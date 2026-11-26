/* Jupiter Rain · Register — shared logic (no data in this file).
 * Reads bank CSV files (Chase checking/savings, Chase card, Bank of America), works out who each line is
 * with, and suggests a category the same way the 2025 tax package did. Used by register.html. */
(function (root) {
  'use strict';

  var CATEGORIES = ['Sales', 'Bills', 'Expenses', 'Taxes', 'Owner / personal', 'Transfers',
    'Credit card payments', 'Other income / refunds', 'Loans', 'Adjustments'];
  var TYPES = {
    'Sales': ['Sales receipt', 'Platform payout', 'Returned deposit'],
    'Bills': ['Supplier invoice', 'Auction purchase', 'Memo / consignment'],
    'Expenses': ['Software & subscriptions', 'Travel', 'Travel & local transport', 'Meals', 'Shipping & insurance',
      'Bank fees', 'Card processing fees', 'Payroll', 'Trade shows', 'Phone', 'Advertising', 'Tools & supplies',
      'Grading / lab fees', 'Petty cash — office expenses', 'Rent / office', 'Office supplies', 'Dues & memberships',
      'Auto', 'Equipment', 'Insurance', 'Parking', 'Repairs & maintenance', 'Accounting / professional fees',
      'Photography', 'Client gifts', 'Refining / melt', 'Other'],
    'Taxes': ['Federal tax (IRS)', 'NY payroll withholding', 'NY corporate tax', 'NYC tax', 'NY unemployment insurance', 'Sales tax', 'Other tax'],
    'Owner / personal': ['Owner draw', 'Auto loan', 'Auto insurance', 'Life insurance', 'Personal'],
    'Transfers': ['Between own accounts', 'To own Wise account', 'To cash register', 'Card payment received', 'Owner contribution', 'Personal funds — not business'],
    'Credit card payments': ['Card payment'],
    'Other income / refunds': ['Interest', 'Bank credit / fee reversal', 'Refund', 'Returned outgoing wire', 'Tax refund', 'Other'],
    'Loans': ['Lent money', 'Borrowed', 'Repayment received', 'We repaid'],
    'Adjustments': ['Cash count', 'Opening balance']
  };
  var LOAN_DIR = { 'Lent money': 'out', 'Borrowed': 'in', 'Repayment received': 'in', 'We repaid': 'out' };
  var UPLOADIFY_CATS = ['Sales', 'Bills'];

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], f = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(f); rows.push(row); row = []; f = '';
      } else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function decode(s) {
    return String(s || '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
  }
  function num(s) {
    s = String(s == null ? '' : s).replace(/[$,\s"]/g, '');
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    var n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }
  function isoDate(s) {
    s = String(s || '').trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { var y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2); }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var d = new Date(s);
    return isNaN(d) ? '' : d.toISOString().slice(0, 10);
  }
  function low(a) { return a.map(function (x) { return String(x).trim().toLowerCase(); }); }

  /* ---------- reading a bank file ---------- */
  // returns { format, label, lines:[{date, amount(+in/-out), description, bankType, checkNo, balance, cardCategory}], balance:{amount,date}, problems:[] }
  function readFile(text, fileName) {
    var rows = parseCSV(text), out = { format: '', label: '', lines: [], balance: null, problems: [], fileName: fileName || '' };
    if (!rows.length) { out.problems.push('The file is empty.'); return out; }
    var h0 = low(rows[0]);
    // Chase checking / savings
    if (h0[0] === 'details' && h0.indexOf('posting date') >= 0) {
      out.format = 'chase_bank'; out.label = 'Chase checking / savings';
      var iD = h0.indexOf('posting date'), iDe = h0.indexOf('description'), iA = h0.indexOf('amount'),
        iT = h0.indexOf('type'), iB = h0.indexOf('balance'), iC = h0.findIndex(function (x) { return x.indexOf('check') === 0; });
      rows.slice(1).forEach(function (r) {
        var a = num(r[iA]); if (!isFinite(a)) return;
        out.lines.push({ date: isoDate(r[iD]), amount: a, description: decode(r[iDe]), bankType: String(r[iT] || '').trim(),
          checkNo: iC >= 0 ? String(r[iC] || '').trim() : '', balance: num(r[iB]) });
      });
      var withBal = out.lines.filter(function (l) { return isFinite(l.balance); });
      if (withBal.length) {
        var newest = withBal.reduce(function (m, l) { return l.date > m.date ? l : m; }, withBal[0]); // Chase lists newest first
        out.balance = { amount: withBal[0].date >= newest.date ? withBal[0].balance : newest.balance, date: newest.date };
      }
      return out;
    }
    // Chase credit card
    if (h0[0] === 'transaction date' && h0.indexOf('post date') >= 0) {
      out.format = 'chase_card'; out.label = 'Chase credit card';
      var cD = h0.indexOf('transaction date'), cDe = h0.indexOf('description'), cCat = h0.indexOf('category'),
        cT = h0.indexOf('type'), cA = h0.indexOf('amount'), cM = h0.indexOf('memo');
      rows.slice(1).forEach(function (r) {
        var a = num(r[cA]); if (!isFinite(a)) return;
        out.lines.push({ date: isoDate(r[cD]), amount: a, description: decode(r[cDe]) + (r[cM] && String(r[cM]).trim() ? ' · ' + decode(r[cM]) : ''),
          bankType: String(r[cT] || '').trim(), cardCategory: String(r[cCat] || '').trim() });
      });
      return out;
    }
    // Bank of America checking / savings (summary block on top, then Date,Description,Amount,Running Bal.)
    var hi = rows.findIndex(function (r) { var l = low(r); return l[0] === 'date' && l[1] === 'description' && l[2] === 'amount'; });
    if (hi >= 0) {
      out.format = 'bofa_bank'; out.label = 'Bank of America checking / savings';
      rows.slice(hi + 1).forEach(function (r) {
        var d = decode(r[1]);
        if (/^beginning balance as of/i.test(d) || /^ending balance as of/i.test(d)) return;
        var a = num(r[2]); if (!isFinite(a)) return;
        out.lines.push({ date: isoDate(r[0]), amount: a, description: d, bankType: '', balance: num(r[3]) });
      });
      var last = out.lines.filter(function (l) { return isFinite(l.balance); }).pop();
      if (last) out.balance = { amount: last.balance, date: last.date };
      rows.slice(0, hi).forEach(function (r) {
        var m = String(r[0] || '').match(/ending balance as of (\S+)/i);
        if (m && isFinite(num(r[2]))) out.balance = { amount: num(r[2]), date: isoDate(m[1]) };
      });
      return out;
    }
    // Bank of America credit card
    if (h0[0] === 'posted date' && h0.indexOf('payee') >= 0) {
      out.format = 'bofa_card'; out.label = 'Bank of America credit card';
      var bD = 0, bP = h0.indexOf('payee'), bA = h0.indexOf('amount');
      rows.slice(1).forEach(function (r) {
        var a = num(r[bA]); if (!isFinite(a)) return;
        out.lines.push({ date: isoDate(r[bD]), amount: a, description: decode(r[bP]), bankType: '' });
      });
      return out;
    }
    // Anything else with date / description / amount columns (e.g. Wise)
    var gD = h0.findIndex(function (x) { return /date/.test(x); }),
      gDe = h0.findIndex(function (x) { return /description|details|payee|merchant|reference/.test(x); }),
      gA = h0.findIndex(function (x) { return x === 'amount' || /amount/.test(x); });
    if (gD >= 0 && gDe >= 0 && gA >= 0) {
      out.format = 'generic'; out.label = 'Other bank file';
      rows.slice(1).forEach(function (r) {
        var a = num(r[gA]); if (!isFinite(a)) return;
        out.lines.push({ date: isoDate(r[gD]), amount: a, description: decode(r[gDe]), bankType: '' });
      });
      return out;
    }
    out.problems.push('This file layout is not known yet. Send it to Claude to add it.');
    return out;
  }

  /* ---------- who is the line with ---------- */
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function titleCase(s) {
    return clean(s).toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); })
      .replace(/\b(Llc|Inc|Ltd|Co|Usa|Nyc|Ny|Bvba|Fzco|Dmcc|Uk|Hk|Gia)\b/g, function (m) { return m.toUpperCase(); });
  }
  function counterparty(desc) {
    var d = ' ' + String(desc || '').toUpperCase() + ' ', m;
    function cut(s) { return clean(String(s).split(/ REF:| TRN:| SSN:| IMAD:| ORIG BK| BNF BK| ID:| SEC:|\/BNF|\/AC-/)[0]); }
    if ((m = d.match(/ZELLE (?:PAYMENT )?(?:FROM|TO) (.+?)(?: [A-Z]*\d[A-Z0-9]{5,}| ON \d|  | CONF|$)/))) return clean(m[1]);
    if ((m = d.match(/ B\/O: (.+?)(?: REF:| TRN:|$)/))) return firstWords(cut(m[1]), 4);
    if ((m = d.match(/ BEN: (.+?)(?: REF:| TRN:|$)/))) return firstWords(cut(m[1]), 4);
    if ((m = d.match(/ ORIG:(.+?)(?: ORIG BK| ID:|$)/))) return firstWords(cut(m[1]), 5);
    if ((m = d.match(/ BNF:(.+?)(?: BNF BK| ID:|$)/))) return firstWords(cut(m[1]), 5);
    if ((m = d.match(/ORIG CO NAME:\s*(.+?)(?:\s{2,}| ORIG ID|$)/))) return clean(m[1]);
    if ((m = d.match(/^ (.+?) (?:\d+ )?DESCR:/))) return clean(m[1].replace(/ \d+$/, ''));
    if ((m = d.match(/ ONLINE ACH PAYMENT \d+ TO (.+?)(?: \(|$)/))) return clean(m[1]);
    if ((m = d.match(/WIRE TRANSFER (?:VIA: .+? )?A\/C: (.+?)(?: [A-Z]{2} \d{5}| \d{5}| REF:| TRN:|$)/))) return firstWords(cut(m[1]), 4);
    if (/PAYROLL/.test(d)) return 'Payroll';
    if (/REMOTE ONLINE DEPOSIT|MOBILE.*DEPOSIT|ATM CHECK DEPOSIT|^ DEPOSIT /.test(d)) return 'Check deposit';
    if ((m = d.match(/^ CHECK #?\s*(\d+)/))) return 'Check #' + m[1];
    var s = d
      .replace(/ (RECURRING )?CARD PURCHASE( WITH PIN)?( RETURN)? \d\d\/\d\d/g, ' ')
      .replace(/ (PURCHASE|CHECKCARD|POS PURCHASE|POS) \d{4}/g, ' ')
      .replace(/ CARD \d{4}.*$/, ' ').replace(/ (MOBILE )?PURCHASE( RETURN)? .*$| REFUND .*$| DEBIT CARD .*$/, ' ')
      .replace(/ HTTPS?\S*| WWW\.\S*/g, ' ')
      .replace(/ \d{3}-?\d{3}-?\d{4}/g, ' ').replace(/ \d{2}\/\d{2}( |$)/g, ' ')
      .replace(/ (SQ|TST|SP|PY|IC|CKO|DD|PAYPAL) ?\*/g, ' ').replace(/[*#]/g, ' ')
      .replace(/ \d[\d ]*/g, ' ').replace(/ (NY|NJ|CA|FL|IL|TX|WA|MA|NV|DE) *$/, ' ');
    return firstWords(clean(s), 4);
  }
  function firstWords(s, n) {
    s = clean(s).replace(/^(MR|MRS|MS|DR)\.? /, '').replace(/ (NEW YORK|BROOKLYN|JERSEY CITY|HONG KONG|LONDON)$/, '');
    var c = s.match(/^(.+?),\s*(LLC|INC|LTD|CO|CORP|LIMITED|L\.L\.C\.)\b/);
    if (c) return c[1] + ', ' + c[2];
    s = s.split(',')[0];
    return s.split(' ').slice(0, n).join(' ').replace(/[,.]+$/, '');
  }
  var NOISE = /\b(INC|LLC|LTD|CO|CORP|THE|LIMITED|PURCHASE|MOBILE|RECURRING|DEBIT|CARD|WWW|COM|DESCR|IND|NAME|ORIG|ENTRY|PREM|COLL|PREMIUM|INS|US|USA|ONLINE)\b/g;
  function keyOf(desc) {
    return counterparty(desc).toUpperCase().replace(/[^A-Z0-9&]+/g, ' ').replace(NOISE, ' ')
      .replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  }

  var MERCHANTS = [
    [/MTA|NYCT|PATH |UBER|LYFT|EZPASS|E-ZPASS|NJ TRANSIT|AMTRAK|TAXI|CURB|PARKMOBILE|SPOTHERO|PARKING|EXXON|SHELL|FUEL|SUNOCO|BP /, 'Travel & local transport'],
    [/FEDEX|UPS |USPS|MALCA|PARCEL PRO|BRINKS|BRINK'S|LOOMIS|FERRARI|DHL|SHIPPO|STAMPS\.COM/, 'Shipping & insurance'],
    [/GOOGLE|GSUITE|ZOHO|WIX|ADOBE|MICROSOFT|UPLOADIFY|1STDIBS|SHOPIFY|CANVA|DROPBOX|ANTHROPIC|CLAUDE|OPENAI|APPLE\.COM\/BILL|ICLOUD|ZAPIER|NOTION|SLACK|QUICKBOOKS/, 'Software & subscriptions'],
    [/T-MOBILE|TMOBILE|VERIZON|AT&T|ATT\*|SPECTRUM|OPTIMUM/, 'Phone'],
    [/GEMOLOGICAL|\bGIA\b|GUBELIN|SSEF|AGL |IGI |GRS /, 'Grading / lab fees'],
    [/AIRLINE|AIRWAYS|AIR CANADA|DELTA|UNITED AIR|AMERICAN AIR|JETBLUE|EMIRATES|LUFTHANSA|MARRIOTT|HILTON|HYATT|AIRBNB|BOOKING\.COM|EXPEDIA|HOTEL/, 'Travel'],
    [/STAPLES|OFFICE DEPOT|OFFICEMAX/, 'Office supplies'],
    [/RIO GRANDE|OTTO FROST|STULLER|JEWELRY TOOLS|ZAK JEWELRY/, 'Tools & supplies']
  ];
  function merchantType(D) { for (var i = 0; i < MERCHANTS.length; i++) if (MERCHANTS[i][0].test(D)) return MERCHANTS[i][1]; return ''; }

  /* ---------- suggest a category ---------- */
  function sug(category, type, party, why, review) {
    return { category: category, type: type || '', party: party || '', why: why, review: !!review };
  }
  // rules: [{key, category, type, party}]  (user rules first, then learned)
  function classify(line, account, rules) {
    var d = ' ' + String(line.description || '').toUpperCase() + ' ', inn = line.amount > 0, t = line.bankType || '';
    var kind = (account && account.kind) || 'checking', cp = counterparty(line.description), key = keyOf(line.description);
    var r = findRule(rules, key, d);
    if (r && r.priority === 'user') return sug(r.category, r.type, r.party || titleCase(cp), 'Your rule', false);

    // cards
    if (kind === 'card') {
      if (inn && /PAYMENT THANK YOU|AUTOMATIC PAYMENT|ONLINE PAYMENT|PAYMENT RECEIVED|AUTOPAY/.test(d))
        return sug('Transfers', 'Card payment received', account.name, 'Card paid off from the bank', false);
      if (r) return sug(r.category, r.type, r.party || titleCase(cp), 'Same as before', false);
      if (inn) return sug('Other income / refunds', 'Refund', titleCase(cp), 'Card refund', true);
      var cc = String(line.cardCategory || '').toLowerCase(), ct =
        /food|drink|restaurant/.test(cc) ? 'Meals' : /travel|gas|auto/.test(cc) ? 'Travel & local transport' :
        /shipping/.test(cc) ? 'Shipping & insurance' : /professional/.test(cc) ? 'Accounting / professional fees' :
        /bills|utilit/.test(cc) ? 'Phone' : 'Other';
      var mt = merchantType(d);
      if (account.personal) {
        if (mt === 'Travel') return sug('Expenses', mt, titleCase(cp), 'Travel on your personal card — business?', true);
        if (mt && mt !== 'Travel & local transport') return sug('Expenses', mt, titleCase(cp), 'Business shop on your personal card', false);
        return sug('Owner / personal', 'Personal', titleCase(cp), 'Personal card', false);
      }
      return sug('Expenses', mt || ct, titleCase(cp), 'Card purchase', !mt && Math.abs(line.amount) >= 250);
    }

    // own money moving
    if (/JUPITER RAIN/.test(d) && /B\/O:|BNF:|ORIG:|BOOK TRANSFER/.test(d) ||
      /ONLINE TRANSFER (TO|FROM)|TRANSFER (TO|FROM) (SAV|CHK|MMA)|AGENT ASSISTED TRANSFER|ONLINE BANKING TRANSFER|TRANSFER FROM SAVINGS|TRANSFER TO SAVINGS/.test(d))
      return sug('Transfers', 'Between own accounts', 'Own account', 'Between your own accounts', false);
    var ach = (d.match(/ORIG CO NAME:\s*(.+?)(?:\s{2,}| ORIG ID)/) || [, ''])[1];
    if ((/A\/C: WISE|BNF:WISE|TRANSFERWISE|WISE PAYMENTS/.test(d) || /^WISE/.test(ach) || /^ WISE /.test(d)) && !(ach && !/^WISE/.test(ach)))
      return sug('Transfers', 'To own Wise account', 'Wise (Jupiter Rain)', 'Your Wise account', false);
    if (!inn && /CHASE CREDIT CRD|PAYMENT TO CHASE CARD|CAPITAL ONE.*(PMT|PAYMENT|MOBILE)|AMEX EPAYMENT|AMERICAN EXPRESS.*PMT|BA ELECTRONIC PAYMENT|CITI CARD.*PAYMENT|DISCOVER.*PAYMENT/.test(d))
      return sug('Credit card payments', 'Card payment', titleCase(cp), 'Paying a credit card', false);
    if (r) return sug(r.category, r.type, r.party || titleCase(cp), 'Same as before', false);
    if (!inn && /IND NAME:\s*KARAN JAIN/.test(d)) {
      var pt = /GEICO|PROGRESSIVE|ALLSTATE|STATE FARM/.test(d) ? 'Auto insurance' : /LIFE/.test(d) ? 'Life insurance' : /AUDI|BMW|TOYOTA|HONDA|FINCL|AUTO/.test(d) ? 'Auto loan' : 'Personal';
      return sug('Owner / personal', pt, titleCase(cp), 'In your own name — personal', false);
    }

    // taxes, payroll, fees, interest
    if (/ORIG CO NAME:\s*IRS|USATAXPYMT|IRS USATAX/.test(d)) return sug('Taxes', 'Federal tax (IRS)', 'IRS', 'Tax payment', false);
    if (/NYS DTF WT/.test(d)) return sug('Taxes', 'NY payroll withholding', 'NYS Tax Dept', 'Tax payment', false);
    if (/NYS DTF CT/.test(d)) return sug('Taxes', 'NY corporate tax', 'NYS Tax Dept', 'Tax payment', false);
    if (/NYS DTF SALES|NYS DTF ST/.test(d)) return sug('Taxes', 'Sales tax', 'NYS Tax Dept', 'Tax payment', false);
    if (/NYS DOL|UI TAX|UNEMPLOY/.test(d)) return sug('Taxes', 'NY unemployment insurance', 'NYS Labor Dept', 'Tax payment', false);
    if (/NYC DEPT OF FIN/.test(d)) return sug('Taxes', 'NYC tax', 'NYC Dept of Finance', 'Tax payment', false);
    if (/PAYROLL/.test(d) || t === 'BASIC_PAYROLL') return sug('Expenses', 'Payroll', 'Payroll', 'Payroll', false);
    if (/INTEREST (PAYMENT|EARNED|PAID)/.test(d)) return sug('Other income / refunds', 'Interest', account.bank || 'Bank', 'Interest', false);
    if (!inn && (t === 'FEE_TRANSACTION' || /\bFEE\b|SERVICE CHARGE|MONTHLY MAINTENANCE|WIRE FEE/.test(d)))
      return sug('Expenses', 'Bank fees', account.bank || 'Bank', 'Bank fee', false);
    if (inn && /REFUND|REVERSAL|FEE REBATE/.test(d) && /FEE|CHARGE/.test(d))
      return sug('Other income / refunds', 'Bank credit / fee reversal', account.bank || 'Bank', 'Fee refunded', false);
    if (!inn && (t === 'ATM' || /ATM WITHDRAW|NON-CHASE ATM|ATM CASH/.test(d)))
      return sug('Transfers', 'To cash register', 'Cash register', 'Cash taken out — added to the cash register', false);
    if (!inn && /CUSTOMER WITHDRAWAL|COUNTER WITHDRAWAL|^ WITHDRAWAL /.test(d))
      return sug('Transfers', 'To cash register', 'Cash register', 'Withdrawal at the bank — cash, or a bank check to someone?', true);
    if (/DEPOSITED ITEM RETURNED|RETURNED ITEM/.test(d)) return sug('Sales', 'Returned deposit', '', 'A deposited check bounced', true);
    if (inn && /RETURN(ED)? (OF )?(WIRE|FUNDS)|WIRE RETURN/.test(d)) return sug('Other income / refunds', 'Returned outgoing wire', titleCase(cp), 'Wire came back', true);

    // platform payouts
    if (inn && /1STDIBS|SHOPIFY|SQUARE INC|SQ \*|PAYMENTECH|STRIPE|PAYPAL|ETSY|EBAY|CHRONO24/.test(d)) {
      var plat = (d.match(/1STDIBS|SHOPIFY|SQUARE|PAYMENTECH|STRIPE|PAYPAL|ETSY|EBAY|CHRONO24/) || [''])[0];
      return sug('Sales', 'Platform payout', titleCase(plat === '1STDIBS' ? '1stdibs' : plat), 'Payout from a selling platform', false);
    }

    // by how the money moved
    var isCheckPaid = t === 'CHECK_PAID' || /^ CHECK #?\s*\d+/.test(d);
    if (isCheckPaid && !inn) return sug('Bills', 'Supplier invoice', 'Check #' + (line.checkNo || (d.match(/CHECK #?\s*(\d+)/) || [, ''])[1]), 'Check you wrote — who was it to?', true);
    if (inn && (t === 'CHECK_DEPOSIT' || t === 'ATM_DEPOSIT' || t === 'DEPOSIT' || /REMOTE ONLINE DEPOSIT|MOBILE.*DEPOSIT|ATM CHECK DEPOSIT|^ DEPOSIT |COUNTER CREDIT|COUNTER DEPOSIT|TLR TRANSFER|BRANCH DEPOSIT/.test(d)))
      return sug('Sales', 'Sales receipt', 'Check deposit (payer not on statement)', 'Check deposit — who paid?', true);
    if (inn && (t === 'WIRE_INCOMING' || /CHIPS CREDIT|FEDWIRE CREDIT|WIRE TYPE:.*IN |BOOK TRANSFER CREDIT/.test(d)))
      return sug('Sales', 'Sales receipt', titleCase(cp), 'Incoming wire — new name', true);
    if (!inn && (t === 'WIRE_OUTGOING' || /WIRE TRANSFER|WIRE TYPE:.*OUT /.test(d)))
      return sug('Bills', 'Supplier invoice', titleCase(cp), 'Outgoing wire — new name', true);
    if (/ZELLE/.test(d) || /QUICKPAY|PARTNERFI/.test(t))
      return inn ? sug('Sales', 'Sales receipt', titleCase(cp), 'Zelle in — sale, loan or own money?', true)
        : sug('Bills', 'Supplier invoice', titleCase(cp), 'Zelle out — purchase, loan, salary?', true);
    if (t === 'DEBIT_CARD' || /CARD PURCHASE|CHECKCARD|PURCHASE \d{4}|DEBIT CARD|MOBILE PURCHASE| PURCHASE /.test(d)) {
      var mt2 = merchantType(d);
      if (inn) return sug('Other income / refunds', 'Refund', titleCase(cp), 'Card refund', false);
      return sug('Expenses', mt2 || 'Other', titleCase(cp), mt2 ? 'Card purchase' : 'Card purchase — new shop', !mt2 && Math.abs(line.amount) >= 250);
    }
    if (inn && /ORIG CO NAME/.test(d) && /RECEIVABLE|BILL\.COM|BI LL\.COM| INV |INVOICE|DESCR:WISE|PAYMENT/.test(d))
      return sug('Sales', 'Sales receipt', titleCase(cp), 'Customer payment — new name', true);
    if (!inn && /ONLINE ACH PAYMENT|ACH PMT|BILL PAY|ONLINE BANKING PAYMENT/.test(d))
      return sug('Bills', 'Supplier invoice', titleCase(cp), 'Payment sent — new name', true);
    if (/^ACH|ACH_/.test(t) || /ORIG CO NAME/.test(d))
      return inn ? sug('Other income / refunds', 'Other', titleCase(cp), 'Bank deposit — new name', true)
        : sug('Expenses', 'Other', titleCase(cp), 'Automatic payment — new name', true);
    return inn ? sug('', '', titleCase(cp), 'Not sure what this is', true) : sug('', '', titleCase(cp), 'Not sure what this is', true);
  }
  var GENERIC = /^(WIRE|CARD|PAYMENT|CHECK|DEPOSIT|TRANSFER|ZELLE|BANK|NEW|NYS|NYC|AMAZON|SQ|TST|THE|AIR|HOTEL|CITY|FIRST|INTL|INTERNATIONAL|DOMESTIC)$/;
  function findRule(rules, key, D) {
    if (!rules || !rules.length) return null;
    var kw = key ? key.split(' ') : [], user = null, exact = null, pre = null, preLen = 1, first = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r || !r.key) continue;
      if (r.match === 'contains') { if (D.indexOf(r.key) >= 0 && (!user || r.priority === 'user')) { if (r.priority === 'user') { user = r; break; } exact = exact || r; } continue; }
      if (r.key === key) { if (r.priority === 'user') { user = r; break; } exact = exact || r; continue; }
      var rw = r.key.split(' '), n = 0;
      while (n < rw.length && n < kw.length && rw[n] === kw[n]) n++;
      if (n >= 2 && n > preLen && n === Math.min(rw.length, kw.length)) { pre = r; preLen = n; }
      if (n >= 1 && kw[0] && kw[0].length >= 4 && !GENERIC.test(kw[0])) first.push(r);
    }
    if (user) return user;
    if (exact) return exact;
    if (pre) return pre;
    if (first.length && first.every(function (r) { return r.category === first[0].category && r.type === first[0].type; })) return first[0];
    return null;
  }

  /* ---------- duplicates ---------- */
  function hashOf(acct, date, amount, desc) {
    var s = [acct, date, Number(amount).toFixed(2), String(desc || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 60)].join('|'), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return acct + '-' + date.replace(/-/g, '') + '-' + h.toString(36);
  }
  // gives each line a hash; identical lines on the same day get #2, #3…
  function hashLines(acct, lines) {
    var seen = {};
    lines.forEach(function (l) {
      var h = hashOf(acct, l.date, l.amount, l.description);
      seen[h] = (seen[h] || 0) + 1;
      l.hash = seen[h] > 1 ? h + '.' + seen[h] : h;
    });
    return lines;
  }

  /* ---------- learn rules from sorted history ---------- */
  function learn(history) {
    var g = {};
    history.forEach(function (h) {
      if (!h.category || /\((personal card|Capital One card)\)$/.test(h.description || '')) return;
      if (/^(Check #|Remote Online Deposit|Check \/ branch)/i.test(h.description || '') || h.category === 'Transfers') return;
      var k = keyOf(h.description);
      if (!k || k.length < 4) return;
      var id = h.category + '|' + h.type + '|' + h.party;
      g[k] = g[k] || {}; g[k][id] = (g[k][id] || 0) + 1;
    });
    return Object.keys(g).sort().map(function (k) {
      var best = Object.keys(g[k]).sort(function (a, b) { return g[k][b] - g[k][a]; })[0].split('|');
      var n = Object.keys(g[k]).reduce(function (s, x) { return s + g[k][x]; }, 0);
      return { key: k, match: 'key', category: best[0], type: best[1], party: best[2], priority: 'learned', hits: n };
    });
  }

  var api = { CATEGORIES: CATEGORIES, TYPES: TYPES, LOAN_DIR: LOAN_DIR, UPLOADIFY_CATS: UPLOADIFY_CATS,
    parseCSV: parseCSV, readFile: readFile, counterparty: counterparty, keyOf: keyOf, classify: classify,
    hashOf: hashOf, hashLines: hashLines, learn: learn, isoDate: isoDate, num: num, titleCase: titleCase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JRReg = api;
})(this);
