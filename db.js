const { put, list } = require('@vercel/blob');

const DB_KEY = 'lbc/data.json';

async function readDB() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) return { annonces: [], password: 'admin5252' };
    // Utilise downloadUrl pour bypasser le cache CDN
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const blob = blobs[0];
    const url = blob.downloadUrl || blob.url;
    const res = await fetch(url, { cache: 'no-store' });
    return await res.json();
  } catch {
    return { annonces: [], password: 'admin5252' };
  }
}

async function writeDB(data) {
  await put(DB_KEY, JSON.stringify(data), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

async function readAll() {
  return (await readDB()).annonces || [];
}

async function writeAll(annonces) {
  const db = await readDB();
  db.annonces = annonces;
  await writeDB(db);
}

async function getAdminPass() {
  return (await readDB()).password || 'admin5252';
}

async function setAdminPass(newPass) {
  const db = await readDB();
  db.password = newPass;
  await writeDB(db);
}

module.exports = { readAll, writeAll, getAdminPass, setAdminPass };
