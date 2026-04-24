# Intégration badge "Nouveau" — Talenco

## Étape 0 — Inclure le script dans chaque page (avant </body>)

```html
<script src="/badge-nouveau.js"></script>
```

---

## 1. offres.html — Badge sur les cartes

### Dans le <head> ou la feuille de style existante
Rien à ajouter — badge-nouveau.js injecte son propre CSS.

### Dans la fonction qui génère le HTML d'une carte (renderCard ou équivalent)

**AVANT :**
```js
function renderCard(offre) {
  return `
    <div class="job-card">
      <img src="${offre.logo}" ...>
      <h3>${offre.titre}</h3>
      ...
    </div>`;
}
```

**APRÈS — 2 micro-changements :**
```js
function renderCard(offre) {
  return `
    <div class="job-card badge-nouveau-host">
      ${badgeNouveau.badge(offre.created_at)}
      <img src="${offre.logo}" ...>
      <h3>${offre.titre}</h3>
      ...
    </div>`;
}
```

> Ajouter `badge-nouveau-host` sur la div racine de la carte (met position:relative).
> Insérer `${badgeNouveau.badge(offre.created_at)}` en premier enfant.

---

## 2. offres.html — Filtre "Moins de 24h" dans la barre de filtres

### Dans le JS, après que le DOM est prêt (DOMContentLoaded ou fin de renderOffres)

```js
// Appeler une seule fois au chargement de la page.
// Remplacer '.filtres-bar' par le sélecteur CSS réel de votre barre de filtres.
badgeNouveau.injecterFiltreNouveautes('.filtres-bar', () => renderOffres());
```

### Dans la fonction qui filtre les offres (avant le render)

**AVANT :**
```js
function getOffresFiltrees() {
  return offres
    .filter(o => !filtreSecteur || o.secteur === filtreSecteur)
    .filter(o => !filtreVille   || o.ville   === filtreVille);
}
```

**APRÈS — ajouter 1 ligne :**
```js
function getOffresFiltrees() {
  return badgeNouveau.filtrerOffres(   // ← envelopper le résultat final
    offres
      .filter(o => !filtreSecteur || o.secteur === filtreSecteur)
      .filter(o => !filtreVille   || o.ville   === filtreVille)
  );
}
```

> `badgeNouveau.filtrerOffres()` ne fait rien si le filtre est inactif.
> Il s'applique après les filtres secteur/ville, donc la combinaison fonctionne.

---

## 3. index.html — Badge sur les offres récentes de la page d'accueil

Identique à offres.html : dans la fonction qui render les cartes de la section "offres récentes".

```js
function renderCarteAccueil(offre) {
  return `
    <div class="recent-job-card badge-nouveau-host">
      ${badgeNouveau.badge(offre.created_at)}
      ...
    </div>`;
}
```

---

## 4. offre-detail.html — Badge + texte relatif dans le header

Dans la fonction qui affiche le détail d'une offre (après avoir chargé l'offre depuis Supabase) :

**AVANT :**
```js
function renderDetail(offre) {
  document.querySelector('.detail-header').innerHTML = `
    <h1>${offre.titre}</h1>
    <span class="entreprise">${offre.entreprise}</span>
    ...
  `;
}
```

**APRÈS :**
```js
function renderDetail(offre) {
  const estNouveau = badgeNouveau.isNew(offre.created_at);

  document.querySelector('.detail-header').innerHTML = `
    <h1>${offre.titre}</h1>
    <span class="entreprise">${offre.entreprise}</span>
    ${estNouveau
      ? `<div class="detail-nouveaute">
           <span class="badge-nouveau" style="position:static;box-shadow:none;">Nouveau</span>
           <span class="detail-temps-relatif">${badgeNouveau.tempsRelatif(offre.created_at)}</span>
         </div>`
      : `<span class="detail-temps-relatif">${badgeNouveau.tempsRelatif(offre.created_at)}</span>`
    }
    ...
  `;
}
```

Ajouter ce CSS dans le `<style>` de offre-detail.html :
```css
.detail-nouveaute {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.detail-temps-relatif {
  font-size: 12px;
  color: #6b7280;   /* ou var(--color-text-secondary) si vous l'avez */
}
```

---

## Rendu du texte relatif selon l'ancienneté

| Ancienneté       | Texte affiché          |
|------------------|------------------------|
| < 1 heure        | Publiée il y a 45 min  |
| 1h – 23h59       | Publiée il y a 3h      |
| 24h – 47h59      | Publiée hier           |
| ≥ 48h            | Publiée il y a 3 jours |
