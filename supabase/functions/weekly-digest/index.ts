import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL  = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL  = 'https://talenco.bj';
const FROM_EMAIL = 'Talenco.bj <contact@talenco.bj>';

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Envoi email via Resend ─────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`Resend erreur ${res.status} pour ${to}:`, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error(`Resend exception pour ${to}:`, err);
    return false;
  }
}

// ── Template email HTML ────────────────────────────────────────────────────

function buildEmailHtml(jobs: Array<{
  id: string; titre: string; entreprise: string; ville: string; secteur: string;
}>, userId: string): string {
  const unsubUrl = `${SUPA_URL}/functions/v1/weekly-digest?unsubscribe=${userId}`;

  const jobCards = jobs.map((j) => `
    <tr>
      <td style="padding:0 0 16px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="
          background:#ffffff;
          border:1px solid #e5e7eb;
          border-radius:10px;
          border-collapse:separate;
          overflow:hidden;
        ">
          <tr>
            <td style="padding:16px 20px 10px 20px;">
              <p style="margin:0 0 2px 0;font-size:16px;font-weight:600;color:#111827;line-height:1.3;">${esc(j.titre)}</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">${esc(j.entreprise)} &mdash; ${esc(j.ville)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 14px 20px;">
              <span style="
                display:inline-block;
                background:#dcfce7;
                color:#15803d;
                font-size:11px;
                font-weight:600;
                padding:3px 10px;
                border-radius:99px;
                letter-spacing:0.02em;
              ">${esc(j.secteur)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 20px 16px 20px;">
              <a href="${SITE_URL}/offre-detail.html?id=${j.id}" style="
                display:inline-block;
                background:#16a34a;
                color:#ffffff;
                font-size:13px;
                font-weight:600;
                text-decoration:none;
                padding:8px 18px;
                border-radius:8px;
              ">Voir l'offre &rarr;</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vos offres de la semaine — Talenco.bj</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- HEADER -->
          <tr>
            <td style="
              background:#16a34a;
              border-radius:12px 12px 0 0;
              padding:28px 32px;
              text-align:center;
            ">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">
                Talenco.bj 🇧🇯
              </p>
              <p style="margin:6px 0 0 0;font-size:13px;color:#bbf7d0;">
                Votre récap' emploi de la semaine
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#f9fafb;padding:24px 24px 8px 24px;">
              <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
                Bonjour,<br>
                Voici les <strong>${jobs.length} meilleures offres</strong> correspondant à vos alertes cette semaine. Postulez vite, les meilleures partent en quelques jours !
              </p>

              <table width="100%" cellpadding="0" cellspacing="0">
                ${jobCards}
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
                <tr>
                  <td align="center" style="padding:8px 0 24px 0;">
                    <a href="${SITE_URL}/offres.html" style="
                      display:inline-block;
                      border:1.5px solid #16a34a;
                      color:#16a34a;
                      font-size:13px;
                      font-weight:600;
                      text-decoration:none;
                      padding:10px 24px;
                      border-radius:8px;
                    ">Voir toutes les offres</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="
              background:#f3f4f6;
              border-top:1px solid #e5e7eb;
              border-radius:0 0 12px 12px;
              padding:20px 24px;
              text-align:center;
            ">
              <p style="margin:0 0 8px 0;font-size:11px;color:#9ca3af;">
                Vous recevez cet email car vous avez configuré des alertes emploi sur Talenco.bj
              </p>
              <a href="${unsubUrl}" style="font-size:11px;color:#9ca3af;text-decoration:underline;">
                Se désabonner des emails hebdomadaires
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Échapper les caractères HTML pour éviter toute injection dans l'email
function esc(s: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Handler principal ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ── Désabonnement via lien email (GET ?unsubscribe=USER_ID) ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const uid = url.searchParams.get('unsubscribe');
    if (uid) {
      const { error } = await sb.from('alerts').delete().eq('user_id', uid);
      if (error) {
        return new Response('<h2>Erreur lors du désabonnement. Réessayez.</h2>', {
          status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>Désabonnement</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;margin:0}
.box{background:#fff;border-radius:12px;padding:40px;text-align:center;max-width:400px;border:1px solid #e5e7eb}
h2{color:#16a34a;margin:0 0 12px}p{color:#6b7280;font-size:14px}a{color:#16a34a}</style>
</head><body>
<div class="box">
  <h2>✅ Désabonné avec succès</h2>
  <p>Vous ne recevrez plus les digests hebdomadaires.<br>Vous pouvez reconfigurer vos alertes à tout moment.</p>
  <a href="https://talenco.bj">Retour au site</a>
</div>
</body></html>`, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const start = Date.now();
    console.log('📧 Digest hebdomadaire démarré:', new Date().toISOString());

    // 1 ── Récupérer toutes les alertes (user_id, secteur, ville)
    const { data: alerts, error: alertsErr } = await sb
      .from('alerts')
      .select('user_id, secteur, ville');

    if (alertsErr) throw alertsErr;
    if (!alerts?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 0, reason: 'Aucune alerte configurée' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Regrouper par user_id → { secteurs: Set, villes: Set }
    const userAlerts = new Map<string, { secteurs: Set<string>; villes: Set<string> }>();
    for (const a of alerts) {
      if (!userAlerts.has(a.user_id)) {
        userAlerts.set(a.user_id, { secteurs: new Set(), villes: new Set() });
      }
      const entry = userAlerts.get(a.user_id)!;
      if (a.secteur) entry.secteurs.add(a.secteur);
      if (a.ville)   entry.villes.add(a.ville);
    }

    const userIds = [...userAlerts.keys()];

    // 2 ── Récupérer les emails des candidats
    const { data: users, error: usersErr } = await sb
      .from('users')
      .select('id, email')
      .in('id', userIds);

    if (usersErr) throw usersErr;

    const emailMap = new Map((users ?? []).map((u) => [u.id, u.email]));

    // 3 ── Récupérer les offres des 7 derniers jours (triées par score)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentJobs, error: jobsErr } = await sb
      .from('jobs')
      .select('id, titre, entreprise, ville, secteur, score, created_at')
      .gte('created_at', since)
      .order('score', { ascending: false });

    if (jobsErr) throw jobsErr;

    const jobs = recentJobs ?? [];

    // 4 ── Envoyer un email par candidat (en parallèle)
    let sent = 0, skipped = 0, errors = 0;

    const tasks = userIds.map(async (userId) => {
      const email = emailMap.get(userId);
      if (!email) { skipped++; return; }

      const { secteurs, villes } = userAlerts.get(userId)!;

      // Top 5 offres correspondantes (score déjà trié côté DB)
      const matching = jobs
        .filter((j) => secteurs.has(j.secteur) || villes.has(j.ville))
        .slice(0, 5);

      if (!matching.length) {
        console.log(`⏭ Aucune offre pour ${email}`);
        skipped++;
        return;
      }

      const html = buildEmailHtml(matching, userId);
      const ok = await sendEmail(
        email,
        '🔔 Vos offres de la semaine — Talenco.bj',
        html,
      );

      if (ok) {
        sent++;
        console.log(`✅ Email envoyé à ${email} (${matching.length} offres)`);
      } else {
        errors++;
      }
    });

    await Promise.allSettled(tasks);

    const duration = Date.now() - start;
    console.log(`Digest terminé en ${duration}ms — envoyés:${sent} ignorés:${skipped} erreurs:${errors}`);

    return new Response(
      JSON.stringify({ success: true, sent, skipped, errors, duration_ms: duration, candidates: userIds.length }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('weekly-digest erreur:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
