const API = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';
const GOOGLE_CLIENT_ID = document.querySelector('meta[name="google-client-id"]')?.content || '';

function getClientId() {
  let id = localStorage.getItem('utiliy_client_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('utiliy_client_id', id);
  }
  return id;
}

function getToken() {
  return localStorage.getItem('utiliy_token');
}

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('utiliy_user') || 'null');
  } catch {
    return null;
  }
}

function setAuth(token, user) {
  localStorage.setItem('utiliy_token', token);
  localStorage.setItem('utiliy_user', JSON.stringify(user));
  updateAuthUI();
}

function clearAuth() {
  localStorage.removeItem('utiliy_token');
  localStorage.removeItem('utiliy_user');
  updateAuthUI();
}

function authHeaders() {
  const h = { 'Content-Type': 'application/json', 'X-Client-Id': getClientId() };
  const t = getToken();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function renderUsage(usage) {
  if (!usage) return;
  const pct = usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;
  const text = `${usage.used} / ${usage.limit} audits`;
  const tracker = document.getElementById('usage-tracker');
  const barFill = document.getElementById('usage-bar-fill');
  const trackerText = document.getElementById('usage-tracker-text');
  const ddFill = document.getElementById('usage-dropdown-fill');
  const ddText = document.getElementById('usage-dropdown-text');

  if (tracker) {
    tracker.hidden = false;
    tracker.classList.toggle('at-limit', usage.remaining <= 0);
  }
  if (barFill) barFill.style.width = `${pct}%`;
  if (trackerText) trackerText.textContent = text;
  if (ddFill) ddFill.style.width = `${pct}%`;
  if (ddText) {
    ddText.textContent = usage.remaining > 0
      ? `${usage.remaining} remaining this month`
      : 'Monthly limit reached';
  }

  const user = getUser();
  if (user) {
    user.usage = usage;
    localStorage.setItem('utiliy_user', JSON.stringify(user));
  }

  const submit = document.getElementById('audit-submit');
  if (submit) {
    submit.disabled = usage.remaining <= 0;
    submit.title = usage.remaining <= 0 ? 'Monthly audit limit reached' : '';
  }
}

async function refreshUsage() {
  try {
    const res = await fetch(`${API}/usage`, { headers: authHeaders() });
    if (!res.ok) return;
    const usage = await res.json();
    renderUsage(usage);
    return usage;
  } catch {
    return null;
  }
}

function showToast(msg, duration = 4000) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.setAttribute('hidden', ''), duration);
}

function showAuthPanel(name) {
  ['login', 'register', 'verify', 'forgot'].forEach((p) => {
    const el = document.getElementById(`auth-panel-${p}`);
    if (el) el.hidden = p !== name;
  });
}

function updateAuthUI() {
  const user = getUser();
  const guestActions = document.getElementById('guest-actions');
  const loggedInActions = document.getElementById('logged-in-actions');
  const navGuest = document.getElementById('nav-guest-mobile');
  const navUser = document.getElementById('nav-user-mobile');
  const userEl = document.getElementById('user-pill');
  const userMobile = document.getElementById('user-pill-mobile');
  const usageInline = document.getElementById('usage-dropdown-inline');

  if (!guestActions) return;

  if (user) {
    guestActions.hidden = true;
    loggedInActions.hidden = false;
    navGuest?.setAttribute('hidden', '');
    navUser?.removeAttribute('hidden');
    usageInline?.removeAttribute('hidden');
    const plan = user.plan === 'pro' ? 'Pro' : 'Free';
    const label = `${user.email.split('@')[0]} · ${plan}`;
    if (userEl) {
      userEl.textContent = label;
      userEl.title = user.email;
    }
    if (userMobile) userMobile.textContent = label;
  } else {
    guestActions.hidden = false;
    loggedInActions.hidden = true;
    navGuest?.removeAttribute('hidden');
    navUser?.setAttribute('hidden', '');
    usageInline?.setAttribute('hidden', '');
  }
  refreshUsage();
}

function showPaywall(msg) {
  const user = getUser();
  const overlay = document.getElementById('paywall-modal');
  const guestActions = document.getElementById('paywall-guest-actions');
  const userActions = document.getElementById('paywall-user-actions');
  const title = document.getElementById('paywall-title');
  const msgEl = document.getElementById('paywall-msg');

  if (!overlay) {
    alert(msg);
    return;
  }

  if (msgEl) msgEl.textContent = msg || '';
  sessionStorage.setItem('utiliy_paywall_active', '1');

  if (!user) {
    if (title) title.textContent = 'Create an account to continue';
    if (msgEl) {
      msgEl.textContent = msg || 'Your free audit is used. Sign up for an account, then subscribe to Pro for 80 audits per month.';
    }
    guestActions?.removeAttribute('hidden');
    userActions?.setAttribute('hidden', '');
  } else if (user.plan !== 'pro') {
    if (title) title.textContent = 'Upgrade to Pro';
    if (msgEl) {
      msgEl.textContent = msg || 'Upgrade to Pro for 80 product page audits per month.';
    }
    guestActions?.setAttribute('hidden', '');
    userActions?.removeAttribute('hidden');
  } else {
    if (title) title.textContent = 'Monthly limit reached';
    if (msgEl) {
      msgEl.textContent = msg || 'You have used all 80 audits this month. Your limit resets next month.';
    }
    guestActions?.setAttribute('hidden', '');
    userActions?.setAttribute('hidden', '');
  }

  overlay.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function openModal(id) {
  document.getElementById(id)?.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.setAttribute('hidden', '');
  if (!document.querySelector('.modal-overlay:not([hidden])')) {
    document.body.style.overflow = '';
  }
}

function openAuth(mode = 'login') {
  showAuthPanel(mode === 'register' ? 'register' : 'login');
  openModal('auth-modal');
  document.getElementById('site-nav')?.classList.remove('is-open');
}

let pendingVerifyEmail = '';

async function register(email, password) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  pendingVerifyEmail = email;
  document.getElementById('verify-pending-msg').textContent =
    `We sent a verification link to ${email}. Click it to activate your account.`;
  showAuthPanel('verify');
  return data;
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    if (data.verification_required) {
      pendingVerifyEmail = data.email || email;
      document.getElementById('verify-pending-msg').textContent =
        `Verify ${pendingVerifyEmail} before signing in. Check your inbox or resend below.`;
      showAuthPanel('verify');
    }
    throw new Error(data.error || 'Login failed');
  }
  setAuth(data.token, { email: data.user.email, plan: data.user.plan, email_verified: true });
  return data;
}

async function googleLogin(credential) {
  const res = await fetch(`${API}/auth/google`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ credential }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Google sign-in failed');
  setAuth(data.token, data.user);
  return data;
}

async function resendVerification() {
  const email = pendingVerifyEmail || document.getElementById('auth-email')?.value;
  if (!email) throw new Error('Enter your email first.');
  const res = await fetch(`${API}/auth/resend-verification`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not resend');
  return data;
}

async function forgotPassword(email) {
  const res = await fetch(`${API}/auth/forgot-password`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function startCheckout() {
  if (!getToken()) {
    openAuth('login');
    showToast('Sign in to continue to Stripe checkout');
    throw new Error('Sign in required');
  }
  const checkoutBtns = document.querySelectorAll('[data-checkout]');
  checkoutBtns.forEach((b) => { b.disabled = true; b.dataset.prevText = b.textContent; b.textContent = 'Redirecting…'; });
  try {
    const res = await fetch(`${API}/billing/checkout`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Checkout failed');
    window.location.href = data.url;
  } finally {
    checkoutBtns.forEach((b) => {
      b.disabled = false;
      if (b.dataset.prevText) b.textContent = b.dataset.prevText;
    });
  }
}

function initGoogleSignIn() {
  if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) return;

  const handleCredential = async (response) => {
    const err = document.getElementById('auth-error') || document.getElementById('register-error');
    try {
      await googleLogin(response.credential);
      closeModal('auth-modal');
      showToast('Signed in with Google');
      if (sessionStorage.getItem('utiliy_checkout_after_auth') === '1') {
        sessionStorage.removeItem('utiliy_checkout_after_auth');
        await startCheckout();
      }
    } catch (ex) {
      if (err) err.textContent = ex.message;
    }
  };

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredential,
    auto_select: false,
  });

  ['google-signin-btn', 'google-signin-btn-register'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'rectangular',
      });
    }
  });
}

function handleUpgradeSuccess() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgraded') === '1') {
    showToast('Welcome to Utiliy Pro! Your plan is now active.');
    fetch(`${API}/auth/me`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.email) {
          setAuth(getToken(), { email: data.email, plan: data.plan || 'pro' });
        }
      });
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }
  if (params.get('canceled') === '1') {
    showToast('Checkout canceled — you can upgrade anytime from Pricing.');
    window.history.replaceState({}, '', window.location.pathname);
  }
  if (params.get('reset') === '1') {
    showToast('Password updated. You are signed in.');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  handleUpgradeSuccess();
  refreshUsage();

  document.getElementById('btn-signin')?.addEventListener('click', () => openAuth('login'));
  document.getElementById('btn-signup')?.addEventListener('click', () => openAuth('register'));
  document.getElementById('btn-signin-mobile')?.addEventListener('click', () => openAuth('login'));
  document.getElementById('btn-signup-mobile')?.addEventListener('click', () => openAuth('register'));

  document.getElementById('auth-toggle')?.addEventListener('click', () => showAuthPanel('register'));
  document.getElementById('auth-toggle-back')?.addEventListener('click', () => showAuthPanel('login'));
  document.getElementById('btn-back-login')?.addEventListener('click', () => showAuthPanel('login'));
  document.getElementById('btn-back-from-forgot')?.addEventListener('click', () => showAuthPanel('login'));
  document.getElementById('btn-forgot')?.addEventListener('click', () => showAuthPanel('forgot'));

  document.getElementById('nav-toggle')?.addEventListener('click', () => {
    const nav = document.getElementById('site-nav');
    const btn = document.getElementById('nav-toggle');
    const open = nav.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  document.getElementById('btn-signout')?.addEventListener('click', () => {
    clearAuth();
    showToast('Signed out');
  });
  document.getElementById('btn-signout-mobile')?.addEventListener('click', () => {
    clearAuth();
    document.getElementById('site-nav')?.classList.remove('is-open');
    showToast('Signed out');
  });

  document.getElementById('paywall-signup')?.addEventListener('click', () => {
    closeModal('paywall-modal');
    sessionStorage.setItem('utiliy_checkout_after_auth', '1');
    openAuth('register');
  });
  document.getElementById('paywall-signin')?.addEventListener('click', () => {
    closeModal('paywall-modal');
    sessionStorage.setItem('utiliy_checkout_after_auth', '1');
    openAuth('login');
  });

  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('auth-error');
    err.textContent = '';
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submit = document.getElementById('auth-submit');
    submit.disabled = true;
    try {
      await login(email, password);
      closeModal('auth-modal');
      showToast('Signed in');
      if (sessionStorage.getItem('utiliy_checkout_after_auth') === '1') {
        sessionStorage.removeItem('utiliy_checkout_after_auth');
        await startCheckout();
      }
    } catch (ex) {
      if (!document.getElementById('auth-panel-verify').hidden) err.textContent = '';
      else err.textContent = ex.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('register-error');
    err.textContent = '';
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const submit = e.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await register(email, password);
      showToast('Check your email to verify your account');
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('forgot-error');
    err.textContent = '';
    const email = document.getElementById('forgot-email').value;
    try {
      await forgotPassword(email);
      showToast('If that email exists, a reset link was sent.');
      showAuthPanel('login');
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  document.getElementById('btn-resend-verify')?.addEventListener('click', async () => {
    try {
      await resendVerification();
      showToast('Verification email sent');
    } catch (ex) {
      showToast(ex.message);
    }
  });

  document.querySelectorAll('[data-checkout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        if (!getToken()) {
          sessionStorage.setItem('utiliy_checkout_after_auth', '1');
          openAuth('login');
          showToast('Sign in to continue to Stripe');
          return;
        }
        await startCheckout();
      } catch (ex) {
        if (ex.message !== 'Sign in required') alert(ex.message);
      }
    });
  });

  if (GOOGLE_CLIENT_ID) {
    const gsi = document.createElement('script');
    gsi.src = 'https://accounts.google.com/gsi/client';
    gsi.async = true;
    gsi.defer = true;
    gsi.onload = initGoogleSignIn;
    document.head.appendChild(gsi);
  }
});

window.UtiliyAuth = { getToken, getClientId, authHeaders, startCheckout, openModal, closeModal, getUser, showToast, openAuth, refreshUsage, renderUsage, showPaywall };
