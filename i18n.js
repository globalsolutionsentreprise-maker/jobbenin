/**
 * Talenco.bj — i18n engine
 * Supports FR (native) and EN.
 * data-i18n="key"      → textContent
 * data-i18n-html="key" → innerHTML
 * data-i18n-ph="key"   → placeholder
 */
(function () {
  var STORAGE_KEY = 'talenco_lang';
  var translations = null;

  function getLang() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'fr') return stored;
    return (navigator.language || '').startsWith('en') ? 'en' : 'fr';
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
  }

  function applyTranslations(t) {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (t[key] !== undefined) el.textContent = t[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-html');
      if (t[key] !== undefined) el.innerHTML = t[key];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-ph');
      if (t[key] !== undefined) el.placeholder = t[key];
    });
    // Update <title> if the page has a data-i18n-title on the <html> element
    var titleKey = document.documentElement.getAttribute('data-i18n-title');
    if (titleKey && t[titleKey]) document.title = t[titleKey];
    document.documentElement.lang = 'en';
  }

  function revertToFrench() {
    document.documentElement.lang = 'fr';
    // Reload page to restore all original French strings
    window.location.reload();
  }

  function updateButton(lang) {
    var btn = document.getElementById('i18n-toggle');
    if (!btn) return;
    btn.textContent = lang === 'en' ? 'FR' : 'EN';
    btn.title = lang === 'en' ? 'Passer en français' : 'Switch to English';
  }

  function injectButton(lang) {
    if (document.getElementById('i18n-toggle')) return;
    var btn = document.createElement('button');
    btn.id = 'i18n-toggle';
    btn.className = 'lang-btn';
    btn.textContent = lang === 'en' ? 'FR' : 'EN';
    btn.title = lang === 'en' ? 'Passer en français' : 'Switch to English';
    btn.addEventListener('click', function () {
      var current = getLang();
      var next = current === 'fr' ? 'en' : 'fr';
      setLang(next);
      if (next === 'en') {
        loadAndApply();
      } else {
        revertToFrench();
      }
    });
    var actions = document.querySelector('.navbar-actions');
    if (actions) {
      actions.insertBefore(btn, actions.firstChild);
    } else {
      var nav = document.querySelector('nav');
      if (nav) {
        btn.style.marginLeft = 'auto';
        nav.appendChild(btn);
      }
    }
  }

  function loadAndApply() {
    if (translations) {
      applyTranslations(translations);
      updateButton('en');
      return;
    }
    fetch('/i18n/en.json')
      .then(function (r) { return r.json(); })
      .then(function (t) {
        translations = t;
        applyTranslations(t);
        updateButton('en');
      })
      .catch(function (e) { console.warn('i18n load failed', e); });
  }

  function init() {
    var lang = getLang();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        injectButton(lang);
        if (lang === 'en') loadAndApply();
      });
    } else {
      injectButton(lang);
      if (lang === 'en') loadAndApply();
    }
  }

  init();
})();
