const { put, get, list } = require('@vercel/blob');

const DB_KEY = 'lbc/annonces.json';

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
    access: 'public',
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

module.exports = { readAll, writeAll };
