const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

let prisma;
try {
    prisma = new PrismaClient();
} catch (error) {
    console.error('Failed to initialize Prisma:', error);
    prisma = null;
}

const auth = async (req, res, next) => {
    try {
        // Check if Prisma is initialized
        if (!prisma) {
            throw new Error('Database connection not available');
        }

        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                error: 'Authentication failed',
                details: 'No authentication token provided'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not set');
            return res.status(500).json({
                error: 'Server configuration error',
                details: 'Authentication is not properly configured'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        });

        if (!user) {
            return res.status(401).json({
                error: 'Authentication failed',
                details: 'User not found'
            });
        }

        // Add user to request object
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Authentication failed',
                details: 'Invalid token'
            });
        }

        res.status(500).json({
            error: 'Server error',
            details: 'An unexpected error occurred'
        });
    }
};

module.exports = auth; 