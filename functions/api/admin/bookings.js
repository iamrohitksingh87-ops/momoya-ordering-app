import { json, bad, body } from '../../_lib/util.js';

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT id,name,phone,email,date,time,guests,tables_used,seating,notes,created_at FROM bookings WHERE date>=? ORDER BY date, time LIMIT 200').bind(todayIST()).all();
  return json({ bookings: results });
}

// Cancelling frees the tables straight away, so the slot shows availability again on the public form.
export async function onRequestPost({ request, env }) {
  const b = await body(request);
  if (!b || !b.id || b.action !== 'cancel') return bad('Invalid request');
  const r = await env.DB.prepare('DELETE FROM bookings WHERE id=?').bind(String(b.id)).run();
  return r.meta.changes ? json({ ok: true }) : bad('Booking not found', 404);
}
