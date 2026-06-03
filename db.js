const { put, list, del } = require('@vercel/blob');

const DB_KEY = 'lbc/data.json';

async function readDB() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) return { annonces: [], password: 'admin5252' };
    // Trie par date décroissante pour avoir le plus récent
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      cache: 'no-store',
    });
    return await res.json();
  } catch {
    return { annonces: [], password: 'admin5252' };
  }
}

async function writeDB(data) {
  // Supprime d'abord l'ancien pour éviter le cache CDN
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (blobs.length) await del(blobs.map(b => b.url));
  } catch { /* ignore */ }

  await put(DB_KEY, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
  });
}

async function readAll() {
  const db = await readDB();
  return db.annonces || [];
}

async function writeAll(annonces) {
  const db = await readDB();
  db.annonces = annonces;
  await writeDB(db);
}

async function getAdminPass() {
  const db = await readDB();
  return db.password || 'admin5252';
}

async function setAdminPass(newPass) {
  const db = await readDB();
  db.password = newPass;
  await writeDB(db);
}

module.exports = { readAll, writeAll, getAdminPass, setAdminPass };
