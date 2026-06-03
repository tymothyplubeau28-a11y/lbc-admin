const { put, list } = require('@vercel/blob');

const DB_KEY = 'lbc/data.json';

async function readDB() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) return { annonces: [], password: 'admin5252' };
    const res = await fetch(blobs[0].url + '?t=' + Date.now()); // cache-bust
    return await res.json();
  } catch {
    return { annonces: [], password: 'admin5252' };
  }
}

async function writeDB(data) {
  await put(DB_KEY, JSON.stringify(data), {
    access: 'public', allowOverwrite: true, contentType: 'application/json',
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
