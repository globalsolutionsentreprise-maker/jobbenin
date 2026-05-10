/**
 * build.js — Talenco.bj
 * Génère dist/ avec JS obfusqué. Vercel sert les fichiers statiques depuis dist/.
 * Les fonctions API (api/) restent à la racine et sont gérées séparément par Vercel.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const { obfuscate } = require('javascript-obfuscator');

// ── Fichiers / dossiers exclus du dist ───────────────────────────────────────
const EXCLUDE = new Set([
  'node_modules', 'dist', 'api', 'lib', 'supabase',
  'build.js', 'package.json', 'package-lock.json',
  'vercel.json', 'CLAUDE.md',
  'qa-test.js', 'bug-report.js',
  'snippet-ajouter-offre.js', 'snippet-whatsapp-ajouter-offre.js',
  'snippet-badge-integration.md', 'snippet-candidature-integration.md',
  'entreprises.html.patch',
]);

// ── Options d'obfuscation ─────────────────────────────────────────────────────
const OPTS = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: false,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersType: 'variable',
  stringArrayThreshold: 0.75,
  unicodeEscapeSequence: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryObfuscate(code, ctx) {
  try {
    return obfuscate(code, OPTS).getObfuscatedCode();
  } catch (e) {
    console.warn(`  ⚠  skip (${ctx}): ${e.message.slice(0, 100)}`);
    return code;
  }
}

function processFile(src, dest) {
  const ext = path.extname(src).toLowerCase();

  if (ext === '.html') {
    let html = fs.readFileSync(src, 'utf8');

    // Mise à jour copyright
    html = html.replace(/©\s*2025\s*Talenco\.bj(?!\s*—)/g,
      '© 2026 Talenco.bj — Tous droits réservés');
    html = html.replace(/©\s*2025\s*Talenco\.bj\s*—\s*Bénin/g,
      '© 2026 Talenco.bj — Tous droits réservés · Bénin');

    // Obfuscation des scripts inline (pas les src=externe ni les JSON-LD)
    html = html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi,
      (match, attrs, code) => {
        if (/\bsrc\s*=/i.test(attrs)) return match;
        if (!code.trim()) return match;
        const tm = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
        if (tm && !['text/javascript', 'application/javascript']
            .includes(tm[1].toLowerCase())) return match;
        const obf = tryObfuscate(code.trim(), path.basename(src) + ' inline');
        return `<script${attrs}>\n${obf}\n</script>`;
      });

    fs.writeFileSync(dest, html);

  } else if (ext === '.js') {
    const code = fs.readFileSync(src, 'utf8');
    fs.writeFileSync(dest, tryObfuscate(code, path.basename(src)));

  } else {
    fs.copyFileSync(src, dest);
  }
}

function processDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir)) {
    if (entry.startsWith('.')) continue;
    if (EXCLUDE.has(entry)) continue;
    const srcPath  = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      processDir(srcPath, destPath);
    } else {
      process.stdout.write(`  ${entry.padEnd(40)}`);
      processFile(srcPath, destPath);
      console.log('✓');
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('\nBuild Talenco.bj → dist/\n');
const DIST = path.join(__dirname, 'dist');
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
processDir(__dirname, DIST);
console.log('\n✅  dist/ prêt.\n');
