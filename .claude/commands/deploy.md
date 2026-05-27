# /deploy

Commit and deploy to Vercel production.

## Steps
1. Check `git status` for uncommitted changes
2. Check supabase/migrations/ for pending .sql files — run `supabase db push` if any
3. Stage specific files (never .env.local)
4. Commit with descriptive message
5. Run `vercel --prod` (or `npm run deploy`)
6. Confirm production URL responds
