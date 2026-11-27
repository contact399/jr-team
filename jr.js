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
    { id: 'calls', label: 'Calls & Orders', href: 'calls.html' }
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
  function bar() {
    if (MOD === 'tasks') return;
    var allowed = null;
    try { allowed = JSON.parse(get('jr_apps') || 'null'); } catch (e) {}
    var css = document.createElement('style');
    css.textContent = '#jrbar{position:fixed;top:0;left:0;right:0;z-index:50;height:46px;display:flex;align-items:center;gap:4px;'
      + 'padding:0 8px;padding-top:env(safe-area-inset-top,0px);box-sizing:content-box;background:#1b2130;color:#fff;font:600 14px system-ui,-apple-system,"Segoe UI",sans-serif;overflow-x:auto;white-space:nowrap}'
      + '#jrbar a{color:#dfe6f3;text-decoration:none;padding:0 12px;min-height:36px;display:inline-flex;align-items:center;border-radius:8px}'
      + '#jrbar a[aria-current=page]{background:#fff;color:#1b2130}'
      + '#jrbar .sp{flex:1}'
      + 'html body{padding-top:calc(46px + env(safe-area-inset-top,0px))!important}'
      + 'nav[aria-label=Sections]{top:calc(46px + env(safe-area-inset-top,0px))!important}';
    document.head.appendChild(css);
    var b = document.createElement('div'); b.id = 'jrbar'; b.setAttribute('role', 'navigation'); b.setAttribute('aria-label', 'Apps');
    APPS.forEach(function (a) {
      if (allowed && allowed.indexOf(a.id) < 0) return;
      var x = document.createElement('a'); x.href = a.href; x.textContent = a.label;
      if (a.id === MOD) x.setAttribute('aria-current', 'page');
      b.appendChild(x);
    });
    var sp = document.createElement('span'); sp.className = 'sp'; b.appendChild(sp);
    var so = document.createElement('a'); so.href = '#'; so.textContent = 'Sign out';
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
