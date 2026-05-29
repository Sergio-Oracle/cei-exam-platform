/*
 * CEI — site_translator.js v8
 * Stratégie :
 *   1. localStorage stocke la langue choisie
 *   2. Cookie googtrans est synchronisé à chaque chargement
 *   3. Après init Google Translate, le combo est déclenché programmatiquement
 *   4. Le changement de langue recharge la page (uniquement si langue différente)
 */
(function () {
    'use strict';

    var LANGS      = ['fr', 'en', 'wo'];
    var DEFAULT    = 'fr';
    var PAGE_LANG  = 'fr';
    var gtLoaded   = false;

    /* ── utilitaires ─────────────────────────────────────────── */

    function normalize(code) {
        return LANGS.indexOf(code) !== -1 ? code : DEFAULT;
    }

    function getLang() {
        return normalize(localStorage.getItem('lang') || DEFAULT);
    }

    function setCookie(val) {
        var exp = 'expires=Fri, 31 Dec 9999 23:59:59 GMT';
        var host = window.location.hostname;
        document.cookie = 'googtrans=' + val + ';path=/;' + exp;
        if (host && host.indexOf('.') !== -1) {
            document.cookie = 'googtrans=' + val + ';path=/;domain=.' + host + ';' + exp;
        }
    }

    function syncCookie(code) {
        setCookie(code === PAGE_LANG ? '/fr/fr' : '/fr/' + code);
    }

    /* ── masquer tout élément UI Google Translate ────────────── */

    var GT_SEL = [
        'iframe.goog-te-banner-frame',
        'iframe.skiptranslate',
        'iframe[id^="goog"]',
        '.goog-te-banner-frame',
        '.goog-te-balloon-frame',
        '.goog-te-gadget',
        '.goog-te-gadget-icon',
        '.goog-te-gadget-simple',
        '.goog-te-spinner-pos',
        '.goog-te-spinner',
        '.goog-te-spinner-animation',
        '.goog-te-menu-frame',
        '.goog-te-menu2',
        '.goog-tooltip',
        '.goog-logo-link',
        '.skiptranslate',
        '#goog-gt-tt',
        '#google_translate_element',
        '#google_translate_element *',
        '[class*="VIpgJd"]',
        '[id*="goog-gt"]',
        '[id^="goog-gt"]',
        'body > .skiptranslate',
        '.goog-te-ftab-float'
    ].join(',');

    var GT_CSS =
        GT_SEL +
        '{display:none!important;visibility:hidden!important;height:0!important;' +
        'width:0!important;max-height:0!important;max-width:0!important;' +
        'opacity:0!important;pointer-events:none!important;overflow:hidden!important}' +
        'html,body,body.translated-ltr,body.translated-rtl' +
        '{top:0!important;position:static!important;margin-top:0!important}';

    function hideUI() {
        document.documentElement.style.setProperty('top', '0', 'important');
        if (!document.body) return;
        document.body.style.setProperty('top', '0', 'important');
        document.body.style.position = '';
        try {
            document.querySelectorAll(GT_SEL).forEach(function (el) {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('height', '0', 'important');
                el.style.setProperty('width', '0', 'important');
                el.style.setProperty('opacity', '0', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');
                el.style.setProperty('max-height', '0', 'important');
                el.style.setProperty('overflow', 'hidden', 'important');
            });
        } catch (e) {}
        if (document.body && document.body.style.top !== '0px') {
            document.body.style.removeProperty('top');
        }
    }

    function injectCSS() {
        if (document.getElementById('cei-gt-css')) return;
        var s = document.createElement('style');
        s.id = 'cei-gt-css';
        s.textContent = GT_CSS;
        document.head.appendChild(s);
    }

    /* ── déclencher la traduction via le combo Google ────────── */

    function applyCombo(code, attempts) {
        attempts = attempts === undefined ? 10 : attempts;
        var combo = document.querySelector('select.goog-te-combo');
        if (combo) {
            combo.value = (code === PAGE_LANG) ? '' : code;
            combo.dispatchEvent(new Event('change', { bubbles: true }));
            setTimeout(hideUI, 100);
            setTimeout(hideUI, 500);
            return;
        }
        if (attempts > 0) {
            setTimeout(function () { applyCombo(code, attempts - 1); }, 300);
        }
    }

    /* ── mise à jour des labels de langue dans la UI ─────────── */

    function updateLabels(code) {
        var flags = { fr: '🇫🇷', en: '🇬🇧', wo: '🇸🇳' };
        var names = { fr: 'FR', en: 'EN', wo: 'WO' };
        var label = (flags[code] || '🌐') + ' ' + (names[code] || code.toUpperCase());
        document.documentElement.lang = code;
        document.querySelectorAll('.lang-current-label, #landing-lang-label').forEach(function (el) {
            el.textContent = label;
        });
        document.querySelectorAll('.lang-option, .landing-lang-option').forEach(function (btn) {
            var oc = btn.getAttribute('onclick') || '';
            btn.classList.toggle('active',
                oc.indexOf("'" + code + "'") !== -1 || oc.indexOf('"' + code + '"') !== -1);
        });
    }

    /* ── changer la langue (cookie + reload si nécessaire) ───── */

    function setLanguage(code) {
        code = normalize(code);

        /* Guard : si même langue déjà active dans l'URL, pas de rechargement */
        var urlParam = null;
        try { urlParam = new URLSearchParams(window.location.search).get('_l'); } catch (e) {}
        if (code === getLang() && urlParam === code) {
            updateLabels(code);
            return;
        }

        localStorage.setItem('lang', code);
        syncCookie(code);

        var m = document.getElementById('landing-lang-menu');
        if (m) m.style.display = 'none';

        var url = window.location.href.split('?')[0].split('#')[0];
        window.location.replace(url + '?_l=' + code + '&_t=' + Date.now());
    }

    /* ── initialisation Google Translate ─────────────────────── */

    window.googleTranslateElementInit = function () {
        gtLoaded = true;
        new google.translate.TranslateElement({
            pageLanguage: PAGE_LANG,
            includedLanguages: 'fr,en',
            autoDisplay: false,
            layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        }, 'google_translate_element');

        var code = getLang();
        if (code !== PAGE_LANG) {
            setTimeout(function () { applyCombo(code); }, 500);
        }
        [300, 800, 1500, 3000, 5000].forEach(function (t) {
            setTimeout(hideUI, t);
        });
    };

    function loadGT() {
        if (document.getElementById('google_translate_element')) return;
        var holder = document.createElement('div');
        holder.id = 'google_translate_element';
        holder.style.cssText = 'position:fixed;left:-99999px;top:-99999px;height:0;width:0;overflow:hidden;opacity:0;pointer-events:none;';
        document.body.appendChild(holder);

        var sc = document.createElement('script');
        sc.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
        sc.async = true;
        sc.onerror = function () {
            console.warn('[CEI] Google Translate non disponible');
        };
        document.body.appendChild(sc);
    }

    /* ── gestion Wolof en natif (data-wo) ────────────────────── */

    function applyWolof() {
        document.querySelectorAll('[data-wo]').forEach(function (el) {
            el.textContent = el.getAttribute('data-wo');
        });
        document.querySelectorAll('[data-wo-placeholder]').forEach(function (el) {
            el.placeholder = el.getAttribute('data-wo-placeholder');
        });
    }

    function restoreOriginal() {
        document.querySelectorAll('[data-orig]').forEach(function (el) {
            el.textContent = el.getAttribute('data-orig');
        });
        document.querySelectorAll('[data-orig-placeholder]').forEach(function (el) {
            el.placeholder = el.getAttribute('data-orig-placeholder');
        });
    }

    /* ── init principale ─────────────────────────────────────── */

    function init() {
        injectCSS();

        var code = getLang();

        try {
            var urlParam = new URLSearchParams(window.location.search).get('_l');
            if (urlParam && LANGS.indexOf(urlParam) !== -1) {
                code = urlParam;
                localStorage.setItem('lang', code);
            }
        } catch (e) {}

        syncCookie(code);
        updateLabels(code);

        if (typeof landingApply === 'function') {
            landingApply(code);
        }

        if (code === 'wo') {
            applyWolof();
        } else if (code !== PAGE_LANG) {
            restoreOriginal();
            loadGT();
        }
        /* Si langue native (fr), pas besoin de Google Translate ni de nettoyage continu */

        /* Nettoyage limité — uniquement si GT est chargé (autre langue) */
        if (code !== PAGE_LANG) {
            var hideCount = 0;
            var hideTimer = setInterval(function () {
                hideUI();
                hideCount++;
                /* Arrêter après 20 secondes (25 × 800 ms) — GT a fini ses injections */
                if (hideCount >= 25) clearInterval(hideTimer);
            }, 800);

            /* MutationObserver avec debounce pour éviter des milliers d'appels */
            var _moTimer = null;
            new MutationObserver(function () {
                if (_moTimer) return;
                _moTimer = setTimeout(function () {
                    _moTimer = null;
                    hideUI();
                }, 200);
            }).observe(document.documentElement, {
                childList: true, subtree: true, attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
    }

    /* ── exposer l'API ───────────────────────────────────────── */

    window.setLang = setLanguage;
    window.landingSetLang = function (code) { setLanguage(code); };
    window.CEITranslate = { getLang: getLang, setLang: setLanguage };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
