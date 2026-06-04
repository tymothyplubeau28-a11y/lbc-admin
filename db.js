const { put, list } = require('@vercel/blob');

const DB_KEY = 'lbc/data.json';

async function readDB() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) {
      const defaultDB = { annonces: [], password: process.env.ADMIN_PASS || 'admin5252' };
      await writeDB(defaultDB);
      return defaultDB;
    }
    blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    const url = blobs[0].url;
    const res = await fetch(url + '?nocache=' + Date.now());
    const db = await res.json();
    if (!db.password && process.env.ADMIN_PASS) {
      db.password = process.env.ADMIN_PASS;
      await writeDB(db);
    }
    return db;
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

// Lit toute la DB, applique la fonction de modification, écrit en une fois
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
