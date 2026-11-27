/* ======================= MOD_CALLS — Customer Calls & Orders (Karan only) =======================
 * Add as a NEW FILE named "Calls" in the "JR Team App - API" project, BELOW Code.gs and Register.
 * Nothing in Code.gs changes: this file plugs itself into the router as module "calls".
 * Data: Google Sheet "JR Calls & Orders (private)", created on first run in the deploying
 * account (contact@jupiterrain.com). Its id is kept in Script Property calls.SHEET_ID.
 * Uploadify is never written to: only its customer ID and link are stored here.
 *
 * Customers (add / edit, duplicate check, Uploadify link) and Review (Find missed requests, Import, Add / Skip → team tasks).
 * Script Properties used: calls.SHEET_ID (auto), calls.FIRE_URL + calls.FIRE_TOKEN (Find button),
 *   Claude API key: calls.ANTHROPIC_API_KEY, else the Auction page's auction.ANTHROPIC_API_KEY.
 */
var MOD_CALLS = (function () {
  var TZ = 'America/New_York';
  var P = PropertiesService.getScriptProperties();          // the real one; keys are prefixed "calls."
  var TABS = {
    Customers: ['id', 'name', 'company', 'phone', 'whatsapp', 'email', 'city', 'tags', 'notes',
                'uploadifyId', 'uploadifyUrl', 'summary', 'budgetRange', 'lastContact', 'created', 'updated'],
    Intake: ['id', 'source', 'sourceRef', 'receivedAt', 'kind', 'who', 'customerId', 'match', 'summary', 'alert',
             'details', 'tasks', 'link', 'partial', 'status', 'decidedAt', 'result', 'created', 'raw', 'direction', 'duration'],
    Calls: ['id', 'customerId', 'who', 'source', 'sourceRef', 'at', 'summary', 'details', 'intakeId', 'taskIds', 'created', 'raw', 'direction', 'duration'],
    Settings: ['key', 'value', 'updated']
  };
  var OWNERS = ['Karan', 'Leo', 'Shivansh', 'DD'];
  var KARAN_EMAIL = 'karan@jupiterrain.com';
  var EDIT = { Customers: ['name', 'company', 'phone', 'whatsapp', 'email', 'city', 'tags', 'notes', 'uploadifyId', 'uploadifyUrl'] };

  function now_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
  function ss_() {
    var id = P.getProperty('calls.SHEET_ID'), ss = null;
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
    if (!ss) {
      ss = SpreadsheetApp.create('JR Calls & Orders (private)');
      P.setProperty('calls.SHEET_ID', ss.getId());
      var first = ss.getSheets()[0]; first.setName('Customers');
      try { ss.addEditor(KARAN_EMAIL); } catch (e) {}   // so Claude (as karan@) can drop scan results into Intake
    }
    return ss;
  }
  function tab_(name) {
    var cols = TABS[name], ss = ss_(), sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() < 1 || String(sh.getRange(1, 1).getValue()) !== cols[0]) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');   // phones stay as typed
    } else if (String(sh.getRange(1, cols.length).getValue()) !== cols[cols.length - 1]) {   // new columns added in a later version
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
    }
    return sh;
  }
  function read_(name) {
    var cols = TABS[name], sh = tab_(name), last = sh.getLastRow();
    if (last < 2) return { sh: sh, rows: [] };
    var vals = sh.getRange(2, 1, last - 1, cols.length).getDisplayValues();
    return { sh: sh, rows: vals.filter(function (r) { return r[0]; }).map(function (r, i) {
      var o = { _row: i + 2 }; cols.forEach(function (c, j) { o[c] = r[j]; }); return o;
    }) };
  }
  function line_(o, cols) { return cols.map(function (c) { return o[c] == null ? '' : String(o[c]); }); }
  function lock_(fn) { var l = LockService.getScriptLock(); l.waitLock(25000); try { return fn(); } finally { l.releaseLock(); } }
  function out_(o) { var c = {}; Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; }); return c; }
  function txt_(v, n) { return String(v == null ? '' : v).replace(/^[=+\-@]/, function (m) { return m === '+' ? '+' : "'" + m; }).slice(0, n || 200).trim(); }
  function nextId_(rows, pre) {
    var max = 0; rows.forEach(function (r) { var m = String(r.id).match(/(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
    return pre + '-' + ('000' + (max + 1)).slice(-4);
  }

  /* ---- duplicate check (same rules as the page) ---- */
  function digits_(s) { return String(s || '').replace(/\D/g, ''); }
  function nm_(s) { return String(s || '').toLowerCase().replace(/\b(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function samePhone_(a, b) { a = digits_(a); b = digits_(b); return a.length >= 7 && b.length >= 7 && a.slice(-9) === b.slice(-9); }
  function dupes_(c, rows) {
    var n = nm_(c.name), e = String(c.email || '').toLowerCase().trim();
    return rows.filter(function (r) {
      if (r.id === c.id) return false;
      var why = [];
      if (n && nm_(r.name) === n) why.push('same name');
      if ([c.phone, c.whatsapp].some(function (p) { return p && (samePhone_(p, r.phone) || samePhone_(p, r.whatsapp)); })) why.push('same phone');
      if (e && String(r.email || '').toLowerCase().trim() === e) why.push('same email');
      if (c.uploadifyId && r.uploadifyId && String(c.uploadifyId).trim() === String(r.uploadifyId).trim()) why.push('same Uploadify ID');
      r._why = why.join(', ');
      return why.length > 0;
    }).map(function (r) { var o = out_(r); o.why = r._why; delete o._why; return o; });
  }

  /* ---- settings ---- */
  function getSet_() { var o = {}; read_('Settings').rows.forEach(function (r) { o[r.key] = r.value; }); return o; }
  function setSet_(k, v) {
    var t = read_('Settings'), r = t.rows.filter(function (x) { return x.key === k; })[0], line = [k, String(v), now_()];
    if (r) t.sh.getRange(r._row, 1, 1, 3).setValues([line]); else t.sh.appendRow(line);
  }
  function json_(s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } }
  function intakeOut_(r) {
    var o = out_(r); o.details = json_(r.details, []); o.tasks = json_(r.tasks, []); o.partial = r.partial === 'true' || r.partial === 'TRUE'; return o;
  }

  /* ---- actions ---- */
  function boot() {
    var cu = read_('Customers').rows.map(out_);
    var cut = Utilities.formatDate(new Date(Date.now() - 14 * 864e5), TZ, 'yyyy-MM-dd');
    var ik = read_('Intake').rows.filter(function (r) { return r.status === 'pending' || String(r.decidedAt) >= cut; }).map(intakeOut_);
    var st = getSet_(); if (!st.syncKey) setSet_('syncKey', Utilities.getUuid().replace(/-/g, ''));
    var calls = read_('Calls').rows.map(out_).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, 300)
      .map(function (c) { c.details = json_(c.details, []); return c; });
    var tasks = [];
    try {
      var tv = tasksSheet_().getDataRange().getDisplayValues(); tv.shift();
      tv.forEach(function (r) { var m = String(r[4] || '').match(/^\[(CALL-\d+)\]/); if (m) tasks.push({ id: r[0], owner: r[1], text: r[3], due: r[5], done: r[7] === 'true' || r[7] === 'TRUE', doneAt: r[8], callId: m[1] }); });
    } catch (e) {}
    return { me: JR__name, now: now_(), customers: cu, intake: ik, calls: calls, tasks: tasks, sheetUrl: ss_().getUrl(),
      lastScan: st.lastScan || '', scanRequested: st.scanRequested || '', scanLinked: !!(P.getProperty('calls.FIRE_URL') && P.getProperty('calls.FIRE_TOKEN')) };
  }

  /* ---- Review: Add / Skip ---- */
  function pushTask_(sh, owner, text, notes, due, urgent) {
    var d = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), id = Utilities.getUuid().slice(0, 13);
    owner = OWNERS.indexOf(owner) >= 0 ? owner : 'Karan';
    var row = [id, owner, owner === 'Karan' ? (urgent ? 'Urgent Admin' : 'Med Priority') : '', txt_(text, 300), txt_(notes, 500),
      /^\d{4}-\d{2}-\d{2}$/.test(String(due || '')) ? due : '', d, 'false', '', owner === 'Karan' ? '' : 'Karan', owner === 'Karan' ? '' : d, ''];
    sh.appendRow(row);
    return id;
  }
  function tasksSheet_() {
    var id = P.getProperty('tasks.SHEET_ID'); if (!id) throw new Error('The team task list was not found.');
    return SpreadsheetApp.openById(id).getSheetByName('Tasks');
  }
  function decideIntake(id, action, edit) {
    edit = edit || {};
    return lock_(function () {
      var t = read_('Intake'), cols = TABS.Intake, r = t.rows.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new Error('That card was not found. Refresh and try again.');
      if (r.status !== 'pending') return { card: intakeOut_(r), already: true };
      if (action === 'skip') { r.status = 'skipped'; r.decidedAt = now_(); }
      else if (action === 'add') {
        var summary = edit.summary != null ? txt_(edit.summary, 3000) : r.summary;
        var tasks = Array.isArray(edit.tasks) ? edit.tasks : json_(r.tasks, []);
        // customer: use the match, or add a new one when asked
        var cuT = read_('Customers'), cust = r.customerId ? cuT.rows.filter(function (c) { return c.id === r.customerId; })[0] : null;
        if (!cust && edit.customerId) cust = cuT.rows.filter(function (c) { return c.id === edit.customerId; })[0];
        if (!cust && edit.addCustomer) {
          var isPhone = /^[+\d][\d\s().-]{6,}$/.test(r.who);
          var nc = { id: nextId_(cuT.rows, 'CUS'), name: r.who, phone: isPhone ? r.who : '', created: now_(), updated: now_(), notes: 'Added from Review (' + r.source + ')', lastContact: String(r.receivedAt || '').slice(0, 16) };
          cuT.sh.appendRow(line_(nc, TABS.Customers)); cuT.rows.push(nc); cust = nc;
        }
        var name = cust ? cust.name : r.who, callT = read_('Calls'), callId = nextId_(callT.rows, 'CALL');
        var ts = tasksSheet_(), ids = tasks.filter(function (k) { return k && k[0]; }).map(function (k) {
          return pushTask_(ts, k[1], k[0], '[' + callId + '] ' + name + ' · ' + r.source, k[2], !!k[3]);
        });
        callT.sh.appendRow(line_({ id: callId, customerId: cust ? cust.id : '', who: name, source: r.source, sourceRef: r.sourceRef, at: r.receivedAt,
          summary: summary, details: r.details, intakeId: r.id, taskIds: ids.join(','), created: now_(), raw: r.raw, direction: r.direction, duration: r.duration }, TABS.Calls));
        var callOut = { id: callId, customerId: cust ? cust.id : '', who: name, source: r.source, at: r.receivedAt, summary: summary, details: json_(r.details, []), taskIds: ids.join(','), raw: r.raw, direction: r.direction, duration: r.duration };
        if (cust && cust._row) { var lc = String(r.receivedAt || now_()).slice(0, 16); if (!cust.lastContact || lc > cust.lastContact) cuT.sh.getRange(cust._row, TABS.Customers.indexOf('lastContact') + 1).setValue(lc); }
        r.status = 'added'; r.decidedAt = now_(); r.summary = summary; r.tasks = JSON.stringify(tasks);
        r.customerId = cust ? cust.id : ''; r.result = callId + (ids.length ? ' · ' + ids.length + ' tasks' : '');
      } else throw new Error('Unknown choice.');
      t.sh.getRange(r._row, 1, 1, cols.length).setValues([line_(r, cols)]);
      return { card: intakeOut_(r), customers: read_('Customers').rows.map(out_), call: typeof callOut === 'undefined' ? null : callOut };
    });
  }
  function undoIntake(id) {
    return lock_(function () {
      var t = read_('Intake'), r = t.rows.filter(function (x) { return x.id === id; })[0];
      if (!r || r.status !== 'skipped') throw new Error('Only skipped cards can be brought back.');
      r.status = 'pending'; r.decidedAt = '';
      t.sh.getRange(r._row, 1, 1, TABS.Intake.length).setValues([line_(r, TABS.Intake)]);
      return { card: intakeOut_(r) };
    });
  }

  /* ---- cards from outside (Import box, or Claude's scan writing to the sheet) ---- */
  function addCards_(cards, source) {
    return lock_(function () {
      var t = read_('Intake'), seen = {}, out = [];
      t.rows.forEach(function (r) { if (r.sourceRef) seen[r.sourceRef] = 1; });
      cards.forEach(function (c) {
        if (!c || !c.who || !c.summary) return;
        var ref = txt_(c.sourceRef || '', 300); if (ref && seen[ref]) return; if (ref) seen[ref] = 1;
        var o = { id: nextId_(t.rows.concat(out), 'INB'), source: txt_(c.source || source, 60), sourceRef: ref, receivedAt: txt_(c.receivedAt || now_(), 40),
          kind: ['req', 'upd', 'fu'].indexOf(c.kind) >= 0 ? c.kind : 'req', who: txt_(c.who, 120), customerId: txt_(c.customerId || '', 20),
          match: txt_(c.match || '', 120), summary: txt_(c.summary, 3000), alert: txt_(c.alert || '', 500),
          details: JSON.stringify((c.details || []).slice(0, 8)), tasks: JSON.stringify((c.tasks || []).slice(0, 6)), link: /^https:\/\//.test(c.link || '') ? txt_(c.link, 500) : '',
          partial: c.partial ? 'true' : 'false', status: 'pending', decidedAt: '', result: '', created: now_(),
          raw: txt_(c.raw || '', 6000), direction: c.direction === 'out' ? 'out' : (c.direction === 'in' ? 'in' : ''), duration: txt_(c.duration || '', 10) };
        t.sh.appendRow(line_(o, TABS.Intake)); out.push(o);
      });
      return out.map(intakeOut_);
    });
  }
  function apiKey_() { return P.getProperty('calls.ANTHROPIC_API_KEY') || P.getProperty('auction.ANTHROPIC_API_KEY') || ''; }
  function importNote(text) {
    text = String(text || '').trim().slice(0, 6000);
    if (!text) throw new Error('Type or paste a note first.');
    return { cards: addCards_(claudeCards_(text, null).map(function (c) { c.raw = text; return c; }), 'Import') };
  }
  function logCall(o) {
    o = o || {};
    var notes = String(o.notes || '').trim().slice(0, 6000);
    if (!notes) throw new Error('Type or dictate your notes first.');
    var cuT = read_('Customers'), cust = o.customerId ? cuT.rows.filter(function (c) { return c.id === o.customerId; })[0] : null;
    if (!cust && o.newName) {
      var nm = txt_(o.newName, 120); if (!nm) throw new Error('Pick a customer or type a new name.');
      var nc = { id: nextId_(cuT.rows, 'CUS'), name: nm, phone: txt_(o.newPhone || '', 40), created: now_(), updated: now_(), notes: 'Added when logging a call' };
      lock_(function () { cuT.sh.appendRow(line_(nc, TABS.Customers)); }); cust = nc;
    }
    if (!cust) throw new Error('Pick a customer or type a new name.');
    var dir = o.direction === 'out' ? 'out' : 'in', at = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$/.test(String(o.at || '')) ? String(o.at).replace('T', ' ') : now_();
    var cards = claudeCards_(notes, cust), c = cards[0] || { kind: 'req', summary: notes.slice(0, 500), details: [], tasks: [] };
    c.who = cust.name; c.customerId = cust.id; c.match = ''; c.receivedAt = at; c.raw = notes; c.direction = dir; c.duration = o.duration;
    c.sourceRef = 'call:' + cust.id + ':' + at + ':' + Utilities.getUuid().slice(0, 6);
    return { card: addCards_([c], dir === 'out' ? 'Call · out' : 'Call · in')[0], customers: read_('Customers').rows.map(out_) };
  }
  function claudeCards_(text, cust) {
    var key = apiKey_(); if (!key) throw new Error('No Claude API key is set (Script Property calls.ANTHROPIC_API_KEY).');
    var names = cust ? '(customer already chosen)' : read_('Customers').rows.map(function (c) { return c.id + ' = ' + c.name + (c.company ? ' (' + c.company + ')' : ''); }).slice(0, 600).join('\n');
    var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd (EEEE)');
    var prompt = (cust ? 'These are Karan\'s notes from a call with ' + cust.name + (cust.company ? ' (' + cust.company + ')' : '') + '. Make exactly ONE card for this customer.\n' : '') +
      'You turn Karan Jain\'s rough notes about jewellery customers (Jupiter Rain, New York) into review cards.\n' +
      'Today is ' + today + '. Team: Karan, Leo, Shivansh, DD. Default owner Karan.\n' +
      'Known customers (id = name):\n' + (names || '(none yet)') + '\n\n' +
      'Return ONLY JSON: {"cards":[{"kind":"req|upd|fu","who":"customer name","customerId":"CUS-.... if clearly a known customer else empty",' +
      '"match":"matched customer name, or New customer?","summary":"2-4 short lines: what they want, items, prices quoted, deadline",' +
      '"details":[["Items","..."],["Quoted","..."],["Deadline","..."]],"tasks":[["task text incl. customer name","Karan","YYYY-MM-DD",false]]}]}\n' +
      'One card per customer. kind: req = they ask for something, upd = order/payment/shipping update, fu = follow-up for us. Dates: real calendar dates; urgent=true only if the note says urgent/ASAP.\n\nNote:\n' + text;
    var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: P.getProperty('calls.MODEL') || P.getProperty('auction.MODEL') || 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }) });
    var code = res.getResponseCode();
    if (code === 401) throw new Error('Claude refused the API key.');
    if (code === 429 || code === 529) throw new Error('Claude is busy. Try again in a minute.');
    if (code !== 200) throw new Error('Claude could not read the note (error ' + code + ').');
    var body = json_(res.getContentText(), {}), txt = ((body.content || [])[0] || {}).text || '', m = txt.match(/\{[\s\S]*\}/);
    var cards = (json_(m ? m[0] : '', {}).cards) || [];
    if (!cards.length && !cust) throw new Error('Claude could not find a customer request in that note.');
    return cards;
  }

  /* ---- Uploadify contacts → Customers (read from Uploadify, never written back) ---- */
  function uploadifyImport(list) {
    if (!Array.isArray(list)) throw new Error('No list.');
    return lock_(function () {
      var t = read_('Customers'), cols = TABS.Customers, byU = {}, added = 0, linked = 0, updated = 0;
      t.rows.forEach(function (r) { if (r.uploadifyId) byU[r.uploadifyId] = r; });
      var fresh = [];
      list.forEach(function (u) {
        if (!u || !u.id || u.supplier) return;
        var name = txt_(u.name || u.company, 120); if (!name) return;
        var o = { name: name, company: txt_(u.company === u.name ? '' : u.company, 120), phone: txt_(u.phone, 40), email: txt_(String(u.email || '').toLowerCase(), 120),
                  tags: txt_(u.tags, 200), uploadifyId: txt_(u.id, 20), uploadifyUrl: /^https:\/\/app\.uploadify\.ai\//.test(u.url || '') ? txt_(u.url, 300) : '' };
        var cur = byU[o.uploadifyId];
        if (!cur) { var d = dupes_(o, t.rows.filter(function (r) { return !r.uploadifyId; })); cur = d.length ? t.rows.filter(function (r) { return r.id === d[0].id; })[0] : null; if (cur) linked++; }
        if (cur) {
          var ch = false;
          ['name', 'company', 'phone', 'email', 'tags', 'uploadifyId', 'uploadifyUrl'].forEach(function (k) { if (o[k] && cur[k] !== o[k] && (k !== 'tags' || !cur.tags)) { cur[k] = o[k]; ch = true; } });
          if (ch) { cur.updated = now_(); t.sh.getRange(cur._row, 1, 1, cols.length).setValues([line_(cur, cols)]); updated++; }
          byU[o.uploadifyId] = cur;
        } else {
          o.id = nextId_(t.rows.concat(fresh), 'CUS'); o.created = now_(); o.updated = now_(); o.notes = ''; o.summary = ''; o.budgetRange = ''; o.lastContact = '';
          fresh.push(o); byU[o.uploadifyId] = o; added++;
        }
      });
      if (fresh.length) { var r0 = t.sh.getLastRow() + 1; t.sh.getRange(r0, 1, fresh.length, cols.length).setNumberFormat('@').setValues(fresh.map(function (o) { return line_(o, cols); })); }
      setSet_('uploadifySync', now_());
      return { added: added, linked: linked, updated: Math.max(0, updated - linked), total: list.length };
    });
  }

  /* ---- Find missed requests: start the Claude scan session (same API as Ask Claude) ---- */
  function requestScan() {
    var url = P.getProperty('calls.FIRE_URL'), key = P.getProperty('calls.FIRE_TOKEN');
    setSet_('scanRequested', now_());
    if (!url || !key) return { needsLink: true };
    var st = getSet_();
    try {
      var res = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'experimental-cc-routine-2026-04-01' },
        payload: JSON.stringify({ text: 'Find missed requests. Last scan: ' + (st.lastScan || 'never') + '. Intake sheet: ' + ss_().getUrl() }) });
      var code = res.getResponseCode(), body = json_(res.getContentText(), {});
      if (code >= 200 && code < 300) return { started: true, url: body.claude_code_session_url || '' };
      if (code === 401 || code === 403) return { error: 'Claude didn’t accept the key. Paste a fresh one under Scan link.' };
      return { error: 'Claude didn’t start (' + code + '). The hourly check will pick it up.' };
    } catch (e) { return { error: 'Couldn’t reach Claude. The hourly check will pick it up.' }; }
  }
  function setScanLink(url, token) {
    url = String(url || '').trim(); token = String(token || '').trim();
    if (!/^https:\/\/[^\s]+$/.test(url) || token.length < 20) throw new Error('Paste both the link and the key.');
    P.setProperty('calls.FIRE_URL', url); P.setProperty('calls.FIRE_TOKEN', token);
    return { ok: true };
  }
  function saveCustomer(c, force) {
    c = c || {};
    return lock_(function () {
      var t = read_('Customers'), cols = TABS.Customers, cur = null;
      if (c.id) { cur = t.rows.filter(function (r) { return r.id === c.id; })[0]; if (!cur) throw new Error('That customer was not found. Refresh and try again.'); }
      var o = cur || { id: nextId_(t.rows, 'CUS'), created: now_(), summary: '', budgetRange: '', lastContact: '' };
      EDIT.Customers.forEach(function (k) { if (c[k] !== undefined) o[k] = txt_(c[k], k === 'notes' ? 2000 : k === 'uploadifyUrl' ? 500 : 200); });
      if (!o.name) throw new Error('A customer needs a name.');
      if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw new Error('That email does not look right.');
      if (o.uploadifyUrl && !/^https:\/\//i.test(o.uploadifyUrl)) throw new Error('The Uploadify link must start with https://');
      if (!cur && !force) { var d = dupes_(o, t.rows); if (d.length) return { dupes: d }; }
      o.updated = now_();
      if (cur) t.sh.getRange(cur._row, 1, 1, cols.length).setValues([line_(o, cols)]);
      else { var r = t.sh.getLastRow() + 1; t.sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues([line_(o, cols)]); }
      return { customer: out_(o) };
    });
  }
  function checkDupes(c) { return dupes_(c || {}, read_('Customers').rows); }

  return { boot: boot, saveCustomer: saveCustomer, checkDupes: checkDupes, decideIntake: decideIntake, undoIntake: undoIntake,
    importNote: importNote, logCall: logCall, requestScan: requestScan, setScanLink: setScanLink, uploadifyImport: uploadifyImport, _addCards: addCards_, _key: function () { return getSet_().syncKey || ''; } };
})();

/* ---- plug into the router (no edits to Code.gs needed). Keep this file BELOW Code.gs and Register. ---- */
var JR_CALLS_MOD_ = { who: ['Karan'], pub: ['boot', 'saveCustomer', 'checkDupes', 'decideIntake', 'undoIntake', 'importNote', 'logCall', 'requestScan', 'setScanLink'] };
JR_MODS.calls = JR_CALLS_MOD_;
var JR_route_before_calls_ = JR_route_;
JR_route_ = function (q) {
  JR_MODS.calls = JR_CALLS_MOD_;
  if (q && String(q.m || '') === 'calls' && String(q.f || '') === 'uploadifyImport') {
    var key = MOD_CALLS._key();
    if (!key || String(q.k || '') !== key) throw new Error('Wrong key.');
    return MOD_CALLS.uploadifyImport(Array.isArray(q.a) ? q.a[0] : null);
  }
  if (q && String(q.m || '') === 'calls') {
    var f = String(q.f || ''), a = Array.isArray(q.a) ? q.a : [];
    if (JR_CALLS_MOD_.pub.indexOf(f) < 0) throw new Error('Unknown action.');
    var name = q.t ? MOD_TASKS._who(String(q.t)) : null;
    if (!name) return { __auth: true };
    if (JR_CALLS_MOD_.who.indexOf(name) < 0) throw new Error('This part of the app is not open to ' + name + '.');
    JR__name = name;
    return MOD_CALLS[f].apply(null, a);
  }
  return JR_route_before_calls_(q);
};

/* ---- "Calls & Orders" button in the Tasks app menu, for Karan only ---- */
var JR_tasks_api_before_calls_ = MOD_TASKS.api;
MOD_TASKS.api = function () {
  var r = JR_tasks_api_before_calls_.apply(null, arguments);
  if (r && r.me && Array.isArray(r.links) && JR_CALLS_MOD_.who.indexOf(r.me) >= 0 &&
      !r.links.some(function (l) { return l.url === 'calls.html'; })) r.links.push({ name: 'Calls & Orders', url: 'calls.html' });
  return r;
};

/** Run once from the editor after adding this file: creates the private sheet and shows its link. */
function callsSetup() {
  var r = MOD_CALLS.boot();
  var ss = SpreadsheetApp.openByUrl(r.sheetUrl); try { ss.addEditor('karan@jupiterrain.com'); } catch (e) {}
  Logger.log('Calls & Orders OK: ' + r.customers.length + ' customers, ' + r.intake.length + ' cards. ' + r.sheetUrl); return r.sheetUrl;
}
