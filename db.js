require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS annonces (
      id SERIAL PRIMARY KEY,
      titre TEXT NOT NULL,
      marque TEXT,
      modele TEXT,
      prix TEXT,
      description TEXT,
      annee TEXT,
      kilometrage TEXT,
      code_postal TEXT,
      region TEXT,
      ville TEXT,
      vendeur TEXT,
      membre_depuis TEXT,
      categorie TEXT DEFAULT 'Voitures',
      titulaire_rib TEXT,
      iban TEXT,
      bic TEXT,
      assistant_name TEXT,
      photo TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ Base de données connectée (Neon PostgreSQL)');
}

init().catch(err => {
  console.error('❌ Erreur DB:', err.message);
});

module.exports = pool;
