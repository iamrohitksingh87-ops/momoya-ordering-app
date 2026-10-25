import './shop.css';
/* Ordering, payment, order tracking, table availability and reviews.
   Talks to the Cloudflare Pages Functions in /functions/api. Prices and totals shown here are
   previews only; the server recomputes everything from its own catalogue when the order is placed. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rupee = (n) => '₹' + Number(n).toLocaleString('en-IN');

// Tiny DOM builder. Children that are strings become text nodes, so user content is never parsed as HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

export async function api(path, opts) {
  const res = await fetch(path, opts && { ...opts, headers: { 'content-type': 'application/json' }, body: JSON.stringify(opts.body) });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) { const e = new Error(data?.error || 'Something went wrong. Please try again.'); e.status = res.status; e.data = data; throw e; }
  return data;
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

let menu = null;          // { items, freeDeliveryOver, deliveryFee, taxRate, gateway }
let cart = store.get('momoya.cart', {});
let lenisRef = null;
let panel, body, overlay, pollTimer = null;

const lines = () => Object.entries(cart).map(([id, qty]) => ({ ...menu.items.find((m) => m.id === id), qty })).filter((l) => l.name);
function totals() {
  const subtotal = lines().reduce((s, l) => s + l.price * l.qty, 0);
  const delivery = !subtotal || subtotal >= menu.freeDeliveryOver ? 0 : menu.deliveryFee;
  const tax = Math.round(subtotal * menu.taxRate);
  return { subtotal, delivery, tax, total: subtotal + delivery + tax };
}
const count = () => Object.values(cart).reduce((s, q) => s + q, 0);
function saveCart() {
  store.set('momoya.cart', cart);
  $$('[data-cart-count]').forEach((el) => { el.textContent = count(); el.hidden = !count(); });
}

/* ── drawer shell ───────────────────────────── */
function buildShell() {
  overlay = h('div', { class: 'shop__overlay', onclick: close, hidden: true });
  body = h('div', { class: 'shop__body', 'data-lenis-prevent': true });
  panel = h('aside', { class: 'shop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your order', hidden: true, tabindex: '-1' },
    h('button', { class: 'shop__close', type: 'button', 'aria-label': 'Close', onclick: close }, '×'), body);
  document.body.append(overlay, panel);
  addEventListener('keydown', (e) => e.key === 'Escape' && !panel.hidden && close());
}
function open(view) {
  panel.hidden = overlay.hidden = false;
  requestAnimationFrame(() => document.body.classList.add('shop-open'));
  lenisRef?.stop();
  (view || showCart)();
  panel.focus();
}
function close() {
  clearInterval(pollTimer);
  document.body.classList.remove('shop-open');
  lenisRef?.start();
  setTimeout(() => { if (!document.body.classList.contains('shop-open')) panel.hidden = overlay.hidden = true; }, 350);
}
const show = (...nodes) => { clearInterval(pollTimer); body.replaceChildren(...nodes); body.scrollTop = 0; };
const notice = () => h('p', { class: 'shop__concept mono' }, 'MOMOYA is a concept project. No real payment is taken and nothing will be delivered.');

/* ── step 1: cart ───────────────────────────── */
function showCart() {
  if (!menu) return show(h('h2', {}, 'Ordering is offline'), h('p', { class: 'mono' }, 'The order service could not be reached. Please try again in a moment.'));
  const ls = lines();
  if (!ls.length) {
    return show(h('p', { class: 'eyebrow' }, 'Your order'), h('h2', {}, 'Nothing steaming yet.'),
      h('p', { class: 'mono' }, 'Add a few momos from the menu. Every order is 8 pieces.'),
      h('button', { class: 'btn btn--red btn--wide', type: 'button', onclick: () => { close(); document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Browse the menu'),
      trackLink(), notice());
  }
  const t = totals();
  const need = menu.freeDeliveryOver - t.subtotal;
  show(
    h('p', { class: 'eyebrow' }, 'Your order'), h('h2', {}, 'Ready to fold?'),
    h('ul', { class: 'cart' }, ls.map((l) => h('li', { class: 'cart__line' },
      h('div', {}, h('strong', {}, l.name), h('span', { class: 'mono' }, `${rupee(l.price)} · 8 pcs`)),
      h('div', { class: 'qty' },
        h('button', { type: 'button', 'aria-label': `Less ${l.name}`, onclick: () => setQty(l.id, l.qty - 1) }, '−'),
        h('span', { 'aria-live': 'polite' }, l.qty),
        h('button', { type: 'button', 'aria-label': `More ${l.name}`, onclick: () => setQty(l.id, l.qty + 1) }, '+')),
      h('span', { class: 'cart__sum' }, rupee(l.price * l.qty))))),
    need > 0 ? h('p', { class: 'mono shop__hint' }, `Add ${rupee(need)} more for free delivery.`) : h('p', { class: 'mono shop__hint' }, 'Free delivery on this order.'),
    summary(t),
    h('button', { class: 'btn btn--red btn--wide', type: 'button', onclick: showCheckout }, `Checkout · ${rupee(t.total)}`),
    trackLink(), notice(),
  );
}
function setQty(id, q) {
  if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 20);
  saveCart(); showCart();
}
const summary = (t) => h('dl', { class: 'sum' },
  h('div', {}, h('dt', {}, 'Subtotal'), h('dd', {}, rupee(t.subtotal))),
  h('div', {}, h('dt', {}, 'Delivery'), h('dd', {}, t.delivery ? rupee(t.delivery) : 'Free')),
  h('div', {}, h('dt', {}, 'GST (5%)'), h('dd', {}, rupee(t.tax))),
  h('div', { class: 'sum__total' }, h('dt', {}, 'Total'), h('dd', {}, rupee(t.total))));
const trackLink = () => h('button', { class: 'linkbtn mono', type: 'button', onclick: showTrack }, 'Track an existing order');

/* ── step 2: checkout ───────────────────────── */
function showCheckout() {
  const t = totals();
  const saved = store.get('momoya.customer', {});
  const err = h('p', { class: 'form__status mono', role: 'alert' });
  const slots = ['asap', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00'];
  const f = h('form', { class: 'form form--shop', novalidate: true, onsubmit: submit },
    field('Name', h('input', { name: 'name', autocomplete: 'name', required: true, value: saved.name || '', placeholder: 'Your name' })),
    field('Mobile', h('input', { name: 'phone', type: 'tel', inputmode: 'numeric', autocomplete: 'tel', required: true, value: saved.phone || '', placeholder: '98765 43210' })),
    field('Email (optional, for your receipt)', h('input', { name: 'email', type: 'email', autocomplete: 'email', value: saved.email || '', placeholder: 'you@example.com' }), true),
    field('Delivery address', h('textarea', { name: 'address', rows: '3', required: true, placeholder: 'House, street, area, Lucknow' }, saved.address || ''), true),
    field('Deliver', h('select', { name: 'slot' }, slots.map((s) => h('option', { value: s }, s === 'asap' ? 'As soon as possible' : `Today ${s}`)))),
    field('Note (optional)', h('input', { name: 'note', maxlength: '200', placeholder: 'Extra achar, ring the bell…' })),
    h('fieldset', { class: 'pay f--wide' }, h('legend', { class: 'mono' }, 'Payment'),
      payOpt('online', menu.gateway === 'razorpay' ? 'Pay online · UPI, card, netbanking' : 'Pay online · test gateway', true),
      payOpt('cod', 'Cash on delivery')),
    h('div', { class: 'f--wide' }, summary(t), h('button', { class: 'btn btn--red btn--wide', type: 'submit' }, `Place order · ${rupee(t.total)}`), err));
  show(h('button', { class: 'linkbtn mono', type: 'button', onclick: showCart }, '← Back to cart'), h('h2', {}, 'Where should we bring it?'), f, notice());

  async function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const bad = [...f.querySelectorAll('[required]')].filter((el) => !el.value.trim());
    $$('.f', f).forEach((x) => x.classList.toggle('is-invalid', bad.includes(x.querySelector('input,textarea'))));
    if (bad.length) { err.textContent = 'Please complete the highlighted fields.'; bad[0].focus(); return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; err.textContent = 'Placing your order…';
    try {
      const r = await api('/api/orders', { method: 'POST', body: { ...d, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) } });
      store.set('momoya.customer', { name: d.name, phone: d.phone, address: d.address, email: d.email });
      store.set('momoya.last', { id: r.order.id, phone: d.phone });
      if (r.order.payStatus === 'pending') return showPay(r, d.phone);
      finishOrder(r.order, d.phone);
    } catch (x) { err.textContent = x.message; btn.disabled = false; }
  }
}
const field = (label, input, wide) => h('label', { class: 'f' + (wide ? ' f--wide' : '') }, h('span', {}, label), input);
const payOpt = (v, text, checked) => h('label', { class: 'pay__opt' }, h('input', { type: 'radio', name: 'method', value: v, checked }), h('span', {}, text));

/* ── step 3: payment ────────────────────────── */
function showPay(r, phone) {
  const o = r.order;
  const err = h('p', { class: 'form__status mono', role: 'alert' });
  if (r.gateway === 'razorpay') return openRazorpay(r, phone, err);
  const pay = async (outcome, btn) => {
    btn.disabled = true; err.textContent = 'Contacting the test gateway…';
    await new Promise((res) => setTimeout(res, 900)); // so the "processing" state is visible
    try {
      const p = await api('/api/pay', { method: 'POST', body: { id: o.id, outcome } });
      finishOrder(p.order, phone);
    } catch (x) {
      if (x.status === 402) return showPayFailed(x.data.order, phone);
      err.textContent = x.message; btn.disabled = false;
    }
  };
  const okBtn = h('button', { class: 'btn btn--red btn--wide', type: 'button', onclick: () => pay('success', okBtn) }, `Pay ${rupee(o.total)}`);
  const noBtn = h('button', { class: 'linkbtn mono', type: 'button', onclick: () => pay('fail', noBtn) }, 'Simulate a failed payment');
  show(h('p', { class: 'badge mono' }, 'Test mode · no money moves'), h('h2', {}, 'Pay for order ' + o.id),
    h('p', { class: 'mono' }, 'This is a stand-in for a real gateway. The server only marks the order paid after this step confirms it.'),
    summary(o), okBtn, noBtn, err);
}
function showPayFailed(o, phone) {
  show(h('p', { class: 'badge badge--bad mono' }, 'Payment failed'), h('h2', {}, 'That did not go through.'),
    h('p', { class: 'mono' }, `Order ${o.id} is saved but unpaid. Your cart is untouched.`),
    h('button', { class: 'btn btn--red btn--wide', type: 'button', onclick: () => (menu.gateway === 'razorpay' ? showCheckout() : showPay({ order: o, gateway: 'test' }, phone)) }, 'Try again'),
    h('button', { class: 'linkbtn mono', type: 'button', onclick: showCart }, 'Back to cart'));
}
function openRazorpay(r, phone, err) {
  const o = r.order;
  show(h('h2', {}, 'Opening secure payment…'), h('p', { class: 'mono' }, `Order ${o.id} · ${rupee(o.total)}`), err);
  const go = () => {
    const rz = new window.Razorpay({
      key: r.razorpay.key, order_id: r.razorpay.orderId, amount: r.razorpay.amount, currency: 'INR', name: 'MOMOYA', description: `Order ${o.id}`,
      prefill: { name: o.name, contact: phone }, theme: { color: '#b23a26' },
      handler: async (resp) => {
        try { finishOrder((await api('/api/pay', { method: 'POST', body: { id: o.id, ...resp } })).order, phone); }
        catch (x) { x.status === 402 ? showPayFailed(x.data.order, phone) : (err.textContent = x.message); }
      },
      modal: { ondismiss: () => showPayFailed(o, phone) },
    });
    rz.open();
  };
  if (window.Razorpay) return go();
  const s = h('script', { src: 'https://checkout.razorpay.com/v1/checkout.js' });
  s.onload = go; s.onerror = () => { err.textContent = 'Could not load the payment window.'; };
  document.head.append(s);
}

/* ── step 4: confirmation + live tracker ────── */
function finishOrder(order, phone) {
  cart = {}; saveCart();
  store.set('momoya.last', { id: order.id, phone });
  showOrder(order, phone);
}
const STEPS = [['placed', 'Order placed'], ['preparing', 'Being folded & steamed'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
function showOrder(order, phone) {
  const render = (o) => {
    const idx = STEPS.findIndex(([k]) => k === o.status);
    const cancelled = o.status === 'cancelled';
    show2(h('p', { class: 'badge mono' }, o.method === 'cod' ? 'Cash on delivery' : 'Paid · test mode'),
      h('h2', {}, 'Order ' + o.id),
      cancelled && h('p', { class: 'badge badge--bad mono' }, 'This order was cancelled'),
      !cancelled && h('ol', { class: 'track' }, STEPS.map(([k, label], i) => h('li', { class: i < idx ? 'is-done' : i === idx ? 'is-now' : '' }, h('span', {}, label)))),
      h('ul', { class: 'cart cart--ro' }, o.items.map((l) => h('li', { class: 'cart__line' }, h('div', {}, h('strong', {}, `${l.qty} × ${l.name}`)), h('span', { class: 'cart__sum' }, rupee(l.price * l.qty))))),
      summary(o),
      h('p', { class: 'mono' }, 'Deliver to: ' + o.address),
      cancelled ? h('p', { class: 'mono shop__hint' }, 'The kitchen cancelled this order. In a live setup, a refund would start here.')
      : o.status === 'delivered'
        ? h('button', { class: 'btn btn--red btn--wide', type: 'button', onclick: () => { close(); prefillReview(o.id, phone); } }, 'Leave a review')
        : h('p', { class: 'mono shop__hint' }, 'Status updates on its own. In this demo it moves every few seconds.'),
      notice());
  };
  const show2 = (...n) => { body.replaceChildren(...n); };   // keep the poll timer alive between renders
  show(); render(order);
  if (!['delivered', 'cancelled'].includes(order.status)) {
    pollTimer = setInterval(async () => {
      try { const r = await api(`/api/orders?id=${order.id}&phone=${encodeURIComponent(phone)}`); render(r.order); if (['delivered', 'cancelled'].includes(r.order.status)) clearInterval(pollTimer); } catch { /* keep trying */ }
    }, 3000);
  }
}

/* ── track an existing order ────────────────── */
function showTrack() {
  const last = store.get('momoya.last', {});
  const err = h('p', { class: 'form__status mono', role: 'alert' });
  const f = h('form', { class: 'form form--shop', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); const d = Object.fromEntries(new FormData(f)); err.textContent = 'Looking…';
    try { const r = await api(`/api/orders?id=${encodeURIComponent(d.id.trim())}&phone=${encodeURIComponent(d.phone.trim())}`); showOrder(r.order, d.phone.trim()); }
    catch (x) { err.textContent = x.message; }
  } },
    field('Order ID', h('input', { name: 'id', placeholder: 'MM-XXXXXX', value: last.id || '', required: true, autocapitalize: 'characters' })),
    field('Mobile used', h('input', { name: 'phone', type: 'tel', value: last.phone || '', required: true })),
    h('div', { class: 'f--wide' }, h('button', { class: 'btn btn--red btn--wide', type: 'submit' }, 'Track order'), err));
  show(h('button', { class: 'linkbtn mono', type: 'button', onclick: showCart }, '← Back'), h('h2', {}, 'Track an order'), f);
}

/* ── booking: live slot availability ────────── */
export function initBookingSlots(form) {
  const date = form.elements.date, time = form.elements.time;
  const hint = h('span', { class: 'mono slot-hint' });
  time.closest('.f').append(hint);
  const base = [...time.options].map((o) => o.value).filter(Boolean);
  const refresh = async () => {
    if (!date.value) return;
    hint.textContent = 'Checking tables…';
    try {
      const a = await api('/api/bookings?date=' + date.value);
      const keep = time.value;
      time.replaceChildren(h('option', { value: '' }, 'Select…'));
      if (a.closed) { hint.textContent = 'Closed on Mondays. Please pick Tuesday to Sunday.'; return; }
      for (const s of a.slots) time.append(h('option', { value: s.time, disabled: !s.left }, s.left ? s.time : `${s.time} · full`));
      if (keep && a.slots.find((s) => s.time === keep && s.left)) time.value = keep;
      hint.textContent = a.slots.every((s) => !s.left) ? 'Fully booked that day.' : `${a.slots.filter((s) => s.left).length} of ${a.slots.length} times available.`;
    } catch { hint.textContent = ''; time.replaceChildren(h('option', { value: '' }, 'Select…'), ...base.map((t) => h('option', {}, t))); }
  };
  date.addEventListener('change', refresh);
  return refresh;
}
export const bookTable = (data) => api('/api/bookings', { method: 'POST', body: data });

/* ── reviews ────────────────────────────────── */
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
async function loadReviews() {
  const list = $('[data-review-list]'), sum = $('[data-review-summary]');
  try {
    const r = await api('/api/reviews');
    sum.textContent = r.count ? `${r.average} / 5 from ${r.count} ${r.count === 1 ? 'review' : 'reviews'}` : 'No reviews yet.';
    list.replaceChildren(...(r.reviews.length ? r.reviews.map((v) => h('li', { class: 'review' },
      h('div', { class: 'review__top' }, h('strong', {}, v.name), v.verified && h('span', { class: 'badge mono' }, 'Ordered here'),
        h('span', { class: 'review__stars', 'aria-label': `${v.rating} out of 5` }, stars(v.rating))),
      h('p', {}, v.text),
      h('time', { class: 'mono', datetime: new Date(v.created_at).toISOString() }, new Date(v.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })))) :
      [h('li', { class: 'mono review--empty' }, 'Be the first to leave a word about the momos.')]));
  } catch { sum.textContent = ''; list.replaceChildren(h('li', { class: 'mono review--empty' }, 'Reviews could not be loaded right now.')); }
}
function prefillReview(orderId, phone) {
  const f = $('[data-review-form]'); if (!f) return;
  f.elements.orderId.value = orderId; f.elements.phone.value = phone; f.querySelector('details').open = true;
  document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' });
}
function initReviews() {
  const f = $('[data-review-form]'); if (!f) return;
  const st = $('[data-review-status]');
  const saved = store.get('momoya.customer', {});
  if (saved.name) f.elements.name.value = saved.name.split(' ')[0];
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (!d.rating) { st.textContent = 'Choose a star rating first.'; return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; st.textContent = 'Posting…';
    try {
      await api('/api/reviews', { method: 'POST', body: d });
      f.reset(); st.textContent = 'Thank you. Your review is up.'; await loadReviews();
    } catch (x) { st.textContent = x.message; } finally { btn.disabled = false; }
  });
  loadReviews();
}

/* ── boot ───────────────────────────────────── */
export async function initShop({ lenis } = {}) {
  lenisRef = lenis;
  buildShell(); saveCart(); initReviews();
  $$('[data-open-cart]').forEach((b) => b.addEventListener('click', () => open()));
  $$('[data-open-track]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); open(showTrack); }));
  try {
    menu = await api('/api/menu');
    $$('[data-dish]').forEach((li) => {
      const m = menu.items.find((x) => x.id === li.dataset.dish);
      if (m) $('.dish__price', li).textContent = rupee(m.price);
    });
    cart = Object.fromEntries(Object.entries(cart).filter(([id]) => menu.items.some((m) => m.id === id)));
    saveCart();
  } catch {
    $$('[data-add]').forEach((b) => { b.disabled = true; b.title = 'Ordering is offline'; });
  }
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => {
    if (!menu) return open();
    const id = b.dataset.add; cart[id] = Math.min((cart[id] || 0) + 1, 20); saveCart();
    b.classList.add('is-added'); b.textContent = `Added · ${cart[id]}`;
    setTimeout(() => { b.classList.remove('is-added'); b.textContent = 'Add'; }, 1200);
  }));
}
