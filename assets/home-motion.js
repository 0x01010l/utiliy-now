import { animate, hover, inView, stagger } from "https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm";

const root = document.querySelector(".motion-home");
if (!root) {
  // This module is loaded only on the homepage, but keep it safe to reuse.
} else {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function motionIntro() {
    animate("[data-motion-eyebrow]", { opacity: [0, 1], y: [12, 0] }, { duration: 0.55 });
    animate(
      ".hero-word > span",
      { opacity: [0, 1], y: ["115%", "0%"], rotate: [3, 0] },
      { duration: 0.9, delay: stagger(0.09), easing: [0.16, 1, 0.3, 1] }
    );
    animate(
      ".utility-hero-foot > *",
      { opacity: [0, 1], y: [18, 0] },
      { duration: 0.65, delay: stagger(0.08, { start: 0.42 }) }
    );
  }

  function motionInteractions() {
    document.querySelectorAll("[data-motion-card]").forEach((card) => {
      const icon = card.querySelector("svg");
      hover(card, () => {
        animate(icon, { scale: 1.08, rotate: -3 }, { duration: 0.25 });
        return () => animate(icon, { scale: 1, rotate: 0 }, { duration: 0.25 });
      });
    });

    document.querySelectorAll(".utility-magnetic").forEach((button) => {
      button.addEventListener("pointermove", (event) => {
        const box = button.getBoundingClientRect();
        animate(
          button,
          { x: (event.clientX - box.left - box.width / 2) * 0.12, y: (event.clientY - box.top - box.height / 2) * 0.18 },
          { duration: 0.2 }
        );
      });
      button.addEventListener("pointerleave", () => animate(button, { x: 0, y: 0 }, { duration: 0.35 }));
    });

    document.querySelectorAll("[data-motion-reveal]").forEach((section) => {
      inView(section, () => {
        animate(section.children, { opacity: [0, 1], y: [28, 0] }, { duration: 0.7, delay: stagger(0.08) });
      }, { amount: 0.35 });
    });

    inView(".utility-product-grid", () => {
      animate(
        ".utility-product-grid .card",
        { opacity: [0, 1], y: [42, 0] },
        { duration: 0.72, delay: stagger(0.1), easing: [0.16, 1, 0.3, 1] }
      );
    }, { amount: 0.2 });
  }

  function setStoryStep(index) {
    document.querySelectorAll("[data-story-step]").forEach((step, stepIndex) => {
      const active = stepIndex === index;
      step.classList.toggle("is-active", active);
      step.setAttribute("aria-hidden", active ? "false" : "true");
      if (!reduced) {
        animate(step, active
          ? { opacity: 1, y: 0 }
          : { opacity: 0, y: stepIndex < index ? -18 : 18 }, { duration: 0.32 });
      }
    });
    const current = document.querySelector("[data-story-index]");
    if (current) current.textContent = `0${index + 1}`;
  }

  function gsapStory() {
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    if (!gsap || !ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);

    document.querySelectorAll(".draw-line").forEach((path) => {
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    });

    const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
    intro
      .to(".draw-line", { strokeDashoffset: 0, duration: 1.5, stagger: 0.08 }, 0.12)
      .from(".utility-object", { opacity: 0, scale: 0.88, transformOrigin: "center", duration: 0.65, stagger: 0.1 }, 0.72)
      .from(".machine-label", { opacity: 0, y: 10, duration: 0.4, stagger: 0.08 }, 1.05)
      .from(".machine-crosshair", { opacity: 0, scale: 0.72, transformOrigin: "center", duration: 0.9 }, 0.35);

    gsap.to(".machine-scan", { y: 360, duration: 3.1, ease: "sine.inOut", repeat: -1, yoyo: true });
    gsap.to(".machine-crosshair", { rotation: 360, transformOrigin: "center", duration: 38, ease: "none", repeat: -1 });
    gsap.to("[data-ticker]", { xPercent: -50, duration: 24, ease: "none", repeat: -1 });
    gsap.set(".story-measure", { opacity: 0 });

    const story = document.querySelector(".utility-story");
    const storyTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: story,
        start: "top top+=" + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 88),
        end: "bottom bottom",
        scrub: 0.65,
        onUpdate(self) {
          setStoryStep(Math.min(2, Math.floor(self.progress * 3)));
        }
      }
    });
    storyTimeline
      .to(".story-measure", { opacity: 1, duration: 1 })
      .to(".story-measure", { opacity: 0.12, duration: 0.35 })
      .to(".story-match", { opacity: 1, duration: 1 }, "<")
      .from(".story-match rect", { x: (index) => (index - 1) * 90, duration: 1, stagger: 0.05 }, "<")
      .to(".story-match", { opacity: 0.12, duration: 0.35 })
      .to(".story-use", { opacity: 1, duration: 1 }, "<")
      .to(".story-pulse", { scale: 5.5, opacity: 0, transformOrigin: "center", duration: 1 }, "<");

    gsap.utils.toArray("[data-reveal-line]").forEach((line, index) => {
      gsap.from(line, {
        xPercent: index % 2 ? 16 : -16,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: line, start: "top 88%", toggleActions: "play none none reverse" }
      });
    });
    gsap.to(".shape-circle", { rotation: 360, duration: 12, ease: "none", repeat: -1 });
    gsap.to(".shape-square", { rotation: 405, duration: 16, ease: "none", repeat: -1 });

    const orbitA = document.querySelector(".orbit-dot-a");
    const orbitB = document.querySelector(".orbit-dot-b");
    const orbit = { angle: Math.PI };
    gsap.to(orbit, {
      angle: Math.PI * 3,
      duration: 14,
      ease: "none",
      repeat: -1,
      onUpdate() {
        orbitA?.setAttribute("cx", String(400 + 340 * Math.cos(orbit.angle)));
        orbitA?.setAttribute("cy", String(210 + 150 * Math.sin(orbit.angle)));
        orbitB?.setAttribute("cx", String(400 + 250 * Math.cos(-orbit.angle * 1.2)));
        orbitB?.setAttribute("cy", String(210 + 105 * Math.sin(-orbit.angle * 1.2)));
      }
    });
  }

  if (reduced) {
    setStoryStep(0);
  } else {
    motionIntro();
    motionInteractions();
    if (document.readyState === "complete") {
      gsapStory();
    } else {
      window.addEventListener("load", gsapStory, { once: true });
    }
  }
}
