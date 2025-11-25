const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const auth = require('../middleware/auth');
const { razorpay } = require('../utils/razorpay');

// Create a payment order
router.post('/create-payment', auth, async (req, res) => {
    try {
        const { amount, currency = 'INR' } = req.body;

        if (!amount) {
            return res.status(400).json({ error: 'Amount is required' });
        }

        if (!razorpay) {
            console.error('Razorpay instance not initialized');
            return res.status(500).json({ error: 'Payment service unavailable' });
        }

        const options = {
            amount: amount,
            currency: currency,
            receipt: `receipt_${Date.now()}`,
            payment_capture: 1
        };

        const order = await razorpay.orders.create(options);

        // Store order in database
        await prisma.payment.create({
            data: {
                razorpayOrderId: order.id,
                amount: parseInt(amount),
                currency: currency,
                status: 'created',
                userId: req.user.id
            }
        });

        res.json(order);
    } catch (error) {
        console.error('Error creating payment order:', error);
        res.status(500).json({ error: 'Failed to create payment order' });
    }
});

// Verify payment signature
router.post('/verify-payment', auth, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ error: 'Missing payment details' });
        }

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Update payment status in database
            const payment = await prisma.payment.update({
                where: { razorpayOrderId: razorpay_order_id },
                data: {
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    status: 'completed',
                    uploadsRemaining: { increment: 1 } // Grant 1 analysis
                }
            });

            res.json({
                success: true,
                message: 'Payment verified successfully',
                paymentId: payment.id,
                uploadsRemaining: payment.uploadsRemaining
            });
        } else {
            await prisma.payment.update({
                where: { razorpayOrderId: razorpay_order_id },
                data: { status: 'failed' }
            });
            res.status(400).json({ error: 'Invalid signature' });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: 'Payment verification failed' });
    }
});

// Request a refund
router.post('/refund', auth, async (req, res) => {
    try {
        const { paymentId, reason } = req.body;

        if (!paymentId) {
            return res.status(400).json({ error: 'Payment ID is required' });
        }

        // Find the payment
        const payment = await prisma.payment.findFirst({
            where: {
                razorpayPaymentId: paymentId,
                userId: req.user.id,
                status: 'completed'
            }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Valid payment not found' });
        }

        // Check if already refunded
        if (payment.refundStatus === 'processed') {
            return res.status(400).json({ error: 'Payment already refunded' });
        }

        // Process refund with Razorpay
        const refund = await razorpay.payments.refund(paymentId, {
            "notes": {
                "reason": reason || "User requested refund"
            }
        });

        // Update database
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                refundStatus: 'processed',
                refundId: refund.id,
                uploadsRemaining: { decrement: 1 } // Revoke the analysis credit
            }
        });

        res.json({ success: true, refund });
    } catch (error) {
        console.error('Refund error:', error);
        res.status(500).json({ error: error.error?.description || 'Refund failed' });
    }
});

// Get refund status
router.get('/refund/:paymentId', auth, async (req, res) => {
    try {
        const { paymentId } = req.params;

        const payment = await prisma.payment.findFirst({
            where: {
                razorpayPaymentId: paymentId,
                userId: req.user.id
            }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({
            refund: {
                status: payment.refundStatus || 'none',
                amount: payment.amount,
                id: payment.refundId
            }
        });
    } catch (error) {
        console.error('Error fetching refund status:', error);
        res.status(500).json({ error: 'Failed to fetch refund status' });
    }
});

// Get payment status by Razorpay order ID
router.get('/status/:orderId', auth, async (req, res) => {
    try {
        const { orderId } = req.params;
        const payment = await prisma.payment.findFirst({
            where: {
                razorpayOrderId: orderId,
                userId: req.user.id
            }
        });
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }
        res.json({ status: payment.status, uploadsRemaining: payment.uploadsRemaining });
    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status' });
    }
});

module.exports = router;