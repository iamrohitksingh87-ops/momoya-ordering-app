import { json, bad, body } from '../../_lib/util.js';

export async function onRequestPost({ request, env }) {
  const b = await body(request);
  if (!b || !Number.isInteger(b.id) || b.action !== 'delete') return bad('Invalid request');
  const r = await env.DB.prepare('DELETE FROM reviews WHERE id=?').bind(b.id).run();
  return r.meta.changes ? json({ ok: true }) : bad('Review not found', 404);
}
