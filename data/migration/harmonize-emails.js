// harmonize-emails.js — ajoute le champ `email` (vide) à tous les docs `users`
// qui n'en ont pas, pour harmoniser la base. N'écrase JAMAIS un email existant.
// Usage: node data/migration/harmonize-emails.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('./cle-privee.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('users').get();
  console.log(`Docs users trouvés: ${snap.size}`);
  let updated = 0;
  let already = 0;
  let batch = db.batch();
  let pending = 0;
  const commitBatch = async () => {
    if (pending > 0) { await batch.commit(); batch = db.batch(); pending = 0; }
  };
  for (const d of snap.docs) {
    const data = d.data();
    const hasEmail = (data.email !== undefined && data.email !== null) ||
                     (data.Email !== undefined && data.Email !== null);
    if (hasEmail) {
      already++;
      console.log(`  = ${d.id} garde email="${data.email || data.Email}"`);
    } else {
      batch.update(d.ref, { email: '' });
      pending++;
      updated++;
      console.log(`  + ${d.id} (Matricule ${data.Matricule}) -> email:'' ajouté`);
      if (pending >= 400) await commitBatch();
    }
  }
  await commitBatch();
  console.log(`\nTerminé: ${updated} doc(s) harmonisé(s), ${already} déjà avec email, total ${snap.size}.`);
}

main().catch((e) => { console.error('ERREUR:', e); process.exit(1); });
