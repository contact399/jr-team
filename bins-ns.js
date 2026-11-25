/* Jupiter Rain \u00b7 Bins \u2014 non-stock items (customers' pieces, repairs, anything not in Uploadify).
 * Add-on to bins.html: load it with  <script src="bins-ns.js"></script>  just before </body>.
 * Adds an "Add non-stock item" button on the Put-in-bin screen. Each item gets its own ID (NS-001\u2026),
 * a required explanation, an optional owner and an optional photo. These items are never sent to Uploadify. */
(function () {
  if (typeof putBinScreen !== 'function' || typeof call !== 'function') return;

  // 1) Button on the "Put in bin" screen
  var _putBinScreen = putBinScreen;
  putBinScreen = function (preset) {
    _putBinScreen(preset);
    var body = $('body');
    if (body) body.insertAdjacentHTML('afterbegin',
      '<button type="button" class="btn" data-act="nsNew" data-sku="' + esc(preset || '') + '" style="margin-bottom:12px">' +
      '\ud83c\udff7\ufe0f Add non-stock item (no SKU)</button>');
  };

  // 2) The form
  function nsForm(preset) {
    cur.photo = null;
    var names = S.bins.bins.map(function (b) { return b.name; });
    $('body').innerHTML =
      '<div class="msg info">For things that aren\'t in Uploadify \u2014 a customer\'s piece, a repair, a sample. ' +
      'It gets its own number (NS-001\u2026) and stays out of Uploadify.</div>' +
      '<label>Bin</label>' + choices('nsbin', names, preset || '') +
      '<label>What is it? <span class="req">required</span></label>' +
      '<textarea id="nsNote" rows="3" style="width:100%;font:inherit;font-size:17px;padding:10px;border-radius:12px;border:1px solid var(--line)" ' +
      'placeholder="e.g. Mrs. Shah\'s sapphire ring \u2014 in for re-tipping, promised Dec 5"></textarea>' +
      '<label>Whose is it? (optional)</label><input id="nsOwner" placeholder="Customer / owner name">' +
      photoField(false, 'Photo so you remember it') +
      '<div style="height:14px"></div><button type="button" class="btn primary" data-act="nsSave">Save into bin</button>';
    $('nsNote').focus();
  }

  function nsSave(btn) {
    var bin = choiceVal('nsbin'), note = $('nsNote').value.trim(), owner = $('nsOwner').value.trim();
    if (!bin) return bad('Pick a bin');
    if (!note) { $('nsNote').focus(); return bad('Write what it is'); }
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    call('BT_addNonStock', { bin: bin, note: note, owner: owner, photo: cur.photo || '' }).then(function (r) {
      good(r.msg);
      $('body').innerHTML =
        '<div class="msg ok" style="font-size:17px">Saved in <b>' + esc(bin) + '</b>.<br>' +
        'Write <b style="font-size:24px">' + esc(r.sku) + '</b> on its tag or bag.</div>' +
        '<div class="grid" style="margin-top:12px">' +
        '<button type="button" class="btn" data-act="nsNew" data-sku="' + esc(bin) + '">Add another</button>' +
        '<button type="button" class="btn" data-act="go" data-to="bin" data-sku="' + esc(bin) + '">Open ' + esc(bin) + '</button></div>';
      if (typeof load === 'function') load();
    }).catch(function (e) { bad(e.message); btn.disabled = false; btn.textContent = 'Save into bin'; });
  }

  // 3) Show non-stock items clearly, with their own photo, wherever items are listed
  var nsPhotos = {};
  function getPhoto(sku) {
    if (nsPhotos[sku]) return Promise.resolve(nsPhotos[sku]);
    return call('BT_nsPhoto', sku).then(function (d) { if (d) nsPhotos[sku] = d; return d; }).catch(function () { return ''; });
  }
  function dress(it) {
    if (!it || !it._ns) return Promise.resolve(it);
    if (!it._nsDressed) {
      it._nsDressed = true;
      it.Description = '\ud83c\udff7\ufe0f Non-stock \u00b7 ' + (it.Description || '') + (it.Owner ? ' \u00b7 Owner: ' + it.Owner : '');
    }
    return it._nsPhoto ? getPhoto(it.SKU).then(function (d) { if (d) it._photo = d; return it; }) : Promise.resolve(it);
  }
  var _call = call;
  call = function (fn) {
    var p = _call.apply(null, arguments);
    if (fn === 'BT_binContents') return p.then(function (r) { return Promise.all((r.items || []).map(dress)).then(function () { return r; }); });
    if (fn === 'BT_lookupSku') return p.then(function (r) { return r ? dress(r) : r; });
    if (fn === 'BT_bootstrap') return p.then(function (r) {
      (r && r.out || []).concat(r && r.needsBin || []).forEach(function (it) { if (it._ns && !it._nsDressed) { it._nsDressed = true; it.Description = '\ud83c\udff7\ufe0f Non-stock \u00b7 ' + (it.Description || '') + (it.Owner ? ' \u00b7 Owner: ' + it.Owner : ''); } });
      return r;
    });
    return p;
  };

  // 4) Tap a non-stock photo to see it big
  function bigPhoto(src) {
    var o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px';
    o.innerHTML = '<img src="' + src + '" style="max-width:100%;max-height:100%;border-radius:10px">';
    o.addEventListener('click', function () { o.remove(); });
    document.body.appendChild(o);
  }

  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('img.ph');
    if (img && /^data:image/.test(img.getAttribute('src') || '')) { e.stopPropagation(); return bigPhoto(img.getAttribute('src')); }
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'nsNew') { e.stopPropagation(); return nsForm(choiceVal('pbin') || b.getAttribute('data-sku')); }
    if (act === 'nsSave') { e.stopPropagation(); return nsSave(b); }
  }, true);
})();
