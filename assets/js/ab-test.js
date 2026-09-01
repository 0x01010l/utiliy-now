/**
 * Utiliy A/B testing — legitimate conversion experiments only.
 *
 * Rules (SEO-safe):
 * - Never changes <title>, <h1>, or meta tags
 * - Only tests CTAs, hints, and secondary copy
 * - Assignments are sticky per browser (localStorage)
 * - Sends events to GA4 when configured; always logs to utiliy_ab_events
 *
 * Configure GA4: set google_analytics in _config.yml (e.g. G-XXXXXXXX)
 */
(function () {
  const STORAGE_KEY = 'utiliy_ab_v1';
  const EVENTS_KEY = 'utiliy_ab_events';

  const EXPERIMENTS = {
    hero_cta: {
      name: 'Hero CTA button',
      page: 'home',
      goal: 'audit_submit',
      variants: [
        { id: 'control', weight: 34, label: 'Open AI lab' },
        { id: 'fix_free', weight: 33, label: 'Fix my page free' },
        { id: 'scan_now', weight: 33, label: 'Scan my product URL' },
      ],
      selector: '#audit-submit',
      apply(el, variant) {
        el.textContent = variant.label;
        el.dataset.abVariant = variant.id;
      },
    },
    hero_lead: {
      name: 'Hero subheadline',
      page: 'home',
      goal: 'audit_submit',
      variants: [
        {
          id: 'control',
          weight: 34,
          html: 'The AI tool that audits your Shopify, WooCommerce, or Amazon product detail page — then opens a lab with copy-paste fixes for titles, meta descriptions, schema, keywords, and AI shopping visibility.',
        },
        {
          id: 'speed',
          weight: 33,
          html: 'Paste a product URL. Get a scored audit and <strong>copy-paste fixes in under 60 seconds</strong> — titles, schema, keywords, and AI visibility.',
        },
        {
          id: 'outcome',
          weight: 33,
          html: 'Stop guessing why your PDP underperforms. See <strong>exactly what to fix</strong> for Google Search and AI shopping assistants.',
        },
      ],
      selector: '.hero-lead',
      apply(el, variant) {
        el.innerHTML = variant.html;
        el.dataset.abVariant = variant.id;
      },
    },
    audit_hint: {
      name: 'Form hint text',
      page: 'home',
      goal: 'audit_submit',
      variants: [
        { id: 'control', weight: 50, label: 'We scan for weaknesses → you fix them with AI-generated copy in the lab' },
        { id: 'trust', weight: 50, label: 'Free scan · No credit card · Works on Shopify, WooCommerce & Amazon' },
      ],
      selector: '.audit-hint',
      apply(el, variant) {
        el.textContent = variant.label;
        el.dataset.abVariant = variant.id;
      },
    },
    pro_cta: {
      name: 'Pricing Pro CTA',
      page: 'pricing',
      goal: 'checkout_start',
      variants: [
        { id: 'control', weight: 34, label: 'Subscribe with Stripe' },
        { id: 'price', weight: 33, label: 'Start Pro — $15/mo' },
        { id: 'upgrade', weight: 33, label: 'Upgrade to Pro' },
      ],
      selector: '[data-checkout]',
      apply(el, variant) {
        el.textContent = variant.label;
        el.dataset.abVariant = variant.id;
      },
    },
  };

  function pageId() {
    if (document.body.classList.contains('home-page')) return 'home';
    if (location.pathname.replace(/\/$/, '') === '/pricing') return 'pricing';
    return null;
  }

  function readStore() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeStore(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function pickVariant(experiment) {
    const store = readStore();
    if (store[experiment.key]) return store[experiment.key];

    const total = experiment.variants.reduce((s, v) => s + v.weight, 0);
    let roll = Math.random() * total;
    let chosen = experiment.variants[0];
    for (const v of experiment.variants) {
      roll -= v.weight;
      if (roll <= 0) {
        chosen = v;
        break;
      }
    }
    store[experiment.key] = chosen.id;
    writeStore(store);
    return chosen.id;
  }

  function getVariant(experimentKey) {
    const exp = EXPERIMENTS[experimentKey];
    if (!exp) return null;
    const store = readStore();
    const id = store[experimentKey] || pickVariant({ key: experimentKey, variants: exp.variants });
    return exp.variants.find((v) => v.id === id) || exp.variants[0];
  }

  function appendEvent(event) {
    try {
      const list = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
      list.push({ ...event, t: Date.now() });
      if (list.length > 500) list.splice(0, list.length - 500);
      localStorage.setItem(EVENTS_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  function sendAnalytics(name, params) {
    if (typeof gtag === 'function') {
      gtag('event', name, params);
    }
    appendEvent({ name, ...params });
  }

  function trackImpression(experimentKey, variantId) {
    sendAnalytics('ab_impression', {
      experiment_id: experimentKey,
      variant_id: variantId,
      page: pageId() || location.pathname,
    });
    document.body.setAttribute(`data-ab-${experimentKey.replace(/_/g, '-')}`, variantId);
  }

  function applyExperiments() {
    const pid = pageId();
    if (!pid) return;

    Object.entries(EXPERIMENTS).forEach(([key, exp]) => {
      if (exp.page !== pid) return;
      const el = document.querySelector(exp.selector);
      if (!el) return;
      const variant = getVariant(key);
      if (!variant) return;
      exp.apply(el, variant);
      trackImpression(key, variant.id);
    });
  }

  function getActiveAssignments() {
    const store = readStore();
    return Object.fromEntries(
      Object.keys(EXPERIMENTS)
        .filter((k) => store[k])
        .map((k) => [k, store[k]])
    );
  }

  function trackConversion(goal, meta = {}) {
    const assignments = getActiveAssignments();
    sendAnalytics('ab_conversion', {
      goal,
      page: pageId() || location.pathname,
      experiments: JSON.stringify(assignments),
      ...meta,
    });
  }

  function getSummary() {
    const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]');
    const impressions = {};
    const conversions = {};
    events.forEach((e) => {
      if (e.name === 'ab_impression') {
        const k = `${e.experiment_id}:${e.variant_id}`;
        impressions[k] = (impressions[k] || 0) + 1;
      }
      if (e.name === 'ab_conversion') {
        const k = `${e.goal}:${e.experiments || ''}`;
        conversions[k] = (conversions[k] || 0) + 1;
      }
    });
    return { assignments: getActiveAssignments(), impressions, conversions, events: events.slice(-20) };
  }

  window.UtiliyAB = {
    trackConversion,
    getAssignment: getVariant,
    getAssignments: getActiveAssignments,
    getSummary,
    experiments: Object.keys(EXPERIMENTS),
  };

  document.addEventListener('DOMContentLoaded', () => {
    applyExperiments();

    document.getElementById('audit-form')?.addEventListener('submit', () => {
      trackConversion('audit_submit');
    });

    document.querySelectorAll('[data-checkout]').forEach((btn) => {
      btn.addEventListener('click', () => trackConversion('checkout_start'));
    });
  });
})();
