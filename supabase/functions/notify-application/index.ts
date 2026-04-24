import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL   = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!;
const SITE_URL   = 'https://talenco.bj';
const FROM_EMAIL = 'Talenco.bj <contact@talenco.bj>';

const sb = createClient(SUPA_URL, SUPA_KEY);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Template email recruteur ───────────────────────────────────────────────

function buildEmailRecruteur(params: {
  jobTitre: string;
  jobId: string;
  candidatEmail: string;
  message: string | null;
}): string {
  const { jobTitre, jobId, candidatEmail, message } = params;
  const dashboardUrl = `${SITE_URL}/recruteur.html?tab=candidatures&job=${jobId}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouvelle candidature</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- HEADER -->
        <tr>
          <td style="background:#16a34a;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
            <p style="margin:0;font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.01em;">
              Talenco.bj 🇧🇯
            </p>
            <p style="margin:6px 0 0 0;font-size:13px;color:#bbf7d0;">Nouvelle candidature reçue</p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#fff;padding:28px 32px;">
            <p style="margin:0 0 20px 0;font-size:14px;color:#374151;line-height:1.6;">
              Vous avez reçu une nouvelle candidature pour l'offre&nbsp;:
            </p>

            <!-- Offre -->
            <table width="100%" cellpadding="0" cellspacing="0" style="
              background:#f0fdf4;border:1px solid #bbf7d0;
              border-radius:10px;margin-bottom:20px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:15px;font-weight:600;color:#15803d;">${esc(jobTitre)}</p>
                </td>
              </tr>
            </table>

            <!-- Candidat -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="font-size:13px;color:#6b7280;width:130px;padding:4px 0;vertical-align:top;">Candidat :</td>
                <td style="font-size:13px;color:#111827;padding:4px 0;font-weight:500;">${esc(candidatEmail)}</td>
              </tr>
              ${message ? `
              <tr>
                <td style="font-size:13px;color:#6b7280;width:130px;padding:4px 0;vertical-align:top;">Message :</td>
                <td style="font-size:13px;color:#374151;padding:4px 0;line-height:1.5;">${esc(message)}</td>
              </tr>` : ''}
            </table>

            <p style="margin:0 0 20px 0;font-size:13px;color:#6b7280;">
              Le CV du candidat est disponible directement dans votre espace recruteur.
            </p>

            <a href="${dashboardUrl}" style="
              display:inline-block;background:#16a34a;color:#fff;
              font-size:13px;font-weight:600;text-decoration:none;
              padding:10px 22px;border-radius:8px;">
              Voir la candidature &rarr;
            </a>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="
            background:#f3f4f6;border-top:1px solid #e5e7eb;
            border-radius:0 0 12px 12px;padding:16px 24px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">
              Talenco.bj &mdash; Recrutement au Bénin
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { application_id } = await req.json();
    if (!application_id) {
      return new Response(JSON.stringify({ error: 'application_id requis' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Récupérer la candidature avec l'offre et les deux utilisateurs
    const { data: app, error: appErr } = await sb
      .from('applications')
      .select(`
        id, cv_path, message,
        user_id,
        job_id,
        jobs (id, titre, user_id),
        users!applications_user_id_fkey (email)
      `)
      .eq('id', application_id)
      .single();

    if (appErr || !app) {
      return new Response(JSON.stringify({ error: 'Candidature introuvable' }), {
        status: 404, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const job: any = app.jobs;
    const candidatEmail: string = (app.users as any)?.email ?? '';

    if (!job?.user_id) {
      return new Response(JSON.stringify({ error: 'Offre sans recruteur associé' }), {
        status: 422, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Email du recruteur
    const { data: recruteur } = await sb
      .from('users')
      .select('email')
      .eq('id', job.user_id)
      .single();

    if (!recruteur?.email) {
      console.warn(`Recruteur ${job.user_id} sans email, notification ignorée`);
      return new Response(JSON.stringify({ success: true, sent: false, reason: 'Recruteur sans email' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const html = buildEmailRecruteur({
      jobTitre:      job.titre ?? job.title ?? 'Offre d\'emploi',
      jobId:         job.id,
      candidatEmail,
      message:       app.message ?? null,
    });

    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [recruteur.email],
        subject: `📥 Nouvelle candidature — ${job.titre ?? job.title}`,
        html,
      }),
    });

    if (!mailRes.ok) {
      const body = await mailRes.text();
      console.error('Resend erreur:', mailRes.status, body);
    }

    console.log(`✅ Notification envoyée à ${recruteur.email} pour candidature ${application_id}`);

    return new Response(
      JSON.stringify({ success: true, sent: mailRes.ok, to: recruteur.email }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('notify-application erreur:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
