import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  // CORS pour GitHub Pages
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  // Vercel peut parser body en string si pas de middleware
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }

  const email = String(body?.email || '').trim().toLowerCase();
  const code = String(body?.code || '').trim();
  const matricule = String(body?.matricule || '').trim();

  if (!email || !code) return res.status(400).json({ ok: false, error: 'missing_fields' });
  if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i.test(email)) {
    return res.status(400).json({ ok: false, error: 'invalid_email' });
  }

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASS;
  if (!user || !pass) {
    console.error('Missing GMAIL_USER / GMAIL_APP_PASSWORD (or GMAIL_APP_PASS) env');
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  try {
    await transporter.verify();
  } catch (e) {
    console.error('SMTP verify failed', e);
    return res.status(500).json({ ok: false, error: 'smtp_verify_failed', details: String(e.message || e) });
  }

  try {
    const info = await transporter.sendMail({
      from: `"Campagnes CNSS" <${user}>`,
      to: email,
      subject: `الرمز السري للدخول - ${code}`,
      text: `الرمز السري للدخول\n${code}\n\nصالح لمدة 10 دقائق`,
      html: `<div style="font-family:Tajawal,Arial,sans-serif; color:#212529; line-height:1.8; text-align:center; padding:16px 0">
        <p style="font-size:15px; color:#212529; margin:0 0 14px; font-weight:600">الرمز السري للدخول</p>
        <p style="font-size:32px; letter-spacing:0.38em; font-weight:800; color:#0f5132; margin:14px 0; direction:ltr; text-align:center">${code}</p>
        <p style="color:#6c757d; font-size:13px; margin:14px 0 0; text-align:center">صالح لمدة 10 دقائق</p>
      </div>`
    });
    console.log('Mail sent to', email, info.messageId);
    return res.status(200).json({ ok: true, messageId: info.messageId });
  } catch (e) {
    console.error('sendMail failed', e);
    return res.status(500).json({ ok: false, error: 'mail_failed', details: String(e.message || e) });
  }
}
