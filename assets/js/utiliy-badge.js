/**
 * Utiliy PDP readiness badge — embed on merchant sites after a real audit.
 * Usage:
 *   <link rel="stylesheet" href="https://utiliy.com/assets/css/research.css">
 *   <a class="utiliy-badge" data-utiliy-score="78" data-utiliy-url="https://..." href="https://utiliy.com/?ref=badge">...</a>
 */
(function () {
  'use strict';
  document.querySelectorAll('.utiliy-badge[data-utiliy-score]').forEach(function (el) {
    if (el.dataset.utiliyRendered) return;
    el.dataset.utiliyRendered = '1';
    var score = el.getAttribute('data-utiliy-score') || '—';
    var label = el.getAttribute('data-utiliy-label') || 'AI shopping readiness';
    if (!el.querySelector('.utiliy-badge-score')) {
      el.innerHTML =
        '<span class="utiliy-badge-score">' + score + '</span>' +
        '<span><span class="utiliy-badge-label">' + label + '</span><br>' +
        '<span class="utiliy-badge-brand">Verified by Utiliy</span></span>';
    }
  });
})();
