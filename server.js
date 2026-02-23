require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const timeout = require('connect-timeout');
const { PrismaClient } = require('@prisma/client');

const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payment');
const specRoutes = require('./routes/spec');
const { apiLimiter, loginLimiter } = require('./middleware/rateLimit');

const app = express();
const prisma = new PrismaClient();

// CORS
app.use(cors({
  origin: true,
  credentials: true,
  exposedHeaders: ['x-razorpay-signature', 'x-razorpay-order-id', 'x-razorpay-payment-id']
}));

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://*.razorpay.com"],
      imgSrc: ["'self'", "data:", "https:", "https://*.razorpay.com"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com", "https://*.razorpay.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Timeout
app.use(timeout('120s'));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

// Routes
app.use('/api/user', loginLimiter, userRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/spec', specRoutes);

// Rate limit on general API
app.use('/api', apiLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', version: '2.0.0' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
