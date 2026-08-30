const API = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

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

function updateAuthUI() {
  const user = getUser();
  const signIn = document.getElementById('btn-signin');
  const signUp = document.getElementById('btn-signup');
  const userEl = document.getElementById('user-pill');
  if (!signIn) return;
  if (user) {
    signIn.hidden = true;
    signUp.hidden = true;
    userEl.hidden = false;
    userEl.textContent = `${user.email.split('@')[0]} · ${user.plan}`;
  } else {
    signIn.hidden = false;
    signUp.hidden = false;
    userEl.hidden = true;
  }
}

function openModal(id) {
  document.getElementById(id)?.removeAttribute('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.setAttribute('hidden', '');
}

async function register(email, password) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  setAuth(data.token, data.user);
  return data;
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  setAuth(data.token, { email: data.user.email, plan: data.user.plan });
  return data;
}

async function startCheckout() {
  const res = await fetch(`${API}/billing/checkout`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Checkout failed');
  window.location.href = data.url;
}

document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();

  document.getElementById('btn-signin')?.addEventListener('click', () => openModal('auth-modal'));
  document.getElementById('btn-signup')?.addEventListener('click', () => openModal('auth-modal'));
  document.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });

  document.getElementById('auth-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('auth-error');
    err.textContent = '';
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const mode = document.getElementById('auth-mode').value;
    try {
      if (mode === 'register') await register(email, password);
      else await login(email, password);
      closeModal('auth-modal');
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  document.getElementById('auth-toggle')?.addEventListener('click', () => {
    const mode = document.getElementById('auth-mode');
    const isLogin = mode.value === 'login';
    mode.value = isLogin ? 'register' : 'login';
    document.getElementById('auth-title').textContent = isLogin ? 'Create account' : 'Sign in';
    document.getElementById('auth-submit').textContent = isLogin ? 'Create account' : 'Sign in';
    document.getElementById('auth-toggle').textContent = isLogin ? 'Already have an account? Sign in' : 'Need an account? Register';
  });

  document.querySelectorAll('[data-checkout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await startCheckout();
      } catch (ex) {
        alert(ex.message);
      }
    });
  });
});

window.UtiliyAuth = { getToken, getClientId, authHeaders, startCheckout, openModal, getUser };
