# Rapport QA — Talenco.bj — 16 mai 2026

Session de test end-to-end couvrant les flux entreprise, candidat, et paiements.

## Flux entreprise

| Flux | Statut | Notes |
|------|--------|-------|
| Inscription entreprise (2 étapes) | ✅ | `verification_status:'docs_submitted'` + email admin envoyé |
| Pipeline certification admin | ✅ | `pending → docs_submitted → docs_verified → interview_scheduled → certified` |
| Invitation équipe | ✅ | Token créé en DB, email envoyé (SMTP peut échouer sur adresses Mailinator) |
| Kanban candidatures | ✅ | Drag-drop opérationnel, statut mis à jour en DB |
| Offres publiées / modération | ✅ | Admin approuve, offre passe à `published` |
| Génération offre IA (`generate-offre`) | ✅ | Edge Function — champ correct : `poste` (pas `intitule`) |

## Flux candidat

| Flux | Statut | Notes |
|------|--------|-------|
| Inscription candidat + upload CV | ✅ | Redirection vers `candidat.html` avec modal bêta |
| Login candidat | ✅ | Session OK, pas de redirection automatique post-login (bug connu) |
| Upload / remplacement CV | ✅ | "✅ CV uploadé avec succès !" — Storage + `users.cv_url` mis à jour |
| Mot de passe oublié | ✅ | "Email envoyé ✓" — bouton désactivé après soumission |

## Flux paiements (FedaPay sandbox)

| Flux | Statut | Notes |
|------|--------|-------|
| `POST /api/payment/candidat` (subscribe) | ✅ | `payment_url` retourné, transaction insérée en DB |
| `POST /api/payment/enterprise-purchase` (starter) | ✅ | `payment_url` retourné |
| Webhook (`/api/payment/webhook`) | ✅ | Vérifie statut FedaPay, redirige `/paiement-erreur.html?reason=declined` pour transaction non payée |

> Le chemin "approved" du webhook (crédits/`premium_until` mis à jour + email) nécessite un vrai paiement sandbox pour être validé end-to-end.

## Corrections appliquées cette session

| Fichier | Correction |
|---------|------------|
| `entreprises.html` | Ajout `id="btn-inviter"` sur le bouton d'invitation — `inviterMembre()` levait `TypeError: Cannot set properties of null` |

## Bugs connus (non bloquants)

| Symptôme | Impact |
|----------|--------|
| `connexion.html` ne redirige pas automatiquement après login | Navigation manuelle vers `/candidat.html` ou `/admin.html` nécessaire |
| Email invitation équipe échoue sur adresses Mailinator | Token créé en DB, lien fonctionnel — problème SMTP destinataire uniquement |
| `companies` table non alimentée par `inscription-entreprise.html` | Seul `users` est mis à jour — si une table `companies` est prévue, il faut ajouter l'insert |
