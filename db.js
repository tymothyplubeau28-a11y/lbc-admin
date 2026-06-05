const { put, list } = require('@vercel/blob');

const DB_KEY = 'lbc/data.json';

async function readDB() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) return { annonces: [], password: process.env.ADMIN_PASS || 'admin5252' };
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const url = blobs[0].url;
    const res = await fetch(url + '?nocache=' + Date.now());
    return await res.json();
  } catch {
    return { annonces: [], password: process.env.ADMIN_PASS || 'admin5252' };
  }
}

async function writeDB(data) {
  await put(DB_KEY, JSON.stringify(data), {
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

async function updateDB(fn) {
  const db = await readDB();
  fn(db);
  await writeDB(db);
  return db;
}

async function readAll() {
  return (await readDB()).annonces || [];
}

async function writeAll(annonces) {
  await updateDB(db => { db.annonces = annonces; });
}

async function getAdminPass() {
  return (await readDB()).password || process.env.ADMIN_PASS || 'admin5252';
}

async function setAdminPass(newPass) {
  await updateDB(db => { db.password = newPass; });
}

module.exports = { readAll, writeAll, getAdminPass, setAdminPass, readDB, writeDB };
