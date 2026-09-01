/** PDP Index page enhancements */
(function () {
  'use strict';
  document.querySelectorAll('.pdp-score').forEach(function (el) {
    var n = parseInt(el.textContent, 10);
    if (isNaN(n)) return;
    el.classList.add(n >= 70 ? 'pdp-score--good' : n >= 45 ? 'pdp-score--warn' : 'pdp-score--bad');
  });
})();
