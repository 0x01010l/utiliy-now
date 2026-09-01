/** AI Optimization Lab — professional workspace UI */

function readyCount(fixes) {
  return (fixes || []).filter((f) => f.copy_paste).length;
}

function bundleFixes(fixes) {
  return (fixes || [])
    .filter((f) => f.copy_paste)
    .map((f, i) => `/* Fix ${i + 1}: ${f.title} */\n${f.copy_paste}`)
    .join('\n\n');
}

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

function pillarIcon(key) {
  const icons = {
    google_seo: '◎',
    ai_visibility: '✦',
    content: '¶',
    keywords: '#',
    images: '▣',
    schema: '{}',
  };
  return icons[key] || '·';
}

function renderFixQueueItem(fix, i, active) {
  const hasAi = Boolean(fix.copy_paste);
  const cat = LABELS[fix.category] || fix.category || 'General';
  return `<button type="button" class="lab-queue-item ${active ? 'is-active' : ''} ${hasAi ? 'has-ai' : ''}" data-fix-index="${i}">
    <span class="lab-queue-status" aria-hidden="true"></span>
    <span class="lab-queue-text">
      <span class="lab-queue-title">${escapeHtml(fix.title)}</span>
      <span class="lab-queue-meta">${escapeHtml(cat)}</span>
    </span>
    <span class="lab-queue-index">${i + 1}</span>
  </button>`;
}

function extractTagValue(html, tag) {
  if (!html) return '';
  if (tag === 'title') {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? m[1].trim() : '';
  }
  const m = html.match(new RegExp(`<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`content=["']([^"']*)["'][^>]+name=["']description["']`, 'i'));
  return m ? m[1].trim() : '';
}

function serpPreviewForFix(fix, data, tm) {
  const title = (fix.title || '').toLowerCase();
  const host = (() => {
    try { return new URL(data.final_url || '').hostname.replace(/^www\./, ''); } catch { return 'yoursite.com'; }
  })();
  const path = (() => {
    try { return new URL(data.final_url || '').pathname; } catch { return '/products/...'; }
  })();

  let serpTitle = tm.title || data.meta?.title || 'Product page title';
  let serpDesc = tm.meta_description || 'Add a compelling meta description so shoppers click from Google.';

  if (fix.copy_paste) {
    const fromFix = extractTagValue(fix.copy_paste, 'title');
    const fromMeta = extractTagValue(fix.copy_paste, 'meta');
    if (fromFix) serpTitle = fromFix;
    if (fromMeta) serpDesc = fromMeta;
  }

  if (!title.includes('title') && !title.includes('meta')) return '';

  return `<section class="lab-serp" aria-label="Google search preview">
    <header class="lab-panel-head"><span>Search preview</span></header>
    <div class="lab-serp-card">
      <p class="lab-serp-url">${escapeHtml(host)}${escapeHtml(path)}</p>
      <p class="lab-serp-title">${escapeHtml(serpTitle)}</p>
      <p class="lab-serp-desc">${escapeHtml(serpDesc)}</p>
    </div>
  </section>`;
}

function siteBrandFromAudit(data) {
  const raw = data.final_url || data.url || '';
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, '');
    return {
      host,
      favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`,
    };
  } catch {
    return { host: 'Website', favicon: '' };
  }
}

function renderSiteTopbar(data) {
  const { host, favicon } = siteBrandFromAudit(data);
  const faviconEl = favicon
    ? `<img class="lab-site-favicon" src="${escapeHtml(favicon)}" alt="" width="32" height="32" loading="lazy" referrerpolicy="no-referrer">`
    : `<span class="lab-site-favicon lab-site-favicon--fallback" aria-hidden="true">${escapeHtml(host.charAt(0).toUpperCase())}</span>`;
  return `<div class="lab-topbar-context lab-topbar-site">
    ${faviconEl}
    <h1 class="lab-product-title">${escapeHtml(host)}</h1>
  </div>`;
}

function renderFixEditor(fix, i, data, tm) {
  if (!fix) {
    return `<div class="lab-editor lab-editor--empty">
      <p>No fixes generated for this page. Switch to <strong>Diagnostics</strong> to review scan results.</p>
    </div>`;
  }

  const impact = fixImpact(fix, i);
  const before = fixBeforeState(fix, data, tm);
  const cat = LABELS[fix.category] || fix.category || 'General';
  const steps = (fix.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');

  const output = fix.copy_paste
    ? `<section class="lab-code-block">
        <header class="lab-code-head">
          <span class="lab-code-label"><span class="lab-ai-dot"></span> AI output</span>
          <button type="button" class="lab-btn lab-btn--primary copy-fix-btn">Copy fix</button>
        </header>
        <pre class="lab-code">${escapeHtml(fix.copy_paste)}</pre>
      </section>`
    : `<section class="lab-callout lab-callout--muted">
        <p>No copy-paste snippet yet — follow the steps below to implement manually.</p>
      </section>`;

  return `<article class="lab-editor" id="fix-editor">
    <header class="lab-editor-header">
      <div class="lab-editor-heading">
        <span class="lab-category-pill">${escapeHtml(cat)}</span>
        <h2>${escapeHtml(fix.title)}</h2>
      </div>
      <span class="lab-impact lab-impact--${impact.cls}">${impact.text}</span>
    </header>

    <section class="lab-callout">
      <p class="lab-callout-label">Why it matters</p>
      <p class="lab-callout-text">${escapeHtml(fix.why_it_matters)}</p>
    </section>

    ${serpPreviewForFix(fix, data, tm)}

    <section class="lab-diff">
      <div class="lab-diff-col lab-diff-col--before">
        <span class="lab-diff-label">Current</span>
        <p>${escapeHtml(before)}</p>
      </div>
      <div class="lab-diff-col lab-diff-col--after">
        <span class="lab-diff-label">Optimized</span>
        <p>${fix.copy_paste ? 'Ready-to-paste fix below' : 'Follow implementation steps'}</p>
      </div>
    </section>

    ${output}

    ${steps ? `<section class="lab-steps">
      <header class="lab-panel-head"><span>How to apply</span></header>
      <ol>${steps}</ol>
    </section>` : ''}

    <footer class="lab-editor-footer">
      <button type="button" class="lab-btn lab-btn--primary mark-done-btn">Mark as done</button>
      <span class="lab-effort">~${escapeHtml(fix.effort || '10 min')}</span>
    </footer>
  </article>`;
}

function renderSidebarPillars(pillars) {
  return PILLARS.map(({ key, label }) => {
    const v = pillarScore(pillars, key);
    if (v == null) return '';
    const tier = scoreTier(v);
    return `<div class="lab-pillar-row ${tier}">
      <span class="lab-pillar-icon">${pillarIcon(key)}</span>
      <span class="lab-pillar-name">${label}</span>
      <span class="lab-pillar-bar"><span style="width:${v}%"></span></span>
      <strong class="lab-pillar-val">${v}</strong>
    </div>`;
  }).join('');
}

function renderLabSidebar(data, pillars, fixes, doneCount = 0) {
  const ready = readyCount(fixes);
  const total = fixes.length;
  const score = data.scores.overall;
  const tier = scoreTier(score);
  const queue = fixes.length
    ? fixes.map((f, i) => renderFixQueueItem(f, i, i === 0)).join('')
    : '<p class="lab-empty">No fixes yet</p>';

  return `<aside class="lab-sidebar" aria-label="Optimization sidebar">
    <div class="lab-sidebar-brand">
      <span class="lab-ai-dot"></span>
      <span>AI Lab</span>
    </div>

    <nav class="lab-mode-nav" role="tablist" aria-label="Lab views">
      <button type="button" class="lab-mode-btn is-active" data-mode="lab" role="tab" aria-selected="true">
        <span>Fixes</span>
        <span class="lab-mode-count">${total}</span>
      </button>
      <button type="button" class="lab-mode-btn" data-mode="diagnostics" role="tab" aria-selected="false">
        <span>Diagnostics</span>
      </button>
    </nav>

    <div class="lab-score-card ${tier}">
      <div class="lab-score-ring-wrap">
        <svg class="lab-score-ring" viewBox="0 0 72 72" aria-hidden="true">
          <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="5"/>
          <circle class="lab-score-ring-progress" cx="36" cy="36" r="30" fill="none" stroke="currentColor" stroke-width="5"
            stroke-dasharray="188.5" stroke-dashoffset="188.5" stroke-linecap="round" transform="rotate(-90 36 36)"/>
        </svg>
        <span class="lab-score-val" data-score="${score}">0</span>
      </div>
      <div class="lab-score-meta">
        <span class="lab-score-label">Visibility score</span>
        <span class="lab-score-sub">${ready} of ${total} AI fixes ready</span>
      </div>
    </div>

    <div class="lab-progress-block">
      <div class="lab-progress-head">
        <span class="fix-progress-label"><strong>${doneCount}</strong> / ${total} complete</span>
      </div>
      <div class="lab-progress-bar fix-progress-bar"><span style="width:${total ? Math.round((doneCount / total) * 100) : 0}%"></span></div>
    </div>

    <div class="lab-queue-wrap">
      <p class="lab-sidebar-section">Fix queue</p>
      <nav class="lab-queue" aria-label="Fix queue">${queue}</nav>
    </div>

    <div class="lab-pillars-wrap">
      <p class="lab-sidebar-section">Pillars</p>
      <div class="lab-pillars">${renderSidebarPillars(pillars)}</div>
    </div>
  </aside>`;
}

function renderDiagnosticsReport(data, pillars, tm, lab, fixes) {
  const allSeoIssues = [...(data.seo?.issues || [])];
  return `<div class="lab-diagnostics">
    <header class="lab-diagnostics-head">
      <h2>Diagnostics</h2>
      <p>Full scan breakdown — understand why each fix was suggested.</p>
    </header>
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

  return `
    <div class="optimizer-app" id="optimizer-app">
      ${warnings}
      <div class="lab-shell">
        ${renderLabSidebar(data, pillars, fixes)}

        <div class="lab-main">
          <header class="lab-topbar">
            ${renderSiteTopbar(data)}
            <div class="lab-topbar-actions">
              <button type="button" class="lab-btn lab-btn--ghost" id="cockpit-new-scan">New scan</button>
              <button type="button" class="lab-btn lab-btn--ghost" id="cockpit-copy-all" ${readyCount(fixes) ? '' : 'disabled'}>Copy all</button>
              <button type="button" class="lab-btn lab-btn--ghost" id="cockpit-rerun">Re-scan</button>
              <button type="button" class="lab-btn lab-btn--ghost" id="cockpit-embed-badge">Embed badge</button>
              <button type="button" class="lab-btn lab-btn--ghost" id="cockpit-export">Export</button>
            </div>
          </header>

          <div class="lab-canvas">
            <div class="optimizer-view optimizer-view-lab" data-view="lab">
              <div class="fix-workspace">
                ${renderFixEditor(fixes[0], 0, data, tm)}
              </div>
            </div>
            <div class="optimizer-view optimizer-view-diagnostics" data-view="diagnostics" hidden>
              ${renderDiagnosticsReport(data, pillars, tm, lab, fixes)}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function bindOptimizerInteractions(root, data) {
  const fixes = data.fixes || [];
  const tm = data.lab?.title_meta || data.seo?.title_meta || {};
  const workspace = root.querySelector('.fix-workspace');

  function markFixDone(btn) {
    btn.classList.add('is-done');
    updateFixProgress(root);
  }

  function selectFix(i, btn) {
    root.querySelectorAll('.lab-queue-item').forEach((b) => b.classList.remove('is-active'));
    (btn || root.querySelector(`[data-fix-index="${i}"]`))?.classList.add('is-active');
    swapFixEditor(workspace, renderFixEditor(fixes[i], i, data, tm));
    bindEditorActions(workspace);
  }

  function bindEditorActions(scope) {
    bindCopyButtons(scope);
    scope?.querySelector('.mark-done-btn')?.addEventListener('click', () => {
      const active = root.querySelector('.lab-queue-item.is-active');
      if (active) markFixDone(active);
    });
  }

  root.querySelectorAll('.lab-queue-item').forEach((btn) => {
    btn.addEventListener('click', () => selectFix(Number(btn.dataset.fixIndex), btn));
  });

  root.querySelectorAll('.lab-mode-btn').forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.mode;
      root.querySelectorAll('.lab-mode-btn').forEach((t) => {
        const on = t.dataset.mode === mode;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      root.querySelectorAll('.optimizer-view').forEach((view) => {
        view.hidden = view.dataset.view !== mode;
      });
    });
  });

  function bindCopyButtons(scope) {
    scope?.querySelectorAll('.copy-fix-btn, .copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy') || btn.closest('section')?.querySelector('pre')?.textContent || '';
        navigator.clipboard.writeText(text).then(() => {
          const orig = btn.textContent;
          btn.textContent = 'Copied';
          showLabToast('Fix copied to clipboard');
          setTimeout(() => { btn.textContent = orig; }, 2000);
        });
      });
    });
  }

  bindEditorActions(workspace);

  root.querySelector('#cockpit-copy-all')?.addEventListener('click', () => {
    const bundle = bundleFixes(fixes);
    if (!bundle) return;
    navigator.clipboard.writeText(bundle).then(() => showLabToast(`${readyCount(fixes)} fixes copied`));
  });

  root.querySelector('#cockpit-new-scan')?.addEventListener('click', () => {
    document.body.classList.remove('optimizer-results', 'optimizer-active', 'audit-active');
    const results = document.getElementById('audit-results');
    if (results) {
      results.hidden = true;
      results.innerHTML = '';
    }
    document.getElementById('audit-progress')?.setAttribute('hidden', '');
    if (document.body.classList.contains('lab-page')) {
      history.replaceState({}, '', '/ai-lab/');
    }
    const input = document.getElementById('audit-url');
    input?.focus();
    input?.select();
    document.getElementById('audit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  root.querySelector('#cockpit-rerun')?.addEventListener('click', () => {
    const url = document.getElementById('audit-url')?.value?.trim() || data.final_url;
    if (url && typeof runAudit === 'function') runAudit(url);
  });
  root.querySelector('#cockpit-export')?.addEventListener('click', () => window.print());

  root.querySelector('#cockpit-embed-badge')?.addEventListener('click', () => {
    const score = data.scores?.overall ?? data.visibility?.overall ?? 0;
    const url = data.final_url || data.url || '';
    const snippet = `<a class="utiliy-badge" data-utiliy-score="${score}" data-utiliy-url="${escapeHtml(url)}" href="https://utiliy.com/ai-lab/?ref=badge" target="_blank" rel="noopener noreferrer">
  <span class="utiliy-badge-score">${score}</span>
  <span><span class="utiliy-badge-label">AI shopping readiness</span><br><span class="utiliy-badge-brand">Verified by Utiliy</span></span>
</a>`;
    navigator.clipboard.writeText(snippet).then(() => {
      if (window.LabUI?.toast) window.LabUI.toast('Embed code copied — paste on your storefront', 'success');
    }).catch(() => {
      window.open(`/embed/badge/?score=${score}&url=${encodeURIComponent(url)}`, '_blank');
    });
  });

  root.querySelectorAll('.score-nav-row').forEach((row) => {
    row.addEventListener('click', () => {
      root.querySelector('[data-mode="diagnostics"]')?.click();
      const target = row.dataset.scroll;
      if (target) setTimeout(() => scrollToSection(target), 100);
    });
  });

  const scoreVal = root.querySelector('.lab-score-val');
  const scoreRing = root.querySelector('.lab-score-ring-progress');
  if (scoreVal && scoreRing) {
    const score = Number(scoreVal.dataset.score || 0);
    const c = 188.5;
    const offset = c - (score / 100) * c;
    requestAnimationFrame(() => { scoreRing.style.strokeDashoffset = offset; });
    animateCounter(scoreVal, score, 900);
  }

  animateLabMetrics(root);
  animateLabEntrance(root);
}
