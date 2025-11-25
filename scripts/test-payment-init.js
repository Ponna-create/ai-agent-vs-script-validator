require('dotenv').config();
const { razorpay } = require('../utils/razorpay');

console.log('Testing Razorpay Initialization...');

if (razorpay) {
    console.log('Razorpay instance initialized successfully.');
    if (razorpay.orders) {
        console.log('Razorpay orders API is accessible.');
    } else {
        console.error('Razorpay orders API is NOT accessible.');
        process.exit(1);
    }
} else {
    console.error('Razorpay instance failed to initialize.');
    process.exit(1);
}

console.log('Razorpay initialization test passed.');
