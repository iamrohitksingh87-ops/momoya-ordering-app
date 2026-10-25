import { json, bad, body, hmacHex } from '../_lib/util.js';
import { publicOrder } from './orders.js';
import { sendMail, orderMail } from '../_lib/mail.js';

// Confirms payment for an order.
//  - Razorpay configured: verifies the HMAC signature Razorpay returns (never trusts the browser).
//  - Otherwise: the built-in test gateway, which exists only to demo the flow without real money.
export async function onRequestPost({ request, env, waitUntil }) {
  const b = await body(request);
  if (!b || !b.id) return bad('Invalid request');
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(String(b.id)).first();
  if (!o) return bad('Order not found', 404);
  if (o.pay_status === 'paid') return json({ order: publicOrder(o) });
  if (o.pay_status !== 'pending' && o.pay_status !== 'failed') return bad('This order does not need payment');

  let ok = false, ref = null;
  if (env.RAZORPAY_KEY_SECRET) {
    const { razorpay_payment_id: pid, razorpay_signature: sig } = b;
    if (!pid || !sig || !o.rzp_order_id) return bad('Missing payment details');
    ok = (await hmacHex(env.RAZORPAY_KEY_SECRET, `${o.rzp_order_id}|${pid}`)) === sig;
    ref = pid;
  } else {
    ok = b.outcome === 'success';
    ref = 'test_' + crypto.randomUUID().slice(0, 8);
  }
  if (ok) {
    // paid time restarts the tracker so it begins at "placed"
    await env.DB.prepare("UPDATE orders SET pay_status='paid', pay_ref=?, created_at=? WHERE id=?").bind(ref, Date.now(), o.id).run();
  } else {
    await env.DB.prepare("UPDATE orders SET pay_status='failed' WHERE id=?").bind(o.id).run();
  }
  const row = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(o.id).first();
  if (ok) waitUntil(sendMail(env, { to: row.email, ...orderMail(publicOrder(row)) }));
  return json({ order: publicOrder(row) }, ok ? 200 : 402);
}
