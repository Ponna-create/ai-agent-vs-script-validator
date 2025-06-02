const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

// Create a single PrismaClient instance and export it
const prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'pretty'
});

const auth = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            console.log('No authentication token provided');
            return res.status(401).json({
                error: 'Authentication failed',
                details: 'No authentication token provided'
            });
        }

        // Verify JWT_SECRET exists
        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET environment variable is not set');
            return res.status(500).json({
                error: 'Server configuration error',
                details: 'Authentication is not properly configured'
            });
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Find user
            const user = await prisma.user.findUnique({
                where: { id: decoded.userId }
            });

            if (!user) {
                console.log(`User not found for ID: ${decoded.userId}`);
                return res.status(401).json({
                    error: 'Authentication failed',
                    details: 'User not found'
                });
            }

            // Add user info to request
            req.user = user;
            req.token = token;
            next();

        } catch (jwtError) {
            console.error('JWT verification failed:', jwtError);
            return res.status(401).json({
                error: 'Authentication failed',
                details: 'Invalid or expired token'
            });
        }

    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            error: 'Server error',
            details: 'An unexpected error occurred during authentication'
        });
    }
};

module.exports = auth; 