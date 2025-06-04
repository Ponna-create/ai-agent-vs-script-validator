const rateLimit = require('express-rate-limit');

// Rate limiter for refund requests
const refundLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // limit each IP to 3 refund requests per window
    message: {
        error: 'Too many refund requests, please try again later',
        details: 'Maximum 3 refund requests allowed per 24 hours'
    }
});

// Rate limiter for payment verification
const paymentVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 verification requests per window
    message: {
        error: 'Too many payment verification attempts',
        details: 'Please wait 15 minutes before trying again'
    }
});

// Rate limiter for login attempts
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // limit each IP to 5 login attempts per hour
    message: {
        error: 'Too many login attempts',
        details: 'Please try again after an hour'
    },
    skipSuccessfulRequests: true // Don't count successful logins against the limit
});

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        details: 'Please try again after 15 minutes'
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false // Disable the `X-RateLimit-*` headers
});

module.exports = {
    refundLimiter,
    paymentVerifyLimiter,
    loginLimiter,
    apiLimiter
}; 