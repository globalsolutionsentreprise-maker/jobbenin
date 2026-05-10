export const config = { runtime: 'edge' };

// Dispatche sur ?type=coach|lettre|onboarding
const GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function groq(body) {
  const res = await fetch(GROQ, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  return res.json();
}

// ── Coach CV ──────────────────────────────────────────────────────────────────
const SYSTEM_COACH = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Analyse le CV fourni et retourne une évaluation structurée.

Réponds UNIQUEMENT en JSON valide avec ce format exact :
{
  "score": 72,
  "points_forts": ["point fort 1", "point fort 2", "point fort 3"],
  "conseils": [
    {
      "priorite": "haute",
      "titre": "Titre court du conseil",
      "conseil": "Description concrète et actionnable (2-3 phrases max)",
      "exemple": "Exemple concret de reformulation ou d'action"
    }
  ]
}

Règles :
- score : entier entre 0 et 100 (sois honnête)
- points_forts : 2 à 3 éléments positifs réels du CV
- conseils : exactement 4 conseils, priorite ∈ ["haute", "moyenne"]
- Conseils spécifiques au contenu du CV, pas des généralités
- Adapté au marché du travail béninois (secteurs, niveaux de rémunération, attentes locales)
- Ton encourageant mais direct`;

async function handleCoach(req) {
  const { cvText } = await req.json();
  if (!cvText || typeof cvText !== 'string' || cvText.trim().length < 50)
    return json({ error: 'Texte du CV trop court ou manquant' }, 400);
  const data = await groq({
    max_tokens: 1024, temperature: 0.6,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_COACH },
      { role: 'user', content: `Voici le CV à analyser :\n\n${cvText.slice(0, 6000)}` },
    ],
  });
  const analyse = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
  return json({ success: true, analyse });
}

// ── Lettre de motivation ──────────────────────────────────────────────────────
const SYSTEM_LETTRE = `Tu es un expert RH spécialisé dans le marché de l'emploi béninois.
Rédige une lettre de motivation professionnelle, personnalisée et convaincante.

Règles :
- Entre 200 et 280 mots, ton professionnel et chaleureux
- Adapté au contexte béninois (formules de politesse locales, références au marché local si pertinent)
- Commence directement par "Madame, Monsieur," (pas d'objet, pas d'en-tête)
- 3 paragraphes : accroche sur le poste, valeur ajoutée du candidat, conclusion avec call to action
- Intègre naturellement les compétences et le titre du candidat
- Termine par "Veuillez agréer, Madame, Monsieur, l'expression de mes salutations distinguées."
- Réponds UNIQUEMENT avec le texte de la lettre, aucun commentaire autour`;

async function handleLettre(req) {
  const { jobTitle, jobDescription, jobRequirements, sector, city,
          candidatNom, candidatTitre, candidatBio, candidatCompetences } = await req.json();
  if (!jobTitle) return json({ error: 'Titre du poste manquant' }, 400);
  const userPrompt = `Rédige une lettre de motivation pour :

POSTE :
- Titre : ${jobTitle}
- Ville : ${city ?? 'Bénin'}
- Secteur : ${sector ?? 'non précisé'}
${jobDescription ? `- Description : ${jobDescription.slice(0, 500)}` : ''}
${jobRequirements ? `- Profil recherché : ${jobRequirements.slice(0, 300)}` : ''}

CANDIDAT :
- Nom : ${candidatNom ?? 'le/la candidat(e)'}
- Titre actuel : ${candidatTitre ?? 'non précisé'}
${candidatBio ? `- Bio : ${candidatBio}` : ''}
${candidatCompetences ? `- Compétences : ${candidatCompetences}` : ''}`;

  const data = await groq({
    max_tokens: 600, temperature: 0.7,
    messages: [
      { role: 'system', content: SYSTEM_LETTRE },
      { role: 'user', content: userPrompt },
    ],
  });
  const lettre = data.choices?.[0]?.message?.content?.trim() ?? '';
  return json({ success: true, lettre });
}

// ── Onboarding entreprise ─────────────────────────────────────────────────────
const SYSTEM_ONBOARDING = `Tu es l'assistant commercial de Talenco.bj, plateforme de recrutement premium au Bénin.

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

async function handleOnboarding(req) {
  const { message, history = [] } = await req.json();
  if (!message || typeof message !== 'string') return json({ error: 'Message requis' }, 400);
  const data = await groq({
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_ONBOARDING },
      ...history.slice(-6),
      { role: 'user', content: message },
    ],
  });
  const reply = data.choices?.[0]?.message?.content ?? "Je n'ai pas pu générer une réponse.";
  return json({ reply });
}

// ── Router ────────────────────────────────────────────────────────────────────
export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const type = new URL(req.url).searchParams.get('type');
  try {
    if (type === 'coach')     return await handleCoach(req);
    if (type === 'lettre')    return await handleLettre(req);
    if (type === 'onboarding') return await handleOnboarding(req);
    return json({ error: 'type invalide : coach | lettre | onboarding' }, 400);
  } catch (e) {
    console.error('agent error:', e);
    return json({ error: 'Erreur serveur' }, 500);
  }
}
