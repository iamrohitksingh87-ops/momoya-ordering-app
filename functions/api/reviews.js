import { json, bad, clean, body, sha256, normPhone } from '../_lib/util.js';

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare('SELECT id,name,rating,text,verified,created_at FROM reviews ORDER BY id DESC LIMIT 30').all();
  const agg = await env.DB.prepare('SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews').first();
  return json({ count: agg.n, average: agg.n ? Math.round(agg.avg * 10) / 10 : null, reviews: results.map((r) => ({ ...r, verified: !!r.verified })) });
}

export async function onRequestPost({ request, env }) {
  const b = await body(request);
  if (!b) return bad('Invalid request');
  if (b.website) return json({ ok: true }, 201); // honeypot: bots fill hidden fields, people do not
  const name = clean(b.name, 40), text = clean(b.text, 500), rating = Math.floor(Number(b.rating));
  if (name.length < 2) return bad('Please add your name');
  if (!(rating >= 1 && rating <= 5)) return bad('Choose a rating from 1 to 5');
  if (text.length < 10) return bad('Write at least a sentence (10 characters)');
  if (/https?:\/\/|www\./i.test(text)) return bad('Links are not allowed in reviews');

  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const ipHash = await sha256(ip + (env.IP_SALT || 'momoya'));
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM reviews WHERE ip_hash=? AND created_at>?').bind(ipHash, Date.now() - 3600e3).first();
  if (recent.n >= 3) return bad('You are posting too fast. Please try again in a while.', 429);

  // The "Ordered here" badge needs a real paid/COD order id plus the phone it was placed with.
  let verified = 0;
  if (b.orderId || b.phone) {
    const o = await env.DB.prepare("SELECT id FROM orders WHERE id=? AND phone=? AND pay_status IN ('paid','cod')")
      .bind(String(b.orderId || '').toUpperCase(), normPhone(b.phone)).first();
    if (!o) return bad('That order ID and phone do not match. Leave them blank to post without the badge.');
    verified = 1;
  }
  const now = Date.now();
  const r = await env.DB.prepare('INSERT INTO reviews (name,rating,text,verified,ip_hash,created_at) VALUES (?,?,?,?,?,?)').bind(name, rating, text, verified, ipHash, now).run();
  return json({ review: { id: r.meta.last_row_id, name, rating, text, verified: !!verified, created_at: now } }, 201);
}
