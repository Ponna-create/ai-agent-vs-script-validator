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
    analyzeBtn.disabled = words < WORD_REQUIREMENT;
}

// Payment and Analysis Functions
async function startAnalysis() {
    try {
        // Create dummy order
        const orderResponse = await fetch('/api/create-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const orderData = await orderResponse.json();
        
        // Show payment modal
        showPaymentModal(orderData);
        
    } catch (error) {
        console.error('Payment initialization failed:', error);
        showError('Payment initialization failed. Please try again.');
    }
}

function showPaymentModal(orderData) {
    const paymentHTML = `
        <div class="payment-form">
            <h3>Payment Details</h3>
            <p class="amount">Amount: ₹${ANALYSIS_PRICE}</p>
            <div class="form-group">
                <label for="cardNumber">Card Number</label>
                <input type="text" id="cardNumber" placeholder="1234 5678 9012 3456" maxlength="19">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="expiryDate">Expiry Date</label>
                    <input type="text" id="expiryDate" placeholder="MM/YY" maxlength="5">
                </div>
                <div class="form-group">
                    <label for="cvv">CVV</label>
                    <input type="text" id="cvv" placeholder="123" maxlength="3">
                </div>
            </div>
            <button class="primary-btn payment-submit-btn">Pay ₹${ANALYSIS_PRICE}</button>
        </div>
    `;
    
    modalContent.innerHTML = paymentHTML;
    modal.style.display = 'block';

    // Add input formatting
    const cardInput = document.getElementById('cardNumber');
    const expiryInput = document.getElementById('expiryDate');
    
    cardInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        value = value.replace(/(.{4})/g, '$1 ').trim();
        e.target.value = value;
    });

    expiryInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2);
        }
        e.target.value = value;
    });

    // Add payment submit listener
    const paymentSubmitBtn = document.querySelector('.payment-submit-btn');
    paymentSubmitBtn.addEventListener('click', () => processPayment(orderData.id));
}

async function processPayment(orderId) {
    try {
        const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        const expiryDate = document.getElementById('expiryDate').value;
        const cvv = document.getElementById('cvv').value;

        // Basic validation
        if (!cardNumber || !expiryDate || !cvv) {
            showError('Please fill in all payment details');
            return;
        }

        if (cardNumber.length !== 16 || !/^\d+$/.test(cardNumber)) {
            showError('Invalid card number. Please enter 16 digits.');
            return;
        }

        if (!/^\d\d\/\d\d$/.test(expiryDate)) {
            showError('Invalid expiry date. Please use MM/YY format.');
            return;
        }

        // Validate expiry date
        const [month, year] = expiryDate.split('/');
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;

        if (parseInt(month) < 1 || parseInt(month) > 12) {
            showError('Invalid month in expiry date');
            return;
        }

        if (parseInt(year) < currentYear || (parseInt(year) === currentYear && parseInt(month) < currentMonth)) {
            showError('Card has expired');
            return;
        }

        if (cvv.length !== 3 || !/^\d+$/.test(cvv)) {
            showError('Invalid CVV. Please enter 3 digits.');
            return;
        }

        // Show loading state
        const payButton = document.querySelector('.payment-form .primary-btn');
        payButton.textContent = 'Processing...';
        payButton.disabled = true;

        // Process payment
        const paymentResponse = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cardNumber,
                expiryDate,
                cvv,
                orderId
            })
        });

        const paymentResult = await paymentResponse.json();
        
        if (paymentResult.success) {
            // Store payment session info
            currentPaymentId = paymentResult.paymentId;
            uploadsRemaining = paymentResult.uploadsRemaining;
            await processAnalysis(paymentResult);
        } else {
            showError(paymentResult.error || 'Payment failed. Please try again.');
        }
    } catch (error) {
        console.error('Payment processing failed:', error);
        showError('Payment processing failed. Please try again.');
    } finally {
        // Reset button state
        const payButton = document.querySelector('.payment-form .primary-btn');
        if (payButton) {
            payButton.textContent = 'Pay ₹699';
            payButton.disabled = false;
        }
    }
}

async function processAnalysis(paymentResponse) {
    try {
        // Send project description for analysis
        const analysisResponse = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                projectDescription: projectDescription.value,
                paymentId: paymentResponse.paymentId
            })
        });

        const analysis = await analysisResponse.json();
        displayResults(analysis);
    } catch (error) {
        console.error('Analysis failed:', error);
        showError('Analysis failed. Please try again.');
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