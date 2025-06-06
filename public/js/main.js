// DOM Elements
const projectDescription = document.getElementById('projectDescription');
const wordCount = document.getElementById('wordCount');
const analyzeBtn = document.getElementById('analyzeBtn');
const modal = document.getElementById('results-modal');
const modalContent = document.getElementById('results-content');
const closeModal = document.querySelector('.close');
const startAnalysisBtn = document.querySelector('.hero-section .primary-btn');
const learnMoreBtn = document.querySelector('.hero-section .secondary-btn');
const userStatus = document.getElementById('user-status');
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

// Constants
const WORD_REQUIREMENT = 450;
const ANALYSIS_PRICE = 199;
const MAX_ANALYSES = 1;

// Add session management
let currentPaymentId = null;
let analysesRemaining = 0;
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// Add debugging flag and function
const DEBUG_MODE = true;

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        if (data === null) {
            console.log(`[DEBUG] ${message}`);
        } else {
            // Clean the data object before logging
            const cleanData = typeof data === 'object' ? 
                JSON.parse(JSON.stringify(data, (key, value) => {
                    if (key === 'password' || key.includes('key') || key.includes('token')) {
                        return '[REDACTED]';
                    }
                    return value;
                })) : data;
            console.log(`[DEBUG] ${message}`, cleanData);
        }
    }
}

function debugLog(message, data = '') {
    if (DEBUG_MODE) {
        console.log(`[DEBUG] ${message}`, data);
    }
    updateDebugPanel();
}

function updateDebugPanel() {
    const debugToken = document.getElementById('debug-token');
    const debugUser = document.getElementById('debug-user');
    const debugButton = document.getElementById('debug-button');
    
    if (debugToken) debugToken.textContent = authToken ? 'EXISTS' : 'NONE';
    if (debugUser) debugUser.textContent = currentUser ? currentUser.email : 'NONE';
    if (debugButton) debugButton.textContent = analyzeBtn ? analyzeBtn.textContent : 'NOT FOUND';
}

function forceLogout() {
    debugLog('Force logout triggered');
    localStorage.clear(); // Clear everything
    authToken = null;
    currentUser = null;
    currentPaymentId = null;
    analysesRemaining = 0;
    updateUIForLoggedOutUser();
    updateDebugPanel();
    alert('Forced logout complete. All localStorage cleared.');
}

function toggleDebug() {
    const debugPanel = document.getElementById('debug-panel');
    if (debugPanel) {
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    }
}

// Check authentication status on page load
checkAuthStatus();

async function checkAuthStatus() {
    debugLog('Checking authentication status...');
    const token = localStorage.getItem('authToken');
    debugLog('Token from localStorage:', token ? 'Token exists' : 'No token');
    
    if (token) {
        try {
            debugLog('Validating token with server...');
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            debugLog('Profile response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                authToken = token;
                debugLog('Authentication successful:', currentUser);
                updateUIForLoggedInUser();
            } else {
                debugLog('Token validation failed, clearing localStorage');
                // Token invalid, clear it
                localStorage.removeItem('authToken');
                authToken = null;
                currentUser = null;
                updateUIForLoggedOutUser();
            }
        } catch (error) {
            debugLog('Failed to check auth status:', error);
            localStorage.removeItem('authToken');
            authToken = null;
            currentUser = null;
            updateUIForLoggedOutUser();
        }
    } else {
        debugLog('No token found, showing logged out state');
        updateUIForLoggedOutUser();
    }
}

function updateUIForLoggedInUser() {
    if (!currentUser) {
        debugLog('No current user for UI update');
        return;
    }

    debugLog('Updating UI for logged in user:', currentUser);
    
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        authSection.innerHTML = `
            <span>Welcome, ${currentUser.name || currentUser.email}</span>
            <button onclick="logout()" class="secondary-btn">Logout</button>
        `;
    }
    
    if (userStatus) {
        userStatus.className = 'user-status logged-in';
        userStatus.innerHTML = `
            <p>✅ Logged in as ${currentUser.name || currentUser.email}</p>
            <small>You can now proceed with project analysis</small>
        `;
    }
    
    // Re-enable analysis if word count is sufficient
    updateWordCount();
}

function updateUIForLoggedOutUser() {
    debugLog('Updating UI for logged out user');
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        authSection.innerHTML = `
            <button onclick="showLoginModal()" class="primary-btn">Login</button>
            <button onclick="showRegisterModal()" class="secondary-btn">Register</button>
        `;
    }
    
    userStatus.className = 'user-status logged-out';
    userStatus.innerHTML = `
        <p>⚠️ Please log in or register to analyze your project</p>
        <small>Create an account to get started</small>
    `;
    
    updateWordCount();
}

async function handleLoginForm(event) {
    event.preventDefault();
    const form = event.target;
    const email = form.email.value;
    const password = form.password.value;
    await login(email, password);
}

function showLoginModal() {
    debugLog('Showing login modal');
    modalContent.innerHTML = `
        <div class="auth-form">
            <h2>Login to Continue</h2>
            <p>Please log in to analyze your project</p>
            <form id="loginForm" onsubmit="handleLoginForm(event)">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit" class="primary-btn">Login</button>
            </form>
            <p>Don't have an account? <a href="#" onclick="showRegisterModal()">Register</a></p>
        </div>
    `;
    modal.style.display = 'block';
}

function showRegisterModal() {
    debugLog('Showing register modal');
    modalContent.innerHTML = `
        <div class="auth-form">
            <h2>Create Account</h2>
            <p>Register to start analyzing your projects</p>
            <form id="registerForm" onsubmit="register(event)">
                <input type="text" name="name" placeholder="Name">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit" class="primary-btn">Register</button>
            </form>
            <p>Already have an account? <a href="#" onclick="showLoginModal()">Login</a></p>
        </div>
    `;
    modal.style.display = 'block';
}

async function login(email, password) {
    try {
        debugLog('Attempting login for:', email);
        
        const response = await fetch('/api/user/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        debugLog('Login successful:', { userId: data.user.id, token: data.token ? 'present' : 'missing' });
        
        // Set authentication state
        authToken = data.token;
        currentUser = data.user;
        localStorage.setItem('authToken', authToken);
        
        // Update UI
        updateUIForLoggedInUser();
        hideModal();
        
        return true;
    } catch (error) {
        debugLog('Login error:', error);
        showError(error.message || 'Authentication failed. Please try again.');
        return false;
    }
}

async function register(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.name.value;
    const email = form.email.value;
    const password = form.password.value;

    debugLog('Attempting registration for:', email);

    try {
        const response = await fetch('/api/user/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();
        debugLog('Registration response:', { status: response.status, success: response.ok });
        
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            authToken = data.token;
            currentUser = data.user;
            debugLog('Registration successful, user:', currentUser);
            modal.style.display = 'none';
            updateUIForLoggedInUser();
        } else {
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        debugLog('Registration failed:', error);
        showError(error.message);
    }
}

function logout() {
    debugLog('Logging out user');
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    currentPaymentId = null;
    analysesRemaining = 0;
    updateUIForLoggedOutUser();
}

// Event Listeners
projectDescription.addEventListener('input', updateWordCount);
analyzeBtn.addEventListener('click', handleAnalyze);
closeModal.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
});

// Add button event listeners
if (startAnalysisBtn) {
    startAnalysisBtn.addEventListener('click', () => {
        const analyzerSection = document.getElementById('analyzer');
        if (analyzerSection) {
            analyzerSection.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
            // Focus on the text area after scrolling
            setTimeout(() => {
                projectDescription.focus();
            }, 800);
        }
    });
}

if (learnMoreBtn) {
    learnMoreBtn.addEventListener('click', () => {
        const featuresSection = document.getElementById('features');
        if (featuresSection) {
            featuresSection.scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
}

// Navigation Functions
function scrollToAnalyzer() {
    const analyzerSection = document.getElementById('analyzer');
    if (analyzerSection) {
        analyzerSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
        // Focus on the text area after scrolling
        setTimeout(() => {
            projectDescription.focus();
        }, 800);
    }
}

function scrollToFeatures() {
    const featuresSection = document.getElementById('features');
    if (featuresSection) {
        featuresSection.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
        });
    }
}

// Word Count Function
function updateWordCount() {
    if (!projectDescription || !wordCount || !analyzeBtn) {
        debugLog('Required elements not found for word count update');
        return;
    }

    const words = projectDescription.value.trim().split(/\s+/).length;
    wordCount.textContent = words;
    
    debugLog('Authentication state check:', {
        hasToken: !!authToken,
        hasUser: !!currentUser,
        wordCount: words,
        wordRequirement: WORD_REQUIREMENT
    });
    
    if (!authToken || !currentUser) {
        analyzeBtn.textContent = 'Login to Analyze';
        analyzeBtn.disabled = true;
        debugLog('Button disabled - not authenticated');
    } else {
        analyzeBtn.textContent = words < WORD_REQUIREMENT ? 
            `Enter at least ${WORD_REQUIREMENT} words` : 
            'Analyze Project';
        analyzeBtn.disabled = words < WORD_REQUIREMENT;
        debugLog('Button state:', { 
            enabled: words >= WORD_REQUIREMENT, 
            wordCount: words,
            required: WORD_REQUIREMENT 
        });
    }
}

// Payment and Analysis Functions
async function handleAnalyze() {
    const words = projectDescription.value.trim().split(/\s+/).length;
    
    if (words < WORD_REQUIREMENT) {
        showError(`Please enter at least ${WORD_REQUIREMENT} words for analysis`);
        return;
    }

    if (!authToken || !currentUser) {
        showRegisterModal();
        return;
    }

    if (analysesRemaining <= 0) {
        showPaymentModal();
        return;
    }

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                projectDescription: projectDescription.value
            })
        });

        if (response.ok) {
            const result = await response.json();
            analysesRemaining--;
            showAnalysisResults(result);
            updateAnalysisCount();
        } else {
            throw new Error('Analysis failed');
        }
    } catch (error) {
        showError('Failed to analyze project. Please try again.');
    }
}

function showPaymentModal() {
    modalContent.innerHTML = `
        <div class="payment-form">
            <h2>Purchase Analysis Credits</h2>
            <p>Get 1 project analysis for ₹${ANALYSIS_PRICE}</p>
            <button onclick="initiatePayment()" class="primary-btn">Pay ₹${ANALYSIS_PRICE}</button>
        </div>
    `;
    modal.style.display = 'block';
}

function updateAnalysisCount() {
    const authSection = document.querySelector('.auth-section');
    if (authSection && currentUser) {
        if (analysesRemaining > 0) {
            authSection.innerHTML = `
                <span>Welcome, ${currentUser.name || currentUser.email}</span>
                <small>(${analysesRemaining} analyses remaining)</small>
                <button onclick="logout()" class="secondary-btn">Logout</button>
            `;
        } else {
            authSection.innerHTML = `
                <span>Welcome, ${currentUser.name || currentUser.email}</span>
                <button onclick="showPaymentModal()" class="primary-btn">Buy More Analyses</button>
                <button onclick="logout()" class="secondary-btn">Logout</button>
            `;
        }
    }
}

// Initialize payment handling
async function initializePayment() {
    try {
        debugLog('Initializing payment...');
        
        // Show loading state
        const paymentButton = document.getElementById('payment-button');
        const paymentStatus = document.getElementById('payment-status');
        
        if (!paymentButton || !paymentStatus) {
            throw new Error('Payment elements not found in DOM');
        }
        
        paymentButton.disabled = true;
        paymentStatus.textContent = 'Initializing payment...';
        
        // Create order
        const response = await fetch('/api/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.details || 'Failed to create payment order');
        }

        const data = await response.json();
        debugLog('Payment order created:', { orderId: data.id });

        // Store order details
        window.paymentOrderId = data.id;
        
        // Get headers for tracking
        const orderId = response.headers.get('x-razorpay-order-id');
        if (orderId) {
            debugLog('Order tracking ID:', orderId);
        }

        // Configure Razorpay options
        const options = {
            key: data.key,
            amount: data.amount,
            currency: data.currency,
            name: "Brain Training",
            description: "Premium Access",
            order_id: data.id,
            handler: handlePaymentSuccess,
            modal: {
                ondismiss: handlePaymentModalDismiss,
                confirm_close: true,
                escape: false
            },
            prefill: {
                name: data.notes?.userName || '',
                email: data.notes?.userEmail || '',
            },
            notes: data.notes,
            theme: {
                color: "#3399cc"
            }
        };

        debugLog('Initializing Razorpay with options:', {
            ...options,
            key: '[REDACTED]',
            prefill: {
                name: '[REDACTED]',
                email: '[REDACTED]'
            }
        });

        // Initialize Razorpay
        const rzp = new Razorpay(options);
        
        // Store instance for later use
        window.razorpayInstance = rzp;
        
        // Open payment modal
        rzp.open();
        
        // Add event listeners
        rzp.on('payment.failed', handlePaymentFailure);
        
    } catch (error) {
        debugLog('Payment initialization error:', error);
        const paymentStatus = document.getElementById('payment-status');
        const paymentButton = document.getElementById('payment-button');
        
        if (paymentStatus) {
            paymentStatus.textContent = 'Payment initialization failed. Please try again.';
        }
        if (paymentButton) {
            paymentButton.disabled = false;
        }
        
        // Show user-friendly error
        showError(error.message || 'Failed to initialize payment. Please try again later.');
    }
}

// Handle successful payment
async function handlePaymentSuccess(response) {
    try {
        debugLog('Payment successful:', { 
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id
        });
        
        const paymentStatus = document.getElementById('payment-status');
        if (paymentStatus) {
            paymentStatus.textContent = 'Verifying payment...';
        }
        
        // Verify payment with backend
        const verificationResponse = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
            })
        });

        if (!verificationResponse.ok) {
            const errorData = await verificationResponse.json();
            throw new Error(errorData.details || 'Payment verification failed');
        }

        const verificationData = await verificationResponse.json();
        debugLog('Payment verification response:', verificationData);
        
        if (verificationData.success) {
            if (paymentStatus) {
                paymentStatus.textContent = 'Payment successful!';
            }
            // Redirect or update UI based on successful payment
            window.location.href = '/dashboard';
        } else {
            throw new Error('Payment verification failed');
        }
        
    } catch (error) {
        debugLog('Payment verification error:', error);
        const paymentStatus = document.getElementById('payment-status');
        if (paymentStatus) {
            paymentStatus.textContent = 'Payment verification failed. Please contact support.';
        }
        showError('Payment verification failed. If amount was deducted, please contact support.');
    }
}

// Handle payment modal dismissal
function handlePaymentModalDismiss() {
    debugLog('Payment modal dismissed');
    const paymentStatus = document.getElementById('payment-status');
    const paymentButton = document.getElementById('payment-button');
    
    if (paymentStatus) {
        paymentStatus.textContent = 'Payment cancelled';
    }
    if (paymentButton) {
        paymentButton.disabled = false;
    }
}

// Handle payment failure
function handlePaymentFailure(response) {
    debugLog('Payment failed:', response.error);
    const paymentStatus = document.getElementById('payment-status');
    const paymentButton = document.getElementById('payment-button');
    
    if (paymentStatus) {
        paymentStatus.textContent = 'Payment failed';
    }
    if (paymentButton) {
        paymentButton.disabled = false;
    }
    
    // Show user-friendly error message
    let errorMessage = 'Payment failed. ';
    if (response.error.description) {
        errorMessage += response.error.description;
    } else if (response.error.reason) {
        errorMessage += response.error.reason;
    } else {
        errorMessage += 'Please try again later.';
    }
    
    showError(errorMessage);
}

// UI Functions
function showModal(content) {
    if (!modal || !modalContent) {
        console.error('Modal elements not found');
        return;
    }
    modalContent.innerHTML = content;
    modal.style.display = 'block';
}

function hideModal() {
    if (modal) {
        modal.style.display = 'none';
    }
}

function showError(message) {
    debugLog('Showing error:', message);
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

function displayResults(analysis) {
    if (!analysis) {
        showError('No analysis results to display');
        return;
    }

    const confidenceColor = getConfidenceColor(analysis.confidenceScore);
    
    // Format the starter template code with proper line breaks
    const formattedTemplate = analysis.starterTemplate
        ? analysis.starterTemplate.split('\n').map(line => line.trim()).join('\n')
        : '';
    
    const resultsHTML = `
        <div class="results-container">
            <div class="recommendation-header">
                <h3>Recommendation: ${analysis.recommendation || 'Not available'}</h3>
                <div class="confidence-score" style="color: ${confidenceColor}">
                    ${analysis.confidenceScore || 0}% Confidence
                </div>
            </div>
            
            <div class="reasoning-section">
                <h4>Why ${analysis.recommendation || 'this recommendation'}?</h4>
                <p>${analysis.reasoning || 'No reasoning provided'}</p>
            </div>
            
            <div class="estimates-section">
                <div class="estimate-box">
                    <h4>💰 Cost Estimate</h4>
                    <p>${analysis.costEstimate || 'Not available'}</p>
                </div>
                <div class="estimate-box">
                    <h4>⏱️ Time Estimate</h4>
                    <p>${analysis.timeEstimate || 'Not available'}</p>
                </div>
            </div>
            
            ${formattedTemplate ? `
                <div class="code-template-section">
                    <h4>🚀 Starter Template</h4>
                    <pre><code>${formattedTemplate}</code></pre>
                </div>
            ` : ''}

            <div class="action-buttons">
                <button class="primary-btn download-btn">
                    📥 Download Analysis (.md)
                </button>
            </div>
        </div>
    `;
    
    showModal(resultsHTML);

    // Store the current analysis and description for download
    window.currentAnalysis = {
        analysis: analysis,
        description: projectDescription ? projectDescription.value : ''
    };

    // Add event listeners after adding elements to DOM
    setupResultsEventListeners();
}

function setupResultsEventListeners() {
    // Download button listener
    const downloadBtn = document.querySelector('.download-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', downloadAnalysis);
    }

    // File upload listener
    const fileInput = document.getElementById('mdFileUpload');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileUpload);
    }
}

async function downloadAnalysis() {
    try {
        const response = await fetch('/api/download-md', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                projectDescription: window.currentAnalysis.description,
                analysis: window.currentAnalysis.analysis
            })
        });

        if (!response.ok) throw new Error('Failed to generate markdown');

        // Get the markdown content
        const markdownContent = await response.text();

        // Create a blob and download it
        const blob = new Blob([markdownContent], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project-analysis.md';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download failed:', error);
        showError('Failed to download analysis. Please try again.');
    }
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }

    // Validate file type and size
    if (!file.name.toLowerCase().endsWith('.md')) {
        showError('Please upload a markdown (.md) file');
        return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showError('File size too large. Please upload a file smaller than 10MB');
        return;
    }

    if (!currentPaymentId) {
        showError('Please make a payment first to analyze your project');
        return;
    }

    console.log('Selected file:', {
        name: file.name,
        type: file.type,
        size: file.size
    });

    try {
        // Show loading state
        modalContent.innerHTML = `
            <div class="loading-container">
                <h3>Analyzing Updated Project...</h3>
                <p>Processing your refined project description...</p>
                <p class="upload-count">Uploads remaining: ${analysesRemaining}</p>
                <div class="loading-spinner"></div>
            </div>
        `;

        const formData = new FormData();
        formData.append('mdFile', file);

        console.log('Sending file upload request...');
        const response = await fetch('/api/upload-md', {
            method: 'POST',
            headers: {
                'X-Payment-ID': currentPaymentId
            },
            body: formData
        });

        console.log('Response status:', response.status);
        let data;
        try {
            data = await response.json();
            console.log('Response data:', data);
        } catch (jsonError) {
            throw new Error('Failed to parse server response');
        }

        if (!response.ok) {
            if (response.status === 403) {
                // Session expired or upload limit reached
                currentPaymentId = null;
                analysesRemaining = 0;
                throw new Error(data.details || 'Session expired or upload limit reached. Please make a new payment.');
            }
            throw new Error(data.details || data.error || 'Failed to process file');
        }

        if (data.error) {
            throw new Error(data.error);
        }

        // Update uploads remaining
        analysesRemaining = data.uploadsRemaining;
        displayResults(data);
    } catch (error) {
        console.error('Upload failed:', error);
        showError(error.message || 'Failed to process uploaded file. Please ensure it\'s a valid markdown file.');
    } finally {
        // Reset file input
        event.target.value = '';
    }
}

function getConfidenceColor(score) {
    if (score >= 80) return '#22c55e'; // Success green
    if (score >= 60) return '#eab308'; // Warning yellow
    return '#ef4444'; // Error red
}

// Add this CSS to your style.css file
const styleSheet = document.createElement('style');
styleSheet.textContent = `
.loading-spinner {
    width: 40px;
    height: 40px;
    margin: 20px auto;
    border: 4px solid var(--background-dark);
    border-top: 4px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.error-container {
    text-align: center;
    padding: 2rem;
}

.error-container h3 {
    color: var(--error-color);
    margin-bottom: 1rem;
}

.error-container p {
    margin-bottom: 2rem;
    color: var(--text-secondary);
}

.error-container button {
    margin: 0.5rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}
`;
document.head.appendChild(styleSheet);

// Mobile Navigation
if (hamburger && navLinks) {
    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        hamburger.classList.toggle('active');
        navLinks.classList.toggle('active');
        document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!hamburger.contains(e.target) && !navLinks.contains(e.target) && navLinks.classList.contains('active')) {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            hamburger.classList.remove('active');
            navLinks.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
    projectDescription.addEventListener('input', updateWordCount);
    analyzeBtn.addEventListener('click', handleAnalyze);
});

// Refund Functions
async function requestRefund(paymentId, reason) {
    try {
        debugLog('Requesting refund for payment:', paymentId);
        
        const response = await fetch('/api/payment/refund', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                paymentId,
                reason
            })
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to process refund');
        }

        showSuccess('Refund request processed successfully');
        return result;
    } catch (error) {
        debugLog('Refund request failed:', error);
        showError(error.message);
        throw error;
    }
}

async function checkRefundStatus(paymentId) {
    try {
        debugLog('Checking refund status for payment:', paymentId);
        
        const response = await fetch(`/api/payment/refund/${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Failed to check refund status');
        }

        return result.refund;
    } catch (error) {
        debugLog('Refund status check failed:', error);
        showError(error.message);
        throw error;
    }
}

function showRefundModal(paymentId) {
    modalContent.innerHTML = `
        <div class="refund-container">
            <h3>Request Refund</h3>
            <p>Please provide a reason for your refund request:</p>
            <textarea id="refundReason" rows="4" placeholder="Enter your reason here..."></textarea>
            <div class="button-group">
                <button onclick="submitRefund('${paymentId}')" class="primary-btn">Submit Request</button>
                <button onclick="closeModal()" class="secondary-btn">Cancel</button>
            </div>
            <p class="small">Note: Refunds are only available within 24 hours of payment and if no analysis has been performed.</p>
        </div>
    `;
    modal.style.display = 'block';
}

async function submitRefund(paymentId) {
    const reasonElement = document.getElementById('refundReason');
    const reason = reasonElement?.value?.trim();
    
    if (!reason) {
        showError('Please provide a reason for the refund');
        return;
    }

    try {
        modalContent.innerHTML = `
            <div class="loading-container">
                <h3>Processing Refund...</h3>
                <div class="loading-spinner"></div>
            </div>
        `;

        const result = await requestRefund(paymentId, reason);
        
        modalContent.innerHTML = `
            <div class="success-container">
                <h3>Refund Processed</h3>
                <p>Your refund has been processed successfully.</p>
                <p>Amount: ₹${result.refund.amount/100}</p>
                <button onclick="closeModal()" class="primary-btn">Close</button>
            </div>
        `;
    } catch (error) {
        modalContent.innerHTML = `
            <div class="error-container">
                <h3>Refund Failed</h3>
                <p>${error.message}</p>
                <button onclick="closeModal()" class="primary-btn">Close</button>
            </div>
        `;
    }
}

// Add refund button to payment history
function updatePaymentHistory(payments) {
    const paymentList = document.getElementById('paymentHistory');
    if (!paymentList) return;

    paymentList.innerHTML = payments.map(payment => `
        <div class="payment-item">
            <div class="payment-info">
                <span>Amount: ₹${payment.amount/100}</span>
                <span>Date: ${new Date(payment.createdAt).toLocaleDateString()}</span>
                <span>Status: ${payment.status}</span>
            </div>
            ${payment.status === 'completed' && !payment.refundStatus ? 
                `<button onclick="showRefundModal('${payment.razorpayPaymentId}')" class="secondary-btn">Request Refund</button>` 
                : payment.refundStatus ? 
                `<span class="refund-status">Refund ${payment.refundStatus}</span>` 
                : ''
            }
        </div>
    `).join('');
} 