// =============================================
// AI Spec Generator - Frontend JavaScript
// =============================================

// === STATE ===
let currentStep = 1;
const totalSteps = 5;
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let lastGeneratedSpec = null;

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  initFormListeners();
  initColorPicker();
  initCharCount();

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});

// =============================================
// MULTI-STEP FORM NAVIGATION
// =============================================

function nextStep() {
  if (!validateStep(currentStep)) return;

  if (currentStep < totalSteps) {
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep++;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateProgress();
    document.querySelector('.generator-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function prevStep() {
  if (currentStep > 1) {
    document.getElementById(`step${currentStep}`).classList.remove('active');
    currentStep--;
    document.getElementById(`step${currentStep}`).classList.add('active');
    updateProgress();
  }
}

function updateProgress() {
  const fill = document.getElementById('progressFill');
  const pct = (currentStep / totalSteps) * 100;
  fill.style.width = `${pct}%`;

  document.querySelectorAll('.progress-step').forEach((el, i) => {
    const stepNum = i + 1;
    el.classList.remove('active', 'done');
    if (stepNum === currentStep) el.classList.add('active');
    else if (stepNum < currentStep) el.classList.add('done');
  });
}

function validateStep(step) {
  if (step === 1) {
    const desc = document.getElementById('appDescription').value.trim();
    if (desc.length < 20) {
      showToast('Please describe your app idea (at least 20 characters)', 'error');
      document.getElementById('appDescription').focus();
      return false;
    }
  }
  if (step === 3) {
    const features = getFeatures();
    if (features.length === 0) {
      showToast('Please add at least one feature', 'error');
      return false;
    }
  }
  return true;
}

// =============================================
// FORM HELPERS
// =============================================

function initFormListeners() {
  // Option cards — handle radio selection visuals
  document.querySelectorAll('.option-card input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const grid = radio.closest('.option-grid');
      grid.querySelectorAll('.option-card').forEach(c => c.classList.remove('selected'));
      radio.closest('.option-card').classList.add('selected');
    });
  });

  // Hamburger menu
  const hamburger = document.getElementById('hamburger');
  if (hamburger) {
    hamburger.addEventListener('click', () => {
      const navLinks = document.querySelector('.nav-links');
      const authSection = document.querySelector('.auth-section');
      if (navLinks) {
        navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
      }
      if (authSection) {
        authSection.style.display = authSection.style.display === 'flex' ? 'none' : 'flex';
      }
    });
  }
}

function initColorPicker() {
  const picker = document.getElementById('colorScheme');
  const hex = document.getElementById('colorHex');
  if (picker && hex) {
    picker.addEventListener('input', () => {
      hex.textContent = picker.value;
    });
  }
}

function initCharCount() {
  const desc = document.getElementById('appDescription');
  const count = document.getElementById('descCount');
  if (desc && count) {
    desc.addEventListener('input', () => {
      count.textContent = desc.value.length;
    });
  }
}

// Feature management
function addFeature() {
  const list = document.getElementById('featuresList');
  const div = document.createElement('div');
  div.className = 'feature-item';
  div.innerHTML = `
    <input type="text" placeholder="e.g. Dashboard with analytics" class="input feature-input">
    <button onclick="removeFeature(this)" class="btn-icon">&times;</button>
  `;
  list.appendChild(div);
  div.querySelector('input').focus();
}

function removeFeature(btn) {
  const list = document.getElementById('featuresList');
  if (list.children.length > 1) {
    btn.closest('.feature-item').remove();
  } else {
    showToast('You need at least one feature', 'error');
  }
}

function getFeatures() {
  const inputs = document.querySelectorAll('#featuresList .feature-input');
  return Array.from(inputs)
    .map(input => input.value.trim())
    .filter(v => v.length > 0);
}

// FAQ toggle
function toggleFaq(btn) {
  const item = btn.closest('.faq-item');
  item.classList.toggle('open');
}

// =============================================
// COLLECT ALL FORM DATA
// =============================================

function collectFormData() {
  return {
    appName: document.getElementById('appName').value.trim(),
    appDescription: document.getElementById('appDescription').value.trim(),
    problemSolved: document.getElementById('problemSolved').value.trim(),
    targetUsers: document.getElementById('targetUsers').value.trim(),
    platform: document.querySelector('input[name="platform"]:checked')?.value || 'web',
    aiTool: document.querySelector('input[name="aiTool"]:checked')?.value || 'claude-code',
    features: getFeatures(),
    userRoles: Array.from(document.querySelectorAll('input[name="userRoles"]:checked')).map(cb => cb.value),
    authType: document.getElementById('authType').value,
    techStack: document.getElementById('techStack').value,
    database: document.getElementById('database').value,
    needsPayments: document.getElementById('needsPayments').checked,
    needsUploads: document.getElementById('needsUploads').checked,
    needsRealtime: document.getElementById('needsRealtime').checked,
    darkMode: document.getElementById('darkMode').checked,
    designStyle: document.querySelector('input[name="designStyle"]:checked')?.value || 'minimal',
    colorScheme: document.getElementById('colorScheme').value,
    referenceUrl: document.getElementById('referenceUrl').value.trim()
  };
}

// =============================================
// SPEC GENERATION
// =============================================

async function generateSpec(type) {
  // Validate final step
  if (!validateStep(currentStep)) return;

  const formData = collectFormData();

  // For Pro: need to be logged in and pay first
  if (type === 'pro') {
    if (!authToken) {
      showToast('Please sign up or login to get the Pro spec pack', 'error');
      showRegisterModal();
      return;
    }
    // Start payment flow
    await startProPayment(formData);
    return;
  }

  // Free spec generation
  await doGenerate(formData, 'free', null);
}

async function doGenerate(formData, specType, paymentId) {
  showLoading('Generating your spec...', 'Our AI is crafting a production-ready specification. This takes 30-60 seconds.');

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const body = { ...formData, specType };
    if (paymentId) body.paymentId = paymentId;

    const res = await fetch('/api/spec/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Generation failed');
    }

    lastGeneratedSpec = data;
    hideModal();
    showSpecResult(data);
    showToast('Spec generated successfully!', 'success');

  } catch (err) {
    hideModal();
    console.error('Generation error:', err);
    showToast(err.message || 'Failed to generate spec. Please try again.', 'error');
  }
}

function showSpecResult(data) {
  const isPro = data.specType === 'pro';
  const preview = data.basicSpec ? data.basicSpec.substring(0, 2000) : 'No preview available';
  const truncated = data.basicSpec && data.basicSpec.length > 2000;

  let actionsHtml = '';

  if (isPro && data.specId) {
    actionsHtml = `
      <div class="spec-actions">
        <button onclick="downloadSpecPack('${data.specId}')" class="btn btn-primary">&#128230; Download Pro Pack (.zip)</button>
        <button onclick="downloadSingleSpec('${data.specId}')" class="btn btn-ghost">&#128196; Download Single .md</button>
        <button onclick="copySpec()" class="btn btn-ghost">&#128203; Copy to Clipboard</button>
      </div>
    `;
  } else if (data.specId) {
    actionsHtml = `
      <div class="spec-actions">
        <button onclick="downloadSingleSpec('${data.specId}')" class="btn btn-primary">&#128196; Download .md File</button>
        <button onclick="copySpec()" class="btn btn-ghost">&#128203; Copy to Clipboard</button>
        <a href="#pricing" onclick="hideModal()" class="btn btn-accent">&#11088; Upgrade to Pro Pack</a>
      </div>
    `;
  } else {
    // Anonymous user — no specId, offer copy and signup
    actionsHtml = `
      <div class="spec-actions">
        <button onclick="copySpec()" class="btn btn-primary">&#128203; Copy to Clipboard</button>
        <button onclick="downloadSpecDirect()" class="btn btn-ghost">&#128196; Download .md File</button>
        <button onclick="hideModal(); showRegisterModal()" class="btn btn-accent">Sign Up to Save Specs</button>
      </div>
    `;
  }

  const html = `
    <button class="modal-close" onclick="hideModal()">&times;</button>
    <div class="spec-result">
      <h2>${isPro ? '&#11088; Pro Spec Pack Generated!' : '&#9889; Your Spec is Ready!'}</h2>
      <p style="color:var(--text-dim);margin:8px 0 16px">${isPro ? 'Your 6-file spec pack is ready to download.' : 'Copy this into your AI coding tool and start building.'}</p>
      <div class="spec-preview" id="specPreview">${escapeHtml(preview)}${truncated ? '\n\n... [truncated - download for full spec]' : ''}</div>
      ${actionsHtml}
    </div>
  `;

  showModal(html);
}

function copySpec() {
  if (!lastGeneratedSpec || !lastGeneratedSpec.basicSpec) {
    showToast('No spec to copy', 'error');
    return;
  }
  navigator.clipboard.writeText(lastGeneratedSpec.basicSpec).then(() => {
    showToast('Spec copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback: select text in preview
    const pre = document.getElementById('specPreview');
    if (pre) {
      const range = document.createRange();
      range.selectNodeContents(pre);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      showToast('Text selected - press Ctrl+C to copy', 'success');
    }
  });
}

function downloadSingleSpec(specId) {
  window.open(`/api/spec/${specId}/download`, '_blank');
}

function downloadSpecPack(specId) {
  window.open(`/api/spec/${specId}/download-pack`, '_blank');
}

function downloadSpecDirect() {
  // For anonymous users — download spec directly from memory
  if (!lastGeneratedSpec || !lastGeneratedSpec.basicSpec) {
    showToast('No spec to download', 'error');
    return;
  }
  const blob = new Blob([lastGeneratedSpec.basicSpec], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const appName = document.getElementById('appName').value.trim() || 'app';
  a.download = `${appName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-spec.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Spec downloaded!', 'success');
}

// =============================================
// RAZORPAY PAYMENT (Pro Tier)
// =============================================

async function startProPayment(formData) {
  if (!authToken) {
    showToast('Please login first', 'error');
    showLoginModal();
    return;
  }

  showLoading('Setting up payment...', 'Creating your order. Please wait.');

  try {
    // 1. Create order on backend
    const orderRes = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ amount: 29900, currency: 'INR' }) // Rs.299 in paise
    });

    const orderData = await orderRes.json();
    if (!orderRes.ok) throw new Error(orderData.error || 'Failed to create order');

    hideModal();

    // 2. Open Razorpay checkout
    if (typeof Razorpay === 'undefined') {
      throw new Error('Payment service not loaded. Please refresh the page.');
    }

    const options = {
      key: orderData.key,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'AI Spec Generator',
      description: 'Pro Spec Pack - 6 Files',
      order_id: orderData.id,
      prefill: {
        email: currentUser?.email || '',
        name: currentUser?.name || ''
      },
      theme: {
        color: '#2563eb'
      },
      handler: async function(response) {
        // 3. Verify payment then generate
        await verifyAndGenerate(response, formData);
      },
      modal: {
        ondismiss: function() {
          showToast('Payment cancelled', 'error');
        }
      }
    };

    const rzp = new Razorpay(options);
    rzp.open();

  } catch (err) {
    hideModal();
    console.error('Payment error:', err);
    showToast(err.message || 'Payment setup failed', 'error');
  }
}

async function verifyAndGenerate(razorpayResponse, formData) {
  showLoading('Verifying payment...', 'Almost there. Confirming your payment.');

  try {
    // Verify payment
    const verifyRes = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || 'Payment verification failed');

    showToast('Payment verified! Generating your Pro spec pack...', 'success');

    // Now generate the pro spec
    await doGenerate(formData, 'pro', verifyData.paymentId);

  } catch (err) {
    hideModal();
    console.error('Verification error:', err);
    showToast(err.message || 'Payment verification failed. Contact support.', 'error');
  }
}

// =============================================
// AUTHENTICATION
// =============================================

function showLoginModal() {
  const html = `
    <button class="modal-close" onclick="hideModal()">&times;</button>
    <div class="auth-form">
      <h2>Welcome Back</h2>
      <p>Login to save and manage your specs</p>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="loginEmail" class="input" placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="loginPassword" class="input" placeholder="Your password">
      </div>
      <button onclick="doLogin()" class="btn btn-primary" id="loginBtn">Login</button>
      <div class="switch-link">
        Don't have an account? <a onclick="showRegisterModal()">Sign up free</a>
      </div>
    </div>
  `;
  showModal(html);

  // Enter key to submit + autofocus
  setTimeout(() => {
    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    if (emailInput) emailInput.focus();
    [emailInput, passInput].forEach(el => {
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });
  }, 100);
}

function showRegisterModal() {
  const html = `
    <button class="modal-close" onclick="hideModal()">&times;</button>
    <div class="auth-form">
      <h2>Create Account</h2>
      <p>Sign up to save specs and unlock Pro features</p>
      <div class="form-group">
        <label>Name <span class="optional">(optional)</span></label>
        <input type="text" id="regName" class="input" placeholder="Your name">
      </div>
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="regEmail" class="input" placeholder="you@example.com">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="regPassword" class="input" placeholder="Min 6 characters">
      </div>
      <button onclick="doRegister()" class="btn btn-primary" id="regBtn">Create Account</button>
      <div class="switch-link">
        Already have an account? <a onclick="showLoginModal()">Login</a>
      </div>
    </div>
  `;
  showModal(html);

  setTimeout(() => {
    const nameInput = document.getElementById('regName');
    if (nameInput) nameInput.focus();
    const passInput = document.getElementById('regPassword');
    if (passInput) passInput.addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
  }, 100);
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginBtn');

  if (!email || !password) {
    showToast('Please enter email and password', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Logging in...';

  try {
    const res = await fetch('/api/user/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', data.token);
    updateAuthUI();
    hideModal();
    showToast(`Welcome back, ${data.user.name || data.user.email}!`, 'success');

  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Login';
    showToast(err.message || 'Login failed', 'error');
  }
}

async function doRegister() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const btn = document.getElementById('regBtn');

  if (!email || !password) {
    showToast('Please enter email and password', 'error');
    return;
  }
  if (password.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account...';

  try {
    const res = await fetch('/api/user/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('authToken', data.token);
    updateAuthUI();
    hideModal();
    showToast('Account created! You can now save specs.', 'success');

  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Create Account';
    showToast(err.message || 'Registration failed', 'error');
  }
}

function logout() {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('authToken');
  updateAuthUI();
  showToast('Logged out', 'success');
}

function updateAuthUI() {
  const section = document.getElementById('authSection');
  if (!section) return;

  if (authToken) {
    fetchProfile();
    section.innerHTML = `
      <span style="color:var(--text-dim);font-size:0.85rem" id="userGreeting">Account</span>
      <button onclick="showMySpecs()" class="btn btn-ghost btn-sm">My Specs</button>
      <button onclick="logout()" class="btn btn-ghost btn-sm">Logout</button>
    `;
  } else {
    section.innerHTML = `
      <button onclick="showLoginModal()" class="btn btn-ghost">Login</button>
      <button onclick="showRegisterModal()" class="btn btn-primary btn-sm">Sign Up Free</button>
    `;
  }
}

async function fetchProfile() {
  try {
    const res = await fetch('/api/user/profile', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      const greeting = document.getElementById('userGreeting');
      if (greeting) {
        greeting.textContent = currentUser.name || currentUser.email.split('@')[0];
      }
    } else if (res.status === 401) {
      // Token expired
      logout();
    }
  } catch (e) {
    console.error('Profile fetch failed:', e);
  }
}

// =============================================
// MY SPECS LIST
// =============================================

async function showMySpecs() {
  if (!authToken) {
    showLoginModal();
    return;
  }

  showLoading('Loading your specs...', '');

  try {
    const res = await fetch('/api/spec/', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load specs');

    const specs = data.specs || [];

    let listHtml;
    if (specs.length === 0) {
      listHtml = '<p style="color:var(--text-dim);text-align:center;padding:24px">No specs yet. Generate your first one!</p>';
    } else {
      listHtml = specs.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg-input);border-radius:var(--radius-sm);margin-bottom:8px">
          <div>
            <strong>${escapeHtml(s.appName || 'Untitled')}</strong>
            <span style="background:${s.specType === 'pro' ? 'var(--accent)' : 'var(--primary)'};color:${s.specType === 'pro' ? '#000' : '#fff'};padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:8px">${s.specType.toUpperCase()}</span>
            <div style="font-size:0.8rem;color:var(--text-dim);margin-top:2px">${escapeHtml(s.platform || '')} &middot; ${escapeHtml(s.aiTool || '')} &middot; ${new Date(s.createdAt).toLocaleDateString()}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button onclick="downloadSingleSpec('${s.id}')" class="btn btn-ghost btn-sm">.md</button>
            ${s.specType === 'pro' ? `<button onclick="downloadSpecPack('${s.id}')" class="btn btn-primary btn-sm">.zip</button>` : ''}
          </div>
        </div>
      `).join('');
    }

    const html = `
      <button class="modal-close" onclick="hideModal()">&times;</button>
      <h2 style="margin-bottom:16px">My Specs</h2>
      <div style="max-height:60vh;overflow-y:auto">${listHtml}</div>
    `;

    showModal(html);

  } catch (err) {
    hideModal();
    showToast(err.message || 'Failed to load specs', 'error');
  }
}

// =============================================
// MODAL & TOAST
// =============================================

function showModal(contentHtml) {
  const modal = document.getElementById('modal');
  const content = document.getElementById('modalContent');
  content.innerHTML = contentHtml;
  modal.classList.add('active');

  // Close on outside click
  modal.onclick = (e) => {
    if (e.target === modal) hideModal();
  };

  // Close on Escape
  document.addEventListener('keydown', modalEscHandler);
}

function hideModal() {
  const modal = document.getElementById('modal');
  modal.classList.remove('active');
  document.removeEventListener('keydown', modalEscHandler);
}

function modalEscHandler(e) {
  if (e.key === 'Escape') hideModal();
}

function showLoading(title, subtitle) {
  const html = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <h3>${title || 'Loading...'}</h3>
      <p>${subtitle || 'Please wait'}</p>
    </div>
  `;
  showModal(html);
}

let toastTimeout;
function showToast(message, type) {
  type = type || 'success';
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// =============================================
// UTILITIES
// =============================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
