/** Embed badge generator on /embed/badge/ */
(function () {
  'use strict';

  var scoreEl = document.getElementById('embed-score');
  var urlEl = document.getElementById('embed-url');
  var labelEl = document.getElementById('embed-label');
  var codeEl = document.getElementById('embed-code');
  var previewEl = document.getElementById('embed-preview');
  var copyBtn = document.getElementById('embed-copy');
  if (!scoreEl || !codeEl) return;

  var params = new URLSearchParams(window.location.search);
  if (params.get('score')) scoreEl.value = params.get('score');
  if (params.get('url')) urlEl.value = params.get('url');

  function buildHtml() {
    var score = Math.min(100, Math.max(0, parseInt(scoreEl.value, 10) || 0));
    var url = (urlEl.value || '').trim();
    var label = (labelEl.value || 'AI shopping readiness').trim();
    var href = 'https://utiliy.com/?ref=badge';
    if (url) href += '&utm_content=' + encodeURIComponent(url);

    var attrs = 'class="utiliy-badge" data-utiliy-score="' + score + '"';
    if (url) attrs += ' data-utiliy-url="' + escapeAttr(url) + '"';
    attrs += ' href="' + href + '" target="_blank" rel="noopener noreferrer"';

    return (
      '<a ' + attrs + '>\n' +
      '  <span class="utiliy-badge-score">' + score + '</span>\n' +
      '  <span>\n' +
      '    <span class="utiliy-badge-label">' + escapeHtml(label) + '</span><br>\n' +
      '    <span class="utiliy-badge-brand">Verified by Utiliy</span>\n' +
      '  </span>\n' +
      '</a>'
    );
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  function render() {
    var html = buildHtml();
    codeEl.value = html;
    if (previewEl) previewEl.innerHTML = html;
  }

  [scoreEl, urlEl, labelEl].forEach(function (el) {
    el.addEventListener('input', render);
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      codeEl.select();
      navigator.clipboard.writeText(codeEl.value).then(function () {
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy embed code'; }, 2000);
      });
    });
  }

  render();
})();
