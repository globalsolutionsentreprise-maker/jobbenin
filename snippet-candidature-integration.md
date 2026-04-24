# Intégration candidature.js — Talenco

## Prérequis communs aux 3 pages

```html
<!-- Dans le <head> ou avant </body> de chaque page -->
<script>window.SUPABASE_ANON_KEY = 'VOTRE_ANON_KEY';</script>
<script src="/candidature.js"></script>
```

---

## 1. candidat.html — Section "Mon CV"

### HTML à ajouter dans la section profil

```html
<!-- Notice si redirigé depuis une offre sans CV -->
<div id="notice-cv-upload"></div>

<!-- Zone d'upload — sera peuplée par candidature.js -->
<div id="mon-cv"></div>
```

### JS à ajouter (dans le callback de session existant)

```js
// Après votre vérification de session existante :
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  candidature.afficherNoticeUpload('notice-cv-upload');   // ← affiche le message si redirigé
  candidature.initUploadCV(supabase, 'mon-cv');           // ← initialise la zone upload
}
```

---

## 2. offres.html — Bouton Postuler sur chaque carte

### Dans la fonction renderCard (template literal)

```js
function renderCard(offre) {
  return `
    <div class="job-card">
      <h3>${offre.titre}</h3>
      <p>${offre.entreprise} — ${offre.ville}</p>
      <!-- Conteneur du bouton — ID unique par offre -->
      <div id="postuler-${offre.id}"></div>
    </div>`;
}
```

### Après insertion des cartes dans le DOM

```js
// Appeler pour chaque offre, après que le HTML est dans le DOM :
async function renderOffres(offres) {
  const grid = document.querySelector('.offres-grid');
  grid.innerHTML = offres.map(renderCard).join('');

  // Initialiser les boutons Postuler en parallèle
  await Promise.all(
    offres.map((o) => candidature.initPostulerBtn(supabase, o.id, `postuler-${o.id}`))
  );
}
```

> ⚠️ `initPostulerBtn` est async et fait 2 requêtes Supabase.
> Sur mobile ou si la liste est longue (50+ offres), limiter aux
> offres visibles avec un IntersectionObserver si besoin.

---

## 3. offre-detail.html — Bouton Postuler dans le header

### HTML dans le header de la page détail

```html
<!-- Dans la zone de l'offre, à côté du titre / CTA existant -->
<div id="postuler-btn"></div>
```

### JS après chargement de l'offre

```js
// Après avoir chargé l'offre depuis Supabase :
async function loadOffre(jobId) {
  const { data: offre } = await supabase
    .from('jobs').select('*').eq('id', jobId).single();

  // ... votre rendu HTML existant ...

  // Initialiser le bouton Postuler
  await candidature.initPostulerBtn(supabase, jobId, 'postuler-btn');
}
```

### Avec lettre d'accompagnement optionnelle

Si vous voulez ajouter un champ message avant de postuler :

```html
<textarea id="lettre-motiv" placeholder="Lettre de motivation (optionnel)" rows="4"
  style="width:100%;border-radius:8px;border:1px solid #e5e7eb;padding:10px;font-size:13px;margin-bottom:10px;"></textarea>
<div id="postuler-btn"></div>
```

```js
// Récupérer le message au moment de l'init
const message = document.getElementById('lettre-motiv')?.value || null;
await candidature.initPostulerBtn(supabase, jobId, 'postuler-btn', { message });
```

---

## États du bouton

| Situation | Bouton affiché |
|---|---|
| Non connecté | 🔑 Se connecter pour postuler (lien connexion) |
| Connecté, sans CV | 📎 Postuler (CV requis) → redirige vers #mon-cv |
| Connecté, CV présent | ⚡ Postuler en 1 clic |
| En cours d'envoi | ⏳ Envoi en cours… (désactivé) |
| Déjà postulé | ✅ Candidature envoyée (désactivé) |
| Erreur | ❌ Erreur lors de l'envoi. Réessayez. |

---

## Déploiement

```bash
# 1. Exécuter la migration SQL dans Supabase SQL Editor
#    (cv_application_schema.sql)

# 2. Déployer les Edge Functions
supabase functions deploy notify-application

# 3. Vérifier que RESEND_API_KEY est dans les secrets Supabase
#    Dashboard → Edge Functions → Secrets

# 4. Copier candidature.js à la racine du site Vercel
```
