import { json, bad, body } from '../../_lib/util.js';
import { statusOf } from '../orders.js';

const SETTABLE = ['placed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled', 'auto'];

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100').all();
  const orders = results.map((o) => ({
    id: o.id, name: o.name, phone: o.phone, email: o.email, address: o.address, slot: o.slot, note: o.note,
    items: JSON.parse(o.items), total: o.total, method: o.method, payStatus: o.pay_status,
    status: statusOf(o), manual: !!o.status, createdAt: o.created_at,
  }));
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = results.filter((o) => o.created_at >= dayStart.getTime() && o.status !== 'cancelled' && ['paid', 'cod'].includes(o.pay_status));
  return json({ orders, stats: { today: today.length, revenueToday: today.reduce((s, o) => s + o.total, 0), awaitingPayment: results.filter((o) => o.pay_status === 'pending').length } });
}

export async function onRequestPost({ request, env }) {
  const b = await body(request);
  if (!b || !SETTABLE.includes(b.status) || !b.id) return bad('Invalid request');
  const o = await env.DB.prepare('SELECT pay_status FROM orders WHERE id=?').bind(String(b.id)).first();
  if (!o) return bad('Order not found', 404);
  if (!['paid', 'cod'].includes(o.pay_status) && b.status !== 'cancelled') return bad('Only paid or cash-on-delivery orders can be moved along');
  await env.DB.prepare('UPDATE orders SET status=? WHERE id=?').bind(b.status === 'auto' ? null : b.status, String(b.id)).run();
  return json({ ok: true });
}
