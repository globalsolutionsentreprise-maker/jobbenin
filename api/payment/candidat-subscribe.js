const { FedaPay, Transaction } = require('../../lib/fedapay');
const { supabase } = require('../../lib/supabase');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { nom, prenom, email, telephone } = req.body;
  if (!nom || !prenom || !email || !telephone) {
    return res.status(400).json({ error: 'Champs requis manquants' });
  }
  try {
    const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
    if (user && user.status === 'active') {
      return res.status(400).json({ error: 'Ce compte est déjà actif.' });
    }
    const callbackUrl = `${process.env.SITE_URL}/api/payment/webhook?type=candidat_subscribe`;
    const transaction = await Transaction.create({
      description: 'Abonnement Talenco.bj — Candidat (1 mois)',
      amount: 1000,
      currency: { iso: 'XOF' },
      callback_url: callbackUrl,
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
    console.error('FedaPay error:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
};
