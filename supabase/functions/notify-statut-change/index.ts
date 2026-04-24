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
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Templates email ───────────────────────────────────────────────────────────

function buildEmailEntretien(params: {
  candidatEmail: string;
  entreprise: string;
  jobTitre: string;
  jobId: string;
}): { subject: string; html: string } {
  const { entreprise, jobTitre, jobId } = params;
  const offreUrl = `${SITE_URL}/offre-detail.html?id=${jobId}`;

  return {
    subject: `🎉 Bonne nouvelle de ${esc(entreprise)} — Talenco.bj`,
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Convocation à un entretien</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="background:#16a34a;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
      <p style="margin:6px 0 0;font-size:13px;color:#bbf7d0;">Une bonne nouvelle vous attend !</p>
    </td></tr>
    <tr><td style="background:#fff;padding:28px 32px;">
      <p style="font-size:22px;margin:0 0 16px;text-align:center;">🎉</p>
      <p style="font-size:15px;font-weight:600;color:#111827;margin:0 0 12px;">Félicitations !</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 16px;">
        <strong>${esc(entreprise)}</strong> a examiné votre candidature pour le poste de
        <strong>${esc(jobTitre)}</strong> et souhaite vous rencontrer pour un entretien.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:20px;">
        <tr><td style="padding:14px 18px;">
          <p style="margin:0;font-size:13px;color:#15803d;font-weight:600;">
            📞 L'entreprise va vous contacter prochainement pour convenir d'une date.
          </p>
        </td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280;line-height:1.5;margin:0 0 20px;">
        En attendant, relisez la description du poste et préparez vos arguments —
        votre Coach IA Talenco peut vous aider !
      </p>
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:8px;">
          <a href="${offreUrl}" style="display:block;text-align:center;background:#16a34a;
             color:#fff;text-decoration:none;padding:10px;border-radius:8px;
             font-size:13px;font-weight:600;">Revoir l'offre</a>
        </td>
        <td>
          <a href="${SITE_URL}/coach.html" style="display:block;text-align:center;
             background:#7c3aed;color:#fff;text-decoration:none;padding:10px;border-radius:8px;
             font-size:13px;font-weight:600;">✨ Préparer l'entretien</a>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#f3f4f6;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;
        padding:14px 24px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Talenco.bj — Recrutement au Bénin</p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body></html>`,
  };
}

function buildEmailRefus(params: {
  candidatEmail: string;
  entreprise: string;
  jobTitre: string;
}): { subject: string; html: string } {
  const { entreprise, jobTitre } = params;

  return {
    subject: `Réponse à votre candidature — ${esc(jobTitre)}`,
    html: `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Réponse à votre candidature</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
    <tr><td style="background:#374151;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">Talenco.bj 🇧🇯</p>
      <p style="margin:6px 0 0;font-size:13px;color:#d1d5db;">Mise à jour de votre candidature</p>
    </td></tr>
    <tr><td style="background:#fff;padding:28px 32px;">
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 14px;">Bonjour,</p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 14px;">
        Suite à l'examen attentif de votre candidature pour le poste de
        <strong>${esc(jobTitre)}</strong> chez <strong>${esc(entreprise)}</strong>,
        nous avons le regret de vous informer que votre profil ne correspond pas
        aux critères recherchés pour ce poste à ce stade de notre processus de recrutement.
      </p>
      <p style="font-size:14px;color:#374151;line-height:1.6;margin:0 0 20px;">
        Nous vous encourageons à continuer à postuler — de nouvelles opportunités
        correspondant à votre profil sont publiées chaque semaine sur Talenco.bj.
      </p>
      <a href="${SITE_URL}/offres.html" style="display:inline-block;background:#16a34a;
         color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px;
         font-size:13px;font-weight:600;">Voir les autres offres &rarr;</a>
    </td></tr>
    <tr><td style="background:#f3f4f6;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;
        padding:14px 24px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Talenco.bj — Recrutement au Bénin</p>
    </td></tr>
  </table>
  </td></tr>
</table>
</body></html>`,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Méthode non autorisée' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { application_id, nouveau_statut } = await req.json();

    // On ne notifie que pour entretien et refusée
    if (!['entretien', 'refusée'].includes(nouveau_statut)) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: 'Statut non notifiable' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Récupérer candidature + offre + candidat + recruteur
    const { data: app, error: appErr } = await sb
      .from('applications')
      .select(`
        id, job_id, user_id,
        jobs ( id, titre, title, user_id, entreprise, company ),
        users!applications_user_id_fkey ( email )
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
    const jobTitre  = job?.titre ?? job?.title ?? 'Offre d\'emploi';
    const entreprise = job?.entreprise ?? job?.company ?? 'L\'entreprise';

    if (!candidatEmail) {
      return new Response(JSON.stringify({ success: true, sent: false, reason: 'Candidat sans email' }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const { subject, html } = nouveau_statut === 'entretien'
      ? buildEmailEntretien({ candidatEmail, entreprise, jobTitre, jobId: job.id })
      : buildEmailRefus({ candidatEmail, entreprise, jobTitre });

    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [candidatEmail], subject, html }),
    });

    if (!mailRes.ok) console.error('Resend erreur:', mailRes.status, await mailRes.text());

    console.log(`✅ notify-statut-change — ${nouveau_statut} → ${candidatEmail}`);

    return new Response(
      JSON.stringify({ success: true, sent: mailRes.ok, to: candidatEmail }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('notify-statut-change erreur:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
