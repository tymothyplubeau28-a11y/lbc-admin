const { put, list } = require('@vercel/blob');

const DB_KEY    = 'lbc/annonces.json';
const PASS_KEY  = 'lbc/config.json';

async function readAll() {
  try {
    const { blobs } = await list({ prefix: DB_KEY });
    if (!blobs.length) return [];
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch {
    return [];
  }
}

async function writeAll(annonces) {
  await put(DB_KEY, JSON.stringify(annonces), {
    access: 'public', allowOverwrite: true, contentType: 'application/json',
  });
}

async function getAdminPass() {
  try {
    const { blobs } = await list({ prefix: PASS_KEY });
    if (!blobs.length) return 'admin5252';
    const res = await fetch(blobs[0].url);
    const cfg = await res.json();
    return cfg.password || 'admin5252';
  } catch {
    return 'admin5252';
  }
}

async function setAdminPass(newPass) {
  await put(PASS_KEY, JSON.stringify({ password: newPass }), {
    access: 'public', allowOverwrite: true, contentType: 'application/json',
  });
}

module.exports = { readAll, writeAll, getAdminPass, setAdminPass };
