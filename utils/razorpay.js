const Razorpay = require('razorpay');

let razorpay;

try {
    // Check if environment variables are loaded
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        console.error('Razorpay environment variables are missing:');
        console.error(`RAZORPAY_KEY_ID: ${process.env.RAZORPAY_KEY_ID ? 'Present' : 'Missing'}`);
        console.error(`RAZORPAY_KEY_SECRET: ${process.env.RAZORPAY_KEY_SECRET ? 'Present' : 'Missing'}`);

        // In production, we'll throw an error
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Razorpay credentials are not configured. Please check environment variables.');
        }

        console.warn('Creating mock Razorpay instance for development');
        // In development, we'll create a mock instance
        razorpay = {
            orders: {
                create: () => Promise.resolve({
                    id: 'test_order_' + Date.now(),
                    amount: 19900,
                    currency: 'INR',
                    status: 'created'
                })
            },
            payments: {
                fetch: () => Promise.resolve({
                    status: 'captured',
                    order_id: 'test_order_' + Date.now(),
                    amount: 19900
                }),
                refund: (paymentId, options) => Promise.resolve({
                    id: 'rfnd_' + Date.now(),
                    amount: options.amount,
                    status: 'processed'
                })
            }
        };
    } else {
        // Initialize real Razorpay instance
        razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET
        });
        console.log('Razorpay initialized with:', {
            keyType: process.env.RAZORPAY_KEY_ID.startsWith('rzp_live') ? 'live' : 'test',
            environment: process.env.NODE_ENV || 'development'
        });
    }
} catch (error) {
    console.error('Failed to initialize Razorpay:', error);
    razorpay = null;
}

module.exports = { razorpay };
