const API_URL = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

const LABELS = {
  seo: 'SEO',
  structured_data: 'Structured data',
  product_information: 'Product info',
  images: 'Images',
  ai_readiness: 'AI readiness',
  content_quality: 'Content',
  conversion_clarity: 'Conversion',
  technical: 'Technical',
};

function scoreTier(n) {
  if (n >= 80) return 'good';
  if (n >= 60) return 'warn';
  return 'bad';
}

function ringSvg(score) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 80 ? '#059669' : score >= 60 ? '#d97706' : '#dc2626';
  return `<svg class="score-ring" viewBox="0 0 100 100">
    <circle class="bg" cx="50" cy="50" r="${r}"/>
    <circle class="fg" cx="50" cy="50" r="${r}" stroke="${color}"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}"/>
    <text x="50" y="54" text-anchor="middle">${score}</text>
  </svg>`;
}

function renderFix(fix) {
  const steps = (fix.steps || []).map((s) => `<li>${s}</li>`).join('');
  const copy = fix.copy_paste
    ? `<div class="copy-block"><button type="button" class="copy-btn" data-copy>Copy</button>${escapeHtml(fix.copy_paste)}</div>`
    : '';
  return `<article class="fix-card">
    <h4>${escapeHtml(fix.title)}</h4>
    <p class="fix-meta">${fix.category} · ~${fix.effort || '10 min'}</p>
    <p><strong>Problem:</strong> ${escapeHtml(fix.problem)}</p>
    <p><strong>Why it matters:</strong> ${escapeHtml(fix.why_it_matters)}</p>
    ${steps ? `<ol>${steps}</ol>` : ''}
    ${copy}
  </article>`;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderResults(data) {
  const cats = data.scores.categories;
  const catCards = Object.entries(cats)
    .map(([k, v]) => `<div class="cat-card ${scoreTier(v)}"><strong>${v}</strong><span>${LABELS[k] || k}</span></div>`)
    .join('');

  const fixes = (data.fixes || []).map(renderFix).join('') || '<p>No fixes generated.</p>';

  const seoIssues = (data.seo?.issues || [])
    .map((i) => `<li class="sev-${i.severity}">${escapeHtml(i.message)}</li>`)
    .join('');

  const images = (data.images?.results || [])
    .map(
      (img) => `<div class="image-card">
        <img src="${escapeHtml(img.src)}" alt="" loading="lazy" onerror="this.style.display='none'">
        <div class="img-meta">
          <strong>Alt:</strong> ${escapeHtml(img.alt || '—')}<br>
          ${img.caption ? `<strong>Vision:</strong> ${escapeHtml(img.caption)}<br>` : ''}
          ${(img.issues || []).map((x) => `<span style="color:var(--warn)">⚠ ${escapeHtml(x)}</span>`).join('<br>')}
        </div>
      </div>`
    )
    .join('');

  const critical = (data.issues?.critical || [])
    .map((i) => `<li>${escapeHtml(i.message)}</li>`)
    .join('');

  return `
    <div class="report-header">
      ${ringSvg(data.scores.overall)}
      <div>
        <p class="eyebrow">Audit complete</p>
        <h2 style="margin:0;font-family:var(--serif);">Product page score: ${data.scores.overall}/100</h2>
        <p style="color:var(--muted);font-size:.9rem;margin:.35rem 0 1rem;">
          ${escapeHtml(data.final_url)} · ${data.platform} · HTTP ${data.status_code}
        </p>
        <div class="category-grid">${catCards}</div>
      </div>
    </div>

    <div class="report-tabs" role="tablist">
      <button type="button" class="tab-btn active" data-tab="fixes">Fixes (${(data.fixes||[]).length})</button>
      <button type="button" class="tab-btn" data-tab="seo">SEO</button>
      <button type="button" class="tab-btn" data-tab="schema">Schema</button>
      <button type="button" class="tab-btn" data-tab="images">Images</button>
      <button type="button" class="tab-btn" data-tab="ai">AI shopping</button>
    </div>

    <div class="tab-panel active" id="tab-fixes">${fixes}</div>

    <div class="tab-panel" id="tab-seo">
      <div class="analysis-block">
        <h3>SEO analysis</h3>
        <p>${escapeHtml(data.seo?.analysis || '')}</p>
      </div>
      <div class="analysis-block">
        <h3>Signals</h3>
        <p>Title length: ${data.seo?.signals?.title_length || '—'} · Meta: ${data.seo?.signals?.meta_description_length || '—'} · H1 count: ${data.seo?.signals?.h1_count ?? '—'} · Images: ${data.seo?.signals?.image_count ?? '—'}</p>
      </div>
      ${seoIssues ? `<ul class="issue-list">${seoIssues}</ul>` : ''}
    </div>

    <div class="tab-panel" id="tab-schema">
      <div class="analysis-block">
        <h3>Structured data</h3>
        <p>Product schema: <strong>${data.structured_data?.has_product_schema ? 'Found' : 'Missing'}</strong> · JSON-LD blocks: ${data.structured_data?.json_ld_blocks_found ?? 0}</p>
        <p>Found: ${(data.structured_data?.properties_found || []).join(', ') || 'none'}</p>
        <p>Missing: ${(data.structured_data?.properties_missing || []).join(', ') || 'none'}</p>
      </div>
    </div>

    <div class="tab-panel" id="tab-images">
      <div class="analysis-block"><h3>Image analysis</h3><p>${escapeHtml(data.images?.summary || '')}</p></div>
      <div class="image-grid">${images || '<p>No images analyzed.</p>'}</div>
    </div>

    <div class="tab-panel" id="tab-ai">
      <div class="analysis-block">
        <h3>AI shopping readiness: ${data.ai_shopping_readiness?.score ?? '—'}/100</h3>
        <p>${escapeHtml(data.ai_shopping_readiness?.summary || '')}</p>
        <p><strong>Missing:</strong> ${(data.ai_shopping_readiness?.missing || []).join(', ') || 'none detected'}</p>
      </div>
      <div class="analysis-block">
        <h3>Extracted product facts</h3>
        <pre style="font-size:.82rem;overflow:auto;">${escapeHtml(JSON.stringify(data.product_information?.extracted || {}, null, 2))}</pre>
      </div>
      ${critical ? `<h3>Critical</h3><ul>${critical}</ul>` : ''}
    </div>
  `;
}

function showProgress(step) {
  const el = document.getElementById('audit-progress');
  if (!el) return;
  el.hidden = false;
  const steps = ['Crawling page…', 'Analyzing SEO & schema…', 'Running image vision…', 'Generating fixes…'];
  el.innerHTML = `<div class="progress-steps">${steps
    .map((s, i) => `<div class="progress-step ${i < step ? 'done' : i === step ? 'active' : ''}"><span class="step-dot"></span>${s}</div>`)
    .join('')}</div>`;
}

function showPaywall(msg) {
  const overlay = document.getElementById('paywall-modal');
  if (overlay) {
    document.getElementById('paywall-msg').textContent = msg;
    overlay.removeAttribute('hidden');
  } else {
    alert(msg);
  }
}

async function runAudit(url) {
  const progress = document.getElementById('audit-progress');
  const results = document.getElementById('audit-results');
  const submit = document.getElementById('audit-submit');

  results.hidden = true;
  submit.disabled = true;
  showProgress(0);

  const headers = window.UtiliyAuth ? window.UtiliyAuth.authHeaders() : { 'Content-Type': 'application/json' };

  try {
    const timers = [setTimeout(() => showProgress(1), 800), setTimeout(() => showProgress(2), 2500), setTimeout(() => showProgress(3), 4500)];

    const res = await fetch(`${API_URL}/audit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, use_ai: true, client_id: window.UtiliyAuth?.getClientId() }),
    });
    timers.forEach(clearTimeout);
    const data = await res.json();

    if (res.status === 402 || data.paywall) {
      showPaywall(data.error || 'Free plan includes 1 audit. Upgrade to Pro for unlimited audits.');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Audit failed');

    progress.hidden = true;
    results.innerHTML = renderResults(data);
    results.hidden = false;

    results.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        results.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        results.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add('active');
      });
    });

    results.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.parentElement.textContent.replace('Copy', '').trim();
        navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
      });
    });

    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    progress.hidden = true;
    alert(err.message || 'Audit failed');
  } finally {
    submit.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('audit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('audit-url').value.trim();
    if (url) runAudit(url);
  });
});
