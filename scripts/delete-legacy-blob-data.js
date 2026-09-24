const { del, list } = require('@vercel/blob');

const LEGACY_PREFIX = 'lbc/data.json';

async function main() {
  if (process.env.CONFIRM_DELETE_LEGACY_DATA !== 'yes') {
    throw new Error('Définissez CONFIRM_DELETE_LEGACY_DATA=yes pour confirmer cette suppression.');
  }

  const { blobs } = await list({ prefix: LEGACY_PREFIX });
  if (blobs.length === 0) {
    console.log('Aucune donnée Blob historique à supprimer.');
    return;
  }

  await del(blobs.map(blob => blob.url));
  console.log(`${blobs.length} fichier(s) de données Blob historique(s) supprimé(s).`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
