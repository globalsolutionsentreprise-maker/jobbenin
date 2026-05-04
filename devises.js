/**
 * devises.js — Talenco.bj
 * Conversion FCFA / EUR / USD.
 * Le franc CFA (XOF) est arrimé à l'euro : 1 EUR = 655.957 FCFA (fixe).
 * Le taux USD est approximatif et mis à jour manuellement si besoin.
 */
window.Devises = (function () {
  const RATES = {
    FCFA: 1,
    EUR:  655.957,   // 1 EUR = 655.957 FCFA (taux fixe officiel)
    USD:  600        // 1 USD ≈ 600 FCFA (approximatif, mise à jour manuelle)
  };

  const SYMBOLS = { FCFA: 'FCFA', EUR: '€', USD: '$' };

  function toFCFA(amount, currency) {
    return Math.round(amount * RATES[currency]);
  }

  function fromFCFA(amount, currency) {
    return Math.round(amount / RATES[currency]);
  }

  function convert(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount;
    const fcfa = toFCFA(amount, fromCurrency);
    return fromFCFA(fcfa, toCurrency);
  }

  function format(amount, currency) {
    const sym = SYMBOLS[currency] || currency;
    if (currency === 'FCFA') {
      return amount.toLocaleString('fr-FR') + ' ' + sym;
    } else if (currency === 'EUR') {
      return sym + '\u202f' + amount.toLocaleString('fr-FR');
    } else {
      return sym + amount.toLocaleString('en-US');
    }
  }

  /**
   * Retourne les 3 représentations d'un montant en FCFA.
   * Ex : tripleDisplay(300000, 'FCFA') →
   *   { fcfa: '300 000 FCFA', eur: '457 €', usd: '$500' }
   */
  function tripleDisplay(amount, sourceCurrency) {
    const fcfaVal = toFCFA(amount, sourceCurrency);
    return {
      fcfa: format(fcfaVal, 'FCFA'),
      eur:  format(fromFCFA(fcfaVal, 'EUR'), 'EUR'),
      usd:  format(fromFCFA(fcfaVal, 'USD'), 'USD'),
    };
  }

  /**
   * Render un bloc triple devise HTML.
   * primary = devise saisie (mise en avant)
   */
  function renderTriple(min, max, currency, period) {
    const minF = tripleDisplay(min, currency);
    const maxF = max ? tripleDisplay(max, currency) : null;

    const primaryMin = format(min, currency);
    const primaryMax = max ? format(max, currency) : null;
    const primaryStr = primaryMax ? `${primaryMin} – ${primaryMax}` : primaryMin;

    const fcfaMin = minF.fcfa; const fcfaMax = maxF ? maxF.fcfa : null;
    const eurMin  = minF.eur;  const eurMax  = maxF ? maxF.eur  : null;
    const usdMin  = minF.usd;  const usdMax  = maxF ? maxF.usd  : null;

    const fcfaStr = fcfaMax ? `${fcfaMin} – ${fcfaMax}` : fcfaMin;
    const eurStr  = eurMax  ? `${eurMin} – ${eurMax}`   : eurMin;
    const usdStr  = usdMax  ? `${usdMin} – ${usdMax}`   : usdMin;

    const per = period === 'an' ? '/ an' : '/ mois';

    // Si la devise principale est déjà FCFA, on n'affiche pas FCFA en secondaire
    const secondaries = [];
    if (currency !== 'FCFA') secondaries.push(`<span class="devise-secondary">${fcfaStr}</span>`);
    if (currency !== 'EUR')  secondaries.push(`<span class="devise-secondary">${eurStr}</span>`);
    if (currency !== 'USD')  secondaries.push(`<span class="devise-secondary">${usdStr}</span>`);

    return `<div class="salary-block">
  <div class="salary-primary">${primaryStr} <span class="salary-period">${per}</span></div>
  <div class="salary-alts">${secondaries.join('<span class="devise-sep">·</span>')}</div>
</div>`;
  }

  return { toFCFA, fromFCFA, convert, format, tripleDisplay, renderTriple, RATES, SYMBOLS };
})();
