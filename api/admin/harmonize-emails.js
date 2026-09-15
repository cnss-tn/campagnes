import admin from 'firebase-admin';
import { timingSafeEqual } from 'node:crypto';

// POST /api/admin/harmonize-emails — ajoute `email:''` aux docs `users` qui
// n'ont pas d'email. N'écrase JAMAIS un email existant.
// Auth: header `Authorization: Bearer <ADMIN_API_TOKEN>` (jamais commité,
// passé à chaque appel depuis la machine de l'admin).
// Secrets lus depuis les variables d'environnement Vercel :
//   FIREBASE_SERVICE_ACCOUNT_JSON = contenu complet du JSON du compte de service
//   ADMIN_API_TOKEN               = jeton secret généré (ex: openssl rand -hex 32)
// Body JSON optionnel: { "dryRun": true, "matricule": "55319" }

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('missing FIREBASE_SERVICE_ACCOUNT_JSON env');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

function isAuthorized(req) {
  const expected = process.env.ADMIN_API_TOKEN;
  if (!expected) return false;
  const m = /^Bearer (.+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body && typeof body === 'object' ? body : {};
  const dryRun = body.dryRun === true || req.query?.dryRun === '1';
  const only = String(body.matricule ?? req.query?.matricule ?? '').trim();

  let db;
  try {
    db = getDb();
  } catch (e) {
    console.error('admin endpoint misconfigured:', e.message);
    return res.status(500).json({ ok: false, error: 'server_not_configured' });
  }

  try {
    let docs;
    if (only) {
      const one = await db.collection('users').doc(only).get();
      docs = one.exists ? [one] : [];
    } else {
      const snap = await db.collection('users').get();
      docs = snap.docs;
    }

    let updated = 0;
    let kept = 0;
    const updatedIds = [];
    let batch = db.batch();
    let pending = 0;
    for (const d of docs) {
      const data = d.data() || {};
      const hasEmail = (data.email !== undefined && data.email !== null) ||
                       (data.Email !== undefined && data.Email !== null);
      if (hasEmail) {
        kept++;
      } else {
        if (!dryRun) {
          batch.update(d.ref, { email: '' });
          pending++;
          if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
        }
        updated++;
        if (updatedIds.length < 200) updatedIds.push(d.id);
      }
    }
    if (pending > 0 && !dryRun) await batch.commit();

    return res.status(200).json({ ok: true, dryRun, total: docs.length, updated, kept, updatedIds });
  } catch (e) {
    console.error('harmonize failed:', e);
    return res.status(500).json({ ok: false, error: 'harmonize_failed' });
  }
}
