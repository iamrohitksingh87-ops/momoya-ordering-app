import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { mountBrand } from './logo.js';
import { initShop, initBookingSlots, bookTable } from './shop.js';

gsap.registerPlugin(ScrollTrigger);
mountBrand();

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── smooth scroll ─────────────────────────── */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const scrollTo = (target) => (lenis ? lenis.scrollTo(target, { offset: 0, duration: 1.4 }) : target.scrollIntoView());

$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    const target = id === '#top' ? document.body : $(id);
    if (!target) return;
    e.preventDefault();
    closeSheet();
    scrollTo(target);
  }),
);

/* ── nav: hide on scroll down, solid after hero ─ */
const nav = $('[data-nav]');
let lastY = 0;
const onScroll = (y) => {
  nav.classList.toggle('is-solid', y > window.innerHeight * 0.6);
  nav.classList.toggle('is-hidden', y > lastY && y > window.innerHeight && !sheetOpen());
  lastY = y;
};
lenis ? lenis.on('scroll', ({ scroll }) => onScroll(scroll)) : addEventListener('scroll', () => onScroll(scrollY), { passive: true });

/* ── mobile sheet ──────────────────────────── */
const toggle = $('[data-toggle]');
const sheet = $('[data-sheet]');
const sheetOpen = () => !sheet.hidden;
function closeSheet() {
  if (!sheetOpen()) return;
  sheet.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  lenis?.start();
}
toggle.addEventListener('click', () => {
  if (sheetOpen()) return closeSheet();
  sheet.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  lenis?.stop();
  gsap.from(sheet.children, { yPercent: 60, opacity: 0, stagger: 0.06, duration: 0.8, ease: 'expo.out' });
});
addEventListener('keydown', (e) => e.key === 'Escape' && closeSheet());

/* ── reservation form ──────────────────────── */
const form = $('[data-form]');
const status = $('[data-status]');
const dateInput = form.elements.date;
dateInput.min = new Date().toISOString().slice(0, 10);
const refreshSlots = initBookingSlots(form);
initShop({ lenis });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  let firstBad = null;
  $$('.f', form).forEach((f) => {
    const el = f.querySelector('input,select,textarea');
    const bad = el && !el.checkValidity();
    f.classList.toggle('is-invalid', !!bad);
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    status.textContent = 'Please complete the highlighted fields.';
    firstBad.focus();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  status.textContent = 'Sending…';
  try {
    const { booking } = await bookTable(data);
    const when = new Date(`${booking.date}T00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    status.textContent = `Booked, ${booking.name.split(' ')[0]}. Table for ${booking.guests} on ${when} at ${booking.time}. Reference ${booking.id}.`;
    form.reset();
    refreshSlots();
  } catch (err) {
    status.textContent = err.message || 'Something went wrong — please try again in a moment.';
    if (err.status === 409) refreshSlots();
  } finally {
    btn.disabled = false;
  }
});
form.addEventListener('input', (e) => e.target.closest('.f')?.classList.remove('is-invalid'));

/* ── motion ────────────────────────────────── */
if (!reduced) document.fonts.ready.then(initMotion);

function initMotion() {
  const ease = 'expo.out';

  // Hero intro
  const heroLetters = $$('.logo--hero .lg-l');
  const intro = gsap.timeline({ defaults: { ease } });
  intro
    .from(heroLetters, { yPercent: 105, opacity: 0, duration: 1.6, stagger: 0.07 })
    .from($$('.logo--hero .lg-o'), { scaleY: 0.6, transformOrigin: '50% 100%', duration: 1.4, stagger: 0.12, ease: 'elastic.out(1, 0.5)' }, 0.5)
    .from('.hero__plate', { xPercent: 40, yPercent: 30, rotate: 60, opacity: 0, duration: 2 }, 0.3)
    .from('.seal--hero', { scale: 0, rotate: -120, duration: 1.4 }, 1.1)
    .from('.hero .line > span', { yPercent: 110, duration: 1.3, stagger: 0.1 }, 0.6)
    .from('.hero [data-fade], .nav', { y: 24, opacity: 0, duration: 1.2, stagger: 0.08 }, 0.9);

  gsap.to('[data-plate]', { rotate: 140, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__plate', { yPercent: 18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero__logo', { yPercent: -30, opacity: 0.3, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.seal--hero .seal__ring', { rotate: 360, transformOrigin: '50% 50%', repeat: -1, duration: 24, ease: 'none' });

  // Split-line reveals (outside hero)
  $$('[data-split]').forEach((el) => {
    if (el.closest('.hero')) return;
    gsap.from($$('.line > span', el), {
      yPercent: 110, rotate: 2, duration: 1.4, stagger: 0.09, ease,
      scrollTrigger: { trigger: el, start: 'top 85%' },
    });
  });

  // Fades
  $$('[data-fade]').forEach((el) => {
    if (el.closest('.hero')) return;
    gsap.from(el, { y: 36, opacity: 0, duration: 1.2, ease, scrollTrigger: { trigger: el, start: 'top 90%' } });
  });

  // Image reveals: clip from bottom
  $$('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { clipPath: 'inset(100% 0% 0% 0%)' }, {
      clipPath: 'inset(0% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // Parallax inside frames
  $$('[data-parallax]').forEach((img) => {
    gsap.fromTo(img, { yPercent: -8 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Timeline line draws with scroll
  gsap.fromTo('[data-line]', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 85%', end: 'top 30%', scrub: true } });
  gsap.fromTo('[data-dot]', { left: '0%' }, { left: '100%', ease: 'none', scrollTrigger: { trigger: '.timeline', start: 'top 85%', end: 'top 30%', scrub: true } });
  gsap.from('.seal--story', { rotate: -180, scale: 0.6, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.seal--story', start: 'top bottom', end: 'center 60%', scrub: true } });

  // Ribbon marquees — drift constantly, accelerate with scroll velocity
  const tracks = $$('[data-marquee]').map((el) => {
    const dir = Number(el.dataset.marquee);
    const half = el.scrollWidth / 2;
    return { el, dir, half, x: dir > 0 ? -half : 0 };
  });
  let boost = 0;
  ScrollTrigger.create({ trigger: '.menu', start: 'top bottom', end: 'bottom top', onUpdate: (s) => { boost = Math.min(Math.abs(s.getVelocity()) / 120, 14); } });
  gsap.ticker.add((_, dt) => {
    boost *= 0.92;
    tracks.forEach((t) => {
      t.x += t.dir * (0.6 + boost) * (dt / 16.7);
      if (t.x <= -t.half) t.x += t.half;
      if (t.x >= 0) t.x -= t.half;
      t.el.style.transform = `translate3d(${t.x}px,0,0)`;
    });
  });

  // Polaroids: tilt + drift
  $$('[data-tilt]').forEach((el, i) => {
    const r = Number(el.dataset.tilt);
    gsap.fromTo(el, { rotate: r * 2.2, y: 120 }, {
      rotate: r, y: i ? -80 : -20, ease: 'none',
      scrollTrigger: { trigger: '.menu__grid', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Cinema: pinned frame opens to full-bleed
  const cine = gsap.timeline({
    scrollTrigger: { trigger: '[data-cinema]', start: 'top top', end: '+=120%', scrub: true, pin: true },
  });
  cine
    .to('[data-cinema-frame]', { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none' }, 0)
    .to('[data-cinema-frame] img', { scale: 1, ease: 'none' }, 0)
    .fromTo('[data-cinema-title]', { y: 60, opacity: 0.0 }, { y: 0, opacity: 1, ease: 'none' }, 0.2);

  // House logo moment
  gsap.from($$('.logo--house .lg-l'), {
    yPercent: 60, opacity: 0, stagger: 0.06, duration: 1.2, ease,
    scrollTrigger: { trigger: '.house__mark', start: 'top 90%' },
  });

  // Footer: giant wordmark rises from below
  gsap.from($$('.logo--footer .lg-l'), {
    yPercent: 100, stagger: 0.05, ease: 'none',
    scrollTrigger: { trigger: '.footer__logo', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });
  gsap.from('.seal--footer', { rotate: -200, ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } });

  addEventListener('load', () => ScrollTrigger.refresh());
}
