// Transactional email through Resend. Fully optional: with no RESEND_API_KEY every call is a no-op,
// so the site works the same without it. Never throws; a mail failure must not fail an order.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = (n) => '₹' + Number(n).toLocaleString('en-IN');

export async function sendMail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'MOMOYA <onboarding@resend.dev>', to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

const shell = (title, inner) => `<div style="font-family:Georgia,serif;max-width:520px;margin:auto;background:#f6f1e6;color:#15150f;padding:28px;border-top:6px solid #b23a26">
<h1 style="font-weight:400;margin:0 0 14px">${esc(title)}</h1>${inner}
<p style="font-size:12px;color:#666;margin-top:24px">MOMOYA is a concept project by WebnexStudio. This is a demo: no real payment was taken and nothing will be delivered.</p></div>`;

export const orderMail = (o) => ({
  subject: `Order ${o.id} confirmed`,
  html: shell(`Thanks, ${o.name.split(' ')[0]}. Order ${o.id} is in.`,
    `<table style="width:100%;border-collapse:collapse">${o.items.map((l) => `<tr><td style="padding:4px 0">${esc(l.qty)} × ${esc(l.name)}</td><td style="text-align:right">${rupee(l.price * l.qty)}</td></tr>`).join('')}
<tr><td style="padding-top:10px;border-top:1px solid #ccc">Delivery</td><td style="text-align:right;border-top:1px solid #ccc">${o.delivery ? rupee(o.delivery) : 'Free'}</td></tr>
<tr><td>GST (5%)</td><td style="text-align:right">${rupee(o.tax)}</td></tr>
<tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${rupee(o.total)}</strong></td></tr></table>
<p>${o.method === 'cod' ? 'Pay in cash on delivery.' : 'Paid online (test mode).'}<br>Deliver to: ${esc(o.address)}</p>
<p>Track it any time on the site with your order ID and mobile number.</p>`),
});

export const bookingMail = (b) => ({
  subject: `Table booked · ${b.date} ${b.time}`,
  html: shell(`You are booked, ${b.name.split(' ')[0]}.`,
    `<p>Table for <strong>${esc(b.guests)}</strong> on <strong>${esc(b.date)}</strong> at <strong>${esc(b.time)}</strong>${b.seating ? ` (${esc(b.seating)})` : ''}.</p>
<p>Reference: <strong>${esc(b.id)}</strong></p><p>We are open Tuesday to Sunday, 17:00 to 01:00.</p>`),
});
