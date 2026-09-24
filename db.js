const { Pool } = require('pg');

let pool;
let initialized = false;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL ou POSTGRES_URL doit être défini avec l’URL de connexion Neon.');
  return url;
}

function getInitialAdminPass() {
  const password = process.env.ADMIN_PASS;
  if (!password) throw new Error('ADMIN_PASS doit être défini.');
  return password;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function initialize() {
  if (initialized) return;

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        password TEXT NOT NULL,
        annonces JSONB NOT NULL DEFAULT '[]'::jsonb
      )
    `);
    await client.query(
      `INSERT INTO app_state (id, password)
       VALUES (TRUE, $1)
       ON CONFLICT (id) DO NOTHING`,
      [getInitialAdminPass()],
    );
    initialized = true;
  } finally {
    client.release();
  }
}

async function readDB() {
  await initialize();
  const { rows } = await getPool().query(
    'SELECT password, annonces FROM app_state WHERE id = TRUE',
  );
  const state = rows[0];
  if (!state) throw new Error('État applicatif Neon introuvable.');
  return { password: state.password, annonces: state.annonces || [] };
}

async function writeDB(data) {
  await initialize();
  await getPool().query(
    `UPDATE app_state
     SET password = $1, annonces = $2::jsonb
     WHERE id = TRUE`,
    [data.password || getInitialAdminPass(), JSON.stringify(data.annonces || [])],
  );
}

async function updateDB(fn) {
  const db = await readDB();
  fn(db);
  await writeDB(db);
  return db;
}

async function readAll() {
  return (await readDB()).annonces;
}

async function writeAll(annonces) {
  await updateDB(db => { db.annonces = annonces; });
}

async function getAdminPass() {
  return (await readDB()).password;
}

async function setAdminPass(newPass) {
  await updateDB(db => { db.password = newPass; });
}

module.exports = { readAll, writeAll, getAdminPass, setAdminPass, readDB, writeDB };
