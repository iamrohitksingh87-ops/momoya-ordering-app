import { MENU, FREE_DELIVERY_OVER, DELIVERY_FEE, TAX_RATE, json, bad, code, clean, validPhone, normPhone, validEmail, body } from '../_lib/util.js';
import { sendMail, orderMail } from '../_lib/mail.js';

const SLOT_RE = /^(asap|\d{2}:\d{2})$/;

// Status is derived from order age so the tracker moves on its own in a demo (seconds, not minutes).
// An admin-set status wins; NULL means "auto" so the demo still moves with nobody in the kitchen.
export function statusOf(o, now = Date.now()) {
  if (o.status === 'cancelled') return 'cancelled';
  if (o.pay_status === 'failed') return 'payment_failed';
  if (o.pay_status === 'pending') return 'awaiting_payment';
  if (o.status) return o.status;
  const s = (now - o.created_at) / 1000;
  return s < 20 ? 'placed' : s < 70 ? 'preparing' : s < 150 ? 'out_for_delivery' : 'delivered';
}
export const publicOrder = (o) => ({
  id: o.id, name: o.name, address: o.address, slot: o.slot, items: JSON.parse(o.items),
  subtotal: o.subtotal, delivery: o.delivery, tax: o.tax, total: o.total,
  method: o.method, payStatus: o.pay_status, status: statusOf(o), createdAt: o.created_at,
});

export async function onRequestPost({ request, env, waitUntil }) {
  const b = await body(request);
  if (!b) return bad('Invalid request');
  const email = clean(b.email, 120);
  if (email && !validEmail(email)) return bad('That email address does not look right');
  const name = clean(b.name, 60), address = clean(b.address, 200), note = clean(b.note, 200);
  if (name.length < 2) return bad('Please enter your name');
  if (!validPhone(b.phone)) return bad('Enter a valid 10-digit mobile number');
  if (address.length < 10) return bad('Please enter a full delivery address');
  const slot = clean(b.slot, 8);
  if (!SLOT_RE.test(slot)) return bad('Pick a delivery time');
  const method = b.method === 'cod' ? 'cod' : 'online';
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 12) return bad('Your cart is empty');

  // Prices come from the server catalogue only; the client's numbers are never trusted.
  const lines = [];
  for (const it of b.items) {
    const m = MENU.find((x) => x.id === it.id);
    const qty = Math.floor(Number(it.qty));
    if (!m || !(qty >= 1 && qty <= 20)) return bad('Invalid item in cart');
    lines.push({ id: m.id, name: m.name, price: m.price, qty });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const delivery = subtotal >= FREE_DELIVERY_OVER ? 0 : DELIVERY_FEE;
  const tax = Math.round(subtotal * TAX_RATE);
  const total = subtotal + delivery + tax;

  const id = code('MM');
  const payStatus = method === 'cod' ? 'cod' : 'pending';
  let rzp = null, rzpOrderId = null;
  if (method === 'online' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`) },
      body: JSON.stringify({ amount: total * 100, currency: 'INR', receipt: id }),
    });
    if (!r.ok) return bad('Payment gateway is unavailable, please try again', 502);
    const ro = await r.json();
    rzpOrderId = ro.id;
    rzp = { key: env.RAZORPAY_KEY_ID, orderId: ro.id, amount: ro.amount };
  }
  await env.DB.prepare(
    'INSERT INTO orders (id,name,phone,address,slot,note,items,subtotal,delivery,tax,total,method,pay_status,rzp_order_id,email,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(id, name, normPhone(b.phone), address, slot, note, JSON.stringify(lines), subtotal, delivery, tax, total, method, payStatus, rzpOrderId, email || null, Date.now()).run();

  const row = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(id).first();
  if (method === 'cod') waitUntil(sendMail(env, { to: email, ...orderMail(publicOrder(row)) }));   // online orders mail after payment
  return json({ order: publicOrder(row), gateway: rzp ? 'razorpay' : 'test', razorpay: rzp }, 201);
}

// Look up an order: needs the order id AND the phone it was placed with.
export async function onRequestGet({ request, env }) {
  const u = new URL(request.url);
  const id = clean(u.searchParams.get('id'), 20).toUpperCase();
  const phone = normPhone(u.searchParams.get('phone') || '');
  if (!id || !phone) return bad('Order ID and phone are required');
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id=? AND phone=?').bind(id, phone).first();
  if (!row) return bad('No order found for that ID and phone number', 404);
  return json({ order: publicOrder(row) });
}
