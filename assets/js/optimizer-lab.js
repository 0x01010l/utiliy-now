/** AI Optimization Lab UI — rendered by auditor.js after discovery scan */

function fixBeforeState(fix, data, tm) {
  const cat = fix.category || '';
  if (cat === 'seo' && fix.title?.toLowerCase().includes('title')) {
    return tm.title || data.meta?.title || '(empty title tag)';
  }
  if (cat === 'seo' && fix.title?.toLowerCase().includes('meta')) {
    return tm.meta_description || '(no meta description)';
  }
  if (cat === 'structured_data') {
    return data.structured_data?.has_product_schema ? 'Incomplete Product JSON-LD' : 'No Product JSON-LD detected';
  }
  if (cat === 'images') {
    const bad = (data.lab?.image_gallery || []).find((i) => !i.alt?.trim());
    return bad ? `Image missing alt: ${bad.src?.slice(-40) || 'gallery image'}` : 'Image alt text gaps';
  }
  if (cat === 'product_information') {
    const missing = (data.product_information?.missing || []).slice(0, 3).join(', ');
    return missing ? `Missing: ${missing}` : fix.problem;
  }
  return fix.problem || 'Current listing has a gap here';
}

function renderFixQueueItem(fix, i, active) {
  const impact = fixImpact(fix, i);
  const hasAi = Boolean(fix.copy_paste);
  return `<button type="button" class="fix-queue-item ${active ? 'active' : ''}" data-fix-index="${i}">
    <span class="fix-queue-num">${i + 1}</span>
    <span class="fix-queue-body">
      <strong>${escapeHtml(fix.title)}</strong>
      <span class="impact-tag ${impact.cls}">${impact.text}</span>
      ${hasAi ? '<span class="fix-queue-ai">AI fix ready</span>' : '<span class="fix-queue-ai pending">Guidance only</span>'}
    </span>
  </button>`;
}

function renderFixEditor(fix, i, data, tm) {
  if (!fix) {
    return `<div class="ai-fix-editor empty"><p>No optimization actions yet. Run diagnostics to see what we found.</p></div>`;
  }
  const impact = fixImpact(fix, i);
  const before = fixBeforeState(fix, data, tm);
  const steps = (fix.steps || [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('');
  const output = fix.copy_paste
    ? `<div class="ai-fix-output">
        <div class="ai-fix-output-head">
          <span class="ai-spark">✦</span> AI-generated fix
          <button type="button" class="btn btn-primary btn-sm copy-fix-btn">Copy fix</button>
        </div>
        <pre class="ai-fix-code">${escapeHtml(fix.copy_paste)}</pre>
      </div>`
    : `<div class="ai-fix-output ai-fix-guidance">
        <p class="ai-fix-no-code">No copy-paste snippet for this one yet — follow the steps below or regenerate when AI is enabled.</p>
      </div>`;

  return `<article class="ai-fix-editor" id="fix-editor">
    <header class="ai-fix-editor-head">
      <div>
        <p class="ai-fix-kicker">Fix #${i + 1} · ${escapeHtml(LABELS[fix.category] || fix.category || 'General')}</p>
        <h3>${escapeHtml(fix.title)}</h3>
      </div>
      <span class="impact-tag ${impact.cls}">${impact.text}</span>
    </header>
    <p class="ai-fix-why">${escapeHtml(fix.why_it_matters)}</p>
    <div class="ai-compare">
      <div class="ai-compare-col before">
        <span class="ai-compare-label">Weakness found</span>
        <p>${escapeHtml(before)}</p>
      </div>
      <div class="ai-compare-arrow" aria-hidden="true">→</div>
      <div class="ai-compare-col after">
        <span class="ai-compare-label">AI recommendation</span>
        <p>${fix.copy_paste ? 'Ready-to-paste fix below' : 'Follow implementation steps'}</p>
      </div>
    </div>
    ${output}
    ${steps ? `<div class="ai-fix-steps"><h4>How to apply</h4><ol>${steps}</ol></div>` : ''}
    <div class="ai-fix-actions">
      <button type="button" class="btn btn-ghost btn-sm mark-done-btn">Mark as done</button>
      <span class="ai-fix-effort">~${escapeHtml(fix.effort || '10 min')}</span>
    </div>
  </article>`;
}

function renderOptimizerSidebar(data, pillars, fixes) {
  const ready = fixes.filter((f) => f.copy_paste).length;
  return `<aside class="optimizer-sidebar">
    <div class="sidebar-card">
      <p class="sidebar-label">Visibility</p>
      <p class="sidebar-score">${data.scores.overall}<span>/100</span></p>
      <div class="sidebar-pillars">${PILLARS.map(({ key, label }) => {
        const v = pillarScore(pillars, key);
        if (v == null) return '';
        return `<div class="sidebar-pillar"><span>${label}</span><strong>${v}</strong></div>`;
      }).join('')}</div>
    </div>
    <div class="sidebar-card">
      <p class="sidebar-label">Lab progress</p>
      <p class="sidebar-stat"><strong>${ready}</strong> AI fixes ready</p>
      <p class="sidebar-stat"><strong>${fixes.length}</strong> total actions</p>
      <div class="lab-progress-bar"><span style="width:${fixes.length ? Math.round((ready / fixes.length) * 100) : 0}%"></span></div>
    </div>
    <div class="sidebar-card product-snapshot">
      <p class="sidebar-label">Product snapshot</p>
      ${renderProductFacts(data.lab, data) || '<p class="lab-empty">Limited product data extracted.</p>'}
    </div>
  </aside>`;
}

function renderDiagnosticsReport(data, pillars, tm, lab, fixes) {
  const allSeoIssues = [...(data.seo?.issues || [])];
  return `<div class="diagnostics-report">
    <div class="diagnostics-intro">
      <h3>Diagnostics report</h3>
      <p>Discovery scan results — use this to understand <em>why</em> the lab suggested each fix. The lab is where you apply changes.</p>
    </div>
    <section class="cockpit-block" id="lab-scores">
      <div class="block-head"><h3>Visibility breakdown</h3></div>
      <div class="score-dashboard">${renderScoreDashboard(pillars)}</div>
    </section>
    <section class="detail-panel" id="lab-seo">
      <div class="panel-head"><h3>Google SEO</h3><span class="zone-score ${scoreTier(pillarScore(pillars, 'google_seo') || 0)}">${pillarScore(pillars, 'google_seo') ?? '—'}/100</span></div>
      <div class="metric-grid">
        ${lengthMeter('Title tag', tm.title, tm.title_length || 0, tm.title_status || 'missing', tm.title_ideal || '30–60')}
        ${lengthMeter('Meta description', tm.meta_description, tm.meta_length || 0, tm.meta_status || 'missing', tm.meta_ideal || '120–155')}
      </div>
      <div class="issue-list">${allSeoIssues.map(issueCard).join('') || '<p class="lab-empty">No issues.</p>'}</div>
    </section>
    <section class="detail-panel" id="lab-keywords">
      <div class="panel-head"><h3>Keywords</h3></div>
      ${renderKeywords(data.keywords)}
    </section>
    <section class="detail-panel" id="lab-content">
      <div class="panel-head"><h3>Content</h3></div>
      <p class="section-lead">${escapeHtml(data.content?.analysis || '')}</p>
      <div class="fact-grid">${renderProductFacts(lab, data)}</div>
    </section>
    <section class="detail-panel" id="lab-images">
      <div class="panel-head"><h3>Images</h3></div>
      ${renderImages(lab.image_gallery, data.scores.categories.images, data.images?.summary)}
    </section>
    <section class="detail-panel" id="lab-schema">
      <div class="panel-head"><h3>Schema</h3></div>
      ${renderSchemaPanel(data)}
    </section>
    <section class="detail-panel" id="lab-ai-diag">
      <div class="panel-head"><h3>AI visibility notes</h3></div>
      ${renderAIStrategist(data, fixes, tm)}
    </section>
  </div>`;
}

function renderOptimizerApp(data) {
  const lab = data.lab || {};
  const tm = lab.title_meta || data.seo?.title_meta || {};
  const fixes = data.fixes || [];
  const pillars = visibilityPillars(data);
  const warnings = (lab.warnings || []).map((w) => `<div class="lab-warning">${escapeHtml(w)}</div>`).join('');
  const queue = fixes.length
    ? fixes.map((f, i) => renderFixQueueItem(f, i, i === 0)).join('')
    : '<p class="lab-empty">No weaknesses with fixes yet. Check diagnostics for raw signals.</p>';

  return `
    <div class="optimizer-app" id="optimizer-app">
      ${warnings}
      <header class="optimizer-toolbar">
        <div class="optimizer-toolbar-main">
          <span class="optimizer-badge"><span class="ai-spark">✦</span> AI Optimization Lab</span>
          <h2>${escapeHtml(data.meta?.title || data.meta?.h1 || 'Product page')}</h2>
          <p class="optimizer-url">${escapeHtml(data.final_url)}</p>
        </div>
        <div class="optimizer-toolbar-actions">
          <div class="optimizer-score-pill ${scoreTier(data.scores.overall)}">${data.scores.overall}</div>
          <button type="button" class="btn btn-ghost btn-sm" id="cockpit-rerun">Re-scan</button>
          <button type="button" class="btn btn-ghost btn-sm" id="cockpit-export">Export</button>
        </div>
      </header>

      <div class="optimizer-mode-tabs" role="tablist">
        <button type="button" class="mode-tab active" data-mode="lab" role="tab" aria-selected="true">Fix with AI</button>
        <button type="button" class="mode-tab" data-mode="diagnostics" role="tab" aria-selected="false">Diagnostics</button>
      </div>

      <div class="optimizer-view optimizer-view-lab" data-view="lab">
        <p class="optimizer-lead">We scanned your page and found <strong>${fixes.length} ways</strong> to improve visibility. Select a fix — apply the AI-generated copy in your theme or CMS.</p>
        <div class="optimizer-layout">
          <nav class="fix-queue" aria-label="Optimization queue">${queue}</nav>
          <div class="fix-workspace">
            ${renderFixEditor(fixes[0], 0, data, tm)}
          </div>
          ${renderOptimizerSidebar(data, pillars, fixes)}
        </div>
      </div>

      <div class="optimizer-view optimizer-view-diagnostics" data-view="diagnostics" hidden>
        ${renderDiagnosticsReport(data, pillars, tm, lab, fixes)}
      </div>
    </div>`;
}

function bindOptimizerInteractions(root, data) {
  const fixes = data.fixes || [];
  const tm = data.lab?.title_meta || data.seo?.title_meta || {};
  const workspace = root.querySelector('.fix-workspace');

  root.querySelectorAll('.fix-queue-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.fixIndex);
      root.querySelectorAll('.fix-queue-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (workspace) workspace.innerHTML = renderFixEditor(fixes[i], i, data, tm);
      bindCopyButtons(workspace);
      workspace.querySelector('.mark-done-btn')?.addEventListener('click', () => {
        btn.classList.add('done');
        btn.querySelector('.fix-queue-ai')?.replaceWith(Object.assign(document.createElement('span'), {
          className: 'fix-queue-ai done',
          textContent: 'Done',
        }));
      });
    });
  });

  root.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      root.querySelectorAll('.mode-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.mode === mode);
        t.setAttribute('aria-selected', t.dataset.mode === mode ? 'true' : 'false');
      });
      root.querySelectorAll('.optimizer-view').forEach((view) => {
        view.hidden = view.dataset.view !== mode;
      });
    });
  });

  function bindCopyButtons(scope) {
    scope?.querySelectorAll('.copy-fix-btn, .copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy') || btn.parentElement?.querySelector('pre')?.textContent || '';
        navigator.clipboard.writeText(text);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    });
  }

  bindCopyButtons(workspace);
  workspace?.querySelector('.mark-done-btn')?.addEventListener('click', () => {
    root.querySelector('.fix-queue-item.active')?.classList.add('done');
  });

  root.querySelector('#cockpit-rerun')?.addEventListener('click', () => {
    const url = document.getElementById('audit-url')?.value?.trim();
    if (url && typeof runAudit === 'function') runAudit(url);
  });
  root.querySelector('#cockpit-export')?.addEventListener('click', () => window.print());

  root.querySelectorAll('.score-nav-row').forEach((row) => {
    row.addEventListener('click', () => {
      root.querySelector('[data-mode="diagnostics"]')?.click();
      const target = row.dataset.scroll;
      if (target) setTimeout(() => scrollToSection(target), 100);
    });
  });

  animateLabMetrics(root);
}
