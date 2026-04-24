import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb = createClient(SUPA_URL, SUPA_KEY);

// ── Vérifier si un article existe déjà ──
async function newsExists(url: string): Promise<boolean> {
  try {
    const { data } = await sb.from('news').select('id').eq('url', url).single();
    return !!data;
  } catch { return false; }
}

// ── Parser un flux RSS XML ──
async function parseRSS(feedUrl: string, sourceName: string, category: string): Promise<number> {
  let inserted = 0;
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Talenco-NewsBot/1.0; +https://talenco.bj)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      }
    });

    if (!res.ok) {
      console.error(`RSS ${sourceName}: HTTP ${res.status}`);
      return 0;
    }

    const xml = await res.text();

    // Extraire les items du flux RSS
    const itemMatches = xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi);

    for (const match of itemMatches) {
      const item = match[1];

      // Extraire titre
      const titleMatch = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : null;
      if (!title || title.length < 10) continue;

      // Extraire URL
      const linkMatch = item.match(/<link[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^\s<\]]+)(?:\]\]>)?<\/link>/i)
        || item.match(/<guid[^>]*>(?:<!\[CDATA\[)?(https?:\/\/[^\s<\]]+)(?:\]\]>)?<\/guid>/i);
      const url = linkMatch ? linkMatch[1].trim() : null;
      if (!url) continue;

      // Extraire résumé
      const descMatch = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
      const summary = descMatch
        ? descMatch[1].replace(/<[^>]+>/g, '').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim().slice(0, 300)
        : null;

      // Extraire date
      const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
      const published_at = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : new Date().toISOString();

      // Vérifier doublon
      if (await newsExists(url)) continue;

      // Insérer dans news
      const { error } = await sb.from('news').insert({
        title: title.slice(0, 250),
        summary: summary || null,
        url,
        source_name: sourceName,
        category,
        published_at,
        is_active: true,
      });

      if (!error) {
        inserted++;
        console.log(`✅ ${sourceName}: ${title.slice(0, 60)}...`);
      }

      if (inserted >= 10) break; // Max 10 articles par source
    }

  } catch (err) {
    console.error(`Erreur RSS ${sourceName}:`, err);
  }

  return inserted;
}

// ══════════════════════════════════════
// SOURCE 1 : Jeune Afrique (HTML scraping car pas de RSS public)
// ══════════════════════════════════════
async function scrapeJeuneAfrique(): Promise<number> {
  let inserted = 0;
  try {
    const res = await fetch('https://www.jeuneafrique.com/rubriques/economie-entreprises/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Talenco-Bot/1.0)' }
    });
    const html = await res.text();

    const matches = html.matchAll(/<h[1-4][^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    for (const match of matches) {
      const url = match[1].startsWith('http') ? match[1] : 'https://www.jeuneafrique.com' + match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 10) continue;
      if (!url.includes('jeuneafrique.com')) continue;
      if (await newsExists(url)) continue;

      const { error } = await sb.from('news').insert({
        title: title.slice(0, 250),
        summary: 'Jeune Afrique — Économie & Entreprises : ' + title.slice(0, 150),
        url,
        source_name: 'Jeune Afrique',
        category: 'Afrique',
        published_at: new Date().toISOString(),
        is_active: true,
      });

      if (!error) inserted++;
      if (inserted >= 10) break;
    }
  } catch (err) {
    console.error('Jeune Afrique error:', err);
  }
  return inserted;
}

// ══════════════════════════════════════
// SOURCE 4 : ANPE Bénin (anpe.bj)
// ══════════════════════════════════════
async function scrapeANPE(): Promise<number> {
  let inserted = 0;
  try {
    const res = await fetch('https://anpe.bj/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      }
    });

    if (!res.ok) { console.error('ANPE HTTP:', res.status); return 0; }
    const html = await res.text();

    // Chercher les liens d'actualités sur anpe.bj
    const patterns = [
      /href="(https?:\/\/anpe\.bj\/[^"]*(?:actualit|article|news|communiqu)[^"]*)"[^>]*>([^<]{10,200})</gi,
      /href="(\/[^"]*(?:actualit|article|news|communiqu)[^"]*)"[^>]*>([^<]{10,200})</gi,
      /<h[2-4][^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]{10,200})<\/a>/gi,
    ];

    const found: any[] = [];
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const url = match[1].startsWith('http') ? match[1] : 'https://anpe.bj' + match[1];
        const title = match[2].replace(/<[^>]+>/g, '').trim();
        if (title.length < 10 || title.length > 200) continue;
        if (!url.includes('anpe.bj')) continue;
        found.push({ url, title });
      }
    }

    // Dédupliquer
    const unique = found.filter((item, i, arr) => arr.findIndex(x => x.url === item.url) === i);

    for (const item of unique.slice(0, 10)) {
      if (await newsExists(item.url)) continue;
      const { error } = await sb.from('news').insert({
        title: item.title.slice(0, 250),
        summary: 'Actualité ANPE Bénin — ' + item.title.slice(0, 150),
        url: item.url,
        source_name: 'ANPE Bénin',
        category: 'Bénin',
        published_at: new Date().toISOString(),
        is_active: true,
      });
      if (!error) { inserted++; console.log('✅ ANPE:', item.title.slice(0, 60)); }
    }

  } catch (err) { console.error('ANPE error:', err); }
  return inserted;
}


async function scrapeHRGrapevine(): Promise<number> {
  return await parseRSS(
    'https://www.hrgrapevine.com/rss',
    'HR Grapevine',
    'RH Europe'
  );
}

// ══════════════════════════════════════
// SOURCE 3 : HR Dive (RSS) — remplace HR Executive
// ══════════════════════════════════════
async function scrapeHRDive(): Promise<number> {
  return await parseRSS(
    'https://www.hrdive.com/feeds/news/',
    'HR Dive',
    'RH USA'
  );
}

// ══════════════════════════════════════
// HANDLER PRINCIPAL
// ══════════════════════════════════════
Deno.serve(async (_req) => {
  const start = Date.now();
  console.log('Talenco News Scraper démarré:', new Date().toISOString());

  const [jeuneAfrique, anpe, hrGrapevine, hrDive] = await Promise.allSettled([
    scrapeJeuneAfrique(),
    scrapeANPE(),
    scrapeHRGrapevine(),
    scrapeHRDive(),
  ]);

  const results = {
    jeune_afrique: jeuneAfrique.status === 'fulfilled' ? jeuneAfrique.value : 0,
    anpe_benin: anpe.status === 'fulfilled' ? anpe.value : 0,
    hr_grapevine: hrGrapevine.status === 'fulfilled' ? hrGrapevine.value : 0,
    hr_dive: hrDive.status === 'fulfilled' ? hrDive.value : 0,
  };

  const total = Object.values(results).reduce((a, b) => a + b, 0);
  const duration = Date.now() - start;

  return new Response(JSON.stringify({
    success: true,
    duration_ms: duration,
    inserted: results,
    total_inserted: total,
    sources: [
      { name: 'Jeune Afrique', category: 'Afrique', articles: results.jeune_afrique },
      { name: 'ANPE Bénin', category: 'Bénin', articles: results.anpe_benin },
      { name: 'HR Grapevine', category: 'RH Europe', articles: results.hr_grapevine },
      { name: 'HR Dive', category: 'RH USA', articles: results.hr_dive },
    ],
    timestamp: new Date().toISOString(),
  }), { headers: { 'Content-Type': 'application/json' } });
});
