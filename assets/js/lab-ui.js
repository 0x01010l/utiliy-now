/** Shared lab UI helpers — toasts, loading, entrance animations */

function showLabToast(msg, duration = 3500) {
  if (window.UtiliyAuth?.showToast) {
    window.UtiliyAuth.showToast(msg, duration);
    return;
  }
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.removeAttribute('hidden');
  clearTimeout(showLabToast._t);
  showLabToast._t = setTimeout(() => el.setAttribute('hidden', ''), duration);
}

function setSubmitLoading(loading) {
  const btn = document.getElementById('audit-submit');
  const form = document.getElementById('audit-form');
  if (!btn) return;
  btn.disabled = loading;
  btn.classList.toggle('is-loading', loading);
  if (form) form.classList.toggle('is-scanning', loading);
  btn.dataset.label = btn.dataset.label || btn.textContent;
  btn.textContent = loading ? 'Opening lab…' : btn.dataset.label;
}

function miniScoreRing(score, size = 56) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = scoreColor(score);
  const offset = c - (score / 100) * c;
  return `<div class="mini-score-ring" style="width:${size}px;height:${size}px" data-score="${score}" aria-label="Visibility score ${score} out of 100">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(0,0,0,.06)" stroke-width="5"/>
      <circle class="mini-ring-progress" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
    </svg>
    <span class="mini-score-val">0</span>
  </div>`;
}

function animateMiniRing(el, score) {
  const ring = el?.querySelector('.mini-ring-progress');
  const val = el?.querySelector('.mini-score-val');
  if (!ring) return;
  const r = parseFloat(ring.getAttribute('r') || '24');
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; });
  if (val) animateCounter(val, score, 800);
}

function animateLabEntrance(root) {
  if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('.lab-reveal').forEach((el, i) => {
    el.style.animationDelay = `${Math.min(i * 0.06, 0.4)}s`;
  });
  const ring = root.querySelector('.mini-score-ring');
  if (ring) animateMiniRing(ring, Number(ring.dataset.score || 0));
}

function updateFixProgress(root) {
  const total = root.querySelectorAll('.lab-queue-item, .fix-queue-item').length;
  const done = root.querySelectorAll('.lab-queue-item.is-done, .fix-queue-item.done').length;
  const label = root.querySelector('.fix-progress-label');
  const bar = root.querySelector('.fix-progress-bar span');
  if (label) label.innerHTML = `<strong>${done}</strong> / ${total} complete`;
  if (bar) bar.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  if (done === total && total > 0) showLabToast('All fixes complete');
}

function swapFixEditor(workspace, html) {
  if (!workspace) return;
  workspace.classList.add('is-swapping');
  workspace.innerHTML = html;
  requestAnimationFrame(() => {
    workspace.classList.remove('is-swapping');
    workspace.classList.add('is-visible');
  });
}
