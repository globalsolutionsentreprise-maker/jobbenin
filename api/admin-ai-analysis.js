module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { metrics, prompt } = req.body;
  if (!metrics || !prompt) return res.status(400).json({ error: 'Données manquantes.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée dans les variables Vercel.' });

  const systemPrompt = `Tu es un expert en data science et en recrutement digital en Afrique de l'Ouest, spécialiste du marché béninois.
Tu analyses les données d'une startup de recrutement premium (Talenco.bj) et fournis des insights actionnables.
Réponds en français, de manière structurée et concise. Utilise **gras** pour les points clés.
Ne dépasse pas 400 mots. Sois direct et pratique.`;

  const userMessage = `Voici les données actuelles de Talenco.bj :
${JSON.stringify(metrics, null, 2)}

Contexte : Plateforme de recrutement premium au Bénin, actuellement en phase bêta (accès gratuit 10 semaines, jusqu'au 12/07/2026).
Modèle économique post-bêta : candidats 1 000 FCFA/mois, entreprises en crédits (Starter 10 crédits / 10 000 FCFA, Growth 30 crédits / 25 000 FCFA, Business 100 crédits / 75 000 FCFA).

${prompt}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic API error:', err);
      return res.status(502).json({ error: 'Erreur API Anthropic : ' + (err.error?.message || 'Inconnue') });
    }

    const data     = await response.json();
    const analysis = data.content?.[0]?.text || 'Aucune réponse générée.';
    return res.status(200).json({ analysis });
  } catch (err) {
    console.error('admin-ai-analysis error:', err);
    return res.status(500).json({ error: 'Erreur serveur lors de l\'appel IA.' });
  }
};
