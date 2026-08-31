const API_URL = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

const PILLARS = [
  { key: 'google_seo', label: 'Google SEO', section: 'seo' },
  { key: 'ai_visibility', label: 'AI Visibility', section: 'ai' },
  { key: 'content', label: 'Content', section: 'content' },
  { key: 'keywords', label: 'Keywords', section: 'keywords' },
  { key: 'images', label: 'Images', section: 'images' },
  { key: 'schema', label: 'Schema', section: 'schema' },
];

const LABELS = {
  google_seo: 'Google SEO',
  ai_visibility: 'AI Visibility',
  content: 'Content',
  keywords: 'Keywords',
  images: 'Images',
  schema: 'Schema',
  seo: 'Google SEO',
  structured_data: 'Schema',
  product_information: 'Content',
  ai_readiness: 'AI Visibility',
  content_quality: 'Content',
  conversion_clarity: 'AI Visibility',
  technical: 'Google SEO',
};

const IMPACT_BY_CATEGORY = {
  seo: { text: 'Google SEO impact', cls: 'high' },
  technical: { text: 'Google SEO impact', cls: 'high' },
  structured_data: { text: 'Search & schema impact', cls: 'medium' },
  ai_readiness: { text: 'AI visibility impact', cls: 'high' },
  product_information: { text: 'AI visibility impact', cls: 'high' },
  content_quality: { text: 'Content impact', cls: 'medium' },
  images: { text: 'Conversion impact', cls: 'medium' },
  keywords: { text: 'Keyword impact', cls: 'high' },
};

const SECTION_FOR_CATEGORY = {
  seo: 'seo',
  technical: 'seo',
  structured_data: 'schema',
  product_information: 'content',
  images: 'images',
  content_quality: 'content',
  ai_readiness: 'ai',
  conversion_clarity: 'ai',
  keywords: 'keywords',
};

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scoreTier(n) {
  if (n >= 80) return 'good';
  if (n >= 60) return 'warn';
  return 'bad';
}

function scoreColor(n) {
  return n >= 80 ? '#34c759' : n >= 60 ? '#ff9f0a' : '#ff3b30';
}

function overallStatus(score) {
  if (score >= 80) return { label: 'Strong visibility', tier: 'good' };
  if (score >= 60) return { label: 'Room to optimize', tier: 'warn' };
  return { label: 'Needs attention', tier: 'bad' };
}

function visibilityPillars(data) {
  const pillars = data.visibility?.pillars || data.scores?.pillars;
  if (pillars) return pillars;
  const c = data.scores?.categories || {};
  return {
    google_seo: Math.round(((c.seo || 0) + (c.technical || 0)) / 2),
    ai_visibility: Math.round(((c.ai_readiness || 0) + (c.conversion_clarity || 0)) / 2),
    content: Math.round(((c.content_quality || 0) + (c.product_information || 0)) / 2),
    keywords: keywordScore(data.keywords),
    images: c.images || 0,
    schema: c.structured_data || 0,
  };
}

function pillarScore(pillars, key) {
  const val = pillars[key];
  return val == null ? null : Math.round(val);
}

function keywordScore(kw) {
  const rows = kw?.title_alignment || [];
  if (!rows.length) return null;
  const good = rows.filter((r) => r.status === 'good' || r.status === 'body').length;
  return Math.round((good / rows.length) * 100);
}

function executiveSummary(data) {
  const llm = data.llm_analysis;
  if (llm?.seo_analysis) return llm.seo_analysis;
  if (llm?.content_analysis) return llm.content_analysis;
  if (data.seo?.analysis) return data.seo.analysis;
  if (data.ai_shopping_readiness?.summary) return data.ai_shopping_readiness.summary;
  return 'Your product page has optimization opportunities. Start with the top actions below to improve visibility in Google and AI search.';
}

function impactLabel(i) {
  if (i < 2) return { text: 'High impact', cls: 'high' };
  if (i < 5) return { text: 'Medium impact', cls: 'medium' };
  return { text: 'Lower impact', cls: 'low' };
}

function animateCounter(el, target, duration = 700) {
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function scrollToSection(id) {
  const el = document.querySelector(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 88;
  window.scrollTo({ top, behavior: 'smooth' });
}

function bigScoreRing(score) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return `<div class="cockpit-score-ring" data-score="${score}">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="${r}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="8"/>
      <circle class="hero-ring-progress" cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" stroke-linecap="round" transform="rotate(-90 60 60)"/>
    </svg>
    <div class="cockpit-score-inner">
      <strong class="hero-score-val">0</strong>
      <span>/ 100</span>
    </div>
  </div>`;
}

function fixImpact(fix, i) {
  const mapped = IMPACT_BY_CATEGORY[fix.category];
  if (mapped) return mapped;
  return impactLabel(i);
}

function renderScoreDashboard(pillars) {
  return PILLARS.map(({ key, label, section }) => {
    const val = pillarScore(pillars, key);
    if (val == null) return '';
    const tier = scoreTier(val);
    return `<button type="button" class="score-nav-row ${tier}" data-scroll="#lab-${section}">
      <span class="score-nav-label">${label}</span>
      <span class="score-nav-track"><span class="score-nav-fill" style="width:${val}%"></span></span>
      <strong class="score-nav-val">${val}</strong>
    </button>`;
  }).join('');
}

function renderPriorityFix(fix, i) {
  const impact = fixImpact(fix, i);
  const section = SECTION_FOR_CATEGORY[fix.category] || 'priorities';
  const categoryLabel = LABELS[fix.category] || (fix.category?.replace(/_/g, ' ') || 'General');
  const copy = fix.copy_paste
    ? `<button type="button" class="btn btn-primary btn-sm" data-scroll="#lab-fixes-all">Get copy-paste fix</button>`
    : '';
  return `<article class="priority-fix">
    <div class="priority-fix-top">
      <span class="priority-rank">${i + 1}</span>
      <div class="priority-fix-title">
        <h4>${escapeHtml(fix.title)}</h4>
        <span class="impact-tag ${impact.cls}">${impact.text}</span>
      </div>
    </div>
    <p class="priority-problem">${escapeHtml(fix.problem)}</p>
    <p class="priority-why"><strong>Why it matters:</strong> ${escapeHtml(fix.why_it_matters)}</p>
    <div class="priority-meta">
      <span>${escapeHtml(categoryLabel)}</span>
      <span>~${escapeHtml(fix.effort || '10 min')}</span>
    </div>
    <div class="priority-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-scroll="#lab-${section}">View details</button>
      ${copy}
    </div>
  </article>`;
}

function renderBeforeAfter(label, current, recommended) {
  if (!recommended || recommended === current) return '';
  return `<div class="compare-block">
    <p class="compare-label">${escapeHtml(label)}</p>
    <div class="compare-col">
      <span class="compare-tag">Current</span>
      <p>${escapeHtml(current || '—')}</p>
    </div>
    <div class="compare-arrow" aria-hidden="true">↓</div>
    <div class="compare-col recommended">
      <span class="compare-tag">Recommended</span>
      <p>${escapeHtml(recommended)}</p>
    </div>
  </div>`;
}

function renderAIStrategist(data, fixes, tm) {
  const llm = data.llm_analysis || {};
  const topFix = fixes[0];
  const currentTitle = tm.title || data.meta?.title || '';
  let recommendedTitle = '';
  const titleFix = fixes.find((f) => f.category === 'seo' && f.copy_paste && f.copy_paste.length < 120 && !f.copy_paste.includes('<'));
  if (titleFix) recommendedTitle = titleFix.copy_paste;
  const intro = llm.content_analysis || llm.ai_shopping_notes || data.conversion?.analysis || '';
  const compare = renderBeforeAfter('Product title', currentTitle, recommendedTitle);

  return `
    <p class="strategist-intro">${escapeHtml(intro || 'Here is what we would prioritize to strengthen this listing.')}</p>
    ${compare || ''}
    ${topFix ? `<div class="strategist-opportunity">
      <p class="strategist-kicker">Biggest opportunity</p>
      <h4>${escapeHtml(topFix.title)}</h4>
      <p>${escapeHtml(topFix.problem)}</p>
      ${topFix.copy_paste ? `<div class="copy-block"><button type="button" class="copy-btn">Copy recommendation</button><pre>${escapeHtml(topFix.copy_paste)}</pre></div>` : ''}
    </div>` : ''}
    ${llm.seo_analysis ? `<p class="strategist-note">${escapeHtml(llm.seo_analysis)}</p>` : ''}
  `;
}

function issueCard(issue) {
  const sev = issue.severity || 'medium';
  return `<div class="issue-row">
    <span class="issue-sev ${sev}">${sev}</span>
    <span>${escapeHtml(issue.message)}</span>
  </div>`;
}

function lengthMeter(label, text, length, status, ideal) {
  const pct = Math.min(100, (length / 70) * 100);
  return `<div class="metric-card">
    <div class="metric-head"><label>${label}</label><span class="status-tag ${status}">${status === 'good' ? 'Optimal' : status === 'missing' ? 'Missing' : status}</span></div>
    <p class="metric-value">${escapeHtml(text) || '<em>Not found</em>'}</p>
    <div class="meter"><div class="meter-fill ${status}" style="width:${length ? pct : 0}%"></div></div>
    <div class="meter-labels"><span>0</span><span>${ideal}</span><span>${length} chars</span></div>
  </div>`;
}

function renderKeywords(kw) {
  if (!kw) return '<p class="lab-empty">No keyword data.</p>';
  const table = (kw.title_alignment || [])
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.term)}</td>
        <td><span class="align-dot ${r.status}"></span> ${r.status === 'body' ? 'in copy' : r.status}</td>
        <td>${r.in_title ? 'Yes' : '—'}</td>
        <td>${r.in_h1 ? 'Yes' : '—'}</td>
      </tr>`
    )
    .join('');
  const opps = (kw.opportunities || []).map((o) => `<li>${escapeHtml(o)}</li>`).join('');
  return `
    <p class="section-lead">${escapeHtml(kw.summary || '')}</p>
    <div class="kw-cloud">${(kw.top_keywords || []).map((k) => `<span class="kw-tag ${k.in_title ? 'in-title' : ''}">${escapeHtml(k.term)}</span>`).join('')}</div>
    <div class="table-wrap"><table class="kw-table">
      <thead><tr><th>Keyword</th><th>Alignment</th><th>In title</th><th>In H1</th></tr></thead>
      <tbody>${table}</tbody>
    </table></div>
    ${opps ? `<div class="opps-list"><h4>Opportunities</h4><ul>${opps}</ul></div>` : ''}
  `;
}

function renderSchemaPanel(data) {
  const platform = data.platform_label || data.platform || 'generic';
  const checklist = (data.lab?.schema_checklist || []).map((item) => {
    const icon = item.status === 'found' ? '✓' : item.status === 'missing' ? '✗' : '·';
    return `<div class="schema-chip ${item.status}">${icon} ${escapeHtml(item.property)}</div>`;
  }).join('');
  const snippets = (data.structured_data?.snippets || data.page_code?.json_ld_snippets || []);
  const snippetBlocks = snippets
    .map((s, i) => `<details class="evidence-panel"><summary>JSON-LD block ${i + 1}</summary><div class="code-viewer">${escapeHtml(s)}</div></details>`)
    .join('');
  const modeNote = ['amazon', 'shopify', 'woocommerce'].includes(data.platform)
    ? `<p class="section-lead">Platform audit: <strong>${escapeHtml(platform)}</strong> — checklist reflects listing data extracted for this marketplace (not merchant JSON-LD).</p>`
    : '';
  return `
    ${modeNote}
    <div class="schema-status">
      <span>Product schema: <strong>${data.structured_data?.has_product_schema ? 'JSON-LD detected' : `${escapeHtml(platform)} listing data`}</strong></span>
      <span>${data.structured_data?.json_ld_blocks_found ?? 0} JSON-LD blocks</span>
    </div>
    <div class="schema-grid">${checklist}</div>
    ${snippetBlocks || '<p class="lab-empty">No public JSON-LD on this marketplace listing.</p>'}
  `;
}

function imgUrl(img) {
  let src = img.src_display || img.src || '';
  if (src.startsWith('//')) src = 'https:' + src;
  if (src.includes('cdn.shopify.com') || src.includes('/cdn/shop/') || src.includes('media-amazon.com')) {
    return `${API_URL}/img?url=${encodeURIComponent(src)}`;
  }
  return src;
}

function imageChecks(img) {
  const checks = [];
  if (img.alt && img.alt.trim()) checks.push({ ok: true, text: 'Alt text present' });
  else checks.push({ ok: false, text: 'Missing alt text' });
  if (img.status === 'good') checks.push({ ok: true, text: 'Good quality' });
  else if (img.status === 'warn') checks.push({ ok: false, text: 'Quality needs improvement' });
  else if (img.status === 'bad') checks.push({ ok: false, text: 'Low quality' });
  if (img.caption) checks.push({ ok: true, text: 'Relevant to product' });
  return checks;
}

function renderImages(gallery, imageScore, summary) {
  if (!gallery?.length) return '<p class="lab-empty">No product images found.</p>';
  const items = gallery.map((img, i) => {
    const src = imgUrl(img);
    const checks = imageChecks(img);
    return `<article class="img-audit-item">
      <div class="img-audit-preview">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt || `Product image ${i + 1}`)}" loading="lazy" referrerpolicy="no-referrer"
          onerror="this.classList.add('img-broken'); this.nextElementSibling?.classList.add('show');">
        <div class="img-fallback">Preview blocked</div>
        <span class="img-num">Image ${i + 1}</span>
      </div>
      <div class="img-audit-detail">
        <ul class="img-checklist">${checks.map((c) => `<li class="${c.ok ? 'pass' : 'warn'}">${c.text}</li>`).join('')}</ul>
        ${img.caption ? `<p class="img-caption">${escapeHtml(img.caption)}</p>` : ''}
        ${img.fix ? `<p class="img-rec">${escapeHtml(img.fix)}</p>` : ''}
      </div>
    </article>`;
  }).join('');
  return `
    <div class="img-audit-score">
      <span>Image analysis</span>
      <strong>${imageScore ?? '—'}/100</strong>
    </div>
    ${summary ? `<p class="section-lead">${escapeHtml(summary)}</p>` : ''}
    <div class="img-audit-grid">${items}</div>
  `;
}

const PRODUCT_FIELDS = [
  'name', 'brand', 'price', 'compare_at_price', 'sku', 'availability',
  'weight', 'category', 'material', 'warranty', 'shipping', 'returns',
];

function renderProductFacts(lab, data) {
  const fields = lab?.product_fields;
  if (!fields) return '';
  const extracted = fields.extracted || data?.product_information?.extracted || {};
  const missingSet = new Set(fields.missing || []);
  return [...new Set([...PRODUCT_FIELDS, ...Object.keys(extracted)])]
    .filter((key) => PRODUCT_FIELDS.includes(key) || extracted[key])
    .map((key) => {
      const val = extracted[key];
      const missing = missingSet.has(key) && !val;
      return `<div class="fact-chip ${missing ? 'missing' : val ? 'found' : ''}">
        <label>${escapeHtml(key.replace(/_/g, ' '))}</label>
        <span>${missing ? 'Not found' : escapeHtml(String(val || '—'))}</span>
      </div>`;
    })
    .join('');
}

function renderFixDetail(fix, i) {
  const steps = (fix.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const copy = fix.copy_paste
    ? `<div class="copy-block"><button type="button" class="copy-btn">Copy</button><pre>${escapeHtml(fix.copy_paste)}</pre></div>`
    : '';
  return `<article class="fix-detail">
    <h4>${i + 1}. ${escapeHtml(fix.title)}</h4>
    <p class="fix-meta">${escapeHtml(fix.category)} · ~${escapeHtml(fix.effort || '10 min')}</p>
    <p>${escapeHtml(fix.problem)}</p>
    <p class="fix-why">${escapeHtml(fix.why_it_matters)}</p>
    ${steps ? `<ol>${steps}</ol>` : ''}
    ${copy}
  </article>`;
}

async function runOptimization(url) {
  const progress = document.getElementById('audit-progress');
  const results = document.getElementById('audit-results');
  const submit = document.getElementById('audit-submit');

  results.hidden = true;
  results.innerHTML = '';
  submit.disabled = true;
  document.body.classList.add('optimizer-active', 'audit-active');
  showScanning(0);

  const headers = window.UtiliyAuth ? window.UtiliyAuth.authHeaders() : { 'Content-Type': 'application/json' };

  try {
    const timers = [
      setTimeout(() => showScanning(1), 600),
      setTimeout(() => showScanning(2), 2200),
      setTimeout(() => showScanning(3), 4500),
      setTimeout(() => showScanning(4), 6500),
    ];

    const res = await fetch(`${API_URL}/audit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, use_ai: true, client_id: window.UtiliyAuth?.getClientId() }),
    });
    timers.forEach(clearTimeout);
    const data = await res.json();

    if (res.status === 402 || data.paywall) {
      document.body.classList.remove('optimizer-active', 'audit-active');
      progress.hidden = true;
      if (data.usage) window.UtiliyAuth?.renderUsage(data.usage);
      showPaywall(data.error || 'You have reached your optimization limit. Upgrade to continue.');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Scan failed');

    if (data.usage) window.UtiliyAuth?.renderUsage(data.usage);

    progress.hidden = true;
    results.innerHTML = renderOptimizerApp(data);
    results.hidden = false;
    results.classList.add('lab-enter');
    bindOptimizerInteractions(results, data);

    document.getElementById('optimizer-app')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    document.body.classList.remove('optimizer-active', 'audit-active');
    progress.hidden = true;
    alert(err.message || 'Optimization failed');
  } finally {
    submit.disabled = false;
  }
}

const runAudit = runOptimization;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('audit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = document.getElementById('audit-url').value.trim();
    if (!url) return;
    if (window.UtiliyAuth?.isAtAuditLimit?.()) {
      window.UtiliyAuth.promptUpgrade();
      return;
    }
    runOptimization(url);
  });
});

function showScanning(step) {
  const el = document.getElementById('audit-progress');
  if (!el) return;
  el.hidden = false;
  const steps = [
    'Scanning page for weaknesses…',
    'Extracting product data…',
    'AI generating fixes…',
    'Building your optimization lab…',
  ];
  el.innerHTML = `<div class="lab-scan">
    <div class="scan-radar"></div>
    <p style="font-weight:700;margin:0 0 1rem;">Preparing your AI lab</p>
    <div class="scan-steps">${steps
      .map((s, i) => `<div class="scan-step ${i < step ? 'done' : i === step ? 'active' : ''}">${i < step ? '✓' : '○'} ${s}</div>`)
      .join('')}</div>
  </div>`;
}

function showPaywall(msg) {
  if (window.UtiliyAuth?.showPaywall) {
    window.UtiliyAuth.showPaywall(msg);
    return;
  }
  const overlay = document.getElementById('paywall-modal');
  if (overlay) {
    document.getElementById('paywall-msg').textContent = msg;
    overlay.removeAttribute('hidden');
  } else {
    alert(msg);
  }
}

function animateLabMetrics(root) {
  root.querySelectorAll('.lab-progress-bar span, .score-nav-fill, .readiness-bar span').forEach((bar) => {
    const w = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(() => { bar.style.width = w; });
  });
  root.querySelectorAll('.hero-ring-progress').forEach((ring) => {
    const card = ring.closest('[data-score]');
    const score = Number(card?.dataset.score || 0);
    const r = 52;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; });
    const valEl = card?.querySelector('.hero-score-val');
    if (valEl) animateCounter(valEl, score);
  });
}
