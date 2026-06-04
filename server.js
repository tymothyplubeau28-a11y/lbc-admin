const express = require('express');
const session = require('cookie-session');
const multer = require('multer');
const path = require('path');
const { put, del } = require('@vercel/blob');
const { readAll, writeAll, getAdminPass, setAdminPass, readDB, writeDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';

// Photos en mémoire puis upload vers Vercel Blob
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  name: 'lbc_session',
  secret: process.env.SESSION_SECRET || 'lbc-secret-2024',
  maxAge: 8 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
  httpOnly: true,
}));

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/images', express.static(path.join(__dirname, 'images')));

function requireAuth(req, res, next) {
  if (req.session.loggedIn) return next();
  res.redirect('/');
}

// ===== LOGIN =====
app.get('/', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/', async (req, res) => {
  const { username, password } = req.body;
  const ADMIN_PASS = await getAdminPass();
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
  req.session = null;
  res.redirect('/');
});

// ===== ANNONCES - liste =====
app.get('/annonces', requireAuth, async (req, res) => {
  try {
    const rows = await readAll();
    const cards = rows.length === 0
      ? `<div class="empty-state">Aucune annonce pour le moment.</div>`
      : rows.map(a => `
        <div class="annonce-card">
          <div class="card-image">
            ${a.photo
              ? `<img src="${a.photo}" alt="${esc(a.titre)}">`
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
              <a href="/annonce/${a.id}" class="btn-text-red">Voir</a>
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
  const id = req.query.id ? parseInt(req.query.id) : null;
  let a = null;
  if (id) {
    const all = await readAll();
    a = all.find(x => x.id === id) || null;
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

        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:8px"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg> Annonce</h3>
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

        <h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Localisation & Vendeur</h3>
        <div class="form-group"><label>Code postal</label>
          <input type="text" name="code_postal" value="${v('code_postal')}" placeholder="Ex: 75001"></div>
        <div class="form-group"><label>Région</label>
          <input type="text" name="region" value="${v('region')}" placeholder="Ex: Île-de-France"></div>
        <div class="form-group"><label>Vendeur</label>
          <input type="text" name="vendeur" value="${v('vendeur')}" placeholder="Nom du vendeur"></div>
        <div class="form-group"><label><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:5px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Membre depuis</label>
          <input type="text" name="membre_depuis" value="${v('membre_depuis')}" placeholder="Ex: 2021">
          <small>Ancienneté du compte vendeur</small></div>
        <div class="form-group"><label>Ville</label>
          <input type="text" name="ville" value="${v('ville')}" placeholder="Ex: Paris"></div>
        <div class="form-group"><label>Catégorie</label>
          <input type="text" name="categorie" value="${v('categorie') || 'Voitures'}"></div>

        <h3><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:8px"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 10l9-6 9 6"/><line x1="9" y1="14" x2="9" y2="16"/><line x1="12" y1="14" x2="12" y2="16"/><line x1="15" y1="14" x2="15" y2="16"/></svg> RIB associé</h3>
        <div class="form-group"><label>Titulaire du compte</label>
          <input type="text" name="titulaire_rib" value="${v('titulaire_rib')}" placeholder="Nom Prénom"></div>
        <div class="form-group"><label>IBAN</label>
          <input type="text" name="iban" value="${v('iban')}" placeholder="FR76 0000 ..."></div>
        <div class="form-group"><label>BIC</label>
          <input type="text" name="bic" value="${v('bic')}" placeholder="Ex: BNPAFRPP"></div>
        <div class="form-group"><label><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:5px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Nom de l'assistant(e) Leboncoin</label>
          <input type="text" name="assistant_name" value="${v('assistant_name')}" placeholder="Ex: Jean DUPONT">
          <small><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:5px"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Ce nom apparaîtra comme bénéficiaire sur le virement</small></div>

        <h3><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Photo principale</h3>
        ${a && a.photo ? `<div class="photos-preview"><div class="photo-item"><img src="${a.photo}" alt="Photo actuelle"></div></div>` : ''}
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
  const id = req.query.id ? parseInt(req.query.id) : null;
  const fields = ['titre','marque','modele','prix','description','annee','kilometrage',
                  'code_postal','region','ville','vendeur','membre_depuis','categorie',
                  'titulaire_rib','iban','bic','assistant_name'];
  const data = {};
  fields.forEach(f => data[f] = req.body[f] || '');

  try {
    // Upload photo vers Vercel Blob si fournie
    if (req.file) {
      const ext = req.file.originalname.split('.').pop();
      const { url } = await put(`lbc/photos/${Date.now()}.${ext}`, req.file.buffer, {
        access: 'public',
        contentType: req.file.mimetype,
      });
      data.photo = url;
    }

    // Lire la DB une seule fois, modifier, écrire une seule fois
    const db = await readDB();
    const all = db.annonces || [];
    if (id) {
      const idx = all.findIndex(x => x.id === id);
      if (idx !== -1) {
        if (!data.photo) data.photo = all[idx].photo;
        all[idx] = { ...all[idx], ...data };
      }
    } else {
      const newId = all.length ? Math.max(...all.map(x => x.id)) + 1 : 1;
      const ref = 'REF' + Math.random().toString(36).substring(2,6).toUpperCase() + Date.now().toString(36).toUpperCase().slice(-6);
      all.unshift({ id: newId, ref, ...data, created_at: new Date().toISOString() });
    }
    db.annonces = all;
    await writeDB(db);
    res.redirect('/annonces');
  } catch (err) {
    res.send(`Erreur: ${err.message}`);
  }
});

// ===== SUPPRESSION =====
app.get('/delete/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id);
  const all = await readAll();
  const a = all.find(x => x.id === id);
  if (a?.photo) {
    try { await del(a.photo); } catch (e) { /* ignore */ }
  }
  await writeAll(all.filter(x => x.id !== id));
  res.redirect('/annonces');
});

// ===== PARAMÈTRES =====
app.get('/parametres', requireAuth, (req, res) => {
  res.send(buildPage('Paramètres', `
    <div class="dashboard">
      <div class="settings-container">
        <h2><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:8px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Paramètres du compte</h2>
        <div class="info-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg> Connecté en tant que : <strong>admin</strong></div>
        <form method="POST" action="/parametres">
          <div class="form-group"><label>Mot de passe actuel</label><input type="password" name="current_password" required></div>
          <div class="form-group"><label>Nouveau mot de passe</label><input type="password" name="new_password" required><small style="color:#666;display:block;margin-top:5px">Minimum 6 caractères</small></div>
          <div class="form-group"><label>Confirmer le mot de passe</label><input type="password" name="confirm_password" required></div>
          <button type="submit" class="btn-update">Mettre à jour</button>
        </form>
        <a href="/dashboard" class="back-link">← Retour au tableau de bord</a>
      </div>
    </div>`));
});

app.post('/parametres', requireAuth, async (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const ADMIN_PASS = await getAdminPass();
  let msg = '';
  if (current_password !== ADMIN_PASS) msg = '<div class="error-message">Mot de passe actuel incorrect.</div>';
  else if (new_password.length < 6)   msg = '<div class="error-message">Le nouveau mot de passe doit faire au moins 6 caractères.</div>';
  else if (new_password !== confirm_password) msg = '<div class="error-message">Les mots de passe ne correspondent pas.</div>';
  else {
    await setAdminPass(new_password);
    msg = '<div style="color:#2e7d32;padding:12px;background:#e8f5e9;border-radius:8px;margin-bottom:16px">✅ Mot de passe mis à jour avec succès.</div>';
  }

  res.send(buildPage('Paramètres', `
    <div class="dashboard">
      <div class="settings-container">
        <h2><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:8px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Paramètres du compte</h2>
        <div class="info-box"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg> Connecté en tant que : <strong>admin</strong></div>
        ${msg}
        <form method="POST" action="/parametres">
          <div class="form-group"><label>Mot de passe actuel</label><input type="password" name="current_password" required></div>
          <div class="form-group"><label>Nouveau mot de passe</label><input type="password" name="new_password" required><small style="color:#666;display:block;margin-top:5px">Minimum 6 caractères</small></div>
          <div class="form-group"><label>Confirmer le mot de passe</label><input type="password" name="confirm_password" required></div>
          <button type="submit" class="btn-update">Mettre à jour</button>
        </form>
        <a href="/dashboard" class="back-link">← Retour au tableau de bord</a>
      </div>
    </div>`));
});

// ===== PAGE PUBLIQUE ANNONCE =====
app.get('/annonce/:id', async (req, res) => {
  const _all = await readAll(); const rows = [_all.find(x => x.id === parseInt(req.params.id))].filter(Boolean);
  const a = rows[0];
  if (!a) return res.status(404).send('Annonce introuvable');

  const photoHtml = a.photo
    ? `<div class="main-photo-container">
        <div class="main-photo" onclick="openLightbox(0)">
          <img src="${a.photo}" alt="${esc(a.titre)}">
        </div>
        <div class="photo-actions">
          <button class="btn-icon" onclick="toggleLike(this)" title="J'aime">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="#1a1a1a" stroke-width="2" fill="none">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </button>
          <button class="btn-icon" onclick="shareAnnonce()" title="Partager">
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="#1a1a1a" stroke-width="2" fill="none">
              <circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.5" y1="13" x2="15.5" y2="6"/><line x1="8.5" y1="11" x2="15.5" y2="18"/>
            </svg>
          </button>
        </div>
        <button class="btn-voir-photos" onclick="openLightbox(0)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:6px"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Voir la photo</button>
      </div>`
    : `<div class="main-photo-container" style="background:#f0f0f0;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:18px;">Pas de photo</div>`;

  const datePosted = new Date(a.created_at).toLocaleDateString('fr-FR', {day:'numeric',month:'long',year:'numeric'});

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
  <title>${esc(a.titre)} - leboncoin</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    body { background: white; }
    .site-header { background: white; padding: 16px 0 12px; border-bottom: 1px solid #f0f0f0; text-align: center; }
    .site-header img { max-width: 180px; height: auto; }
    .site-header .logo-text { font-size: 28px; font-weight: 900; color: #FF8C00; letter-spacing: -1px; }
    .breadcrumb { font-size: 13px; color: #999; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid #f5f5f5; }
    .breadcrumb a { color: #4183D7; text-decoration: none; }
    .photos-section { margin-bottom: 22px; position: relative; }
    .main-photo-container { position: relative; width: 100%; height: 300px; background: #f8f8f8; border-radius: 16px; overflow: hidden; margin-bottom: 10px; }
    .main-photo { width: 100%; height: 100%; cursor: pointer; }
    .main-photo img { width: 100%; height: 100%; object-fit: cover; }
    .photo-actions { position: absolute; top: 14px; right: 14px; display: flex; gap: 10px; z-index: 20; }
    .btn-icon { background: #f5f5f5; border: none; border-radius: 40px; width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
    .btn-icon.liked svg { fill: #ff6b6b; stroke: #ff6b6b; }
    .btn-voir-photos { position: absolute; bottom: 14px; right: 14px; background: white; color: #333; border: 1px solid #ddd; padding: 9px 18px; border-radius: 30px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 20; }
    .title-block h1 { font-size: 21px; font-weight: 700; margin-bottom: 6px; }
    .location { font-size: 15px; color: #666; margin-bottom: 8px; }
    .price-big { font-size: 28px; font-weight: 800; color: #000; margin-bottom: 4px; }
    .fee { font-size: 14px; color: #666; margin-bottom: 22px; }
    .btn-reservation { display: block; background: #f56b2a; color: white; border: none; padding: 15px 32px; border-radius: 12px; font-size: 17px; font-weight: 700; text-decoration: none; text-align: center; cursor: pointer; margin-bottom: 24px; }
    .btn-reservation:hover { background: #d95a1e; }
    .section-title { font-size: 18px; font-weight: 700; margin: 24px 0 12px; }
    .specs-grid { background: #fafafa; border-radius: 14px; padding: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
    .spec-label { font-size: 12px; color: #999; text-transform: uppercase; margin-bottom: 3px; }
    .spec-value { font-size: 15px; font-weight: 600; }
    .description { line-height: 1.7; color: #333; white-space: pre-line; }
    .seller-card { background: #fafafa; border-radius: 14px; padding: 18px; margin-top: 22px; }
    .lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 1000; justify-content: center; align-items: center; }
    .lightbox.active { display: flex; }
    .lightbox-image { max-width: 90%; max-height: 80%; object-fit: contain; }
    .lightbox-close { position: absolute; top: 18px; right: 18px; color: white; font-size: 38px; cursor: pointer; background: rgba(255,255,255,0.15); border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; }
    .footer { margin-top: 50px; padding-top: 36px; border-top: 1px solid #f0f0f0; }
    .footer-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 24px; margin-bottom: 24px; }
    .footer-column h4 { font-size: 15px; font-weight: 700; margin-bottom: 12px; }
    .footer-column ul { list-style: none; }
    .footer-column ul li { margin-bottom: 8px; }
    .footer-column ul li a { color: #666; text-decoration: none; font-size: 13px; }
    .footer-column ul li a:hover { color: #f56b2a; }
    .footer-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 18px; border-top: 1px solid #f0f0f0; color: #999; font-size: 13px; }
    .view-all { margin-top: 32px; }
    .view-all a { color: #f56b2a; text-decoration: none; font-weight: 500; font-size: 15px; }
    @media (min-width: 1024px) {
      .annonce-container { display: grid; grid-template-columns: 1fr 360px; gap: 40px; align-items: start; }
      .right-column { display: block !important; }
      .mobile-only { display: none !important; }
      .sticky-box { background: white; border-radius: 18px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #f0f0f0; position: sticky; top: 24px; }
      .main-photo-container { height: 420px; }
    }
    .right-column { display: none; }
  </style>
</head>
<body>
  <header class="site-header">
    <img src="/images/logo.png" alt="leboncoin" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
    <span class="logo-text" style="display:none">leboncoin</span>
  </header>

  <div class="app">
    <div class="breadcrumb">
      <a href="#">Accueil</a> › <a href="#">Voitures</a> › ${esc(a.ville || a.region || '')} › ${esc(a.titre)}
    </div>

    <div class="annonce-container">
      <div class="left-column">
        <div class="photos-section">${photoHtml}</div>

        <div class="title-block mobile-only">
          <h1>${esc(a.titre)}</h1>
          <div class="location">${esc(a.ville || '')}${a.annee ? ' • ' + esc(a.annee) : ''}${a.kilometrage ? ' • ' + esc(a.kilometrage) + ' km' : ''}</div>
        </div>
        <div class="price-big mobile-only">${a.prix ? esc(a.prix) + ' €' : ''}</div>
        <div class="fee mobile-only">Paiement sécurisé : 19,99 €</div>
        <a href="/reservation/${a.id}" class="btn-reservation mobile-only">Réserver</a>

        <div class="section-title">Caractéristiques</div>
        <div class="specs-grid">
          ${a.marque ? `<div><div class="spec-label">Marque</div><div class="spec-value">${esc(a.marque)}</div></div>` : ''}
          ${a.modele ? `<div><div class="spec-label">Modèle</div><div class="spec-value">${esc(a.modele)}</div></div>` : ''}
          ${a.annee ? `<div><div class="spec-label">Année</div><div class="spec-value">${esc(a.annee)}</div></div>` : ''}
          ${a.kilometrage ? `<div><div class="spec-label">Kilométrage</div><div class="spec-value">${esc(a.kilometrage)} km</div></div>` : ''}
          ${a.code_postal ? `<div><div class="spec-label">Code postal</div><div class="spec-value">${esc(a.code_postal)}</div></div>` : ''}
          ${a.region ? `<div><div class="spec-label">Région</div><div class="spec-value">${esc(a.region)}</div></div>` : ''}
        </div>

        <div class="section-title">Description</div>
        <div class="description">${esc(a.description || 'Aucune description.')}</div>

        <div class="seller-card">
          <div style="font-weight:700;margin-bottom:10px;">Vendeur</div>
          <div style="font-size:17px;font-weight:600;">${esc(a.vendeur || 'Leboncoin')}</div>
          ${a.membre_depuis ? `<div style="color:#666;margin-top:6px;">Membre depuis ${esc(a.membre_depuis)}</div>` : ''}
        </div>

        <footer class="footer">
          <div class="footer-links">
            <div class="footer-column"><h4>À propos</h4><ul><li><a href="#">Qui sommes-nous ?</a></li><li><a href="#">Nos engagements</a></li><li><a href="#">Recrutement</a></li></ul></div>
            <div class="footer-column"><h4>Aide & Contact</h4><ul><li><a href="#">Centre d'aide</a></li><li><a href="#">Nous contacter</a></li><li><a href="#">FAQ</a></li></ul></div>
            <div class="footer-column"><h4>Mentions légales</h4><ul><li><a href="#">CGU</a></li><li><a href="#">CGV</a></li><li><a href="#">Confidentialité</a></li></ul></div>
          </div>
          <div class="footer-bottom"><span>© 2006 - 2026 Tous droits réservés</span></div>
        </footer>
        <div class="view-all"><a href="#">Voir toutes les annonces →</a></div>
      </div>

      <div class="right-column">
        <div class="sticky-box">
          <h1 style="font-size:20px;font-weight:700;margin-bottom:10px;">${esc(a.titre)}</h1>
          <div style="color:#666;font-size:15px;margin-bottom:16px;">${esc(a.ville || '')}${a.annee ? ' • ' + esc(a.annee) : ''}${a.kilometrage ? ' • ' + esc(a.kilometrage) + ' km' : ''}</div>
          <div class="price-big">${a.prix ? esc(a.prix) + ' €' : ''}</div>
          <div class="fee">Paiement sécurisé : 19,99 €</div>
          <a href="/reservation/${a.id}" class="btn-reservation">Réserver</a>
        </div>
      </div>
    </div>
  </div>

  <div id="lightbox" class="lightbox">
    <span class="lightbox-close" onclick="closeLightbox()">×</span>
    <img id="lightbox-image" class="lightbox-image" src="${a.photo || ''}">
  </div>

  <script>
    function openLightbox(i) { document.getElementById('lightbox').classList.add('active'); document.body.style.overflow='hidden'; }
    function closeLightbox() { document.getElementById('lightbox').classList.remove('active'); document.body.style.overflow=''; }
    function toggleLike(btn) { btn.classList.toggle('liked'); }
    function shareAnnonce() {
      if (navigator.share) { navigator.share({ title: '${esc(a.titre)}', url: window.location.href }); }
      else { navigator.clipboard.writeText(window.location.href).then(() => alert('Lien copié !')); }
    }
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  </script>
</body>
</html>`);
});

// ===== PAGE RÉSERVATION INFO =====
app.get('/reservation/:id', async (req, res) => {
  const _all = await readAll(); const rows = [_all.find(x => x.id === parseInt(req.params.id))].filter(Boolean);
  const a = rows[0];
  if (!a) return res.status(404).send('Annonce introuvable');

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Achat sécurisé - leboncoin</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
    body{background:#fff;color:#111827;line-height:1.5}
    .header{background:#fff;border-bottom:1px solid #e5e7eb;position:sticky;top:0;z-index:50;padding:0}
    .header-content{max-width:1280px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}
    .icon-btn{padding:8px;background:none;border:none;cursor:pointer;border-radius:8px;color:#374151}
    .icon-btn:hover{background:#f3f4f6}
    .logo{color:#f56b2a;font-weight:900;font-size:20px;letter-spacing:-0.5px}
    .security-badge{color:#4b5563;display:flex;align-items:center;gap:4px;font-size:13px}
    .progress-bar{max-width:1280px;margin:0 auto;padding:0 16px;height:4px;background:#e5e7eb;border-radius:9999px;overflow:hidden;margin-bottom:0}
    .progress-fill{height:100%;width:33%;background:#2563eb}
    .main{max-width:800px;margin:0 auto;padding:28px 16px;flex:1}
    .page-title{font-size:22px;font-weight:700;margin-bottom:22px}
    .section{margin-bottom:28px}
    .section-title{font-size:17px;font-weight:600;margin-bottom:14px}
    .step-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px;margin-bottom:4px}
    .step-header{display:flex;align-items:center;gap:12px;margin-bottom:12px}
    .step-number{width:30px;height:30px;border-radius:50%;background:#f97316;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0}
    .step-title{font-size:15px;font-weight:700}
    .step-desc{font-size:14px;color:#4b5563;line-height:1.6}
    .carousel-dots{display:flex;justify-content:center;gap:8px;margin-top:14px}
    .dot{width:8px;height:8px;border-radius:50%;background:#d1d5db;border:none;cursor:pointer;padding:0;transition:background 0.2s}
    .dot.active{background:#111827}
    .pricing-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:22px}
    .payment-btn{width:100%;background:#fff7ed;color:#9a3412;font-weight:600;padding:11px 16px;border-radius:8px;border:none;cursor:pointer;margin-bottom:14px}
    .price-label{text-align:center;font-size:24px;font-weight:800;color:#111827;margin-bottom:20px}
    .feature{display:flex;gap:12px;margin-bottom:14px}
    .feature-title{font-weight:600;font-size:14px}
    .feature-desc{font-size:12px;color:#4b5563;margin-top:3px}
    .terms{font-size:12px;color:#4b5563;margin-bottom:20px}
    .terms a{color:#4b5563;text-decoration:underline}
    .cta-btn{display:block;width:100%;background:#f56b2a;color:#fff;font-weight:700;padding:15px 24px;border-radius:10px;border:none;cursor:pointer;font-size:16px;text-align:center;text-decoration:none;transition:background 0.2s}
    .cta-btn:hover{background:#d95a1e}
    .footer{background:#1f2937;color:#fff;padding:20px 16px;margin-top:48px}
    .footer-inner{max-width:1280px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:12px}
    .footer-text{font-size:13px;color:#9ca3af}
    .trustpilot{display:flex;align-items:center;gap:6px;font-size:13px}
    .stars{display:flex;gap:2px}
    .carousel-slide{display:none}.carousel-slide.active{display:block}
  </style>
</head>
<body>
  <header class="header">
    <div class="header-content">
      <button class="icon-btn" onclick="history.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="logo">leboncoin</span>
        <span class="security-badge">|
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
          Achat sécurisé
        </span>
      </div>
      <button class="icon-btn" onclick="history.back()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="progress-bar"><div class="progress-fill"></div></div>
  </header>

  <main class="main">
    <h1 class="page-title">Acheter votre véhicule en toute confiance</h1>

    <div class="section">
      <h2 class="section-title">Comment ça marche ?</h2>
      <div class="carousel-slide active">
        <div class="step-card">
          <div class="step-header"><div class="step-number">1</div><h3 class="step-title">Réservez le véhicule</h3></div>
          <p class="step-desc">Avant ou après avoir vu le véhicule, je le réserve pour rassurer le vendeur sur ma volonté d'acheter son véhicule. Si je le souhaite, je peux négocier le prix, et ce jusqu'à la remise des clés.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <div class="step-card">
          <div class="step-header"><div class="step-number">2</div><h3 class="step-title">Préparez votre paiement en ligne</h3></div>
          <p class="step-desc">Je sélectionne mon moyen de paiement et dépose mes fonds. Mon argent reste bloqué et sécurisé sur un compte séquestre jusqu'à la vente.</p>
        </div>
      </div>
      <div class="carousel-slide">
        <div class="step-card">
          <div class="step-header"><div class="step-number">3</div><h3 class="step-title">Payez votre véhicule en toute sécurité</h3></div>
          <p class="step-desc">Lors de la remise définitive, je débloque les fonds au vendeur. Nous serons instantanément informés de la disponibilité des fonds lors de l'annulation ou de la négociation.</p>
        </div>
      </div>
      <div class="carousel-dots">
        <button class="dot active" data-slide="0"></button>
        <button class="dot" data-slide="1"></button>
        <button class="dot" data-slide="2"></button>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">La formule</h2>
      <div class="pricing-card">
        <button class="payment-btn">Paiement sécurisé</button>
        <div class="price-label">19,99 €</div>
        <div class="feature">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div><p class="feature-title">Réservation du véhicule</p><p class="feature-desc">Assurez-vous que le véhicule ne vous passe pas sous le nez.</p></div>
        </div>
        <div class="feature">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" style="flex-shrink:0;margin-top:2px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div><p class="feature-title">Paiement sécurisé</p><p class="feature-desc">Votre argent est protégé sur un compte séquestre jusqu'au jour de la transaction.</p></div>
        </div>
      </div>
    </div>

    <p class="terms">En cliquant sur «Réserver mon véhicule», j'accepte les <a href="#">Conditions Générales d'Utilisation</a></p>
    <a href="/formule/${a.id}" class="cta-btn">Réserver mon véhicule</a>
  </main>

  <footer class="footer">
    <div class="footer-inner">
      <p class="footer-text">leboncoin 2006 - 2026</p>
      <div class="trustpilot">
        <span style="font-weight:500">Excellent</span>
        <div class="stars">
          ${['','','','',''].map(() => `<svg width="18" height="18" viewBox="0 0 24 24" fill="#00b67a"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`).join('')}
        </div>
        <span style="color:#9ca3af">243 458 avis sur</span>
        <span style="font-weight:700">Trustpilot</span>
      </div>
    </div>
  </footer>

  <script>
    const dots = document.querySelectorAll('.dot');
    const slides = document.querySelectorAll('.carousel-slide');
    dots.forEach(dot => {
      dot.addEventListener('click', function() {
        dots.forEach(d => d.classList.remove('active'));
        slides.forEach(s => s.classList.remove('active'));
        this.classList.add('active');
        slides[this.dataset.slide].classList.add('active');
      });
    });
  </script>
</body>
</html>`);
});

// ===== PAGE FORMULE =====
app.get('/formule/:id', async (req, res) => {
  const _all = await readAll(); const rows = [_all.find(x => x.id === parseInt(req.params.id))].filter(Boolean);
  const a = rows[0];
  if (!a) return res.status(404).send('Annonce introuvable');
  const S = sharedStyle();

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>leboncoin - Choisir ma formule</title>
  <style>${S}
    .perks{margin-bottom:24px;color:#2c3e50}
    .perks p{font-size:14px;margin-bottom:6px}
    .carte-grise{background:#f8f9fa;border-radius:10px;padding:18px;margin:24px 0;border:1px solid #e0e0e0}
    .carte-grise h3{font-size:15px;font-weight:700;margin-bottom:14px;color:#2c3e50;display:flex;align-items:center;gap:8px}
    .form-row{display:flex;gap:14px;margin-bottom:0;flex-wrap:wrap}
    .form-group{flex:1;min-width:180px;margin-bottom:14px}
    .form-group label{display:block;font-size:13px;font-weight:700;margin-bottom:5px;color:#2c3e50}
    .form-group input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px}
    .form-group input:focus{outline:none;border-color:#f56b2a;box-shadow:0 0 0 2px rgba(245,107,42,0.1)}
    .form-group input.error{border-color:#e74c3c}
    .err{color:#e74c3c;font-size:12px;margin-top:4px;display:none}
    .sidebar{background:#f8f9fa;border-radius:12px;padding:18px;position:sticky;top:80px}
    .car-img{width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:12px}
    .car-title-s{font-size:14px;font-weight:700;margin-bottom:4px;color:#2c3e50}
    .car-price-s{font-size:18px;font-weight:800;color:#f56b2a;margin-bottom:12px}
    .pay-row{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#7f8c8d;border-bottom:1px solid #f0f0f0}
    .pay-row.total{font-weight:700;color:#2c3e50;border-bottom:none;padding-top:10px}
    .layout{display:grid;grid-template-columns:1fr;gap:30px}
    @media(min-width:900px){.layout{grid-template-columns:1fr 320px}}
    .legal-text{font-size:11px;color:#95a5a6;margin:16px 0;line-height:1.6}
    .legal-text a{color:#3498db;text-decoration:none}
  </style>
</head>
<body>
  ${sharedHeader('/annonce/${a.id}')}
  <div class="progress-bar"><div class="progress-fill" style="width:50%"></div></div>

  <main class="main">
    <div class="layout">
      <div>
        <h1>Choisissez votre formule :</h1>

        <div class="perks">
          <p>✓ Dépannage et remorquage dès 0 km</p>
          <p>✓ Pas de plafond du montant des remboursements</p>
          <p>✓ Mise à disposition d'un véhicule de remplacement pendant 5 jours</p>
          <p>✓ Un accès à des conseils téléphoniques</p>
          <p>✓ Franchise de 150 €</p>
        </div>

        <div class="carte-grise">
          <h3>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#f56b2a" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M7 8H13" stroke-linecap="round"/><path d="M7 11H11" stroke-linecap="round"/></svg>
            Nom et prénom sur la carte grise (À demander au vendeur)
          </h3>
          <div class="form-row">
            <div class="form-group">
              <label>Nom sur la carte grise <span style="color:red">*</span></label>
              <input type="text" id="nom" placeholder="Ex: DUPONT">
              <div class="err" id="nom_err">Ce champ est obligatoire</div>
            </div>
            <div class="form-group">
              <label>Prénom sur la carte grise <span style="color:red">*</span></label>
              <input type="text" id="prenom" placeholder="Ex: Jean">
              <div class="err" id="prenom_err">Ce champ est obligatoire</div>
            </div>
          </div>
        </div>

        <h2>Je choisis la durée :</h2>
        <div class="warranty-grid">
          <div class="warranty-card" onclick="selectW('3',139,this)">
            <div class="radio-container"><input type="radio" name="warranty" value="3"></div>
            <div class="warranty-duration">3 mois</div>
            <div class="warranty-price">139 €</div>
          </div>
          <div class="warranty-card" onclick="selectW('6',259,this)">
            <div class="popular-badge">La plus souscrite</div>
            <div class="radio-container"><input type="radio" name="warranty" value="6"></div>
            <div class="warranty-duration">6 mois</div>
            <div class="warranty-price">259 €</div>
          </div>
          <div class="warranty-card" onclick="selectW('12',399,this)">
            <div class="radio-container"><input type="radio" name="warranty" value="12"></div>
            <div class="warranty-duration">12 mois</div>
            <div class="warranty-price">399 €</div>
          </div>
          <div class="warranty-card" onclick="selectW('0',0,this)">
            <div class="radio-container"><input type="radio" name="warranty" value="0"></div>
            <div class="warranty-duration">Sans garantie</div>
            <div class="warranty-price"></div>
          </div>
        </div>

        <div class="info-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="flex-shrink:0;color:#ffb300"><path d="M9.66 17H14.34M12 3C9.5 3 6.5 4.5 6.5 8.5c0 3 2 4.5 2.5 6s0 2.5 0 2.5h6s0-1-.5-2.5S17.5 11.5 17.5 8.5C17.5 4.5 14.5 3 12 3z" stroke-linecap="round"/></svg>
          <p style="font-size:13px;color:#2c3e50">Conditions, limites et exclusions Garantie Panne Mécanique. <a href="#" style="color:#3498db">Document d'information</a>, <a href="#" style="color:#3498db">Conditions générales</a>.</p>
        </div>

        <div class="legal-text">
          <a href="#">Document d'information sur les produits d'assurance</a>,
          <a href="#">Fiche d'information pré-contractuelle</a>,
          <a href="#">Conditions générales de la garantie</a>
        </div>

        <form id="wform" action="/finaliser/${a.id}" method="GET" style="display:none">
          <input type="hidden" name="warranty" id="hw">
          <input type="hidden" name="price" id="hp">
          <input type="hidden" name="nom" id="hn">
          <input type="hidden" name="prenom" id="hpr">
        </form>

        <div style="margin-top:24px">
          <button class="btn-primary" id="continueBtn" onclick="submit()" disabled>Continuer</button>
        </div>
      </div>

      <div>
        <div class="sidebar">
          ${a.photo ? `<img src="${a.photo}" class="car-img" alt="${esc(a.titre)}">` : ''}
          <div class="car-title-s">${esc(a.titre)}</div>
          <div class="car-price-s">${a.prix ? esc(a.prix) + ' €' : ''}</div>
          <div class="pay-row"><span>Prix du véhicule :</span><span>${a.prix ? esc(a.prix) + ' €' : '—'}</span></div>
          <div class="pay-row" id="wrow" style="display:none"><span id="wlabel">Garantie :</span><span id="wprice">0 €</span></div>
          <div class="pay-row total"><span>Total :</span><span id="total">${a.prix ? esc(a.prix) + ' €' : '—'}</span></div>
        </div>
      </div>
    </div>
  </main>

  ${sharedFooter()}

  <script>
    let selW = null, selPrice = 0;
    const base = ${parseFloat((a.prix || '0').replace(/\s/g,'').replace(',','.')) || 0};

    function selectW(months, price, el) {
      document.querySelectorAll('.warranty-card').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      el.querySelector('input[type=radio]').checked = true;
      selW = months; selPrice = price;
      document.getElementById('wrow').style.display = 'flex';
      document.getElementById('wlabel').textContent = months == '0' ? 'Sans garantie :' : 'Garantie ' + months + ' mois :';
      document.getElementById('wprice').textContent = price.toFixed(2).replace('.',',') + ' €';
      document.getElementById('total').textContent = (base + price).toFixed(2).replace('.',',') + ' €';
      document.getElementById('continueBtn').disabled = false;
    }

    function submit() {
      const nom = document.getElementById('nom').value.trim();
      const prenom = document.getElementById('prenom').value.trim();
      let ok = true;
      document.getElementById('nom_err').style.display = 'none';
      document.getElementById('prenom_err').style.display = 'none';
      document.getElementById('nom').classList.remove('error');
      document.getElementById('prenom').classList.remove('error');
      if (!nom) { document.getElementById('nom_err').style.display='block'; document.getElementById('nom').classList.add('error'); ok=false; }
      if (!prenom) { document.getElementById('prenom_err').style.display='block'; document.getElementById('prenom').classList.add('error'); ok=false; }
      if (!selW) return;
      if (ok) {
        document.getElementById('hw').value = selW;
        document.getElementById('hp').value = selPrice;
        document.getElementById('hn').value = nom;
        document.getElementById('hpr').value = prenom;
        document.getElementById('wform').submit();
      }
    }
  </script>
</body>
</html>`);
});

// ===== PAGE FINALISER =====
app.get('/finaliser/:id', async (req, res) => {
  const _all = await readAll(); const rows = [_all.find(x => x.id === parseInt(req.params.id))].filter(Boolean);
  const a = rows[0];
  if (!a) return res.status(404).send('Annonce introuvable');
  const { warranty, price, nom, prenom } = req.query;
  const base = parseFloat((a.prix || '0').replace(/\s/g,'').replace(',','.')) || 0;
  const garantie = parseFloat(price) || 0;
  const total = (base + garantie).toFixed(2).replace('.',',');
  const ref = a.ref || ('REF' + String(a.id).padStart(2,'0') + '0000' + String(a.id).padStart(2,'0'));
  const S = sharedStyle();

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>leboncoin - Finaliser ma réservation</title>
  <style>${S}
    .price-box{display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:15px}
    .price-box .label{color:#555}
    .price-box .val{font-weight:700;color:#2c3e50}
    .warranty-detail{background:#f8f9fa;padding:12px;border-radius:8px;margin:14px 0;display:flex;justify-content:space-between;align-items:center;font-size:14px}
    .warranty-detail .wname{font-weight:600;color:#333}
    .warranty-detail .wprice{color:#f56b2a;font-weight:700}
    .ref{background:#e3f2fd;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:14px;color:#1565c0;margin:10px 0;display:inline-block}
    .vendeur-box{background:#fff3e0;padding:14px;border-radius:8px;margin:16px 0;border-left:4px solid #f56b2a}
    .vendeur-box strong{color:#f56b2a}
    .nom-box{background:#e8f0fe;padding:10px 14px;border-radius:6px;margin:10px 0;font-size:13px}
    .cancel-link{color:#2c3e50;text-decoration:underline;font-size:14px;cursor:pointer;background:none;border:none;padding:0;display:inline-block;margin-top:16px}
    .layout{display:grid;grid-template-columns:1fr;gap:30px}
    @media(min-width:900px){.layout{grid-template-columns:1fr 320px}}
    .sidebar{background:#f8f9fa;border-radius:12px;padding:18px;position:sticky;top:80px}
    .car-img{width:100%;height:110px;object-fit:cover;border-radius:8px;margin-bottom:12px}
    .validate-btn{width:100%;background:#f56b2a;color:#fff;border:none;padding:14px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;margin-top:16px}
    .validate-btn:hover{background:#d95a1e}
    .faq{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;overflow:hidden}
    .faq summary{padding:14px 18px;cursor:pointer;font-weight:500;color:#2c3e50;list-style:none;display:flex;justify-content:space-between}
    .faq summary::after{content:'⌄';font-size:1.4rem}
    .faq[open] summary::after{transform:rotate(180deg)}
    .faq-body{padding:0 18px 14px;color:#555;font-size:14px}
  </style>
</head>
<body>
  ${sharedHeader('/formule/' + a.id + '?warranty=' + (warranty||'') + '&price=' + (price||'') + '&nom=' + encodeURIComponent(nom||'') + '&prenom=' + encodeURIComponent(prenom||''))}
  <div class="progress-bar"><div class="progress-fill" style="width:75%"></div></div>

  <main class="main">
    <div class="layout">
      <div>
        <h1>On récapitule votre achat !</h1>

        <h2>Reste à payer</h2>
        <div class="price-box"><span class="label">Prix du véhicule</span><span class="val">${a.prix ? esc(a.prix) + ' €' : '—'}</span></div>
        ${garantie > 0 ? `<div class="warranty-detail"><span class="wname">Garantie ${warranty} mois</span><span class="wprice">+ ${garantie.toFixed(2).replace('.',',')} €</span></div>` : ''}
        <div class="price-box" style="border-top:2px solid #f56b2a;margin-top:14px;padding-top:16px">
          <span style="font-weight:700;font-size:16px">Total à payer</span>
          <span style="color:#f56b2a;font-size:26px;font-weight:800">${total} €</span>
        </div>

        <div class="vendeur-box">
          <strong><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:5px"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Informations virement</strong>
          <div class="nom-box">
            <span style="font-size:12px;color:#555"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:8px"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg> Nom et Prénom(s) de la carte grise :</span>
            <span style="font-weight:600;color:#f56b2a"> ${esc(prenom||'')} ${esc((nom||'').toUpperCase())}</span>
            <p style="margin-top:8px;color:#666;font-size:13px">S'il y a eu négociation avec le vendeur, vous pouvez adapter le montant total à virer en conséquence dans les étapes suivantes.</p>
            <div class="ref"><strong>Référence annonce :</strong> ${ref}</div>
            <p style="margin-top:10px;font-size:13px"><strong>Vendeur :</strong> ${esc(a.vendeur || 'Leboncoin')}</p>
          </div>
        </div>

        <button class="cancel-link" onclick="if(confirm('Annuler votre achat ?')) location.href='/annonce/${a.id}'">Je ne souhaite plus acheter le véhicule</button>

        <details class="faq" style="margin-top:24px">
          <summary>Comment négocier le prix du véhicule ?</summary>
          <div class="faq-body">Vous pouvez négocier directement avec le vendeur avant de finaliser l'achat. Le montant final pourra être ajusté lors du virement.</div>
        </details>
        <details class="faq">
          <summary>Comment payer le vendeur ensuite ?</summary>
          <div class="faq-body">Une fois les fonds reçus sur votre compte sécurisé, vous pourrez finaliser le paiement au vendeur en suivant les instructions par email.</div>
        </details>
      </div>

      <div>
        <div class="sidebar">
          ${a.photo ? `<img src="${a.photo}" class="car-img" alt="${esc(a.titre)}">` : ''}
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;color:#2c3e50">${esc(a.titre)}</div>
          <div style="font-size:18px;font-weight:800;color:#f56b2a;margin-bottom:12px">${a.prix ? esc(a.prix) + ' €' : ''}</div>
          <div style="display:flex;justify-content:space-between;padding:7px 0;font-size:13px;color:#7f8c8d;border-bottom:1px dashed #ddd">
            <span>Prix du véhicule :</span><span>${a.prix ? esc(a.prix) + ' €' : '—'}</span>
          </div>
          ${garantie > 0 ? `<div style="padding:7px 0;font-size:13px;color:#7f8c8d;border-bottom:1px dashed #ddd">Garantie ${warranty} mois : + ${garantie.toFixed(2).replace('.',',')} €</div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:15px;font-weight:700;color:#2c3e50">
            <span>Total :</span><span>${total} €</span>
          </div>
          <a href="/confirmer/${a.id}?total=${encodeURIComponent(total.replace(',','.'))}&warranty=${encodeURIComponent(warranty||'')}&nom=${encodeURIComponent(nom||'')}&prenom=${encodeURIComponent(prenom||'')}">
            <button class="validate-btn">Valider</button>
          </a>
        </div>
      </div>
    </div>
  </main>

  ${sharedFooter()}
</body>
</html>`);
});

// ===== PAGE CONFIRMER (RIB) =====
app.get('/confirmer/:id', async (req, res) => {
  const _all = await readAll(); const rows = [_all.find(x => x.id === parseInt(req.params.id))].filter(Boolean);
  const a = rows[0];
  if (!a) return res.status(404).send('Annonce introuvable');
  const { total, warranty, nom, prenom } = req.query;
  const ref = a.ref || ('REF' + String(a.id).padStart(2,'0') + '0000' + String(a.id).padStart(2,'0'));
  const S = sharedStyle();

  res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>leboncoin - Achat sécurisé</title>
  <style>${S}
    .bank-card{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:10px;padding:22px;margin-top:14px}
    .bank-header{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:16px;color:#2c3e50}
    hr{margin:12px 0;border:none;border-top:1px solid #e0e0e0}
    .bank-item{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
    .bank-label{font-size:13px;color:#7f8c8d}
    .bank-value{font-weight:700;color:#2c3e50;font-size:15px;word-break:break-all}
    .ref{background:#e3f2fd;padding:8px 12px;border-radius:6px;font-family:monospace;font-size:14px;color:#1565c0;margin:10px 0;display:inline-block}
    .copy-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:18px;background:#f8f9fa;border:1px solid #dee2e6;padding:13px 24px;border-radius:8px;cursor:pointer;font-size:15px;font-weight:700;color:#2c3e50;transition:all 0.2s}
    .copy-btn:hover{background:#e9ecef;box-shadow:0 4px 8px rgba(0,0,0,0.1)}
    .toast{position:fixed;top:20px;right:20px;background:#4caf50;color:#fff;padding:10px 18px;border-radius:6px;font-size:14px;z-index:999;animation:slideIn 0.3s ease;display:none}
    @keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}
    .cancel-link{color:#2c3e50;text-decoration:underline;font-size:14px;cursor:pointer;background:none;border:none;padding:0}
    .faq{background:#f8f9fa;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:10px;overflow:hidden}
    .faq summary{padding:14px 18px;cursor:pointer;font-weight:500;color:#2c3e50;list-style:none;display:flex;justify-content:space-between}
    .faq summary::after{content:'⌄';font-size:1.4rem}
    .faq-body{padding:0 18px 14px;color:#555;font-size:14px}
    .primary-btn{background:#f56b2a;color:#fff;border:none;padding:11px 28px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;text-decoration:none;display:inline-block}
    .primary-btn:hover{background:#d95a1e}
    .actions{display:flex;align-items:center;gap:20px;margin:28px 0;flex-wrap:wrap}
  </style>
</head>
<body>
  ${sharedHeader('/finaliser/' + a.id)}
  <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>

  <main class="main">
    <img src="/images/logo.png" alt="leboncoin" style="height:36px;margin-bottom:20px" onerror="this.style.display='none'">

    <h1>Déposez vos fonds sur votre compte sécurisé leboncoin</h1>

    <h2>Comment procéder ?</h2>
    <p style="font-size:14px;color:#2c3e50;margin-bottom:16px">
      Connectez-vous à votre compte bancaire et ajoutez le bénéficiaire avec les coordonnées ci-dessous. Puis effectuez votre virement de <strong>${total ? esc(total) + ' €' : ''}</strong>.
    </p>

    <div class="bank-card">
      <div class="bank-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="10" height="8"/><path d="M5 5V4a2 2 0 0 1 4 0v1"/><circle cx="8" cy="9" r="1" fill="currentColor"/></svg>
        RIB Compte séquestre
      </div>
      <hr>
      <div class="bank-item">
        <span class="bank-label">Titulaire du compte</span>
        <span class="bank-value">${esc(a.titulaire_rib || a.assistant_name || 'Leboncoin Assistance')}</span>
      </div>
      <div class="bank-item">
        <span class="bank-label">IBAN</span>
        <span class="bank-value" id="iban-val">${esc(a.iban || '')}</span>
      </div>
      <div class="bank-item">
        <span class="bank-label">BIC</span>
        <span class="bank-value">${esc(a.bic || '')}</span>
      </div>
      <div class="ref"><strong>Référence annonce :</strong> ${ref}</div>
      <button class="copy-btn" onclick="copyIBAN()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="8" height="8"/><path d="M3 11V3H11"/></svg>
        Copier l'IBAN
      </button>
    </div>

    <div class="info-box" style="margin-top:22px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="flex-shrink:0;color:#ffb300"><path d="M9.66 17H14.34M12 3C9.5 3 6.5 4.5 6.5 8.5c0 3 2 4.5 2.5 6s0 2.5 0 2.5h6s0-1-.5-2.5S17.5 11.5 17.5 8.5C17.5 4.5 14.5 3 12 3z" stroke-linecap="round"/></svg>
      <p style="font-size:13px;color:#2c3e50">Votre virement prendra jusqu'à 4 jours ouvrés. Votre banque peut prendre jusqu'à 48h pour valider votre bénéficiaire. Puis sous 2 jours ouvrés vous recevrez vos fonds sur votre compte leboncoin.</p>
    </div>

    <div class="actions">
      <button class="cancel-link" onclick="if(confirm('Annuler votre achat ?')) location.href='/annonce/${a.id}'">Je ne souhaite plus acheter le véhicule</button>
      <a href="#" class="primary-btn" onclick="alert('Merci ! Nous avons bien pris note de votre virement. Vous serez notifié par email dès réception.')">J'ai fait mon virement</a>
    </div>

    <details class="faq">
      <summary>Combien de temps prend le virement ?</summary>
      <div class="faq-body">Le virement peut prendre jusqu'à 4 jours ouvrés (48h pour l'ajout du bénéficiaire + 2 jours ouvrés pour la réception des fonds).</div>
    </details>
    <details class="faq">
      <summary>Comment payer le vendeur ensuite ?</summary>
      <div class="faq-body">Une fois les fonds reçus sur votre compte sécurisé, vous serez notifié par email et pourrez finaliser le paiement au vendeur en quelques clics.</div>
    </details>
  </main>

  ${sharedFooter()}

  <div class="toast" id="toast">IBAN copié dans le presse-papiers !</div>
  <script>
    function copyIBAN() {
      const iban = document.getElementById('iban-val').textContent;
      navigator.clipboard.writeText(iban).then(() => {
        const t = document.getElementById('toast');
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 3000);
      }).catch(() => alert('Impossible de copier l\\'IBAN'));
    }
  </script>
</body>
</html>`);
});

// ===== HELPERS =====
function sharedStyle() {
  return `*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  body{background:#fff;color:#111827;font-size:14px}
  .header{background:#fff;border-bottom:3px solid #f56b2a;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 4px rgba(0,0,0,.05)}
  .logo{font-size:20px;font-weight:900;color:#FF8C00;letter-spacing:-.5px}
  .secure-badge{display:flex;align-items:center;gap:6px;font-size:13px;color:#4b5563}
  .icon-btn{background:none;border:none;cursor:pointer;padding:8px;color:#374151;border-radius:8px}
  .icon-btn:hover{background:#f3f4f6}
  .progress-bar{height:4px;background:#e5e7eb}
  .progress-fill{height:100%;background:#2563eb;border-radius:9999px;transition:width .3s}
  .main{max-width:960px;margin:0 auto;padding:28px 16px}
  h1{font-size:22px;font-weight:700;margin-bottom:20px;color:#2c3e50}
  h2{font-size:17px;font-weight:600;margin:24px 0 12px;color:#2c3e50}
  .warranty-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
  @media(max-width:600px){.warranty-grid{grid-template-columns:repeat(2,1fr)}}
  .warranty-card{border:1px solid #e0e0e0;border-radius:12px;padding:16px 8px 12px;background:#fff;cursor:pointer;position:relative;text-align:center;display:flex;flex-direction:column;align-items:center;transition:all .2s}
  .warranty-card:hover{border-color:#f56b2a;box-shadow:0 4px 12px rgba(245,107,42,.15)}
  .warranty-card.selected{border:2px solid #f56b2a;background:#fff8f5}
  .popular-badge{position:absolute;top:-11px;left:50%;transform:translateX(-50%);background:#f56b2a;color:#fff;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap}
  .radio-container{margin-bottom:8px}
  .radio-container input[type=radio]{width:18px;height:18px;accent-color:#f56b2a;cursor:pointer}
  .warranty-duration{font-size:14px;font-weight:700;color:#2c3e50;margin:6px 0 3px}
  .warranty-price{font-size:20px;font-weight:800;color:#f56b2a}
  .info-box{background:#f5f5f5;border:1px solid #e0e0e0;border-radius:8px;padding:14px;display:flex;gap:12px;margin:20px 0}
  .btn-primary{background:#f56b2a;color:#fff;border:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;transition:all .2s}
  .btn-primary:hover:not(:disabled){background:#d95a1e}
  .btn-primary:disabled{background:#ccc;cursor:not-allowed}
  .footer{background:#2c3e50;color:#fff;padding:20px;margin-top:48px;text-align:center;font-size:13px}
  .footer-inner{max-width:960px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:10px}
  @media(min-width:640px){.footer-inner{flex-direction:row;justify-content:space-between}}
  .trustpilot{display:flex;align-items:center;gap:6px;font-size:13px}
  .stars{color:#00b67a}`;
}

function sharedHeader(backUrl = '') {
  return `<header class="header" style="background:#fff;border-bottom:3px solid #FF8C00;padding:10px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 4px rgba(0,0,0,.05)">
  <button class="icon-btn" onclick="${backUrl ? `location.href='${backUrl}'` : 'history.back()'}" aria-label="Retour">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <div style="display:flex;align-items:center;gap:10px">
    <img src="/images/logo.png" alt="leboncoin" style="height:36px;width:auto" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
    <span style="display:none;color:#FF8C00;font-weight:900;font-size:20px;letter-spacing:-.5px">leboncoin</span>
    <span style="color:#4b5563;font-size:13px;display:flex;align-items:center;gap:4px">|
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 0L2 3V7C2 11 5 14 8 16C11 14 14 11 14 7V3L8 0Z" fill="#4A90E2"/></svg>
      Achat sécurisé
    </span>
  </div>
  <button class="icon-btn" onclick="if(confirm('Quitter ?')) location.href='/'" aria-label="Fermer">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round"/></svg>
  </button>
</header>`;
}

function sharedFooter() {
  return `<footer class="footer">
  <div class="footer-inner">
    <span>leboncoin 2006 - 2026</span>
    <div class="trustpilot">
      <span>Excellent</span>
      <span class="stars">★★★★★</span>
      <span style="color:#9ca3af">243 458 avis sur</span>
      <span style="font-weight:700">Trustpilot</span>
    </div>
  </div>
</footer>`;
}

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
