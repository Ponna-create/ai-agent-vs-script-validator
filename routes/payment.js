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
router.post('/create-payment', auth, async (req, res) => {
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
        console.log('Creating Razorpay order with amount:', numericAmount);
        // Ensure receipt is no more than 40 characters
        const receipt = `order_${Date.now()}_${String(req.user.id).slice(-10)}`.slice(0, 40);
        
        let order;
        try {
            order = await razorpay.orders.create({
                amount: numericAmount,
                currency: currency || 'INR',
                receipt: receipt,
                notes: {
                    userId: req.user.id,
                    userEmail: req.user.email || 'not_provided'
                }
            });
            console.log('Razorpay order created successfully:', order.id);
        } catch (razorpayError) {
            console.error('Razorpay order creation failed:', {
                message: razorpayError.message,
                code: razorpayError.code,
                status: razorpayError.status,
                details: razorpayError.error
            });
            throw new Error(`Razorpay order creation failed: ${razorpayError.message}`);
        }

        // Create payment record in database
        console.log('Creating payment record...');
        let payment;
        try {
            payment = await prisma.payment.create({
                data: {
                    userId: req.user.id,
                    amount: numericAmount,
                    razorpayOrderId: order.id,
                    status: 'pending',
                    uploadsRemaining: 1
                }
            });
            console.log('Payment record created successfully:', payment.id);
        } catch (dbError) {
            console.error('Database payment record creation failed:', dbError);
            // Don't fail the entire request if DB fails, but log it
            console.warn('Continuing without database record due to DB error');
        }

        res.json({
            success: true,
            key: process.env.RAZORPAY_KEY_ID,
            key_id: process.env.RAZORPAY_KEY_ID,
            amount: order.amount,
            currency: order.currency,
            id: order.id
        });

    } catch (error) {
        console.error('Order creation error:', error);
        if (error && error.error) {
            console.error('Razorpay error details:', error.error);
        }
        if (error && error.response) {
            console.error('Razorpay error response:', error.response);
        }
        
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

router.post('/verify-payment', auth, async (req, res) => {
    try {
        console.log('--- [VERIFY PAYMENT] Incoming request body:', req.body);
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        console.log('--- [VERIFY PAYMENT] Checking required fields...');
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            console.log('--- [VERIFY PAYMENT] Missing required fields:', {
                hasOrderId: !!razorpay_order_id,
                hasPaymentId: !!razorpay_payment_id,
                hasSignature: !!razorpay_signature
            });
            return res.status(400).json({
                error: 'Missing required payment verification fields',
                success: false
            });
        }

        // First check if payment is already verified
        console.log('--- [VERIFY PAYMENT] Checking for existing completed payment...');
        const existingPayment = await prisma.payment.findFirst({
            where: {
                razorpayOrderId: razorpay_order_id,
                status: 'completed'
            }
        });
        console.log('--- [VERIFY PAYMENT] Existing payment:', existingPayment);

        if (existingPayment) {
            console.log('--- [VERIFY PAYMENT] Payment already verified:', existingPayment);
            return res.json({
                success: true,
                message: 'Payment already verified',
                paymentId: existingPayment.razorpayPaymentId,
                uploadsRemaining: 1
            });
        }

        // Verify payment with Razorpay
        try {
            console.log('--- [VERIFY PAYMENT] Fetching payment details from Razorpay:', razorpay_payment_id);
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            console.log('--- [VERIFY PAYMENT] Razorpay payment details:', payment);

            if (payment.status !== 'captured') {
                console.log('--- [VERIFY PAYMENT] Payment not captured:', payment.status);
                return res.status(400).json({
                    error: 'Payment not captured',
                    success: false,
                    details: `Payment status: ${payment.status}`
                });
            }

            // Verify signature
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = require('crypto')
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body.toString())
                .digest("hex");
            console.log('--- [VERIFY PAYMENT] Signature check:', {
                expected: expectedSignature,
                received: razorpay_signature
            });

            if (expectedSignature !== razorpay_signature) {
                console.log('--- [VERIFY PAYMENT] Signature verification failed');
                return res.status(400).json({
                    error: 'Invalid payment signature',
                    success: false
                });
            }

            // Update payment record
            console.log('--- [VERIFY PAYMENT] Updating payment record in database...');
            const updatedPayment = await prisma.payment.updateMany({
                where: {
                    razorpayOrderId: razorpay_order_id,
                    userId: req.user.id
                },
                data: {
                    razorpayPaymentId: razorpay_payment_id,
                    status: 'completed',
                    verifiedAt: new Date()
                }
            });
            console.log('--- [VERIFY PAYMENT] Payment record update result:', updatedPayment);

            if (updatedPayment.count === 0) {
                console.log('--- [VERIFY PAYMENT] No payment record updated:', {
                    orderId: razorpay_order_id,
                    userId: req.user.id
                });
                return res.status(400).json({
                    error: 'Failed to update payment record',
                    success: false
                });
            }

            console.log('--- [VERIFY PAYMENT] Payment verification successful:', {
                paymentId: razorpay_payment_id,
                userId: req.user.id
            });

            res.json({
                success: true,
                message: 'Payment verified successfully',
                paymentId: razorpay_payment_id,
                uploadsRemaining: 1
            });
        } catch (razorpayError) {
            console.error('--- [VERIFY PAYMENT] Razorpay API error:', razorpayError);
            return res.status(400).json({
                error: 'Failed to verify payment with Razorpay',
                success: false,
                details: razorpayError.message
            });
        }
    } catch (error) {
        console.error('--- [VERIFY PAYMENT] Payment verification error:', error);
        res.status(500).json({
            error: 'Payment verification failed',
            success: false,
            details: error.message
        });
    }
});

router.post('/webhook', express.json({ type: '*/*' }), (req, res) => {
    console.log('--- [RAZORPAY WEBHOOK] Event received:', req.body);
    res.status(200).json({ received: true });
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