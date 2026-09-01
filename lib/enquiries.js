const crypto = require('crypto');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const rateBuckets = new Map();
const MUXI_PROPERTIES = {
  huoshan: 'Dream Island · Huoshan',
  erhai: 'Dream Island · Erhai',
  flexible: 'Flexible · Please advise',
};

function text(value, max = 500) {
  return String(value || '').trim().replace(/\u0000/g, '').slice(0, max);
}

function escapeHtml(value) {
  return text(value, 5000)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clientIp(req) {
  return text(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress, 120)
    .split(',')[0]
    .trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (rateBuckets.get(ip) || []).filter(ts => now - ts < WINDOW_MS);
  recent.push(now);
  rateBuckets.set(ip, recent);
  if (rateBuckets.size > 1000) {
    for (const [key, values] of rateBuckets.entries()) {
      if (!values.some(ts => now - ts < WINDOW_MS)) rateBuckets.delete(key);
    }
  }
  return recent.length > MAX_REQUESTS;
}

async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true;
}

function normalise(body) {
  const variant = text(body.variant, 20) === 'long' ? 'long' : 'short';
  const propertyCode = text(body.property, 30).toLowerCase();
  return {
    id: `WRJ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    variant,
    lang: text(body.lang, 4) === 'en' ? 'en' : 'zh',
    name: text(body.name, 100),
    email: text(body.email, 180),
    contact: text(body.contact, 180),
    message: text(body.message, 3000),
    discovery: text(body.discovery, 100),
    route: text(body.route, 180),
    property: MUXI_PROPERTIES[propertyCode] || '',
    source: text(body.source, 180),
    landingPath: text(body.landing_path, 180),
    contentGroup: text(body.content_group, 80),
    dates: text(body.dates, 180),
    duration: text(body.duration, 80),
    travellers: text(body.travellers, 80),
    budget: text(body.budget, 100),
    interests: text(body.interests, 500),
    preferredLanguage: text(body.preferred_language, 80),
    submittedAt: new Date().toISOString(),
  };
}

function validate(enquiry) {
  if (!enquiry.name || !enquiry.email || !enquiry.message) return 'required_fields';
  if (enquiry.route.toLowerCase() === 'muxidali' && !enquiry.property) return 'required_fields';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)) return 'invalid_email';
  return null;
}

function plainText(enquiry) {
  const rows = [
    ['Enquiry', enquiry.id],
    ['Language', enquiry.lang],
    ['Form', enquiry.variant],
    ['Name', enquiry.name],
    ['Email', enquiry.email],
    ['WhatsApp / WeChat', enquiry.contact || '—'],
    ['Route', enquiry.route || '—'],
    ['Property', enquiry.property || '—'],
    ['Travel dates', enquiry.dates || '—'],
    ['Duration', enquiry.duration || '—'],
    ['Travellers', enquiry.travellers || '—'],
    ['Budget', enquiry.budget || '—'],
    ['Interests', enquiry.interests || '—'],
    ['Preferred language', enquiry.preferredLanguage || '—'],
    ['Discovery source', enquiry.discovery || '—'],
    ['Page source', enquiry.source || '—'],
    ['Landing path', enquiry.landingPath || '—'],
    ['Content group', enquiry.contentGroup || '—'],
    ['Submitted', enquiry.submittedAt],
  ];
  return `${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nDream journey:\n${enquiry.message}`;
}

function htmlEmail(enquiry) {
  const rows = [
    ['Language', enquiry.lang], ['Form', enquiry.variant], ['Name', enquiry.name],
    ['Email', enquiry.email], ['WhatsApp / WeChat', enquiry.contact || '—'],
    ['Route', enquiry.route || '—'], ['Property', enquiry.property || '—'],
    ['Travel dates', enquiry.dates || '—'],
    ['Duration', enquiry.duration || '—'], ['Travellers', enquiry.travellers || '—'],
    ['Budget', enquiry.budget || '—'], ['Interests', enquiry.interests || '—'],
    ['Preferred language', enquiry.preferredLanguage || '—'],
    ['Discovery source', enquiry.discovery || '—'], ['Page source', enquiry.source || '—'],
    ['Landing path', enquiry.landingPath || '—'], ['Content group', enquiry.contentGroup || '—'],
    ['Submitted', enquiry.submittedAt],
  ];
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#24242f;line-height:1.6">
    <div style="max-width:680px;margin:auto;border:1px solid #e7e1d6;border-radius:12px;overflow:hidden">
      <div style="background:#171723;color:#fff;padding:24px 28px"><div style="color:#c8a96e;letter-spacing:2px;font-size:12px">WR JOURNEYS</div><h1 style="font-size:22px;margin:8px 0 0">New enquiry · ${escapeHtml(enquiry.id)}</h1></div>
      <div style="padding:24px 28px"><table style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:7px 12px 7px 0;color:#777;width:160px;border-bottom:1px solid #f0ede7">${escapeHtml(label)}</td><td style="padding:7px 0;border-bottom:1px solid #f0ede7">${escapeHtml(value)}</td></tr>`).join('')}</table>
      <h2 style="font-size:16px;margin:24px 0 8px;color:#8a7144">Dream journey</h2><div style="white-space:pre-wrap;background:#faf8f3;padding:16px;border-left:3px solid #c8a96e">${escapeHtml(enquiry.message)}</div></div>
    </div></body></html>`;
}

async function sendResend(enquiry) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ENQUIRY_EMAIL_TO || 'info@wildroadgroup.com';
  if (!apiKey) return { channel: 'email', configured: false };
  const cc = (process.env.ENQUIRY_EMAIL_CC || 'steven.shao@wildroadgroup.com').split(',').map(v => v.trim()).filter(Boolean);
  const subjectContext = enquiry.property
    ? enquiry.property.replace('Dream Island · ', 'MUXI · ').replace('Flexible · Please advise', 'MUXI · Flexible')
    : enquiry.route || 'New journey enquiry';
  const payload = {
    from: process.env.ENQUIRY_EMAIL_FROM || 'WR Journeys <enquiries@mkt.wildroadgroup.com>',
    to: to.split(',').map(v => v.trim()).filter(Boolean),
    reply_to: enquiry.email,
    subject: `[WR Journeys] ${subjectContext} · ${enquiry.name}`,
    html: htmlEmail(enquiry),
    text: plainText(enquiry),
  };
  if (cc.length) payload.cc = cc;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  return { channel: 'email', configured: true };
}

async function sendFeishu(enquiry) {
  const webhook = process.env.FEISHU_ENQUIRY_WEBHOOK_URL;
  if (!webhook) return { channel: 'feishu', configured: false };
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: `🧭 WR Journeys 新询价\n\n${plainText(enquiry)}` } }),
  });
  if (!response.ok) throw new Error(`Feishu returned ${response.status}`);
  const result = await response.json().catch(() => ({}));
  if (result.code && result.code !== 0) throw new Error(`Feishu returned code ${result.code}`);
  return { channel: 'feishu', configured: true };
}

function createEnquiryHandler() {
  return async function enquiryHandler(req, res) {
    const ip = clientIp(req);
    if (rateLimited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' });
    if (text(req.body.website, 200)) return res.status(200).json({ ok: true });

    const startedAt = Number(req.body.started_at || 0);
    const elapsed = Date.now() - startedAt;
    if (!startedAt || elapsed < 2500 || elapsed > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ ok: false, error: 'invalid_timing' });
    }
    if (String(req.body.privacy_consent) !== '1') {
      return res.status(400).json({ ok: false, error: 'privacy_consent' });
    }

    const enquiry = normalise(req.body);
    const validationError = validate(enquiry);
    if (validationError) return res.status(400).json({ ok: false, error: validationError });

    try {
      const turnstileOk = await verifyTurnstile(text(req.body.turnstile_token, 3000), ip);
      if (!turnstileOk) return res.status(400).json({ ok: false, error: 'verification_failed' });

      const results = await Promise.allSettled([sendResend(enquiry), sendFeishu(enquiry)]);
      const configured = results.filter(r => r.status === 'fulfilled' && r.value.configured);
      const delivered = configured.length;
      const logOnly = process.env.ENQUIRY_LOG_ONLY === '1' && process.env.NODE_ENV !== 'production';
      if (!delivered && !logOnly) {
        console.error(`Enquiry ${enquiry.id} could not be delivered`, results.map(r => r.status === 'rejected' ? r.reason.message : `${r.value.channel}:not-configured`));
        return res.status(503).json({ ok: false, error: 'delivery_unavailable' });
      }
      console.info(`Enquiry ${enquiry.id} accepted via ${configured.map(r => r.value.channel).join(',') || 'local-log'}`);
      return res.status(201).json({ ok: true, id: enquiry.id });
    } catch (error) {
      console.error(`Enquiry submission failed: ${error.message}`);
      return res.status(502).json({ ok: false, error: 'delivery_failed' });
    }
  };
}

module.exports = { createEnquiryHandler };
