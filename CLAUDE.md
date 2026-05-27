# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skill routing

When the user's request matches an available agent or skill, invoke it proactively. Don't wait for the user to ask.

Key routing rules:
- Bug reported / something broken / page not loading → invoke bug-investigator agent
- Before or after a commit/deploy → invoke code-reviewer agent
- "commite et déploie" / "déploie" / "mets en prod" → invoke deploy-helper agent
- New table / migration / Supabase query / Edge Function → invoke supabase-expert agent
- "vérifie que ça marche" / after UI changes → invoke ui-qa agent
- Investigating a bug or error → invoke /investigate skill
- Code review / diff check → invoke /review skill
- Ship / deploy → invoke /land-and-deploy skill

## SELF-LEARNING

Ce projet maintient un journal d'apprentissage dans tasks/lessons.md.

### Règles impératives

1. Au démarrage de chaque session, avant TOUTE autre action : lire tasks/lessons.md (s'il existe).

2. Avant de modifier du code, relire les règles de tasks/lessons.md et les appliquer.

3. Après chaque correction de l'utilisateur, ajouter immédiatement une entrée au format :

   [YYYY-MM-DD] | ce qui s'est mal passé | règle à suivre la prochaine fois

### Contraintes

- Ne jamais supprimer ou réorganiser les entrées existantes sans demande explicite.
- Si tasks/lessons.md n'existe pas, le créer avant de continuer.

## Commands

```bash
# Local development (requires Vercel CLI)
npm run dev          # vercel dev — serves HTML statically + proxies /api/* as serverless functions

# Deploy
npm run deploy       # vercel --prod

# Supabase local (Edge Functions)
supabase start       # local Supabase stack
supabase functions serve <name>   # serve a single Edge Function locally
supabase db push     # apply SQL migrations
```

There is no build step — HTML/CSS/JS is served as-is. No bundler, no TypeScript compilation for the frontend.

## Architecture

**Frontend**: Vanilla HTML pages (`*.html`) + plain JS (inline `<script>` tags). No framework, no bundler. All pages import `/design-system.css` for the "Champagne Éditorial" design token system.

**API layer** (`/api/**/*.js`): Vercel serverless functions (Node.js, CommonJS). Shared libs in `/lib/`:
- `lib/supabase.js` — Supabase admin client (uses `SUPABASE_SERVICE_KEY`, bypasses RLS)
- `lib/mailer.js` — Nodemailer SMTP transporter
- `lib/fedapay.js` — FedaPay payment gateway (West Africa)

**Database**: Supabase Postgres. Migrations are in `/supabase/migrations/*.sql` and must be applied manually via the Supabase Dashboard or `supabase db push`. They are **not** auto-applied.

**Edge Functions** (`/supabase/functions/*/index.ts`): Deno-based, deployed separately via `supabase functions deploy`. Used for AI matching, WhatsApp notifications, push notifications, and weekly digest.

**Storage**: Supabase `cvs` bucket — private, PDF-only, 5 MB limit. CV path convention: `cvs/{user_id}/cv.pdf`.

## Data model (key tables)

- `users` — unified table for all roles. `role` ∈ `{candidat, entreprise, admin}`. `status` ∈ `{active, suspended, pending}`. Contains `cv_path`, `premium_until`, `credits`, `plan`.
- `applications` — job applications. `statut` ∈ `{envoyée, vue, entretien, refusée}`. Stores `cv_path` snapshot at apply time.
- `transactions` — FedaPay payment records. `type` ∈ `{candidat_subscribe, candidat_reactivate, enterprise_purchase}`.
- `reactivation_tokens` — one-time tokens for suspended candidate reactivation.
- `login_events` — one row per login, used for admin analytics.
- `jobs` — job offers. `status` ∈ `{pending, published, rejected}` (moderated by admin).

## Business logic

**Subscription model**:
- Candidats: 1,000 FCFA/month. Account suspended after 3 months inactivity. Reactivation costs 2,000 FCFA.
- Entreprises: credit packs — Starter (10), Growth (30), Business (100). Credits never expire.

**Payment flow**: FedaPay redirects to `/api/payment/webhook?type=<type>&id=<fedapay_id>` after payment. The webhook verifies status with FedaPay, updates `transactions`, then updates `users` or inserts a new user.

**Admin auth**: API endpoints in `/api/admin/` verify the caller's JWT via `supabase.auth.getUser()`, then check `users.role = 'admin'`. There is also an `ADMIN_SECRET_KEY` env var used for some endpoints.

**Inactivity cron**: `/api/payment/check-inactivity` runs daily at 06:00 UTC (configured in `vercel.json`).

## Environment variables

Required in `.env.local` (or Vercel dashboard):

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
FEDAPAY_SECRET_KEY
FEDAPAY_ENV=sandbox          # or 'live' in production
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM
SITE_URL                     # e.g. https://talenco.bj (no trailing slash)
ADMIN_SECRET_KEY
```

## Design system

`/design-system.css` defines all CSS variables. Key tokens: `--accent: #8B4513` (brown), `--bg: #F9F6F1` (warm off-white), `--font-serif: 'Instrument Serif'`, `--font-body: 'Space Grotesk'`, `--font-mono: 'DM Mono'`. All pages load this file plus Google Fonts. Page-specific styles live in `<style>` tags in each HTML file.

## Language

The entire UI and codebase is in French. Variable names, comments, database column names, and user-facing strings are all in French.
