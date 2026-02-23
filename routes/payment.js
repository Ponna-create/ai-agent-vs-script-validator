const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { auth } = require('../middleware/auth');
const { razorpay } = require('../utils/razorpay');

// Create payment order
router.post('/create-order', auth, async (req, res) => {
  try {
    const { amount, currency = 'INR' } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    if (!razorpay) {
      return res.status(500).json({ error: 'Payment service unavailable' });
    }

    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `spec_${Date.now()}`,
      payment_capture: 1
    });

    await prisma.payment.create({
      data: {
        razorpayOrderId: order.id,
        amount: parseInt(amount),
        currency,
        status: 'created',
        userId: req.user.id
      }
    });

    res.json({ ...order, key: process.env.RAZORPAY_KEY_ID });
  } catch (error) {
    console.error('Payment order error:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Verify payment
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      const payment = await prisma.payment.update({
        where: { razorpayOrderId: razorpay_order_id },
        data: {
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          status: 'completed',
          verifiedAt: new Date()
        }
      });

      res.json({
        success: true,
        paymentId: payment.id,
        message: 'Payment verified'
      });
    } else {
      await prisma.payment.update({
        where: { razorpayOrderId: razorpay_order_id },
        data: { status: 'failed' }
      });
      res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = router;
