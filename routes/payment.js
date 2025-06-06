const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const Razorpay = require('razorpay');

const prisma = new PrismaClient();

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create a new payment order
router.post('/create-order', auth, async (req, res) => {
    try {
        const { amount, currency = 'INR' } = req.body;

        if (!amount) {
            return res.status(400).json({
                error: 'Amount is required',
                success: false
            });
        }

        // Create order in Razorpay
        const order = await razorpay.orders.create({
            amount: parseInt(amount),
            currency,
            receipt: `order_${Date.now()}_${req.user.id}`,
            notes: {
                userId: req.user.id
            }
        });

        // Create payment record in database
        await prisma.payment.create({
            data: {
                userId: req.user.id,
                amount: parseInt(amount),
                currency,
                razorpayOrderId: order.id,
                status: 'pending'
            }
        });

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            id: order.id
        });

    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({
            error: 'Failed to create payment order',
            details: error.message,
            success: false
        });
    }
});

// Request a refund
router.post('/refund', auth, async (req, res) => {
    try {
        const { paymentId, reason } = req.body;

        // Validate request
        if (!paymentId) {
            return res.status(400).json({
                error: 'Missing payment ID',
                success: false
            });
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
            return res.status(404).json({
                error: 'Payment not found or not eligible for refund',
                success: false
            });
        }

        // Check if payment is within 24-hour refund window
        const paymentTime = payment.createdAt;
        const now = new Date();
        const hoursSincePayment = (now - paymentTime) / (1000 * 60 * 60);

        if (hoursSincePayment > 24) {
            return res.status(400).json({
                error: 'Refund window has expired (24 hours)',
                success: false
            });
        }

        // Check if payment has already been refunded
        if (payment.status === 'refunded' || payment.refundStatus) {
            return res.status(400).json({
                error: 'Payment has already been refunded or refund is in process',
                success: false
            });
        }

        // Check if any analyses were performed
        const analysisCount = await prisma.analysis.count({
            where: {
                paymentId: payment.id
            }
        });

        if (analysisCount > 0) {
            return res.status(400).json({
                error: 'Cannot refund payment as analysis has already been performed',
                success: false
            });
        }

        // Process refund through Razorpay
        const refund = await razorpay.payments.refund(paymentId, {
            amount: payment.amount, // Full refund
            speed: 'normal',
            notes: {
                reason: reason || 'Customer requested refund',
                userId: req.user.id
            }
        });

        // Update payment record
        await prisma.payment.update({
            where: { id: payment.id },
            data: {
                status: 'refunded',
                refundStatus: 'processed',
                refundReason: reason || 'Customer requested refund',
                refundedAt: new Date(),
                refundAmount: payment.amount
            }
        });

        res.json({
            success: true,
            message: 'Refund processed successfully',
            refund: {
                id: refund.id,
                amount: refund.amount,
                status: refund.status
            }
        });

    } catch (error) {
        console.error('Refund processing error:', error);
        res.status(500).json({
            error: 'Failed to process refund',
            details: error.message,
            success: false
        });
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
            return res.status(404).json({
                error: 'Payment not found',
                success: false
            });
        }

        res.json({
            success: true,
            refund: {
                status: payment.refundStatus || 'not_requested',
                amount: payment.refundAmount,
                processedAt: payment.refundedAt,
                reason: payment.refundReason
            }
        });

    } catch (error) {
        console.error('Refund status check error:', error);
        res.status(500).json({
            error: 'Failed to check refund status',
            details: error.message,
            success: false
        });
    }
});

module.exports = router; 