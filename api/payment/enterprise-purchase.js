const { Transaction } = require('../../lib/fedapay');
const { supabase } = require('../../lib/supabase');

const PACKS = {
  starter:  { name: 'Pack Starter',  credits: 10,  amount: 10000 },
  growth:   { name: 'Pack Growth',   credits: 30,  amount: 25000 },
  business: { name: 'Pack Business', credits: 100, amount: 75000 }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { pack, nom, email, telephone, societe } = req.body;
  const selectedPack = PACKS[pack];
  if (!selectedPack) return res.status(400).json({ error: 'Pack invalide' });
  if (!nom || !email || !telephone) return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const callbackUrl = `${process.env.SITE_URL}/api/payment/webhook?type=enterprise_purchase&pack=${pack}`;
    const transaction = await Transaction.create({
      description: `${selectedPack.name} Talenco.bj — ${selectedPack.credits} crédits`,
      amount: selectedPack.amount, currency: { iso: 'XOF' }, callback_url: callbackUrl,
      customer: {
        firstname: nom.split(' ')[0] || nom,
        lastname: nom.split(' ').slice(1).join(' ') || '',
        email, phone_number: { number: telephone, country: 'BJ' }
      }
    });
    await supabase.from('transactions').insert({
      fedapay_id: String(transaction.id), email, nom, telephone,
      amount: selectedPack.amount, type: 'enterprise_purchase', status: 'pending',
      meta: JSON.stringify({ pack, credits: selectedPack.credits, societe })
    });
    const token = await transaction.generateToken();
    return res.status(200).json({ payment_url: token.url });
  } catch (err) {
    console.error('Enterprise purchase error:', err);
    return res.status(500).json({ error: 'Erreur lors de la création du paiement.' });
  }
};
