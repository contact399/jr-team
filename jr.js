/* JR Team app — shared sign-in, menu and server bridge for every page.
 * Pages were built for Google's "google.script.run"; this file provides the same
 * thing, but talks to the JR Team API over the normal web, so links open on any phone. */
(function () {
  var API = 'https://script.google.com/macros/s/AKfycbxOzbHurdAYRDZyKhhbwucdx2fFdLX2hLass8LcaIbxJeYs9rIwNgJMqJIfPhRh2y8C/exec';
  var MOD = window.JR_MOD || 'tasks';
  var APPS = [
    { id: 'tasks', label: 'Tasks', href: 'index.html' },
    { id: 'captions', label: 'Instagram', href: 'captions.html' },
    { id: 'auction', label: 'Auction', href: 'auction.html' },
    { id: 'bins', label: 'Bins', href: 'bins.html' },
    { id: 'melt', label: 'Melt', href: 'melt.html' },
    { id: 'pearl', label: 'Pearl Chau', href: 'pearl.html' },
    { id: 'reg', label: 'Register', href: 'register.html' },
    { id: 'calls', label: 'Requests', href: 'calls.html' }
  ];
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }

  var JR = window.JR = {
    token: function () { return get('jr_token'); },
    name: function () { return get('jr_name'); },
    signOut: function () {
      ['jr_token', 'jr_pin', 'jr_apps', 'jr_list_cache', 'jr_cache'].forEach(function (k) { set(k, null); });
      try { sessionStorage.removeItem('jr_token'); } catch (e) {}
      if (MOD !== 'tasks') location.replace('index.html'); else location.reload();
    },
    rpc: function (mod, fn, args) {
      var body = JSON.stringify({ m: mod, f: fn, a: args || [], t: JR.token() || '' });
      return fetch(API, {
        method: 'POST', body: body, redirect: 'follow', credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      }).then(function (r) {
        if (!r.ok) throw new Error('Server error (' + r.status + '). Try again.');
        return r.json();
      }, function () {
        throw new Error('No connection. Check your internet and try again.');
      }).then(function (j) {
        if (j.ok) return j.r;
        if (j.e === 'AUTH' || /SESSION_EXPIRED|PIN: Please sign in/.test(j.e || '')) { JR.signOut(); throw new Error('Please sign in again.'); }
        throw new Error(j.e || 'Something went wrong.');
      });
    }
  };

  /* google.script.run look-alike */
  function runner(h) {
    return new Proxy({}, {
      get: function (_, k) {
        if (k === 'withSuccessHandler') return function (f) { return runner({ ok: f, fail: h.fail, uo: h.uo }); };
        if (k === 'withFailureHandler') return function (f) { return runner({ ok: h.ok, fail: f, uo: h.uo }); };
        if (k === 'withUserObject') return function (o) { return runner({ ok: h.ok, fail: h.fail, uo: o }); };
        return function () {
          var args = [].slice.call(arguments);
          if (MOD === 'captions' && k === 'setupStatus') {   // nothing to check: sign-in is shared
            setTimeout(function () { if (h.ok) h.ok({ needsSetup: false }, h.uo); }, 0);
            return;
          }
          JR.rpc(MOD, String(k), args).then(function (r) {
            if (h.ok) h.ok(r, h.uo);
            if (MOD === 'tasks' && k === 'login' && r && r.token) { set('jr_name', r.name); }
          }, function (e) { if (h.fail) h.fail(e, h.uo); });
        };
      }
    });
  }
  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', { get: function () { return runner({}); }, configurable: true });

  /* other pages need a sign-in from the Tasks page first */
  if (MOD !== 'tasks') {
    var t = JR.token();
    if (!t) { location.replace('index.html'); return; }
    set('jr_pin', t);                                    // Auction page reads this
    try { sessionStorage.setItem('jr_token', t); } catch (e) {}
  }

  /* top menu bar on the other pages (Tasks has its own side menu) */
  /* ---- Luxury jeweller look (ivory, deep green, gold). Turn off: ?look=classic ---- */
  (function () {
    var q = /[?&]look=(classic|lux)/.exec(location.search);
    if (q) set('jr_look', q[1]);
  })();
  var LUX = get('jr_look') !== 'classic';
  function theme() {
    if (!LUX) return;
    var f = document.createElement('link'); f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&display=swap';
    document.head.appendChild(f);
    var SERIF = '"Cormorant Garamond",Georgia,serif', SANS = '"Public Sans",system-ui,-apple-system,"Segoe UI",sans-serif';
    var v = {
      bg: '#F7F3EA', surface: '#FFFDF8', card: '#FFFDF8', sunk: '#F1EBDD', input: '#FFFDF8', soft: '#F1EBDD',
      ink: '#1C2420', fg: '#1C2420', muted: '#5B6660', mute: '#5B6660',
      line: '#E2D9C6', 'input-line': '#D6CBB3',
      accent: '#1F3D33', acc: '#1F3D33', navy: '#1F3D33', 'accent-ink': '#FFFFFF',
      'accent-soft': '#E6EDE8', 'acc-soft': '#E6EDE8', 'blue-soft': '#E6EDE8',
      gold: '#A8823F', brass: '#A8823F', 'gold-soft': '#F3EAD6', 'brass-soft': '#F3EAD6',
      display: SERIF, 'f-display': SERIF, body: SANS, 'f-body': SANS
    };
    var c = 'html:root,html:root body{color-scheme:light;';
    for (var k in v) c += '--' + k + ':' + v[k] + '!important;';
    c += '}'
      + 'html body{background:#F7F3EA!important;color:#1C2420;font-family:' + SANS + '}'
      + 'h1,h2,h3,.title,.brand{font-family:' + SERIF + '!important;letter-spacing:.01em;color:#1C2420}'
      + 'h1{font-weight:600!important}'
      + 'button.primary,.btn.primary,.btn-primary,button[type=submit]{background:#1F3D33!important;border-color:#1F3D33!important;color:#fff!important}'
      + 'input:focus,select:focus,textarea:focus{outline-color:#A8823F!important}'
      + '::selection{background:#E9DDBF}';
    if (MOD === 'tasks') c +=
        '#rail .railhd,#rail .raildiv,#rail #apps a.appbtn,header #out{display:none!important}'
      + '#tabs a[data-p]:not([data-p="Karan"]){display:none!important}'
      + '.wrap.wide{padding-left:inherit!important}'
      + '.shell.hasrail{flex-direction:column!important;gap:14px!important}'
      + '.shell.hasrail .rail{position:static!important;width:auto!important;height:auto!important;flex-direction:row!important;flex-wrap:wrap;gap:6px!important;border:0!important;padding:0!important;background:none!important;box-shadow:none!important}'
      + '.rail nav,.rail .apps{flex-direction:row!important;flex-wrap:wrap!important;gap:6px!important}'
      + '.rail nav a,.rail .appbtn{border:1px solid #E2D9C6!important;border-radius:999px!important;background:#FFFDF8!important;padding:7px 14px!important;width:auto!important}'
      + '.rail nav a .sh,.rail .appbtn .sh{display:none!important}.rail nav a .lb,.rail .appbtn .lb{display:inline!important}'
      + '.rail nav a[aria-current=page],.rail .appbtn[aria-current=page]{background:#1F3D33!important;color:#fff!important;border-color:#1F3D33!important}'
      + '.rail nav a[aria-current=page] .n{color:#D9BE85!important}';
    var st = document.createElement('style'); st.id = 'jrtheme'; st.textContent = c;
    document.head.appendChild(st);
  }

  function bar() {
    theme();
    if (MOD === 'tasks' && !LUX) return;
    var allowed = null;
    try { allowed = JSON.parse(get('jr_apps') || 'null'); } catch (e) {}
    var css = document.createElement('style');
    css.textContent = LUX
      ? '#jrbar{position:fixed;top:0;left:0;right:0;z-index:50;height:52px;display:flex;align-items:center;gap:2px;'
      + 'padding:0 10px;padding-top:env(safe-area-inset-top,0px);box-sizing:content-box;background:#1F3D33;color:#F7F3EA;font:500 14px "Public Sans",system-ui,sans-serif;overflow-x:auto;white-space:nowrap;box-shadow:0 1px 0 #A8823F}'
      + '#jrbar .br{font:600 19px "Cormorant Garamond",Georgia,serif;color:#D9BE85;padding:0 14px 0 4px;letter-spacing:.03em}'
      + '#jrbar a{color:#E6E1D3;text-decoration:none;padding:0 11px;min-height:40px;display:inline-flex;align-items:center;border-bottom:2px solid transparent}'
      + '#jrbar a[aria-current=page]{color:#fff;border-bottom-color:#D9BE85;font-weight:600}'
      + '#jrbar .sp{flex:1}#jrbar .so{color:#B9C4BC;font-size:13px}'
      + 'html body{padding-top:calc(52px + env(safe-area-inset-top,0px))!important}'
      + 'nav[aria-label=Sections]{top:calc(52px + env(safe-area-inset-top,0px))!important}'
      : '#jrbar{position:fixed;top:0;left:0;right:0;z-index:50;height:46px;display:flex;align-items:center;gap:4px;'
      + 'padding:0 8px;padding-top:env(safe-area-inset-top,0px);box-sizing:content-box;background:#1b2130;color:#fff;font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif;overflow-x:auto;white-space:nowrap}'
      + '#jrbar a{color:#dfe6f3;text-decoration:none;padding:0 12px;min-height:36px;display:inline-flex;align-items:center;border-radius:8px}'
      + '#jrbar a[aria-current=page]{background:#fff;color:#1b2130}'
      + '#jrbar .sp{flex:1}'
      + 'html body{padding-top:calc(46px + env(safe-area-inset-top,0px))!important}'
      + 'nav[aria-label=Sections]{top:calc(46px + env(safe-area-inset-top,0px))!important}';
    document.head.appendChild(css);
    var b = document.createElement('div'); b.id = 'jrbar'; b.setAttribute('role', 'navigation'); b.setAttribute('aria-label', 'Apps');
    if (LUX) { var br = document.createElement('span'); br.className = 'br'; br.textContent = 'Jupiter Rain'; b.appendChild(br); }
    APPS.forEach(function (a) {
      if (allowed && allowed.indexOf(a.id) < 0) return;
      var x = document.createElement('a'); x.href = a.href; x.textContent = a.label;
      if (a.id === MOD) x.setAttribute('aria-current', 'page');
      b.appendChild(x);
    });
    var sp = document.createElement('span'); sp.className = 'sp'; b.appendChild(sp);
    var so = document.createElement('a'); so.href = '#'; so.className = 'so'; so.textContent = 'Sign out';
    so.onclick = function (e) { e.preventDefault(); JR.rpc('tasks', 'logout', [JR.token()]).catch(function () {}).then(JR.signOut); };
    b.appendChild(so);
    document.body.insertBefore(b, document.body.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();

  /* remember which parts this person may open (for the menu) */
  if (JR.token()) setTimeout(function () {             // after the page's own loading
    JR.rpc('auth', 'me', []).then(function (r) { if (r && r.apps) set('jr_apps', JSON.stringify(r.apps)); }).catch(function () {});
  }, get('jr_apps') ? 4000 : 0);

  /* lets the phone add it to the home screen */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
