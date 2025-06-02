// DOM Elements
const projectDescription = document.getElementById('projectDescription');
const wordCount = document.getElementById('wordCount');
const analyzeBtn = document.getElementById('analyzeBtn');
const modal = document.getElementById('results-modal');
const modalContent = document.getElementById('results-content');
const closeModal = document.querySelector('.close');
const startAnalysisBtn = document.querySelector('.hero-section .primary-btn');
const learnMoreBtn = document.querySelector('.hero-section .secondary-btn');

// Constants
const WORD_REQUIREMENT = 450;
const ANALYSIS_PRICE = 699;

// Add session management
let currentPaymentId = null;
let uploadsRemaining = 0;
let authToken = localStorage.getItem('authToken');
let currentUser = null;

// Check authentication status on page load
checkAuthStatus();

async function checkAuthStatus() {
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                updateUIForLoggedInUser();
            } else {
                // Token invalid, clear it
                localStorage.removeItem('authToken');
                updateUIForLoggedOutUser();
            }
        } catch (error) {
            console.error('Failed to check auth status:', error);
            updateUIForLoggedOutUser();
        }
    } else {
        updateUIForLoggedOutUser();
    }
}

function updateUIForLoggedInUser() {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        authSection.innerHTML = `
            <span>Welcome, ${currentUser.name || currentUser.email}</span>
            <button onclick="logout()" class="secondary-btn">Logout</button>
        `;
    }
    updateWordCount();
}

function updateUIForLoggedOutUser() {
    const authSection = document.querySelector('.auth-section');
    if (authSection) {
        authSection.innerHTML = `
            <button onclick="showLoginModal()" class="primary-btn">Login</button>
            <button onclick="showRegisterModal()" class="secondary-btn">Register</button>
        `;
    }
    updateWordCount();
}

function showLoginModal() {
    modalContent.innerHTML = `
        <div class="auth-form">
            <h2>Login</h2>
            <form id="loginForm" onsubmit="login(event)">
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
    modalContent.innerHTML = `
        <div class="auth-form">
            <h2>Register</h2>
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

async function login(event) {
    event.preventDefault();
    const form = event.target;
    const email = form.email.value;
    const password = form.password.value;

    try {
        const response = await fetch('/api/user/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            authToken = data.token;
            currentUser = data.user;
            modal.style.display = 'none';
            updateUIForLoggedInUser();
        } else {
            throw new Error(data.error || 'Login failed');
        }
    } catch (error) {
        showError(error.message);
    }
}

async function register(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.name.value;
    const email = form.email.value;
    const password = form.password.value;

    try {
        const response = await fetch('/api/user/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();
        if (response.ok) {
            localStorage.setItem('authToken', data.token);
            authToken = data.token;
            currentUser = data.user;
            modal.style.display = 'none';
            updateUIForLoggedInUser();
        } else {
            throw new Error(data.error || 'Registration failed');
        }
    } catch (error) {
        showError(error.message);
    }
}

function logout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    updateUIForLoggedOutUser();
}

// Event Listeners
projectDescription.addEventListener('input', updateWordCount);
analyzeBtn.addEventListener('click', startAnalysis);
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
    const words = projectDescription.value.trim().split(/\s+/).length;
    wordCount.textContent = words;
    
    if (!authToken || !currentUser) {
        analyzeBtn.textContent = 'Login to Analyze';
        analyzeBtn.disabled = true;
    } else {
        analyzeBtn.textContent = `Analyze Project (₹${ANALYSIS_PRICE})`;
        analyzeBtn.disabled = words < WORD_REQUIREMENT;
    }
}

// Payment and Analysis Functions
async function startAnalysis() {
    if (!authToken || !currentUser) {
        showLoginModal();
        return;
    }

    try {
        console.log('Starting payment initialization...');
        
        // Show loading state
        modalContent.innerHTML = `
            <div class="loading-container">
                <h3>Initializing Payment...</h3>
                <div class="loading-spinner"></div>
            </div>
        `;
        modal.style.display = 'block';

        // Create Razorpay order
        const orderResponse = await fetch('/api/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!orderResponse.ok) {
            throw new Error(`HTTP error! status: ${orderResponse.status}`);
        }
        
        const orderData = await orderResponse.json();
        console.log('Order created:', orderData);
        
        if (!orderData.key || !orderData.amount || !orderData.currency || !orderData.id) {
            throw new Error('Invalid order data received from server');
        }
        
        // Initialize Razorpay payment
        const options = {
            key: orderData.key,
            amount: orderData.amount,
            currency: orderData.currency,
            name: "AI Agent vs Script Validator",
            description: "Project Analysis Payment",
            order_id: orderData.id,
            prefill: {
                name: currentUser.name || '',
                email: currentUser.email || '',
            },
            handler: async function (response) {
                try {
                    console.log('Payment successful, verifying...');
                    // Show verifying state
                    modalContent.innerHTML = `
                        <div class="loading-container">
                            <h3>Verifying Payment...</h3>
                            <div class="loading-spinner"></div>
                        </div>
                    `;
                    
                    // Verify payment
                    const verifyResponse = await fetch('/api/verify-payment', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`
                        },
                        body: JSON.stringify({
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    });

                    if (!verifyResponse.ok) {
                        throw new Error(`HTTP error! status: ${verifyResponse.status}`);
                    }

                    const verifyResult = await verifyResponse.json();
                    console.log('Verification result:', verifyResult);
                    
                    if (verifyResult.success) {
                        // Store payment session info
                        currentPaymentId = verifyResult.paymentId;
                        uploadsRemaining = verifyResult.uploadsRemaining;
                        await processAnalysis(verifyResult);
                    } else {
                        throw new Error(verifyResult.error || 'Payment verification failed');
                    }
                } catch (error) {
                    console.error('Payment verification failed:', error);
                    showError('Payment verification failed: ' + error.message);
                }
            },
            theme: {
                color: "#2563eb"
            },
            modal: {
                ondismiss: function() {
                    console.log('Payment modal closed');
                    modal.style.display = 'none';
                }
            }
        };

        // Close our loading modal before opening Razorpay
        modal.style.display = 'none';

        // Create and open Razorpay
        console.log('Opening Razorpay with options:', { ...options, key: '***' });
        const rzp = new Razorpay(options);
        rzp.open();
        
    } catch (error) {
        console.error('Payment initialization failed:', error);
        showError('Payment initialization failed: ' + error.message);
    }
}

async function processAnalysis(paymentResponse) {
    try {
        // Send project description for analysis
        const analysisResponse = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                projectDescription: projectDescription.value,
                paymentId: paymentResponse.paymentId
            })
        });

        if (!analysisResponse.ok) {
            const errorData = await analysisResponse.json();
            throw new Error(errorData.details || errorData.error || 'Analysis failed');
        }

        const analysis = await analysisResponse.json();
        displayResults(analysis);
    } catch (error) {
        console.error('Analysis failed:', error);
        showError('Analysis failed: ' + error.message);
    }
}

// UI Functions
function displayResults(analysis) {
    const confidenceColor = getConfidenceColor(analysis.confidenceScore);
    
    // Format the starter template code with proper line breaks
    const formattedTemplate = analysis.starterTemplate
        .split('\n')
        .map(line => line.trim())
        .join('\n');
    
    const resultsHTML = `
        <div class="results-container">
            <div class="recommendation-header">
                <h3>Recommendation: ${analysis.recommendation}</h3>
                <div class="confidence-score" style="color: ${confidenceColor}">
                    ${analysis.confidenceScore}% Confidence
                </div>
            </div>
            
            <div class="reasoning-section">
                <h4>Why ${analysis.recommendation}?</h4>
                <p>${analysis.reasoning}</p>
            </div>
            
            <div class="estimates-section">
                <div class="estimate-box">
                    <h4>💰 Cost Estimate</h4>
                    <p>${analysis.costEstimate}</p>
                </div>
                <div class="estimate-box">
                    <h4>⏱️ Time Estimate</h4>
                    <p>${analysis.timeEstimate}</p>
                </div>
            </div>
            
            <div class="code-template-section">
                <h4>🚀 Starter Template</h4>
                <pre><code>${formattedTemplate}</code></pre>
            </div>

            <div class="action-buttons">
                <button class="primary-btn download-btn">
                    📥 Download Analysis (.md)
                </button>
                ${uploadsRemaining > 0 ? `
                <div class="upload-section">
                    <label for="mdFileUpload" class="secondary-btn">
                        📤 Upload Edited Analysis (${uploadsRemaining} remaining)
                    </label>
                    <input 
                        type="file" 
                        id="mdFileUpload" 
                        accept=".md"
                        style="display: none;"
                    >
                </div>
                ` : `
                <div class="upload-limit-reached">
                    <p>You have used all your re-upload attempts. To analyze more changes, please make a new payment.</p>
                    <button class="secondary-btn" onclick="scrollToAnalyzer()">Start New Analysis</button>
                </div>
                `}
            </div>
        </div>
    `;
    
    modalContent.innerHTML = resultsHTML;
    modal.style.display = 'block';

    // Store the current analysis and description for download
    window.currentAnalysis = {
        analysis: analysis,
        description: projectDescription.value
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
                <p class="upload-count">Uploads remaining: ${uploadsRemaining}</p>
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
                uploadsRemaining = 0;
                throw new Error(data.details || 'Session expired or upload limit reached. Please make a new payment.');
            }
            throw new Error(data.details || data.error || 'Failed to process file');
        }

        if (data.error) {
            throw new Error(data.error);
        }

        // Update uploads remaining
        uploadsRemaining = data.uploadsRemaining;
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

function showError(message) {
    const errorHTML = `
        <div class="error-container">
            <h3>Error</h3>
            <p>${message}</p>
            ${!currentPaymentId ? `
                <button class="primary-btn" onclick="modal.style.display='none'; scrollToAnalyzer();">
                    Start New Analysis
                </button>
            ` : ''}
            <button class="secondary-btn" onclick="modal.style.display='none';">
                Close
            </button>
        </div>
    `;
    
    modalContent.innerHTML = errorHTML;
    modal.style.display = 'block';
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