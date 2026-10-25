import { SLOTS, TABLES_PER_SLOT, json, bad, code, clean, validPhone, normPhone, validEmail, body } from '../_lib/util.js';
import { sendMail, bookingMail } from '../_lib/mail.js';

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const closedOn = (date) => new Date(date + 'T00:00:00Z').getUTCDay() === 1; // Monday
const tablesFor = (guests) => Math.ceil(guests / 4);

// GET ?date=YYYY-MM-DD -> tables left in every slot, so the form can grey out full ones.
export async function onRequestGet({ request, env }) {
  const date = new URL(request.url).searchParams.get('date') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('Invalid date');
  if (closedOn(date)) return json({ closed: true, slots: [] });
  const { results } = await env.DB.prepare('SELECT time, SUM(tables_used) AS used FROM bookings WHERE date=? GROUP BY time').bind(date).all();
  const used = Object.fromEntries(results.map((r) => [r.time, r.used]));
  return json({ closed: false, slots: SLOTS.map((t) => ({ time: t, left: Math.max(0, TABLES_PER_SLOT - (used[t] || 0)) })) });
}

export async function onRequestPost({ request, env, waitUntil }) {
  const b = await body(request);
  if (!b) return bad('Invalid request');
  const name = clean(b.name, 60), notes = clean(b.notes, 300), seating = clean(b.seating, 30);
  const guests = Math.floor(Number(b.guests)), date = String(b.date || ''), time = String(b.time || '');
  if (name.length < 2) return bad('Please enter your name');
  if (!validPhone(b.phone)) return bad('Enter a valid 10-digit mobile number');
  if (!(guests >= 1 && guests <= 10)) return bad('Tables are for 1 to 10 guests');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIST()) return bad('Pick a date from today onwards');
  if (closedOn(date)) return bad('We are closed on Mondays. Tuesday to Sunday, 17:00 to 01:00.');
  if (!SLOTS.includes(time)) return bad('Pick a valid time');

  const email = clean(b.email, 120);
  if (email && !validEmail(email)) return bad('That email address does not look right');
  const need = tablesFor(guests);
  const id = code('BK');
  // One atomic statement: insert only if the slot still has room, so two people cannot take the last table.
  const r = await env.DB.prepare(
    `INSERT INTO bookings (id,name,phone,date,time,guests,tables_used,seating,notes,email,created_at)
     SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(tables_used),0) FROM bookings WHERE date=? AND time=?) + ? <= ?`,
  ).bind(id, name, normPhone(b.phone), date, time, guests, need, seating, notes, email || null, Date.now(), date, time, need, TABLES_PER_SLOT).run();
  if (!r.meta.changes) return bad('That time is fully booked. Please pick another slot.', 409);
  waitUntil(sendMail(env, { to: email, ...bookingMail({ id, name, date, time, guests, seating }) }));
  return json({ booking: { id, name, date, time, guests, seating } }, 201);
}
