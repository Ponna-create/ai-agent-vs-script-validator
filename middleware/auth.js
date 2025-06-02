const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error('No authentication token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId }
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Add user to request object
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({
            error: 'Authentication failed',
            details: error.message
        });
    }
};

module.exports = auth; 