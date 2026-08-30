const API_URL = document.body.dataset.apiUrl || 'https://utiliy-audit-api.azurewebsites.net/api';

function scoreClass(score) {
  if (score >= 80) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

function renderResults(data) {
  const cats = data.scores.categories;
  const labels = {
    seo: 'SEO',
    structured_data: 'Structured data',
    product_information: 'Product information',
    images: 'Images',
    ai_readiness: 'AI search readiness',
    content_quality: 'Content quality',
    conversion_clarity: 'Conversion clarity',
    technical: 'Technical',
  };

  const categoryCards = Object.entries(cats)
    .map(([key, val]) => `<div class="score-card"><strong>${val}</strong><span>${labels[key] || key}</span></div>`)
    .join('');

  const renderIssues = (items, cls) =>
    items.length
      ? `<ul class="issue-list">${items.map((i) => `<li class="sev-${i.severity}">${i.message}</li>`).join('')}</ul>`
      : '<p class="audit-hint">No issues in this bucket.</p>';

  const recs = (data.recommendations || [])
    .map((r) => `<li>${r}</li>`)
    .join('');

  return `
    <div class="score-hero">
      <div class="score-main">
        <div class="eyebrow">Product page score</div>
        <div class="number">${data.scores.overall}<span style="font-size:1.2rem;color:var(--muted)"> / 100</span></div>
        <p class="audit-hint">Platform: ${data.platform} · HTTP ${data.status_code}</p>
        <p style="margin-top:.75rem;color:#c5ccd6;font-size:.92rem;">${data.ai_shopping_readiness.summary}</p>
      </div>
      <div class="score-grid">${categoryCards}</div>
    </div>
    <div class="issue-section">
      <h3>Critical issues</h3>
      ${renderIssues(data.issues.critical || [], 'critical')}
    </div>
    <div class="issue-section">
      <h3>High priority</h3>
      ${renderIssues(data.issues.high_priority || [], 'high')}
    </div>
    <div class="issue-section">
      <h3>Quick wins</h3>
      ${renderIssues(data.issues.quick_wins || [], 'medium')}
    </div>
    <div class="issue-section">
      <h3>Recommended fixes</h3>
      <ul class="issue-list">${recs || '<li>Address critical and high-priority items first.</li>'}</ul>
    </div>
  `;
}

async function runAudit(url) {
  const status = document.getElementById('audit-status');
  const results = document.getElementById('audit-results');
  const submit = document.getElementById('audit-submit');

  status.hidden = false;
  results.hidden = true;
  status.textContent = 'Crawling and analyzing your product page…';
  submit.disabled = true;

  try {
    const res = await fetch(`${API_URL}/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, use_ai: true }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Audit failed');

    status.textContent = `Analyzed ${data.final_url}`;
    results.innerHTML = renderResults(data);
    results.hidden = false;
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    status.textContent = err.message || 'Something went wrong. Check the URL and try again.';
  } finally {
    submit.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('audit-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('audit-url');
    const url = input.value.trim();
    if (url) runAudit(url);
  });
});
