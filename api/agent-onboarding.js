export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `Tu es l'assistant commercial de Talenco.bj, plateforme de recrutement premium au Bénin.

Ton rôle : aider les entreprises à comprendre comment fonctionne Talenco et les inciter à acheter des crédits.

INFORMATIONS EXACTES SUR TALENCO :

Système de crédits (pay-as-you-go, les crédits n'expirent jamais) :
- Pack Starter : 10 crédits pour 10 000 FCFA
- Pack Growth : 30 crédits pour 25 000 FCFA
- Pack Business : 100 crédits pour 75 000 FCFA

Coût des actions :
- Publier une offre d'emploi : 2 crédits
- Consulter un CV candidat : 1 crédit
- Contacter un candidat : 1 crédit
- Tableau kanban de suivi + rapports : inclus gratuitement

Candidats sur la plateforme :
- Profils vérifiés, basés au Bénin
- Abonnement mensuel 1 000 FCFA/mois (ils sont donc sérieux et motivés)

Processus :
1. L'entreprise achète un pack de crédits
2. Elle publie ses offres
3. Elle consulte les candidats correspondants
4. Elle les contacte directement depuis la plateforme

RÈGLES DE CONDUITE :
- Réponds toujours en français
- Sois concis, professionnel, jamais condescendant
- Ne donne jamais d'information non listée ci-dessus
- Si tu ne sais pas, dis : "Je vous recommande de contacter notre équipe à contact@talenco.bj"
- Ne mentionne jamais de concurrents
- Oriente toujours vers l'achat de crédits quand c'est naturel`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { message, history = [] } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-6),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 512,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Groq API error:', err);
      return new Response(JSON.stringify({ error: 'Erreur API' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content ?? "Je n'ai pas pu générer une réponse.";

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Agent onboarding error:', err);
    return new Response(JSON.stringify({ error: 'Erreur serveur' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
