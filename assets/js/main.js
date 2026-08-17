document.addEventListener('DOMContentLoaded', function () {
  var path = window.location.pathname.replace(/\/$/, '') || '/';

  document.querySelectorAll('.site-nav a').forEach(function (link) {
    var href = link.getAttribute('href').replace(/\/$/, '') || '/';
    if (path === href || (href !== '/' && path.startsWith(href))) {
      link.classList.add('is-active');
    }
  });

  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  var content = document.getElementById('post-content');
  var toc = document.getElementById('post-toc-list');
  if (content && toc) {
    var headings = content.querySelectorAll('h2, h3');
    headings.forEach(function (heading, index) {
      if (!heading.id) {
        heading.id = 'section-' + (index + 1);
      }
      var item = document.createElement('li');
      if (heading.tagName === 'H3') {
        item.style.marginLeft = '0.75rem';
      }
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      item.appendChild(link);
      toc.appendChild(item);
    });
  }

  var banner = document.getElementById('cookie-banner');
  var accept = document.getElementById('cookie-accept');
  if (banner && accept && !localStorage.getItem('tpd-cookie-consent')) {
    banner.hidden = false;
    accept.addEventListener('click', function () {
      localStorage.setItem('tpd-cookie-consent', '1');
      banner.hidden = true;
    });
  }
});
