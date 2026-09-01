/** Guide page — table of contents from headings */

document.addEventListener('DOMContentLoaded', () => {
  const prose = document.querySelector('.guide-prose');
  const toc = document.getElementById('guide-toc');
  const list = document.getElementById('guide-toc-list');
  if (!prose || !toc || !list) return;

  const headings = prose.querySelectorAll('h2, h3');
  if (!headings.length) return;

  headings.forEach((h, i) => {
    if (!h.id) h.id = `section-${i + 1}`;
    const li = document.createElement('li');
    if (h.tagName === 'H3') li.className = 'toc-h3';
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.textContent = h.textContent;
    li.appendChild(a);
    list.appendChild(li);
  });

  toc.hidden = false;

  const links = list.querySelectorAll('a');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        links.forEach((link) => {
          link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
        });
      });
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );
  headings.forEach((h) => observer.observe(h));

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    });
  });
});
