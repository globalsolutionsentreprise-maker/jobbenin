'use strict';
// POST /api/payment/candidat
//   action=subscribe    → candidat-subscribe (1 000 XOF)
//   action=reactivate   → candidat-reactivate (2 000 XOF)
//   action=buy_credits  → achat de crédits candidat (packs)

const { FedaPay, Transaction } = require('../../lib/fedapay');
const { supabase }             = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body ?? {};

  // ── Abonnement ──────────────────────────────────────────────────────
  if (action === 'subscribe') {
    const { nom, prenom, email, telephone } = req.body;
    if (!nom || !prenom || !email || !telephone) {
      return res.status(400).json({ error: 'Champs requis manquants' });
    }
    try {
      const { data: user } = await supabase.from('users').select('status').eq('email', email).single();
      if (user?.status === 'active') {
        return res.status(400).json({ error: 'Ce compte est déjà actif.' });
      }
      const callbackUrl = `${process.env.SITE_URL}/api/payment/webhook?type=candidat_subscribe`;
      const transaction = await Transaction.create({
        description: 'Abonnement Talenco.bj — Candidat (1 mois)',
        amount: 1000, currency: { iso: 'XOF' }, callback_url: callbackUrl,
        customer: { firstname: prenom, lastname: nom, email, phone_number: { number: telephone, country: 'BJ' } }
      });
      await supabase.from('transactions').insert({
        fedapay_id: String(transaction.id),
        email, nom: `${prenom} ${nom}`, telephone,
        amount: 1000, type: 'candidat_subscribe', status: 'pending'
      });
      const token = await transaction.generateToken();
      return res.status(200).json({ payment_url: token.url });
    } catch (err) {
      console.error('subscribe error:', err);
      return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
    }
  }

  // ── Réactivation ────────────────────────────────────────────────────
  if (action === 'reactivate') {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token manquant' });
    try {
      const { data: rt, error } = await supabase
        .from('reactivation_tokens').select('*, users(*)').eq('token', token)
        .eq('used', false).gt('expires_at', new Date().toISOString()).single();
      if (error || !rt) return res.status(400).json({ error: 'Token invalide ou expiré. Contactez le support.' });
      const user = rt.users;
      const callbackUrl = `${process.env.SITE_URL}/api/payment/webhook?type=candidat_reactivate&token=${token}`;
      const transaction = await Transaction.create({
        description: 'Réactivation compte Talenco.bj',
        amount: 2000, currency: { iso: 'XOF' }, callback_url: callbackUrl,
        customer: { firstname: user.prenom || 'Client', lastname: user.nom || '', email: user.email, phone_number: { number: user.telephone, country: 'BJ' } }
      });
      await supabase.from('transactions').insert({
        fedapay_id: String(transaction.id), email: user.email, nom: user.nom, telephone: user.telephone,
        amount: 2000, type: 'candidat_reactivate', status: 'pending',
        meta: JSON.stringify({ reactivation_token: token })
      });
      const payToken = await transaction.generateToken();
      return res.status(200).json({ payment_url: payToken.url });
    } catch (err) {
      console.error('reactivate error:', err);
      return res.status(500).json({ error: 'Erreur lors de la réactivation.' });
    }
  }

  // ── Achat de crédits ────────────────────────────────────────────────
  if (action === 'buy_credits') {
    const PACKS = {
      starter: { name: 'Pack Starter',  credits: 5,  amount: 1500 },
      actif:   { name: 'Pack Actif',    credits: 15, amount: 3500 },
      pro:     { name: 'Pack Pro',      credits: 50, amount: 8000 },
    };
    const { pack, nom, email, telephone } = req.body;
    const selectedPack = PACKS[pack];
    if (!selectedPack) return res.status(400).json({ error: 'Pack invalide' });
    if (!nom || !email || !telephone) return res.status(400).json({ error: 'Champs requis manquants' });
    try {
      const callbackUrl = `${process.env.SITE_URL}/api/payment/webhook?type=candidat_credits_purchase&pack=${pack}`;
      const transaction = await Transaction.create({
        description: `${selectedPack.name} Talenco.bj — ${selectedPack.credits} crédits`,
        amount: selectedPack.amount, currency: { iso: 'XOF' }, callback_url: callbackUrl,
        customer: {
          firstname: nom.split(' ')[0] || nom,
          lastname:  nom.split(' ').slice(1).join(' ') || '',
          email, phone_number: { number: telephone, country: 'BJ' },
        },
      });
      await supabase.from('transactions').insert({
        fedapay_id: String(transaction.id),
        email, nom, telephone,
        amount: selectedPack.amount,
        type: 'candidat_credits_purchase',
        status: 'pending',
        meta: JSON.stringify({ pack, credits: selectedPack.credits }),
      });
      const token = await transaction.generateToken();
      return res.status(200).json({ payment_url: token.url });
    } catch (err) {
      console.error('buy_credits error:', err);
      return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
    }
  }

  return res.status(400).json({ error: 'action requis : subscribe | reactivate | buy_credits' });
};
