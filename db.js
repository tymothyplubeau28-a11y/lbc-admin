const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS annonces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
