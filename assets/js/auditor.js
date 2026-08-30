const API_URL = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

const LABELS = {
  seo: 'SEO & Meta',
  structured_data: 'Schema',
  product_information: 'Product Info',
  images: 'Images',
  ai_readiness: 'AI Shopping',
  content_quality: 'Content',
  conversion_clarity: 'Conversion',
  technical: 'Technical',
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
  return n >= 80 ? '#059669' : n >= 60 ? '#d97706' : '#dc2626';
}

function animateCounter(el, target, duration = 800) {
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function miniRing(score, label) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const tier = scoreTier(score);
  const color = scoreColor(score);
  return `<div class="lab-ring-card ${tier}" data-score="${score}">
    <svg viewBox="0 0 56 56" class="lab-ring-svg" aria-hidden="true">
      <circle cx="28" cy="28" r="${r}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="5"/>
      <circle class="ring-progress" cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" stroke-linecap="round" transform="rotate(-90 28 28)"/>
    </svg>
    <div class="lab-ring-label">
      <strong class="ring-val">0</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  </div>`;
}

function categoryRings(categories) {
  return Object.entries(categories || {})
    .map(([k, v]) => miniRing(v, LABELS[k] || k))
    .join('');
}

function statTiles(sev, total) {
  const tiles = [
    { key: 'critical', label: 'Critical', val: sev.critical || 0 },
    { key: 'high', label: 'High', val: sev.high || 0 },
    { key: 'medium', label: 'Medium', val: sev.medium || 0 },
    { key: 'low', label: 'Low', val: sev.low || 0 },
    { key: 'total', label: 'Total', val: total || 0 },
  ];
  return tiles
    .filter((t) => t.val > 0 || t.key === 'total')
    .map((t) => `<div class="lab-stat-tile ${t.key}">
      <strong class="tile-val">${t.val}</strong>
      <span class="tile-label">${t.label}</span>
    </div>`)
    .join('');
}

function scrollToSection(id) {
  const el = document.querySelector(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 88;
  window.scrollTo({ top, behavior: 'smooth' });
}

function bigScoreRing(score) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = scoreColor(score);
  return `<div class="lab-score-big" data-score="${score}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="7"/>
      <circle class="hero-ring-progress" cx="50" cy="50" r="${r}" fill="none" stroke="${color}" stroke-width="7"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" stroke-linecap="round"
        transform="rotate(-90 50 50)"/>
    </svg>
    <div class="score-num"><strong class="hero-score-val">0</strong><span>Overall</span></div>
  </div>`;
}

function barChart(categories) {
  const rows = Object.entries(categories)
    .map(([k, v]) => {
      const tier = scoreTier(v);
      return `<div class="bar-row">
        <span>${LABELS[k] || k}</span>
        <div class="bar-track"><div class="bar-fill ${tier}" style="width:${v}%"></div></div>
        <span class="bar-val">${v}</span>
      </div>`;
    })
    .join('');
  return `<div class="bar-chart">${rows}</div>`;
}

function heatmap(zones) {
  return (zones || [])
    .map(
      (z) => `<div class="heat-cell ${z.status}" data-scroll="lab-${z.id}">
        <strong>${z.score}</strong>
        <span>${escapeHtml(z.label)}</span>
        <div class="err-count">${z.error_count} issue${z.error_count !== 1 ? 's' : ''}</div>
      </div>`
    )
    .join('');
}

function issueCard(issue) {
  const sev = issue.severity || 'medium';
  return `<div class="issue-card">
    <span class="issue-sev ${sev}">${sev}</span>
    <div>${escapeHtml(issue.message)}</div>
  </div>`;
}

function lengthMeter(label, text, length, status, ideal) {
  const pct = Math.min(100, (length / 70) * 100);
  return `<div class="signal-card">
    <label>${label}</label>
    <div class="signal-text">${escapeHtml(text) || '<em>Not found</em>'}</div>
    <div class="meter"><div class="meter-fill ${status}" style="width:${length ? pct : 0}%"></div></div>
    <div class="meter-labels"><span>0</span><span>${ideal}</span><span>${length} chars</span></div>
    <span class="status-tag ${status}">${status === 'good' ? 'Optimal' : status === 'missing' ? 'Missing' : status}</span>
  </div>`;
}

function renderKeywords(kw) {
  if (!kw) return '<p>No keyword data.</p>';
  const cloud = (kw.top_keywords || [])
    .map((k) => {
      const cls = k.in_title ? 'in-title' : '';
      return `<span class="kw-tag ${cls}" title="Score: ${k.score}">${escapeHtml(k.term)}</span>`;
    })
    .join('');

  const table = (kw.title_alignment || [])
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.term)}</td>
        <td><span class="align-dot ${r.status}"></span> ${r.status}</td>
        <td>${r.in_title ? '✓' : '—'}</td>
        <td>${r.in_h1 ? '✓' : '—'}</td>
      </tr>`
    )
    .join('');

  const opps = (kw.opportunities || []).map((o) => `<li>${escapeHtml(o)}</li>`).join('');

  return `
    <p style="color:var(--muted);font-size:.9rem;margin:0 0 1rem;">${escapeHtml(kw.summary || '')}</p>
    <div class="kw-cloud">${cloud}</div>
    <table class="kw-table">
      <thead><tr><th>Keyword</th><th>Alignment</th><th>Title</th><th>H1</th></tr></thead>
      <tbody>${table}</tbody>
    </table>
    ${opps ? `<h4 style="margin:1rem 0 .5rem;font-size:.85rem;">Opportunities</h4><ul style="font-size:.88rem;color:var(--muted);">${opps}</ul>` : ''}
  `;
}

function renderSchema(data) {
  const checklist = (data.lab?.schema_checklist || []).map((item) => {
    const icon = item.status === 'found' ? '✓' : item.status === 'missing' ? '✗' : '○';
    return `<div class="schema-item ${item.status}">${icon} ${escapeHtml(item.property)}</div>`;
  }).join('');

  const snippets = (data.structured_data?.snippets || data.page_code?.json_ld_snippets || [])
    .map((s, i) => `<div class="code-viewer"><div class="code-label">JSON-LD block ${i + 1}</div>${escapeHtml(s)}</div>`)
    .join('');

  return `
    <p>Product schema: <strong>${data.structured_data?.has_product_schema ? 'Detected' : 'Not detected'}</strong>
    · ${data.structured_data?.json_ld_blocks_found ?? 0} JSON-LD blocks</p>
    <div class="schema-grid" style="margin:1rem 0;">${checklist}</div>
    ${snippets || '<p style="color:var(--muted)">No JSON-LD snippets in page source. Use the Fixes tab for a template.</p>'}
  `;
}

function imgUrl(img) {
  let src = img.src_display || img.src || '';
  if (src.startsWith('//')) src = 'https:' + src;
  if (src.includes('cdn.shopify.com') || src.includes('/cdn/shop/')) {
    return `${API_URL}/img?url=${encodeURIComponent(src)}`;
  }
  return src;
}

function renderImages(gallery) {
  if (!gallery?.length) return '<p class="lab-empty">No product images found.</p>';
  return gallery
    .map(
      (img, i) => {
        const src = imgUrl(img);
        return `<div class="img-lab-card" data-img="${i}">
        <div class="img-thumb">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt || 'Product image')}" loading="lazy" referrerpolicy="no-referrer" decoding="async"
            onerror="this.classList.add('img-broken'); this.nextElementSibling?.classList.add('show');">
          <div class="img-fallback">Preview blocked — <a href="${escapeHtml(src)}" target="_blank" rel="noopener">open image</a></div>
          <span class="img-status ${img.status}">${img.status}</span>
        </div>
        <div class="img-lab-body">
          <div class="img-row"><span class="img-label">Alt</span><span>${escapeHtml(img.alt || '— missing —')}</span></div>
          ${img.caption ? `<div class="img-row"><span class="img-label">Vision</span><span>${escapeHtml(img.caption)}</span></div>` : ''}
          ${img.ocr ? `<div class="img-row"><span class="img-label">OCR</span><span>${escapeHtml(img.ocr)}</span></div>` : ''}
          ${img.fix ? `<div class="img-fix">Fix: ${escapeHtml(img.fix)}</div>` : ''}
        </div>
      </div>`;
      }
    )
    .join('');
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
  const keys = [...new Set([...PRODUCT_FIELDS, ...Object.keys(extracted)])];

  return keys
    .filter((key) => PRODUCT_FIELDS.includes(key) || extracted[key])
    .map((key) => {
      const val = extracted[key];
      const missing = missingSet.has(key) && !val;
      return `<div class="fact-card ${missing ? 'missing' : val ? 'found' : ''}">
        <label>${escapeHtml(key.replace(/_/g, ' '))}</label>
        <div class="val">${missing ? 'Not found' : escapeHtml(String(val || '—'))}</div>
      </div>`;
    })
    .join('');
}

function renderFix(fix, i) {
  const pri = i < 2 ? 'priority-critical' : i < 5 ? 'priority-high' : 'priority-medium';
  const steps = (fix.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
  const copy = fix.copy_paste
    ? `<div class="copy-block"><button type="button" class="copy-btn">Copy</button>${escapeHtml(fix.copy_paste)}</div>`
    : '';
  return `<article class="fix-card ${pri}">
    <h4>${i + 1}. ${escapeHtml(fix.title)}</h4>
    <p class="fix-meta">${escapeHtml(fix.category)} · ~${fix.effort || '10 min'}</p>
    <p><strong>Problem:</strong> ${escapeHtml(fix.problem)}</p>
    <p><strong>Fix:</strong> ${escapeHtml(fix.why_it_matters)}</p>
    ${steps ? `<ol>${steps}</ol>` : ''}
    ${copy}
  </article>`;
}

function renderLab(data) {
  const lab = data.lab || {};
  const sev = lab.severity_counts || {};
  const zones = lab.zones || [];
  const tm = lab.title_meta || data.seo?.title_meta || {};

  const navItems = [
    { id: 'overview', label: 'Overview', badge: data.scores.overall },
    { id: 'seo', label: 'SEO', badge: sev.high + sev.critical || null },
    { id: 'keywords', label: 'Keywords', badge: (data.keywords?.opportunities || []).length || null },
    { id: 'product', label: 'Product', badge: (lab.product_fields?.missing || []).length || null },
    { id: 'schema', label: 'Schema', badge: data.structured_data?.properties_missing?.length || null },
    { id: 'images', label: 'Images', badge: (lab.image_gallery || []).filter((i) => i.status !== 'good').length || null },
    { id: 'code', label: 'Page Code', badge: (data.page_code?.issues || []).length || null },
    { id: 'fixes', label: 'Fix Queue', badge: (data.fixes || []).length },
  ];

  const nav = navItems
    .filter((n) => n.badge !== null || n.id === 'overview')
    .map(
      (n) =>
        `<a href="#lab-${n.id}" class="${n.id === 'overview' ? 'active' : ''}" data-nav="${n.id}">
          ${n.label}${n.badge != null ? `<span class="nav-badge">${n.badge}</span>` : ''}
        </a>`
    )
    .join('');

  const allSeoIssues = [
    ...(data.seo?.issues || []),
    ...(zones.find((z) => z.id === 'seo')?.issues || []),
  ];

  const warningBanner = (lab.warnings || [])
    .map((w) => `<div class="lab-warning">${escapeHtml(w)}</div>`)
    .join('');

  const shopifyBadge = data.product_information?.platform_enriched
    ? `<span class="shopify-badge">${escapeHtml(data.product_information?.data_source || 'enriched')}</span>`
    : '';

  return `
    <div class="audit-lab" id="audit-lab">
      ${warningBanner}
      <div class="lab-hero">
        ${bigScoreRing(data.scores.overall)}
        <div class="lab-hero-copy">
          <p class="lab-eyebrow">Audit report</p>
          <h2>${escapeHtml(data.meta?.title || data.meta?.h1 || 'Product Page')}</h2>
          <div class="lab-url">${escapeHtml(data.final_url)}</div>
          <span class="platform-pill">${escapeHtml(data.platform)} · HTTP ${data.status_code} ${shopifyBadge}</span>
        </div>
        <div class="lab-stat-strip">${statTiles(sev, lab.total_issues)}</div>
      </div>

      <div class="lab-shell">
        <aside class="lab-nav-wrap" id="lab-nav-wrap">
          <nav class="lab-nav" id="lab-nav" aria-label="Report sections">
            <p class="lab-nav-title">Report</p>
            ${nav}
          </nav>
        </aside>

        <div class="lab-main">
          <section class="lab-section" id="lab-overview">
            <div class="lab-section-head">
              <h3>Overview</h3>
              <span class="zone-score ${scoreTier(data.scores.overall)}">${lab.total_issues || 0} issues</span>
            </div>
            <div class="lab-ring-grid">${categoryRings(data.scores.categories)}</div>
            <div class="charts-row">
              <div class="chart-card chart-card-bars">
                <h4>Category breakdown</h4>
                ${barChart(data.scores.categories)}
              </div>
              <div class="chart-card chart-card-heat">
                <h4>Zone scores</h4>
                <div class="heatmap-grid">${heatmap(zones)}</div>
              </div>
            </div>
            ${data.seo?.analysis ? `<p class="lab-summary">${escapeHtml(data.seo.analysis)}</p>` : ''}
          </section>

          <section class="lab-section" id="lab-seo">
            <div class="lab-section-head">
              <h3>SEO & Meta</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.seo)}">${data.scores.categories.seo}/100</span>
            </div>
            <div class="signal-cards">
              ${lengthMeter('Title tag', tm.title, tm.title_length || 0, tm.title_status || 'missing', tm.title_ideal || '30–60')}
              ${lengthMeter('Meta description', tm.meta_description, tm.meta_length || 0, tm.meta_status || 'missing', tm.meta_ideal || '120–155')}
            </div>
            <div style="margin-top:1rem;">
              <strong style="font-size:.82rem;">H1:</strong>
              <span style="font-size:.88rem;color:var(--muted);"> ${escapeHtml(tm.h1 || '—')}</span>
              ${tm.canonical ? `<br><strong style="font-size:.82rem;">Canonical:</strong> <span style="font-size:.82rem;color:var(--muted);">${escapeHtml(tm.canonical)}</span>` : ''}
            </div>
            <div class="issue-cards" style="margin-top:1rem;">${allSeoIssues.map(issueCard).join('') || '<p style="color:var(--muted)">No SEO issues detected.</p>'}</div>
          </section>

          <section class="lab-section" id="lab-keywords">
            <div class="lab-section-head">
              <h3>Keywords</h3>
              ${data.keywords?.primary_keyword ? `<span class="zone-score good">Focus: ${escapeHtml(data.keywords.primary_keyword)}</span>` : ''}
            </div>
            ${renderKeywords(data.keywords)}
          </section>

          <section class="lab-section" id="lab-product">
            <div class="lab-section-head">
              <h3>Product Information</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.product_information)}">${data.scores.categories.product_information}/100</span>
            </div>
            <div class="product-facts">${renderProductFacts(lab, data)}</div>
            ${lab.shopify?.tags?.length ? `<p class="lab-tags">Tags: ${lab.shopify.tags.map((t) => `<span class="kw-tag">${escapeHtml(t)}</span>`).join('')}</p>` : ''}
            <div class="ai-readiness-card">
              <div class="ai-readiness-head">
                <span>AI shopping readiness</span>
                <strong>${data.ai_shopping_readiness?.score ?? '—'}/100</strong>
              </div>
              <div class="ai-readiness-bar"><span style="width:${data.ai_shopping_readiness?.score || 0}%"></span></div>
              <p>${escapeHtml(data.ai_shopping_readiness?.summary || '')}</p>
            </div>
          </section>

          <section class="lab-section" id="lab-schema">
            <div class="lab-section-head">
              <h3>Structured Data</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.structured_data)}">${data.scores.categories.structured_data}/100</span>
            </div>
            ${renderSchema(data)}
          </section>

          <section class="lab-section" id="lab-images">
            <div class="lab-section-head">
              <h3>Images</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.images)}">${data.scores.categories.images}/100</span>
            </div>
            <p style="font-size:.88rem;color:var(--muted);margin:0 0 1rem;">${escapeHtml(data.images?.summary || '')}</p>
            <div class="img-lab-grid">${renderImages(lab.image_gallery)}</div>
          </section>

          <section class="lab-section" id="lab-code">
            <div class="lab-section-head">
              <h3>Page Code</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.technical)}">${data.page_code?.html_size_kb || '—'} KB</span>
            </div>
            <div class="signal-cards" style="margin-bottom:1rem;">
              <div class="signal-card">
                <label>Links</label>
                <div class="signal-text">${data.page_code?.links?.internal || 0} internal · ${data.page_code?.links?.external || 0} external · ${data.page_code?.links?.nofollow || 0} nofollow</div>
              </div>
              <div class="signal-card">
                <label>Technical</label>
                <div class="signal-text">Lang: ${escapeHtml(data.page_code?.lang || '—')} · Viewport: ${data.page_code?.viewport ? '✓' : '✗'} · Scripts: ${data.page_code?.script_count || 0}</div>
              </div>
            </div>
            <h4 style="font-size:.82rem;margin:0 0 .5rem;">Heading outline</h4>
            <div class="heading-tree">${escapeHtml(data.page_code?.heading_outline || 'No headings')}</div>
            <h4 style="font-size:.82rem;margin:1rem 0 .5rem;">Head markup preview</h4>
            <div class="code-viewer">${escapeHtml(data.page_code?.head_preview || '')}</div>
            ${(data.page_code?.issues || []).map(issueCard).join('')}
          </section>

          <section class="lab-section fix-queue" id="lab-fixes">
            <div class="lab-section-head">
              <h3>Fix Queue</h3>
              <span class="zone-score good">${(data.fixes || []).length} actionable fixes</span>
            </div>
            ${(data.fixes || []).map(renderFix).join('') || '<p>No fixes generated.</p>'}
          </section>
        </div>
      </div>
    </div>
  `;
}

function showScanning(step) {
  const el = document.getElementById('audit-progress');
  if (!el) return;
  el.hidden = false;
  const steps = [
    'Crawling product page…',
    'Extracting SEO & keywords…',
    'Analyzing schema & product data…',
    'Running image vision…',
    'Building fix queue…',
  ];
  el.innerHTML = `<div class="lab-scan">
    <div class="scan-radar"></div>
    <p style="font-weight:700;margin:0 0 1rem;">Running audit lab analysis</p>
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
  root.querySelectorAll('.bar-fill').forEach((bar) => {
    const w = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(() => { bar.style.width = w; });
  });

  root.querySelectorAll('.ring-progress, .hero-ring-progress').forEach((ring) => {
    const card = ring.closest('[data-score]');
    const score = Number(card?.dataset.score || 0);
    const r = ring.classList.contains('hero-ring-progress') ? 46 : 22;
    const c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; });
    const valEl = card?.querySelector('.ring-val, .hero-score-val');
    if (valEl) animateCounter(valEl, score);
  });

  root.querySelectorAll('.ai-readiness-bar span').forEach((bar) => {
    const w = bar.style.width;
    bar.style.width = '0';
    requestAnimationFrame(() => { bar.style.width = w; });
  });
}

function bindLabInteractions(root) {
  root.querySelectorAll('.lab-nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href');
      scrollToSection(id);
      root.querySelectorAll('.lab-nav a').forEach((a) => a.classList.remove('active'));
      link.classList.add('active');
    });
  });

  root.querySelectorAll('.heat-cell[data-scroll]').forEach((cell) => {
    cell.addEventListener('click', () => {
      scrollToSection(`#${cell.dataset.scroll}`);
    });
  });

  root.querySelectorAll('.img-lab-card').forEach((card) => {
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  });

  root.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.parentElement.textContent.replace('Copy', '').trim();
      navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });

  const sections = root.querySelectorAll('.lab-section');
  const navLinks = root.querySelectorAll('.lab-nav a');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('lab-', '');
          navLinks.forEach((a) => a.classList.toggle('active', a.dataset.nav === id));
        }
      });
    },
    { rootMargin: '-15% 0px -55% 0px' }
  );
  sections.forEach((s) => observer.observe(s));

  animateLabMetrics(root);
}

async function runAudit(url) {
  const progress = document.getElementById('audit-progress');
  const results = document.getElementById('audit-results');
  const submit = document.getElementById('audit-submit');

  results.hidden = true;
  results.innerHTML = '';
  submit.disabled = true;
  document.body.classList.add('audit-active');
  showScanning(0);

  const headers = window.UtiliyAuth ? window.UtiliyAuth.authHeaders() : { 'Content-Type': 'application/json' };

  try {
    const timers = [
      setTimeout(() => showScanning(1), 600),
      setTimeout(() => showScanning(2), 2000),
      setTimeout(() => showScanning(3), 4000),
      setTimeout(() => showScanning(4), 6000),
    ];

    const res = await fetch(`${API_URL}/audit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, use_ai: true, client_id: window.UtiliyAuth?.getClientId() }),
    });
    timers.forEach(clearTimeout);
    const data = await res.json();

    if (res.status === 402 || data.paywall) {
      document.body.classList.remove('audit-active');
      progress.hidden = true;
      if (data.usage) window.UtiliyAuth?.renderUsage(data.usage);
      showPaywall(data.error || 'You have reached your audit limit. Upgrade to continue.');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Audit failed');

    if (data.usage) window.UtiliyAuth?.renderUsage(data.usage);

    progress.hidden = true;
    results.innerHTML = renderLab(data);
    results.hidden = false;
    results.classList.add('lab-enter');
    bindLabInteractions(results);

    document.getElementById('audit-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    document.body.classList.remove('audit-active');
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
    if (!url) return;
    if (window.UtiliyAuth?.isAtAuditLimit?.()) {
      window.UtiliyAuth.promptUpgrade();
      return;
    }
    runAudit(url);
  });
});
