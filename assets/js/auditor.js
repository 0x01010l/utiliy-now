const API_URL = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

const LABELS = {
  seo: 'SEO',
  structured_data: 'Structured Data',
  product_information: 'Product',
  images: 'Images',
  ai_readiness: 'AI Shopping',
  content_quality: 'Content',
  conversion_clarity: 'Conversion',
  technical: 'Technical',
};

const SECTION_FOR_CATEGORY = {
  seo: 'seo',
  structured_data: 'schema',
  product_information: 'content',
  images: 'images',
  content_quality: 'content',
  technical: 'technical',
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
  if (score >= 80) return { label: 'Strong listing', tier: 'good' };
  if (score >= 60) return { label: 'Needs improvement', tier: 'warn' };
  return { label: 'Critical issues', tier: 'bad' };
}

function keywordScore(kw) {
  const rows = kw?.title_alignment || [];
  if (!rows.length) return null;
  const good = rows.filter((r) => r.status === 'good').length;
  return Math.round((good / rows.length) * 100);
}

function executiveSummary(data) {
  const llm = data.llm_analysis;
  if (llm?.seo_analysis) return llm.seo_analysis;
  if (llm?.content_analysis) return llm.content_analysis;
  if (data.seo?.analysis) return data.seo.analysis;
  if (data.ai_shopping_readiness?.summary) return data.ai_shopping_readiness.summary;
  return 'Your listing has room to improve. Start with the priority fixes below for the fastest impact on visibility and conversions.';
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

function renderScoreDashboard(categories, kw) {
  const rows = [
    { key: 'seo', label: 'SEO', section: 'seo' },
    { key: 'content_quality', label: 'Content', section: 'content' },
    { key: '_keywords', label: 'Keywords', section: 'keywords', score: keywordScore(kw) },
    { key: 'images', label: 'Images', section: 'images' },
    { key: 'technical', label: 'Technical', section: 'technical' },
    { key: 'structured_data', label: 'Structured Data', section: 'schema' },
  ];
  return rows
    .map(({ key, label, section, score }) => {
      const val = score != null ? score : categories[key];
      if (val == null) return '';
      const tier = scoreTier(val);
      return `<button type="button" class="score-nav-row ${tier}" data-scroll="#lab-${section}">
        <span class="score-nav-label">${label}</span>
        <span class="score-nav-track"><span class="score-nav-fill" style="width:${val}%"></span></span>
        <strong class="score-nav-val">${val}</strong>
      </button>`;
    })
    .join('');
}

function renderPriorityFix(fix, i) {
  const impact = impactLabel(i);
  const section = SECTION_FOR_CATEGORY[fix.category] || 'fixes';
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
      <span>${escapeHtml(fix.category?.replace(/_/g, ' ') || 'General')}</span>
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
        <td><span class="align-dot ${r.status}"></span> ${r.status}</td>
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
  const checklist = (data.lab?.schema_checklist || []).map((item) => {
    const icon = item.status === 'found' ? '✓' : item.status === 'missing' ? '✗' : '·';
    return `<div class="schema-chip ${item.status}">${icon} ${escapeHtml(item.property)}</div>`;
  }).join('');
  const snippets = (data.structured_data?.snippets || data.page_code?.json_ld_snippets || []);
  const snippetBlocks = snippets
    .map((s, i) => `<details class="evidence-panel"><summary>JSON-LD block ${i + 1}</summary><div class="code-viewer">${escapeHtml(s)}</div></details>`)
    .join('');
  return `
    <div class="schema-status">
      <span>Product schema: <strong>${data.structured_data?.has_product_schema ? 'Detected' : 'Not detected'}</strong></span>
      <span>${data.structured_data?.json_ld_blocks_found ?? 0} JSON-LD blocks</span>
    </div>
    <div class="schema-grid">${checklist}</div>
    ${snippetBlocks || '<p class="lab-empty">No JSON-LD in page source. See priority fixes for a template.</p>'}
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

function renderLab(data) {
  const lab = data.lab || {};
  const sev = lab.severity_counts || {};
  const tm = lab.title_meta || data.seo?.title_meta || {};
  const fixes = data.fixes || [];
  const overall = data.scores.overall;
  const status = overallStatus(overall);
  const critical = sev.critical || 0;
  const improvements = (sev.high || 0) + (sev.medium || 0);
  const strengths = (lab.zones || []).filter((z) => z.status === 'good').length;
  const seoIssueCount = (data.seo?.issues || []).length;
  const issueBadge = critical + (sev.high || 0) || fixes.length;

  const navItems = [
    { id: 'header', label: 'Overview' },
    { id: 'priorities', label: 'Issues', badge: issueBadge || null },
    { id: 'scores', label: 'Scores' },
    { id: 'ai', label: 'AI Analysis' },
    { id: 'seo', label: 'SEO', badge: seoIssueCount || null },
    { id: 'keywords', label: 'Keywords', badge: (data.keywords?.opportunities || []).length || null },
    { id: 'content', label: 'Content' },
    { id: 'images', label: 'Images', badge: (lab.image_gallery || []).filter((i) => i.status !== 'good').length || null },
    { id: 'schema', label: 'Structured Data' },
    { id: 'technical', label: 'Technical', badge: (data.page_code?.issues || []).length || null },
  ];

  const nav = navItems
    .map(
      (n) =>
        `<a href="#lab-${n.id}" class="${n.id === 'header' ? 'active' : ''}" data-nav="${n.id}">
          ${n.label}${n.badge != null && n.badge > 0 ? `<span class="nav-badge">${n.badge}</span>` : ''}
        </a>`
    )
    .join('');

  const allSeoIssues = [...(data.seo?.issues || [])];
  const warnings = (lab.warnings || []).map((w) => `<div class="lab-warning">${escapeHtml(w)}</div>`).join('');
  const enriched = data.product_information?.platform_enriched
    ? `<span class="platform-pill">${escapeHtml(data.product_information?.data_source || 'enriched')}</span>`
    : '';

  return `
    <div class="audit-cockpit" id="audit-lab">
      ${warnings}
      <header class="cockpit-header" id="lab-header">
        <div class="cockpit-header-main">
          ${bigScoreRing(overall)}
          <div class="cockpit-header-copy">
            <p class="cockpit-eyebrow">${escapeHtml(data.platform)} · HTTP ${data.status_code} ${enriched}</p>
            <h2>${escapeHtml(data.meta?.title || data.meta?.h1 || 'Product listing')}</h2>
            <p class="cockpit-url">${escapeHtml(data.final_url)}</p>
            <p class="cockpit-status ${status.tier}">${status.label.toUpperCase()}</p>
            <p class="cockpit-summary">${escapeHtml(executiveSummary(data))}</p>
            <div class="cockpit-stats">
              <span class="stat-critical"><em>${critical}</em> Critical</span>
              <span class="stat-improve"><em>${improvements}</em> Improvements</span>
              <span class="stat-strong"><em>${strengths}</em> Strengths</span>
            </div>
            <div class="cockpit-actions">
              <button type="button" class="btn btn-primary btn-sm" data-scroll="#lab-priorities">View priority fixes</button>
              <button type="button" class="btn btn-ghost btn-sm" id="cockpit-rerun">Re-run audit</button>
              <button type="button" class="btn btn-ghost btn-sm" id="cockpit-export">Export report</button>
            </div>
          </div>
        </div>
      </header>

      <div class="lab-shell">
        <aside class="lab-nav-wrap" id="lab-nav-wrap">
          <nav class="lab-nav" id="lab-nav" aria-label="Audit sections">
            <p class="lab-nav-title">Audit</p>
            ${nav}
          </nav>
        </aside>

        <div class="lab-main">
          <section class="cockpit-block priority-block" id="lab-priorities">
            <div class="block-head">
              <h3>Priority fixes</h3>
              <span class="block-sub">${fixes.length} actionable recommendations</span>
            </div>
            <p class="block-lead">Fix these first for the highest impact on visibility and conversions.</p>
            <div class="priority-list">${fixes.slice(0, 6).map(renderPriorityFix).join('') || '<p class="lab-empty">No fixes generated.</p>'}</div>
            ${fixes.length > 6 ? `<button type="button" class="btn btn-ghost btn-sm" data-scroll="#lab-fixes-all">View all ${fixes.length} fixes</button>` : ''}
          </section>

          <section class="cockpit-block" id="lab-scores">
            <div class="block-head"><h3>Score dashboard</h3></div>
            <p class="block-lead">Click a category to jump to its detailed analysis.</p>
            <div class="score-dashboard">${renderScoreDashboard(data.scores.categories, data.keywords)}</div>
          </section>

          <section class="cockpit-block strategist-block" id="lab-ai">
            <div class="block-head"><h3>AI listing strategist</h3></div>
            <p class="block-lead">Expert recommendations based on your listing data.</p>
            ${renderAIStrategist(data, fixes, tm)}
          </section>

          <section class="detail-panel" id="lab-seo">
            <div class="panel-head">
              <h3>SEO &amp; meta</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.seo)}">${data.scores.categories.seo}/100</span>
            </div>
            <div class="metric-grid">
              ${lengthMeter('Title tag', tm.title, tm.title_length || 0, tm.title_status || 'missing', tm.title_ideal || '30–60')}
              ${lengthMeter('Meta description', tm.meta_description, tm.meta_length || 0, tm.meta_status || 'missing', tm.meta_ideal || '120–155')}
            </div>
            <div class="meta-extra">
              <p><strong>H1:</strong> ${escapeHtml(tm.h1 || '—')}</p>
              ${tm.canonical ? `<p><strong>Canonical:</strong> ${escapeHtml(tm.canonical)}</p>` : ''}
            </div>
            <div class="issue-list">${allSeoIssues.map(issueCard).join('') || '<p class="lab-empty">No SEO issues detected.</p>'}</div>
          </section>

          <section class="detail-panel" id="lab-keywords">
            <div class="panel-head">
              <h3>Keywords</h3>
              ${data.keywords?.primary_keyword ? `<span class="zone-score good">${escapeHtml(data.keywords.primary_keyword)}</span>` : ''}
            </div>
            ${renderKeywords(data.keywords)}
          </section>

          <section class="detail-panel" id="lab-content">
            <div class="panel-head">
              <h3>Content &amp; product data</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.content_quality)}">${data.scores.categories.content_quality}/100</span>
            </div>
            <p class="section-lead">${escapeHtml(data.content?.analysis || '')}</p>
            <div class="fact-grid">${renderProductFacts(lab, data)}</div>
            ${lab.shopify?.tags?.length ? `<p class="lab-tags">Tags: ${lab.shopify.tags.map((t) => `<span class="kw-tag">${escapeHtml(t)}</span>`).join('')}</p>` : ''}
            <div class="readiness-strip">
              <span>AI shopping readiness</span>
              <div class="readiness-bar"><span style="width:${data.ai_shopping_readiness?.score || 0}%"></span></div>
              <strong>${data.ai_shopping_readiness?.score ?? '—'}/100</strong>
            </div>
            <p class="section-lead">${escapeHtml(data.ai_shopping_readiness?.summary || '')}</p>
          </section>

          <section class="detail-panel" id="lab-images">
            <div class="panel-head">
              <h3>Image analysis</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.images)}">${data.scores.categories.images}/100</span>
            </div>
            ${renderImages(lab.image_gallery, data.scores.categories.images, data.images?.summary)}
          </section>

          <section class="detail-panel" id="lab-schema">
            <div class="panel-head">
              <h3>Structured data</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.structured_data)}">${data.scores.categories.structured_data}/100</span>
            </div>
            ${renderSchemaPanel(data)}
          </section>

          <section class="detail-panel evidence-panel-wrap" id="lab-technical">
            <div class="panel-head">
              <h3>Technical evidence</h3>
              <span class="zone-score ${scoreTier(data.scores.categories.technical)}">${data.scores.categories.technical}/100</span>
            </div>
            <div class="tech-summary">
              <span>${data.page_code?.html_size_kb || '—'} KB HTML</span>
              <span>${data.page_code?.links?.internal || 0} internal links</span>
              <span>${data.page_code?.links?.external || 0} external links</span>
              <span>Viewport: ${data.page_code?.viewport ? 'Yes' : 'No'}</span>
            </div>
            <div class="issue-list">${(data.page_code?.issues || []).map(issueCard).join('')}</div>
            <details class="evidence-panel">
              <summary>Heading outline</summary>
              <div class="heading-tree">${escapeHtml(data.page_code?.heading_outline || 'No headings')}</div>
            </details>
            <details class="evidence-panel">
              <summary>Head markup preview</summary>
              <div class="code-viewer">${escapeHtml(data.page_code?.head_preview || '')}</div>
            </details>
            ${(data.page_code?.json_ld_snippets || []).length ? `<details class="evidence-panel"><summary>Raw JSON-LD (${data.page_code.json_ld_snippets.length} blocks)</summary><div class="code-viewer">${escapeHtml(data.page_code.json_ld_snippets.join('\n\n'))}</div></details>` : ''}
          </section>

          <section class="detail-panel" id="lab-fixes-all">
            <div class="panel-head">
              <h3>Full fix queue</h3>
              <span class="zone-score good">${fixes.length} fixes</span>
            </div>
            ${fixes.map(renderFixDetail).join('') || '<p class="lab-empty">No fixes generated.</p>'}
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
    <p style="font-weight:700;margin:0 0 1rem;">Analyzing your listing</p>
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
  root.querySelectorAll('.score-nav-fill, .readiness-bar span').forEach((bar) => {
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

function setupFloatingNav(root) {
  const wrap = root.querySelector('.lab-nav-wrap');
  const nav = root.querySelector('.lab-nav');
  const shell = root.querySelector('.lab-shell');
  const header = root.querySelector('.cockpit-header');
  if (!wrap || !nav || !shell) return null;

  const mq = window.matchMedia('(min-width: 901px)');
  const headerOffset = 84;

  const update = () => {
    if (!mq.matches) {
      nav.classList.remove('is-floating');
      nav.style.cssText = '';
      wrap.style.minHeight = '';
      return;
    }

    const shellRect = shell.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const headerRect = header?.getBoundingClientRect();

    if (shellRect.bottom < headerOffset || shellRect.top > window.innerHeight) {
      nav.classList.remove('is-floating');
      nav.style.visibility = 'hidden';
      wrap.style.minHeight = '';
      return;
    }

    wrap.style.minHeight = `${nav.offsetHeight}px`;
    let top = Math.max(headerOffset, wrapRect.top);
    if (headerRect && headerRect.bottom > headerOffset) {
      top = Math.max(top, headerRect.bottom + 12);
    }

    nav.classList.add('is-floating');
    nav.style.visibility = 'visible';
    nav.style.top = `${top}px`;
    nav.style.left = `${wrapRect.left}px`;
    nav.style.width = `${wrapRect.width}px`;
    nav.style.maxHeight = `calc(100vh - ${top}px - 1.5rem)`;
  };

  update();
  const onScroll = () => requestAnimationFrame(update);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

function bindLabInteractions(root) {
  root.querySelectorAll('[data-scroll]').forEach((el) => {
    el.addEventListener('click', () => scrollToSection(el.dataset.scroll));
  });

  root.querySelectorAll('.lab-nav a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToSection(link.getAttribute('href'));
      root.querySelectorAll('.lab-nav a').forEach((a) => a.classList.remove('active'));
      link.classList.add('active');
    });
  });

  root.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const fromAttr = btn.getAttribute('data-copy');
      const text = fromAttr || (btn.parentElement.querySelector('pre')?.textContent || btn.parentElement.textContent.replace('Copy', '').replace('Copy recommendation', '').replace('Copy fix', '').trim());
      navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  });

  root.querySelector('#cockpit-rerun')?.addEventListener('click', () => {
    const url = document.getElementById('audit-url')?.value?.trim();
    if (url) runAudit(url);
    else {
      document.getElementById('audit')?.scrollIntoView({ behavior: 'smooth' });
      document.getElementById('audit-url')?.focus();
    }
  });

  root.querySelector('#cockpit-export')?.addEventListener('click', () => window.print());

  const sections = root.querySelectorAll('[id^="lab-"]');
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
    { rootMargin: '-12% 0px -60% 0px' }
  );
  sections.forEach((s) => observer.observe(s));

  animateLabMetrics(root);
  setupFloatingNav(root);
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

    document.getElementById('lab-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
