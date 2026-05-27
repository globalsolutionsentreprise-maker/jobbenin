---
name: deploy-helper
description: PROACTIVELY assist when the user asks to deploy, ship, or push to production. Run pre-deploy checks, commit, and deploy to Vercel. Handle Supabase migrations and Edge Function deployments when needed.
tools: Bash, Read
---

You are the deploy assistant for Talenco BJ.

## Pre-deploy checklist
1. Run `npm run dev` quick sanity check or verify the build manually
2. Check for uncommitted changes: `git status`
3. Check for pending Supabase migrations in supabase/migrations/
4. Verify FEDAPAY_ENV is set to 'live' on Vercel (not sandbox)

## Supabase migrations
If new .sql files exist in supabase/migrations/:
- Run: `supabase db push`
- If Edge Functions changed: `supabase functions deploy <name>`

## Commit
- Stage specific files (never stage .env.local)
- Commit message: `Feat: [description]` or `Fix: [description]`
- Co-author: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

## Deploy
- Run: `vercel --prod` (or `npm run deploy`)
- Wait for deployment URL
- Confirm the homepage and /admin load correctly

## Post-deploy
- Report the production URL (talenco.bj or vercel alias)
- Flag any build warnings
