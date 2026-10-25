import { json, bad, body, sha256, safeEq, adminToken, isAdmin } from '../../_lib/util.js';

const cookie = (value, maxAge) => `mm_admin=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

// GET: am I signed in?   POST: sign in.   DELETE: sign out.
export async function onRequestGet({ request, env }) {
  return json({ configured: !!env.ADMIN_PASSWORD, signedIn: await isAdmin(request, env) });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return bad('Admin is not configured', 503);
  const b = await body(request);
  if (!b || typeof b.password !== 'string') return bad('Invalid request');

  const ipHash = await sha256((request.headers.get('cf-connecting-ip') || 'local') + 'admin');
  const since = Date.now() - 15 * 60e3;
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_attempts WHERE ip_hash=? AND at>?').bind(ipHash, since).first();
  if (n >= 5) return bad('Too many attempts. Try again in 15 minutes.', 429);

  // Compare hashes so length and timing reveal nothing about the password.
  const ok = safeEq(await sha256(b.password), await sha256(env.ADMIN_PASSWORD));
  if (!ok) {
    await env.DB.prepare('INSERT INTO admin_attempts (ip_hash, at) VALUES (?,?)').bind(ipHash, Date.now()).run();
    return bad('Wrong password', 401);
  }
  await env.DB.prepare('DELETE FROM admin_attempts WHERE ip_hash=?').bind(ipHash).run();
  const res = json({ ok: true });
  res.headers.append('set-cookie', cookie(await adminToken(env), 12 * 3600));
  return res;
}

export async function onRequestDelete() {
  const res = json({ ok: true });
  res.headers.append('set-cookie', cookie('', 0));
  return res;
}
