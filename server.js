require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const timeout = require('connect-timeout');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { PrismaClient } = require('@prisma/client');
const userRoutes = require('./routes/user');
const paymentRoutes = require('./routes/payment');
const auth = require('./middleware/auth');
const { 
    refundLimiter, 
    paymentVerifyLimiter, 
    loginLimiter, 
    apiLimiter 
} = require('./middleware/rateLimit');
const webhookRoutes = require('./routes/webhook');

// Initialize Express app with improved error handling for Vercel deployment
const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS with specific options
app.use(cors({
    origin: true,
    credentials: true,
    exposedHeaders: [
        'x-rtb-fingerprint-id',
        'x-razorpay-signature',
        'x-razorpay-order-id',
        'x-razorpay-payment-id'
    ]
}));

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Razorpay with better error handling
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

// Middleware to check Razorpay initialization
const checkRazorpay = (req, res, next) => {
    if (!razorpay) {
        console.error('Razorpay not initialized');
        return res.status(503).json({
            error: 'Payment service unavailable',
            details: 'Payment system is not properly configured. Please check server logs.'
        });
    }
    next();
};

// In-memory session storage (replace with Redis/DB in production)
const sessions = new Map();

// Session management functions
function createSession(paymentId) {
  sessions.set(paymentId, {
    uploadsRemaining: 1, // Allow 1 re-upload
    created: Date.now(),
    lastUpload: Date.now()
  });
  return paymentId;
}

function getSession(paymentId) {
  return sessions.get(paymentId);
}

function updateSession(paymentId) {
  const session = sessions.get(paymentId);
  if (session) {
    session.uploadsRemaining--;
    session.lastUpload = Date.now();
    sessions.set(paymentId, session);
  }
}

// Clean up expired sessions (24 hours)
setInterval(() => {
  const now = Date.now();
  for (const [paymentId, session] of sessions.entries()) {
    if (now - session.created > 24 * 60 * 60 * 1000) {
      sessions.delete(paymentId);
    }
  }
}, 60 * 60 * 1000); // Check every hour

// Configure multer for .md file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    console.log('Upload directory:', uploadDir);
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created upload directory');
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error('Failed to create upload directory:', error);
      cb(error);
    }
  },
  filename: function (req, file, cb) {
    console.log('Incoming file:', file);
    const filename = 'analysis-' + Date.now() + '.md';
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('File filter - mimetype:', file.mimetype);
    console.log('File filter - original name:', file.originalname);
    
    // Accept any text-based mimetype or files with .md extension
    if (
      file.mimetype.startsWith('text/') ||
      file.originalname.toLowerCase().endsWith('.md') ||
      file.originalname.toLowerCase().endsWith('.markdown')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only text files with .md or .markdown extensions are allowed'));
    }
  }
});

// Configure Helmet with custom CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://checkout.razorpay.com",
        "https://*.razorpay.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
        "https://*.razorpay.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "https://*.razorpay.com"
      ],
      connectSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://checkout.razorpay.com",
        "https://*.razorpay.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://fonts.googleapis.com",
        "data:"
      ],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://checkout.razorpay.com",
        "https://*.razorpay.com"
      ],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount user routes
app.use('/api/user', userRoutes);
app.use('/api/payment', paymentRoutes);

// Add timeout middleware
app.use(timeout('30s'));
app.use((req, res, next) => {
  if (!req.timedout) next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Generate markdown content
function generateMarkdown(projectDescription, analysis) {
  return `# Project Analysis Report

## Project Description
${projectDescription}

## Analysis Results

### Recommendation: ${analysis.recommendation}
**Confidence Score:** ${analysis.confidenceScore}%

### Reasoning
${analysis.reasoning}

### Cost Estimate
${analysis.costEstimate}

### Time Estimate
${analysis.timeEstimate}

### Starter Template
\`\`\`
${analysis.starterTemplate}
\`\`\`

---
*Generated by AI Agent vs Script Validator*
*Edit this file to add more details and re-upload for refined analysis*

## How to Improve Your Analysis

1. Add more specific details about:
   - Technical requirements
   - Scale and complexity
   - Integration needs
   - Performance requirements
   - Budget constraints

2. Clarify:
   - User interaction patterns
   - Data processing needs
   - Security requirements
   - Maintenance expectations

3. Upload the edited file for a more accurate analysis
`;
}

// Download markdown route
app.post('/api/download-md', (req, res) => {
  try {
    const { projectDescription, analysis } = req.body;
    const markdownContent = generateMarkdown(projectDescription, analysis);
    
    // Set headers for markdown download
    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', 'attachment; filename=project-analysis.md');
    
    res.send(markdownContent);
  } catch (error) {
    console.error('Markdown generation error:', error);
    res.status(500).json({ error: 'Failed to generate markdown file' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      details: err.message
    });
  }
  if (err.name === 'SyntaxError') {
    return res.status(400).json({
      error: 'Invalid request format',
      details: err.message
    });
  }
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Create Razorpay order
app.post('/api/create-payment', auth, checkRazorpay, async (req, res) => {
    try {
        console.log('Creating Razorpay order...');
        
        // Validate Razorpay initialization
        if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
            console.error('Missing Razorpay credentials:', {
                hasKeyId: !!process.env.RAZORPAY_KEY_ID,
                hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET
            });
            return res.status(503).json({
                error: 'Payment service configuration error',
                details: 'Payment service is not properly configured'
            });
        }

        // Log Razorpay configuration (without exposing full keys)
        console.log('Razorpay configuration:', {
            keyId: process.env.RAZORPAY_KEY_ID.substring(0, 8) + '...',
            keyType: process.env.RAZORPAY_KEY_ID.startsWith('rzp_live') ? 'live' : 'test',
            hasSecret: !!process.env.RAZORPAY_KEY_SECRET,
            environment: process.env.NODE_ENV || 'development'
        });

        // Create order with required fields
        const options = {
            amount: 19900,  // amount in paisa
            currency: "INR",
            receipt: `order_rcptid_${Date.now()}`,
            notes: {
                userId: req.user.id,
                userEmail: req.user.email || 'not_provided',
                environment: process.env.NODE_ENV || 'development'
            }
        };

        console.log('Creating order with options:', {
            ...options,
            notes: { userId: '***', userEmail: '***' }  // Don't log user data
        });

        try {
            // Verify Razorpay instance
            if (!razorpay || !razorpay.orders || typeof razorpay.orders.create !== 'function') {
                console.error('Invalid Razorpay instance:', {
                    hasInstance: !!razorpay,
                    hasOrders: razorpay && !!razorpay.orders,
                    hasCreateFunction: razorpay && razorpay.orders && typeof razorpay.orders.create === 'function'
                });
                throw new Error('Payment service not properly initialized');
            }

            const order = await razorpay.orders.create(options);
            console.log('Order created successfully:', {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                status: order.status
            });

            if (!order.id) {
                throw new Error('Order creation failed - no order ID received');
            }

            // Store order in database
            await prisma.payment.create({
                data: {
                    userId: req.user.id,
                    razorpayOrderId: order.id,
                    amount: options.amount,
                    status: 'pending',
                    createdAt: new Date()
                }
            });

            // Set additional headers for better tracking
            res.set('x-razorpay-order-id', order.id);
            
            // Send only required data to frontend
            res.json({
                key: process.env.RAZORPAY_KEY_ID,
                amount: order.amount,
                currency: order.currency,
                id: order.id,
                notes: options.notes
            });
        } catch (razorpayError) {
            console.error('Razorpay API error:', {
                message: razorpayError.message,
                code: razorpayError.code,
                status: razorpayError.status,
                stack: razorpayError.stack
            });
            
            // Check for specific error types
            if (razorpayError.message?.toLowerCase().includes('invalid api key')) {
                return res.status(503).json({
                    error: 'Invalid API configuration',
                    details: 'Please contact support'
                });
            }
            
            if (razorpayError.message?.toLowerCase().includes('rate limit')) {
                return res.status(429).json({
                    error: 'Too many requests',
                    details: 'Please try again in a few minutes'
                });
            }

            return res.status(503).json({
                error: 'Failed to create order with payment provider',
                details: process.env.NODE_ENV === 'development' ? razorpayError.message : 'Payment service temporarily unavailable'
            });
        }
    } catch (error) {
        console.error('Payment creation error:', {
            message: error.message,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Failed to create payment',
            details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// Verify Razorpay payment
app.post('/api/verify-payment', auth, checkRazorpay, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        console.log('Payment verification request received:', {
            orderId: razorpay_order_id,
            paymentId: razorpay_payment_id,
            userId: req.user.id
        });

        // Validate required fields
        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            console.log('Missing required fields:', {
                hasOrderId: !!razorpay_order_id,
                hasPaymentId: !!razorpay_payment_id,
                hasSignature: !!razorpay_signature
            });
            return res.status(400).json({
                error: 'Missing required payment verification fields',
                success: false
            });
        }

        // First check if payment is already verified
        const existingPayment = await prisma.payment.findFirst({
            where: {
                razorpayOrderId: razorpay_order_id,
                status: 'completed'
            }
        });

        if (existingPayment) {
            console.log('Payment already verified:', existingPayment);
            return res.json({
                success: true,
                message: 'Payment already verified',
                paymentId: existingPayment.razorpayPaymentId,
                uploadsRemaining: 1
            });
        }

        // Verify payment with Razorpay
        try {
            console.log('Fetching payment details from Razorpay:', razorpay_payment_id);
            const payment = await razorpay.payments.fetch(razorpay_payment_id);
            
            console.log('Razorpay payment details:', {
                status: payment.status,
                amount: payment.amount,
                orderId: payment.order_id
            });

            if (payment.status !== 'captured') {
                return res.status(400).json({
                    error: 'Payment not captured',
                    success: false,
                    details: `Payment status: ${payment.status}`
                });
            }

            // Verify signature
            const body = razorpay_order_id + "|" + razorpay_payment_id;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body.toString())
                .digest("hex");

            if (expectedSignature !== razorpay_signature) {
                console.log('Signature verification failed:', {
                    expected: expectedSignature,
                    received: razorpay_signature
                });
                return res.status(400).json({
                    error: 'Invalid payment signature',
                    success: false
                });
            }

            // Update payment record
            const updatedPayment = await prisma.payment.updateMany({
                where: {
                    razorpayOrderId: razorpay_order_id,
                    userId: req.user.id,
                    status: 'pending'
                },
                data: {
                    razorpayPaymentId: razorpay_payment_id,
                    status: 'completed',
                    verifiedAt: new Date()
                }
            });

            if (updatedPayment.count === 0) {
                console.log('No payment record updated:', {
                    orderId: razorpay_order_id,
                    userId: req.user.id
                });
                return res.status(400).json({
                    error: 'Failed to update payment record',
                    success: false
                });
            }

            console.log('Payment verification successful:', {
                paymentId: razorpay_payment_id,
                userId: req.user.id
            });

            res.json({
                success: true,
                message: 'Payment verified successfully',
                paymentId: razorpay_payment_id,
                uploadsRemaining: 1
            });
        } catch (razorpayError) {
            console.error('Razorpay API error:', razorpayError);
            return res.status(400).json({
                error: 'Failed to verify payment with Razorpay',
                success: false,
                details: razorpayError.message
            });
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        res.status(500).json({
            error: 'Payment verification failed',
            success: false,
            details: error.message
        });
    }
});

// Upload and analyze markdown route
app.post('/api/upload-md', (req, res) => {
  const paymentId = req.headers['x-payment-id'];
  
  // Check if this is a paid analysis or re-upload
  if (!paymentId) {
    return res.status(400).json({
      error: 'Payment ID required',
      details: 'Please complete payment to analyze your project'
    });
  }

  // Verify session and upload limits
  const session = getSession(paymentId);
  if (!session) {
    return res.status(403).json({
      error: 'Invalid or expired session',
      details: 'Please make a new payment to continue analyzing'
    });
  }

  if (session.uploadsRemaining <= 0) {
    return res.status(403).json({
      error: 'Upload limit reached',
      details: 'You have used all your re-upload attempts. Please make a new payment to continue analyzing.'
    });
  }

  console.log('Received upload request');
  console.log('Request headers:', req.headers);
  
  upload.single('mdFile')(req, res, (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      return res.status(400).json({
        error: 'File upload failed',
        details: err.message
      });
    }

    if (!req.file) {
      console.error('No file in request');
      return res.status(400).json({
        error: 'No file uploaded',
        details: 'Please select a markdown file'
      });
    }

    // Update session upload count
    updateSession(paymentId);
    const uploadsRemaining = session.uploadsRemaining - 1;

    processUploadedFile(req, res).then(analysis => {
      res.json({
        ...analysis,
        uploadsRemaining,
        sessionValid: true
      });
    }).catch((error) => {
      console.error('Process file error:', error);
      res.status(500).json({
        error: 'Failed to process file',
        details: error.message
      });
    });
  });
});

// Separate function to process the uploaded file
async function processUploadedFile(req, res) {
  try {
    // Read the uploaded file
    let fileContent;
    try {
      fileContent = await fs.promises.readFile(req.file.path, 'utf8');
      console.log('File read successfully, size:', fileContent.length);
    } catch (readError) {
      throw new Error(`Failed to read file: ${readError.message}`);
    }

    // Extract project description
    const descriptionMatch = fileContent.match(/## Project Description\n([\s\S]*?)(?=\n##|$)/);
    if (!descriptionMatch || !descriptionMatch[1].trim()) {
      throw new Error('Invalid markdown format: Project description section not found. Please ensure your file has a "## Project Description" section.');
    }

    const projectDescription = descriptionMatch[1].trim();
    if (projectDescription.length < 50) {
      throw new Error('Project description is too short. Please provide more details (minimum 50 characters).');
    }

    console.log('Project description extracted, length:', projectDescription.length);

    // Clean up the uploaded file
    try {
      await fs.promises.unlink(req.file.path);
      console.log('Temporary file deleted:', req.file.path);
    } catch (deleteError) {
      console.warn('Failed to delete temporary file:', deleteError);
      // Continue processing even if cleanup fails
    }

    // Validate OpenAI configuration
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

    // Initialize OpenAI
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 3
    });

    // Prepare and send OpenAI request
    const prompt = `Analyze this project description and determine if it needs an AI agent or a simple script. Project description: ${projectDescription}
    
    Consider:
    1. Complexity of decision-making required
    2. Need for natural language processing
    3. Adaptability requirements
    4. Data processing needs
    
    Return a JSON object with EXACTLY these fields:
    {
      "recommendation": "AI Agent" or "Simple Script",
      "confidenceScore": number between 1-100,
      "reasoning": "detailed explanation string",
      "costEstimate": "estimated cost range string",
      "timeEstimate": "estimated time string",
      "starterTemplate": "code template string"
    }`;

    console.log('Sending request to OpenAI...');
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });

      // Parse and validate OpenAI response
      let analysis;
      try {
        const responseContent = completion.choices[0].message.content;
        analysis = JSON.parse(responseContent);
        
        // Validate required fields
        const requiredFields = ['recommendation', 'confidenceScore', 'reasoning', 'costEstimate', 'timeEstimate', 'starterTemplate'];
        const missingFields = requiredFields.filter(field => !analysis[field]);
        
        if (missingFields.length > 0) {
          throw new Error(`Invalid response format. Missing fields: ${missingFields.join(', ')}`);
        }

        // Validate field types and values
        if (!['AI Agent', 'Simple Script'].includes(analysis.recommendation)) {
          throw new Error('Invalid recommendation value');
        }
        
        if (typeof analysis.confidenceScore !== 'number' || 
            analysis.confidenceScore < 1 || 
            analysis.confidenceScore > 100) {
          throw new Error('Invalid confidence score');
        }

        console.log('Analysis completed successfully');
      } catch (parseError) {
        console.error('OpenAI response parsing error:', parseError);
        throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
      }
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      if (openaiError.code === 'ECONNABORTED') {
        throw new Error('OpenAI API request timed out');
      } else if (openaiError.response?.status === 429) {
        throw new Error('OpenAI API rate limit exceeded');
      } else if (openaiError.response?.status === 401) {
        throw new Error('Invalid OpenAI API key');
      } else {
        throw new Error(`OpenAI API error: ${openaiError.message}`);
      }
    }

    return analysis;
  } catch (error) {
    console.error('File processing error:', error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Analysis route
app.post('/api/analyze', auth, async (req, res) => {
  try {
    console.log('Starting project analysis...');
    console.log('Checking OpenAI API key:', process.env.OPENAI_API_KEY ? 'Key exists' : 'Key missing');
    
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 30000, // 30 second timeout
      maxRetries: 3
    });

    const { projectDescription, paymentId } = req.body;
    
    // Verify payment belongs to user
    const payment = await prisma.payment.findFirst({
      where: {
        razorpayPaymentId: paymentId,
        userId: req.user.id,
        status: 'completed'
      }
    });

    if (!payment) {
      return res.status(403).json({
        error: 'Invalid payment',
        details: 'Please complete payment before analysis'
      });
    }
    
    const prompt = `Analyze this project description and determine if it needs an AI agent or a simple script. Project description: ${projectDescription}
    
    Consider:
    1. Complexity of decision-making required
    2. Need for natural language processing
    3. Adaptability requirements
    4. Data processing needs
    
    Return a JSON with:
    - recommendation: "AI Agent" or "Simple Script"
    - confidenceScore: number between 1-100
    - reasoning: detailed explanation
    - costEstimate: estimated cost range
    - timeEstimate: estimated time to implement
    - starterTemplate: basic code template`;

    console.log('Sending request to OpenAI...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
    });

    const analysis = JSON.parse(completion.choices[0].message.content);
    console.log('Analysis completed successfully');

    // Store analysis in database
    await prisma.analysis.create({
      data: {
        userId: req.user.id,
        paymentId: payment.id,
        description: projectDescription,
        result: analysis
      }
    });

    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze project', details: error.message });
  }
});

// Apply rate limiters to specific endpoints
app.use('/api/payment/refund', refundLimiter);
app.use('/api/verify-payment', paymentVerifyLimiter);
app.use('/api/user/login', loginLimiter);

// Apply general API rate limit to all other routes
app.use('/api', apiLimiter);

// Mount webhook routes (no authentication required)
app.use('/webhook', webhookRoutes);

// Handle all other routes by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Server startup with error handling
const findAvailablePort = (startPort) => {
  return new Promise((resolve, reject) => {
    const server = require('net').createServer();
    
    server.once('error', err => {
      if (err.code === 'EADDRINUSE') {
        resolve(findAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(startPort);
    });

    server.listen(startPort);
  });
};

const startServer = async () => {
  try {
    const port = await findAvailablePort(3000);
    app.listen(port, () => {
      console.log(`\n🚀 Server running at http://localhost:${port}`);
      console.log('Press Ctrl+C to stop the server\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down server gracefully...');
  process.exit(0);
});

// Start the server
startServer(); 