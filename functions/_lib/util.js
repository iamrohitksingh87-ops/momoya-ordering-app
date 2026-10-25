export const MENU = [
  { id: 'jhol',   name: 'Jhol Momo',       price: 219 },
  { id: 'kothey', name: 'Kothey',          price: 199 },
  { id: 'timmur', name: 'Timmur Chicken',  price: 189 },
  { id: 'sadeko', name: 'Sadeko Mushroom', price: 189 },
  { id: 'chilli', name: 'Chilli Momo',     price: 199 },
  { id: 'sesame', name: 'Black Sesame',    price: 129 },
];
export const FREE_DELIVERY_OVER = 499;
export const DELIVERY_FEE = 40;
export const TAX_RATE = 0.05;
export const SLOTS = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];
export const TABLES_PER_SLOT = 8;

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
export const bad = (msg, status = 400) => json({ error: msg }, status);

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function code(prefix) {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${[...b].map((x) => ALPHA[x % ALPHA.length]).join('')}`;
}
export const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const normPhone = (p) => String(p ?? '').replace(/[\s-]/g, '').replace(/^\+?91/, '');
export const validPhone = (p) => /^[6-9]\d{9}$/.test(normPhone(p));

const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
export async function hmacHex(secret, msg) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg)));
}
export async function body(request) {
  try { return await request.json(); } catch { return null; }
}

export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(String(e ?? ''));
const safeEq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
export { safeEq };

// Admin session = "<expiry>.<hmac(expiry)>" in an HttpOnly cookie. The password never leaves the server.
export async function adminToken(env, hours = 12) {
  const exp = String(Date.now() + hours * 3600e3);
  return `${exp}.${await hmacHex(env.ADMIN_PASSWORD, 'admin:' + exp)}`;
}
export async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = /(?:^|;\s*)mm_admin=([^;]+)/.exec(request.headers.get('cookie') || '');
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEq(sig, await hmacHex(env.ADMIN_PASSWORD, 'admin:' + exp));
}
