// End-to-end API check against `wrangler pages dev` (npm run api). Usage: node test-api.mjs [base]
const base = process.argv[2] || 'http://127.0.0.1:8788';
let fails = 0;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json() }));
const get = (p) => fetch(base + p).then(async (r) => ({ s: r.status, j: await r.json() }));
const ok = (name, cond, extra = '') => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); if (!cond) fails++; };

const cust = { name: 'Test User', phone: '9876543210', address: '12 Hazratganj, Lucknow 226001', slot: 'asap' };

// orders: totals computed server-side, client price ignored
let r = await post('/api/orders', { ...cust, method: 'online', items: [{ id: 'jhol', qty: 2, price: 1 }] });
ok('order created', r.s === 201, JSON.stringify(r.j));
const o = r.j.order;
ok('server price used (2 x 219 = 438, +40 delivery, +22 tax = 500)', o.subtotal === 438 && o.delivery === 40 && o.tax === 22 && o.total === 500, JSON.stringify(o));
ok('online order awaits payment', o.status === 'awaiting_payment');
r = await post('/api/orders', { ...cust, items: [{ id: 'nope', qty: 1 }] }); ok('unknown item rejected', r.s === 400);
r = await post('/api/orders', { ...cust, items: [{ id: 'jhol', qty: 0 }] }); ok('qty 0 rejected', r.s === 400);
r = await post('/api/orders', { ...cust, phone: '12345', items: [{ id: 'jhol', qty: 1 }] }); ok('bad phone rejected', r.s === 400);
r = await post('/api/orders', { ...cust, items: [{ id: 'jhol', qty: 3 }], method: 'cod' });
ok('COD order free delivery over 499 (657 subtotal)', r.s === 201 && r.j.order.delivery === 0 && r.j.order.status === 'placed', JSON.stringify(r.j));

// payment
r = await post('/api/pay', { id: o.id, outcome: 'fail' }); ok('failed payment -> 402 + payment_failed', r.s === 402 && r.j.order.status === 'payment_failed');
r = await post('/api/pay', { id: o.id, outcome: 'success' }); ok('retry success -> paid + placed', r.s === 200 && r.j.order.payStatus === 'paid' && r.j.order.status === 'placed', JSON.stringify(r.j));

// lookup needs id + matching phone
r = await get(`/api/orders?id=${o.id}&phone=9876543210`); ok('lookup with right phone', r.s === 200 && r.j.order.id === o.id);
r = await get(`/api/orders?id=${o.id}&phone=9000000000`); ok('lookup with wrong phone is 404', r.s === 404);

// bookings
const d = new Date(Date.now() + 5.5 * 3600e3 + 3 * 864e5); // 3 days out
while (d.getUTCDay() === 1) d.setUTCDate(d.getUTCDate() + 1);
const date = d.toISOString().slice(0, 10);
const bk = { name: 'Test User', phone: '9876543210', date, time: '20:00', guests: 4, seating: 'Steam bar' };
r = await post('/api/bookings', bk); ok('booking created', r.s === 201 && /^BK-/.test(r.j.booking?.id), JSON.stringify(r.j));
r = await get('/api/bookings?date=' + date); ok('availability drops by 1 table', r.j.slots.find((s) => s.time === '20:00').left === 7, JSON.stringify(r.j));
for (let i = 0; i < 7; i++) await post('/api/bookings', { ...bk, guests: 4 });
r = await post('/api/bookings', bk); ok('full slot -> 409', r.s === 409, JSON.stringify(r.j));
const mon = new Date(Date.now() + 5.5 * 3600e3 + 3 * 864e5); while (mon.getUTCDay() !== 1) mon.setUTCDate(mon.getUTCDate() + 1);
r = await post('/api/bookings', { ...bk, date: mon.toISOString().slice(0, 10), time: '19:00' }); ok('Monday closed', r.s === 400);
r = await post('/api/bookings', { ...bk, date: '2020-01-01' }); ok('past date rejected', r.s === 400);

// reviews
r = await post('/api/reviews', { name: 'Asha', rating: 5, text: 'The jhol momo was unreal, perfect broth.' }); ok('review posted', r.s === 201, JSON.stringify(r.j));
r = await post('/api/reviews', { name: 'Spam', rating: 5, text: 'buy now http://spam.example' }); ok('links rejected', r.s === 400);
r = await post('/api/reviews', { name: 'Ravi', rating: 4, text: 'Kothey was crisp and the achar had real heat.', orderId: o.id, phone: '9876543210' }); ok('verified review', r.s === 201 && r.j.review.verified === true, JSON.stringify(r.j));
r = await post('/api/reviews', { name: 'Fake', rating: 5, text: 'Claims an order that is not theirs.', orderId: o.id, phone: '9000000000' }); ok('wrong order+phone rejected', r.s === 400);
r = await post('/api/reviews', { name: 'Bot', rating: 5, text: 'honeypot filled in here', website: 'x' }); ok('honeypot silently dropped', r.s === 201 && !r.j.review);
r = await post('/api/reviews', { name: 'Third', rating: 3, text: 'Third review inside an hour, still allowed.' }); ok('3rd review allowed', r.s === 201, JSON.stringify(r.j));
r = await post('/api/reviews', { name: 'Fourth', rating: 3, text: '<script>alert(1)</script> fourth in an hour' }); ok('4th review in an hour rate-limited', r.s === 429, JSON.stringify(r.j));
r = await get('/api/reviews'); ok('list + average', r.j.count === 3 && r.j.average === 4, JSON.stringify(r.j));
ok('no raw angle brackets stored', !JSON.stringify(r.j).includes('<'));

// admin (runs when ADMIN_PASSWORD is set in the environment)
const raw = (p, m = 'GET', b, cookie) => fetch(base + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, body: b ? JSON.stringify(b) : undefined });
r = await raw('/api/admin/orders'); ok('admin API is locked without a session', [401, 503].includes(r.status));
r = await raw('/api/admin/orders', 'POST', { id: o.id, status: 'delivered' }); ok('cannot change status without a session', [401, 503].includes(r.status));
if (process.env.ADMIN_PASSWORD) {
  r = await raw('/api/admin/login', 'POST', { password: 'wrong' }); ok('wrong password rejected', r.status === 401);
  r = await raw('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD });
  const ck = (r.headers.get('set-cookie') || '').split(';')[0];
  ok('login sets HttpOnly SameSite=Strict cookie', r.status === 200 && /HttpOnly/i.test(r.headers.get('set-cookie')) && /SameSite=Strict/i.test(r.headers.get('set-cookie')));
  r = await raw('/api/admin/orders', 'GET', null, 'mm_admin=1.deadbeef'); ok('forged cookie rejected', r.status === 401);
  r = await raw('/api/admin/orders', 'GET', null, ck); let j = await r.json(); ok('admin sees orders + stats', r.status === 200 && j.orders.length >= 2 && j.stats.today >= 1, JSON.stringify(j.stats));
  r = await raw('/api/admin/orders', 'POST', { id: o.id, status: 'preparing' }, ck); ok('admin sets status', r.status === 200);
  r = await get(`/api/orders?id=${o.id}&phone=9876543210`); ok('customer tracker reflects admin status (not time based)', r.j.order.status === 'preparing', JSON.stringify(r.j));
  r = await raw('/api/admin/orders', 'POST', { id: o.id, status: 'bogus' }, ck); ok('invalid status rejected', r.status === 400);
  r = await post('/api/orders', { ...cust, method: 'online', items: [{ id: 'jhol', qty: 1 }] });
  const unpaid = r.j.order.id;
  r = await raw('/api/admin/orders', 'POST', { id: unpaid, status: 'delivered' }, ck); ok('cannot deliver an unpaid order', r.status === 400);
  r = await raw('/api/admin/orders', 'POST', { id: o.id, status: 'cancelled' }, ck); ok('admin cancels', r.status === 200);
  r = await get(`/api/orders?id=${o.id}&phone=9876543210`); ok('customer sees cancelled', r.j.order.status === 'cancelled');
  r = await raw('/api/admin/orders', 'POST', { id: o.id, status: 'auto' }, ck); r = await get(`/api/orders?id=${o.id}&phone=9876543210`); ok('auto resets override', r.j.order.status !== 'preparing' && r.j.order.status !== 'cancelled', JSON.stringify(r.j.order.status));
  r = await raw('/api/admin/orders', 'POST', 'x', ck); // non-JSON content type
  r = await fetch(base + '/api/admin/orders', { method: 'POST', headers: { cookie: ck, 'content-type': 'text/plain' }, body: '{}' }); ok('non-JSON write rejected (CSRF guard)', r.status === 415);
  r = await raw('/api/admin/bookings', 'GET', null, ck); j = await r.json();
  const mine = j.bookings.find((x) => x.date === date && x.time === '20:00'); ok('admin sees bookings', !!mine);
  r = await raw('/api/admin/bookings', 'POST', { id: mine.id, action: 'cancel' }, ck); ok('admin cancels booking', r.status === 200);
  r = await get('/api/bookings?date=' + date); ok('cancelling frees the table', r.j.slots.find((s) => s.time === '20:00').left >= 1);
  const rv = (await get('/api/reviews')).j.reviews[0];
  r = await raw('/api/admin/reviews', 'POST', { id: rv.id, action: 'delete' }, ck); ok('admin deletes review', r.status === 200);
  for (let i = 0; i < 5; i++) await raw('/api/admin/login', 'POST', { password: 'nope' + i });
  r = await raw('/api/admin/login', 'POST', { password: process.env.ADMIN_PASSWORD }); ok('login throttled after repeated failures', r.status === 429);
} else console.log('SKIP admin checks (set ADMIN_PASSWORD)');
r = await post('/api/orders', { ...cust, email: 'not-an-email', items: [{ id: 'jhol', qty: 1 }] }); ok('bad email rejected', r.status === 400 || r.s === 400);

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
