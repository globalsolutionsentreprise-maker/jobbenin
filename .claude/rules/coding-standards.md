# Coding Standards — Talenco BJ

## JavaScript — API routes (/api/**/*.js)

- Use CommonJS: `require()` and `module.exports` — NEVER `import/export`
- Always use the shared Supabase client: `const { supabase } = require('../../lib/supabase')`
- Every API route must return `res.status(200).json(...)` or `res.status(4xx).json({ error })`
- Check Supabase errors: `if (error) return res.status(500).json({ error: error.message })`
- Never hardcode SUPABASE_SERVICE_KEY or FEDAPAY_SECRET_KEY — always use process.env

## JavaScript — Frontend (HTML pages)

- All logic is inline `<script>` in the HTML file — no external JS modules
- Use `fetch('/api/...')` for all data operations
- Always check `response.ok` before using response data
- Token/session stored in localStorage key `talenco_token`

## Security

- /api/admin/* routes: always verify JWT via supabase.auth.getUser() AND check users.role = 'admin'
- FedaPay webhook: always re-verify payment status with FedaPay API before updating DB
- Never trust client-sent role or status — always read from DB

## Design

- All CSS variables come from /design-system.css — no hardcoded colors or fonts
- Key tokens: --accent: #8B4513, --bg: #F9F6F1
- All user-facing text in French

## Git commits

- Format: `Feat: description` or `Fix: description`
- Never commit .env.local or secrets
- Always co-author with Claude when Claude writes the code
