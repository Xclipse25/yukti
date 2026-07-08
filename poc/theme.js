/* Yukti — shared, page-agnostic interaction behaviors. */

(function () {
  // Nav gains a hairline border + stronger blur once the page scrolls.
  const nav = document.querySelector("nav");
  if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Cursor-following spotlight on panels/cards.
  document.querySelectorAll(".panel, .card").forEach((el) => {
    el.addEventListener("mousemove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  });

  // Scroll-reveal, with a safety net so content never stays hidden if the
  // observer misfires (slow devices, unusual layouts, etc).
  const revealEls = document.querySelectorAll(".reveal");
  if (revealEls.length) {
    if (window.IntersectionObserver) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in-view"); io.unobserve(e.target); } }),
        { threshold: 0.15 }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add("in-view"));
    }
    setTimeout(() => revealEls.forEach((el) => el.classList.add("in-view")), 4000);
  }
})();

// Smoothly animates an element's numeric text content from its current value to `to`.
function countTo(el, to, duration) {
  duration = duration || 600;
  const from = parseFloat(el.textContent) || 0;
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
