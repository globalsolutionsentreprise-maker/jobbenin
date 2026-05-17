const { Transaction } = require('../../lib/fedapay');
const { supabase } = require('../../lib/supabase');
const { sendMail } = require('../../lib/mailer');

module.exports = async (req, res) => {
  const { type, token: reactivationToken, pack } = req.query;
  const fedapayId = req.query.id;
  if (!fedapayId) return res.redirect(`${process.env.SITE_URL}/paiement-erreur.html`);

  try {
    // Idempotence : si déjà traité, on redirige sans re-traiter
    const { data: existingTxn } = await supabase.from('transactions')
      .select('status').eq('fedapay_id', String(fedapayId)).single();
    if (existingTxn?.status === 'success') {
      return res.redirect(`${process.env.SITE_URL}/paiement-succes.html?type=${type}&pack=${pack}`);
    }

    const fTransaction = await Transaction.retrieve(fedapayId);
    const status = fTransaction.status;
    await supabase.from('transactions')
      .update({ status: status === 'approved' ? 'success' : 'failed' })
      .eq('fedapay_id', String(fedapayId));

    if (status !== 'approved') {
      return res.redirect(`${process.env.SITE_URL}/paiement-erreur.html?reason=declined`);
    }

    if (type === 'candidat_subscribe') {
      const { data: txn } = await supabase.from('transactions').select('*').eq('fedapay_id', String(fedapayId)).single();
      if (txn) {
        const now = new Date().toISOString();
        const end = new Date(Date.now() + 30*24*60*60*1000).toISOString();
        const { data: existing } = await supabase.from('users').select('id').eq('email', txn.email).single();
        if (existing) {
          await supabase.from('users').update({ status: 'active', subscription_start: now, subscription_end: end, premium_until: end, last_activity: now }).eq('id', existing.id);
        } else {
          await supabase.from('users').insert({ email: txn.email, full_name: txn.nom, telephone: txn.telephone, role: 'candidate', status: 'active', subscription_start: now, subscription_end: end, premium_until: end, last_activity: now, credits: 0 });
        }
        await sendMail({ to: txn.email, subject: 'Bienvenue sur Talenco.bj — Abonnement activé !',
          html: `<h2>Votre abonnement est activé</h2><p>Bonjour ${txn.nom},</p><p>Abonnement <strong>1 000 FCFA/mois</strong> actif.</p><a href="${process.env.SITE_URL}/offres.html" style="background:#F0A500;color:#000;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Voir les offres →</a>`
        });
      }
      return res.redirect(`${process.env.SITE_URL}/paiement-succes.html?type=candidat`);
    }

    if (type === 'candidat_reactivate' && reactivationToken) {
      const { data: rt } = await supabase.from('reactivation_tokens').select('*, users(*)').eq('token', reactivationToken).single();
      if (rt) {
        const now = new Date().toISOString();
        const end2 = new Date(Date.now() + 30*24*60*60*1000).toISOString();
        await supabase.from('users').update({ status: 'active', subscription_start: now, subscription_end: end2, premium_until: end2, last_activity: now, inactivity_warned_at: null }).eq('id', rt.user_id);
        await supabase.from('reactivation_tokens').update({ used: true }).eq('token', reactivationToken);
        await sendMail({ to: rt.users.email, subject: 'Talenco.bj — Compte réactivé',
          html: `<p>Votre compte Talenco.bj est de nouveau actif !</p><a href="${process.env.SITE_URL}/offres.html">Voir les offres →</a>`
        });
      }
      return res.redirect(`${process.env.SITE_URL}/paiement-succes.html?type=reactivation`);
    }

    if (type === 'candidat_credits_purchase') {
      const { data: txn } = await supabase.from('transactions').select('*').eq('fedapay_id', String(fedapayId)).single();
      if (txn) {
        const meta = typeof txn.meta === 'string' ? JSON.parse(txn.meta) : (txn.meta || {});
        const PACKS = { starter: 5, actif: 15, pro: 50 };
        const creditsToAdd = PACKS[meta.pack] || 0;
        if (creditsToAdd > 0) {
          const { data: user } = await supabase.from('users').select('id, credits').eq('email', txn.email).single();
          if (user) {
            await supabase.from('users').update({ credits: (user.credits || 0) + creditsToAdd }).eq('id', user.id);
          } else {
            // Compte inexistant : créer un compte candidat avec les crédits
            await supabase.from('users').insert({ email: txn.email, full_name: txn.nom, telephone: txn.telephone, role: 'candidat', status: 'active', credits: creditsToAdd });
          }
        }
        await sendMail({ to: txn.email, subject: `Talenco.bj — ${creditsToAdd} crédits ajoutés`,
          html: `<p>Bonjour ${txn.nom || ''},</p><p><strong>${creditsToAdd} crédits</strong> ajoutés à votre compte. Ils n'expirent jamais.</p><a href="${process.env.SITE_URL}/offres.html" style="background:#8B4513;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Voir les offres →</a>`
        });
      }
      return res.redirect(`${process.env.SITE_URL}/paiement-succes.html?type=candidat_credits&pack=${pack}`);
    }

    if (type === 'enterprise_purchase') {
      const { data: txn } = await supabase.from('transactions').select('*').eq('fedapay_id', String(fedapayId)).single();
      if (txn) {
        const meta = typeof txn.meta === 'string' ? JSON.parse(txn.meta) : (txn.meta || {});
        const CREDITS = { starter: 10, growth: 30, business: 100 };
        const creditsToAdd = CREDITS[meta.pack] || 0;
        const { data: user } = await supabase.from('users').select('id,credits').eq('email', txn.email).single();
        if (user) {
          await supabase.from('users').update({ credits: (user.credits||0) + creditsToAdd }).eq('id', user.id);
        } else {
          await supabase.from('users').insert({ email: txn.email, full_name: txn.nom, company_name: txn.nom, telephone: txn.telephone, role: 'company', status: 'active', credits: creditsToAdd });
        }
        await sendMail({ to: txn.email, subject: `Talenco.bj — ${creditsToAdd} crédits ajoutés`,
          html: `<p><strong>${creditsToAdd} crédits</strong> ajoutés à votre compte. Ils n'expirent jamais.</p><a href="${process.env.SITE_URL}/entreprises.html">Espace recruteur →</a>`
        });
      }
      return res.redirect(`${process.env.SITE_URL}/paiement-succes.html?type=enterprise&pack=${pack}`);
    }

    return res.redirect(`${process.env.SITE_URL}/paiement-succes.html`);
  } catch (err) {
    console.error('Webhook error:', err);
    return res.redirect(`${process.env.SITE_URL}/paiement-erreur.html?reason=server`);
  }
};
