const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');
const Razorpay = require('razorpay');

const prisma = new PrismaClient();

// Initialize Razorpay
let razorpay;
try {
    razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    console.log('Razorpay initialized with key type:', process.env.RAZORPAY_KEY_ID.startsWith('rzp_live') ? 'live' : 'test');
} catch (error) {
    console.error('Failed to initialize Razorpay:', error);
}

// Create a new payment order
router.post('/create-order', auth, async (req, res) => {
    try {
        // Check if Razorpay is initialized
        if (!razorpay) {
            console.error('Razorpay not initialized');
            return res.status(500).json({
                error: 'Payment service unavailable',
                details: 'Payment system is not properly configured',
                success: false
            });
        }

        const { amount, currency = 'INR' } = req.body;
        console.log('Creating order with:', { amount, currency, userId: req.user.id });

        if (!amount) {
            console.error('Amount missing in request');
            return res.status(400).json({
                error: 'Amount is required',
                success: false
            });
        }

        // Validate amount
        const numericAmount = parseInt(amount);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            console.error('Invalid amount:', amount);
            return res.status(400).json({
                error: 'Invalid amount',
                success: false
            });
        }

        // Create order in Razorpay
        console.log('Creating Razorpay order...');
        const order = await razorpay.orders.create({
            amount: numericAmount,
            currency,
            receipt: `order_${Date.now()}_${req.user.id}`,
            notes: {
                userId: req.user.id
            }
        });
        console.log('Razorpay order created:', order.id);

        // Create payment record in database
        console.log('Creating payment record...');
        const payment = await prisma.payment.create({
            data: {
                userId: req.user.id,
                amount: numericAmount,
                currency,
                razorpayOrderId: order.id,
                status: 'pending',
                uploadsRemaining: 1
            }
        });
        console.log('Payment record created:', payment.id);

        res.json({
            success: true,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            id: order.id
        });

    } catch (error) {
        console.error('Order creation error:', error);
        
        // Check for specific error types
        if (error.code === 'P2002') {
            return res.status(400).json({
                error: 'Duplicate order',
                details: 'This order has already been created',
                success: false
            });
        }
        
        if (error.statusCode === 400) {
            return res.status(400).json({
                error: 'Invalid request to payment provider',
                details: error.message,
                success: false
            });
        }

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