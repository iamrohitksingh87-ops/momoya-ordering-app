import { isAdmin, bad } from '../../_lib/util.js';

// Everything under /api/admin needs a valid session cookie, except logging in.
// State-changing calls must be JSON, which a cross-site form post cannot send (plus the cookie is SameSite=Strict).
export async function onRequest({ request, env, next }) {
  const path = new URL(request.url).pathname;
  if (path.endsWith('/login')) return next();
  if (!env.ADMIN_PASSWORD) return bad('Admin is not configured', 503);
  if (!(await isAdmin(request, env))) return bad('Please sign in', 401);
  if (request.method !== 'GET' && !(request.headers.get('content-type') || '').includes('application/json')) return bad('Invalid request', 415);
  return next();
}
