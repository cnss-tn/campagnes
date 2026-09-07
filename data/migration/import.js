const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore'); // Importation explicite de Firestore
const serviceAccount = require('./cle-privee.json');

// Chargement de TOUS tes fichiers JSON de données
const bureaux = require('./Bureaux.json');
const programmes = require('./Programmes.json');
const resultats = require('./Resultats.json');
const users = require('./Users.json');

// Connexion sécurisée à ton projet Firebase
initializeApp({
  credential: cert(serviceAccount)
});

// Initialisation de la base de données Firestore
const db = getFirestore();

async function executerMigration() {
  console.log("🚀 Début de l'importation complète vers Firestore...");
  console.log("   → Mode: upsert par clé métier (évite les doublons auto-ID)");
  console.log("   → pw_changed ajouté en fin de document users (0=normal, 1=admin)");

  // Clé métier par collection -> champ unique + docId souhaité
  const keyByCollection = {
    users: { field: 'Matricule', idFrom: (item) => String(item.Matricule).trim() },
    bureaux: { field: 'Code_Bureau', idFrom: (item) => String(item.Code_Bureau).trim() },
    programmes: { field: 'ID_Programme', idFrom: (item) => String(item.ID_Programme).trim() },
    resultats: { field: 'ID_Resultat', idFrom: (item) => String(item.ID_Resultat).trim() },
  };

  const tâches = [
    { nom: 'bureaux', donnees: bureaux },
    { nom: 'programmes', donnees: programmes },
    { nom: 'resultats', donnees: resultats },
    { nom: 'users', donnees: users }
  ];

  for (const tâche of tâches) {
    console.log(`\n📦 Importation de la collection "${tâche.nom}"...`);
    const collectionRef = db.collection(tâche.nom);
    const keyConf = keyByCollection[tâche.nom];

    for (const item of tâche.donnees) {
      // Détermine le docId métier (corrige le bug auto-ID précédent)
      // Ancien code: const rawId = item.id || item.ID -> null pour users => doublons
      // Nouveau: utilise Matricule / Code_Bureau / ID_Programme / ID_Resultat
      let docId = null;
      if (keyConf && keyConf.field && item[keyConf.field] != null && String(item[keyConf.field]).trim() !== '') {
        docId = keyConf.idFrom(item);
      } else {
        const rawId = item.id || item.ID;
        docId = rawId ? String(rawId).trim() : null;
      }

      // Upsert intelligent: cherche par champ unique, sinon crée avec docId métier
      let targetRef = null;
      let isUpdate = false;
      if (keyConf && docId) {
        try {
          const snap = await collectionRef.where(keyConf.field, '==', isNaN(Number(docId)) ? docId : Number(docId)).limit(1).get();
          // Pour bureaux/programmes/resultats, le type numérique vs string peut varier; essaye aussi en string
          let found = !snap.empty ? snap.docs[0] : null;
          if (!found && keyConf.field === 'Code_Bureau') {
            const snap2 = await collectionRef.where(keyConf.field, '==', String(docId)).limit(1).get();
            if (!snap2.empty) found = snap2.docs[0];
          }
          if (found) {
            targetRef = collectionRef.doc(found.id);
            isUpdate = true;
            // Si le doc existant a un id auto-généré différent du docId métier, on va le mettre à jour
            // et supprimer l'ancien doublon après (si docId métier != found.id, on migrera)
            if (found.id !== docId) {
              // On écrit d'abord sur le doc métier, puis on supprimera l'ancien auto-ID
              const newRef = collectionRef.doc(docId);
              await newRef.set(item, { merge: true });
              // Supprime l'ancien doublon auto-ID si ce n'est pas le même
              try { await collectionRef.doc(found.id).delete(); console.log(`  🧹 Ancien doublon supprimé: ${tâche.nom}/${found.id} -> ${docId}`); } catch {}
              console.log(`  ✅ Migré ${tâche.nom}/${found.id} -> ${docId} ${tâche.nom === 'users' ? `(pw_changed=${item.pw_changed})` : ''}`);
              continue;
            }
          }
        } catch (e) {
          console.warn(`  ⚠️ Recherche par ${keyConf.field} échouée pour ${docId}:`, e.message);
        }
      }

      if (!targetRef) {
        targetRef = docId ? collectionRef.doc(docId) : collectionRef.doc();
      }

      // Écriture (upsert avec merge pour ne pas écraser d'autres champs éventuels)
      // Pour users, s'assure que pw_changed est bien en fin (Firestore n'a pas d'ordre, mais JSON source l'a)
      await targetRef.set(item, { merge: true });
      const action = isUpdate ? 'mis à jour' : 'créé';
      const extra = tâche.nom === 'users' ? ` pw_changed=${item.pw_changed} (${item.user_type})` : '';
      console.log(`  ✅ Document ${action} dans ${tâche.nom} : ${targetRef.id}${extra}`);
    }
  }

  console.log("\n🎉 Fantastique ! Toutes tes bases (Bureaux, Programmes, Résultats, Users) sont maintenant dans le Cloud.");
  console.log("   Vérifie dans Console Firebase > Firestore > users : champ pw_changed présent en fin de document.");
}

executerMigration().catch(error => {
  console.error("❌ Erreur critique pendant la migration :", error);
});