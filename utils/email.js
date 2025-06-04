const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Email templates
const emailTemplates = {
    refundProcessed: (amount) => ({
        subject: 'Refund Processed Successfully',
        text: `Your refund of ₹${amount/100} has been processed successfully. The amount will be credited to your original payment method within 5-7 business days.`,
        html: `
            <h2>Refund Processed Successfully</h2>
            <p>Your refund of ₹${amount/100} has been processed successfully.</p>
            <p>The amount will be credited to your original payment method within 5-7 business days.</p>
            <p>If you have any questions, please contact our support team at support@ppokasoft.com</p>
        `
    }),
    refundFailed: (reason) => ({
        subject: 'Refund Request Failed',
        text: `We encountered an issue processing your refund. Reason: ${reason}. Please contact our support team for assistance.`,
        html: `
            <h2>Refund Request Failed</h2>
            <p>We encountered an issue processing your refund.</p>
            <p><strong>Reason:</strong> ${reason}</p>
            <p>Please contact our support team at support@ppokasoft.com for assistance.</p>
        `
    })
};

// Send email function
async function sendEmail(to, template, data) {
    try {
        const emailContent = emailTemplates[template](data);
        
        const mailOptions = {
            from: process.env.SMTP_FROM,
            to: to,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent:', info.messageId);
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        return false;
    }
}

module.exports = {
    sendEmail
}; 