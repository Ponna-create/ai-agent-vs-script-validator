const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { sendEmail } = require('../utils/email');
const prisma = new PrismaClient();

// Verify Razorpay webhook signature
function verifyWebhookSignature(body, signature) {
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(JSON.stringify(body))
        .digest('hex');
    return expectedSignature === signature;
}

// Handle Razorpay webhooks
router.post('/razorpay', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        
        // Verify webhook signature
        if (!verifyWebhookSignature(req.body, signature)) {
            return res.status(400).json({ error: 'Invalid webhook signature' });
        }

        const event = req.body;

        // Handle refund.processed event
        if (event.event === 'refund.processed') {
            const refund = event.payload.refund.entity;
            const payment = await prisma.payment.findFirst({
                where: {
                    razorpayPaymentId: refund.payment_id
                },
                include: {
                    user: true
                }
            });

            if (payment) {
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        status: 'refunded',
                        refundStatus: 'processed',
                        refundedAt: new Date(),
                        refundAmount: refund.amount
                    }
                });

                // Send success email to user
                if (payment.user?.email) {
                    await sendEmail(
                        payment.user.email,
                        'refundProcessed',
                        refund.amount
                    );
                }
            }
        }

        // Handle refund.failed event
        if (event.event === 'refund.failed') {
            const refund = event.payload.refund.entity;
            const payment = await prisma.payment.findFirst({
                where: {
                    razorpayPaymentId: refund.payment_id
                },
                include: {
                    user: true
                }
            });

            if (payment) {
                const failureReason = refund.notes?.failure_reason || 'Refund failed';
                await prisma.payment.update({
                    where: { id: payment.id },
                    data: {
                        refundStatus: 'failed',
                        refundReason: failureReason
                    }
                });

                // Send failure email to user
                if (payment.user?.email) {
                    await sendEmail(
                        payment.user.email,
                        'refundFailed',
                        failureReason
                    );
                }
            }
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router; 