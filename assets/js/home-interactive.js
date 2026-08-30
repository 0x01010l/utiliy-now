/** Homepage scroll reveals, report tabs, and hero parallax */

function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((el) => io.observe(el));
}

function initReportTabs() {
  const root = document.getElementById('report-tabs');
  if (!root) return;
  root.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      root.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      root.querySelectorAll('.tab-panel').forEach((p) => {
        const show = p.dataset.panel === tab;
        p.classList.toggle('active', show);
        p.hidden = !show;
      });
    });
  });
}

function initHeroParallax() {
  const hero = document.querySelector('.hero-home');
  if (!hero || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const glows = hero.querySelectorAll('.hero-glow');
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    glows.forEach((g, i) => {
      g.style.transform = `translateY(${y * (0.04 + i * 0.02)}px)`;
    });
  }, { passive: true });
}

function initGlassCards() {
  document.querySelectorAll('.glass-card, .glass-card-static').forEach((card) => {
    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      card.style.setProperty('--mx', `${x}%`);
      card.style.setProperty('--my', `${y}%`);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initReveal();
  initReportTabs();
  initHeroParallax();
  initGlassCards();
});
