require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin5252';

// Dossier uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'lbc-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/uploads', express.static(uploadsDir));

function requireAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/');
}

// ===== LOGIN =====
app.get('/', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.loggedIn = true;
    return res.redirect('/dashboard');
  }
  res.send(buildPage('Admin - Connexion', `
    <body class="login-body">
    <div class="login-logo">
      <img src="/images/logo.png" alt="leboncoin" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span class="login-logo-text" style="display:none">leboncoin</span>
    </div>
    <div class="login-container">
      <h2>Espace Admin</h2>
      <div class="error-message">Identifiant ou mot de passe incorrect.</div>
      <form method="POST" action="/">
        <input type="text" name="username" placeholder="Identifiant" required autocomplete="off">
        <input type="password" name="password" placeholder="Mot de passe" required>
        <button type="submit" class="btn-red">Se connecter</button>
      </form>
    </div>`, true));
});

// ===== DASHBOARD =====
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ===== LOGOUT =====
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ===== ANNONCES - liste =====
app.get('/annonces', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM annonces ORDER BY created_at DESC');
    const cards = rows.length === 0
      ? `<div class="empty-state">Aucune annonce pour le moment.</div>`
      : rows.map(a => `
        <div class="annonce-card">
          <div class="card-image">
            ${a.photo
              ? `<img src="/uploads/${a.photo}" alt="${esc(a.titre)}">`
              : `<div class="no-image">Pas de photo</div>`}
          </div>
          <div class="card-content">
            <div class="annonce-header">
              <span class="title">${esc(a.titre)}</span>
              <span class="subtitle">${esc(a.marque || '')} ${esc(a.modele || '')}</span>
            </div>
            <div class="details">${esc(a.categorie || '')}, ${a.kilometrage ? esc(a.kilometrage) + ' km' : ''}, ${esc(a.annee || '')}</div>
            ${a.prix ? `<div class="price">${esc(a.prix)} €</div>` : ''}
            <div class="actions">
              <a href="/annonce-form?id=${a.id}" class="btn-text-red">Modifier</a>
              <a href="/delete/${a.id}" class="btn-text-red" onclick="return confirm('Supprimer cette annonce ?')">Supprimer</a>
            </div>
          </div>
        </div>`).join('');

    res.send(buildPage('Annonces', `
      <div class="app">
        <div class="top-bar">
          <a href="/dashboard" class="back">← Retour</a>
          <a href="/annonce-form" class="add">+ Annonce</a>
        </div>
        <div class="annonces-list">${cards}</div>
      </div>`));
  } catch (err) {
    res.send(`Erreur: ${err.message}`);
  }
});

// ===== FORMULAIRE ANNONCE =====
app.get('/annonce-form', requireAuth, async (req, res) => {
  const id = req.query.id;
  let a = null;
  if (id) {
    const { rows } = await pool.query('SELECT * FROM annonces WHERE id = $1', [id]);
    a = rows[0] || null;
  }
  const v = f => a ? esc(a[f] || '') : '';
  const title = a ? "Modifier l'annonce" : 'Ajouter une annonce';
  const btnLabel = a ? 'Enregistrer les modifications' : "Ajouter l'annonce";

  res.send(buildPage(title, `
    <div class="app">
      <div class="top-bar">
        <a href="/dashboard" class="back">← Retour</a>
        <a href="/annonces" class="add">Annonces</a>
      </div>
      <form class="annonce-form" method="POST" action="/annonce-form${a ? '?id=' + a.id : ''}" enctype="multipart/form-data">

        <h3>📋 Annonce</h3>
        <div class="form-group"><label>Titre</label>
          <input type="text" name="titre" value="${v('titre')}" placeholder="Ex: Renault Clio 2020 – 45 000 km" required></div>
        <div class="form-group"><label>Marque</label>
          <input type="text" name="marque" value="${v('marque')}" placeholder="Ex: Renault"></div>
        <div class="form-group"><label>Modèle</label>
          <input type="text" name="modele" value="${v('modele')}" placeholder="Ex: Clio"></div>
        <div class="form-group"><label>Prix (€)</label>
          <input type="text" name="prix" value="${v('prix')}" placeholder="Ex: 12 500" required></div>
        <div class="form-group"><label>Description</label>
          <textarea name="description" placeholder="Décrivez le véhicule...">${v('description')}</textarea></div>
        <div class="form-group"><label>Année</label>
          <input type="text" name="annee" value="${v('annee')}" placeholder="Ex: 2020"></div>
        <div class="form-group"><label>Kilométrage</label>
          <input type="text" name="kilometrage" value="${v('kilometrage')}" placeholder="Ex: 45 000"></div>

        <h3>📍 Localisation & Vendeur</h3>
        <div class="form-group"><label>Code postal</label>
          <input type="text" name="code_postal" value="${v('code_postal')}" placeholder="Ex: 75001"></div>
        <div class="form-group"><label>Région</label>
          <input type="text" name="region" value="${v('region')}" placeholder="Ex: Île-de-France"></div>
        <div class="form-group"><label>Vendeur</label>
          <input type="text" name="vendeur" value="${v('vendeur')}" placeholder="Nom du vendeur"></div>
        <div class="form-group"><label>📅 Membre depuis</label>
          <input type="text" name="membre_depuis" value="${v('membre_depuis')}" placeholder="Ex: 2021">
          <small>Ancienneté du compte vendeur</small></div>
        <div class="form-group"><label>Ville</label>
          <input type="text" name="ville" value="${v('ville')}" placeholder="Ex: Paris"></div>
        <div class="form-group"><label>Catégorie</label>
          <input type="text" name="categorie" value="${v('categorie') || 'Voitures'}"></div>

        <h3>🏦 RIB associé</h3>
        <div class="form-group"><label>Titulaire du compte</label>
          <input type="text" name="titulaire_rib" value="${v('titulaire_rib')}" placeholder="Nom Prénom"></div>
        <div class="form-group"><label>IBAN</label>
          <input type="text" name="iban" value="${v('iban')}" placeholder="FR76 0000 ..."></div>
        <div class="form-group"><label>BIC</label>
          <input type="text" name="bic" value="${v('bic')}" placeholder="Ex: BNPAFRPP"></div>
        <div class="form-group"><label>👤 Nom de l'assistant(e) Leboncoin</label>
          <input type="text" name="assistant_name" value="${v('assistant_name')}" placeholder="Ex: Jean DUPONT">
          <small>⚠️ Ce nom apparaîtra comme bénéficiaire sur le virement</small></div>

        <h3>📷 Photo principale</h3>
        ${a && a.photo ? `<div class="photos-preview"><div class="photo-item"><img src="/uploads/${a.photo}" alt="Photo actuelle"></div></div>` : ''}
        <div class="file-input-wrapper">
          <label for="photo" class="file-input-label">+ Choisir une photo</label>
          <input type="file" name="photo" id="photo" accept="image/*">
        </div>
        <div id="preview" class="photos-preview"></div>

        <button type="submit" class="btn-blue">${btnLabel}</button>
      </form>
    </div>
    <script>
      document.getElementById('photo').addEventListener('change', function() {
        const preview = document.getElementById('preview');
        preview.innerHTML = '';
        if (this.files[0]) {
          const reader = new FileReader();
          reader.onload = e => {
            preview.innerHTML = '<div class="photo-item"><img src="' + e.target.result + '" alt="Aperçu"></div>';
          };
          reader.readAsDataURL(this.files[0]);
        }
      });
    </script>`));
});

app.post('/annonce-form', requireAuth, upload.single('photo'), async (req, res) => {
  const id = req.query.id;
  const fields = ['titre','marque','modele','prix','description','annee','kilometrage',
                  'code_postal','region','ville','vendeur','membre_depuis','categorie',
                  'titulaire_rib','iban','bic','assistant_name'];
  const data = {};
  fields.forEach(f => data[f] = req.body[f] || '');
  if (req.file) data.photo = req.file.filename;

  try {
    if (id) {
      const cols = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
      await pool.query(
        `UPDATE annonces SET ${cols} WHERE id = $${Object.keys(data).length + 1}`,
        [...Object.values(data), id]
      );
    } else {
      const cols = Object.keys(data).join(', ');
      const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
      await pool.query(
        `INSERT INTO annonces (${cols}) VALUES (${placeholders})`,
        Object.values(data)
      );
    }
    res.redirect('/annonces');
  } catch (err) {
    res.send(`Erreur: ${err.message}`);
  }
});

// ===== SUPPRESSION =====
app.get('/delete/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query('SELECT photo FROM annonces WHERE id = $1', [req.params.id]);
  if (rows[0]?.photo) {
    const filePath = path.join(uploadsDir, rows[0].photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  await pool.query('DELETE FROM annonces WHERE id = $1', [req.params.id]);
  res.redirect('/annonces');
});

// ===== PARAMÈTRES =====
app.get('/parametres', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'parametres.html'));
});

// ===== HELPERS =====
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPage(title, content, noNavbar = false) {
  const navbar = noNavbar ? '' : `
  <div class="navbar">
    <img src="/images/logo.png" alt="leboncoin" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
    <span class="navbar-logo-text" style="display:none">leboncoin</span>
  </div>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, viewport-fit=cover">
  <title>${title}</title>
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  ${navbar}
  ${content}
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`✅ Serveur démarré : http://localhost:${PORT}`);
});
