/* popcornWindow.js — the RUDVENTUR 🍿 popcorn window: a sealed "bunker" where
   the camera and microphone work only on this device.

   Drop-in (one line, any page; add popcornMovie.js after it for the movie maker):
     <script src="https://rudventur.github.io/RudVentur.com/embed/popcornWindow.js"></script>
     <script src="https://rudventur.github.io/RudVentur.com/embed/popcornMovie.js"></script>

   Privacy model
   - The camera and microphone are only ever used inside the popcorn window.
     Nothing runs behind the website.
   - Entering the popcorn window SEALS the page: a Content-Security-Policy is
     added that makes the browser itself refuse every connection (fetch, XHR,
     WebSocket, beacons, images, frames, forms), WebRTC is switched off, and
     every open window/iframe (chat etc.) is closed. A test request to our own
     site must be refused before 📷 / 🎤 can be switched on. The seal can't be
     lifted from inside the page — leaving the popcorn window reloads it.
   - What it can't stop: a hacked phone or browser, browser extensions, the
     operating system, or someone looking over your shoulder.
   - 🌐 online / 🕶 private is a per-device switch (localStorage 'rvPrivacy').
     Private: 📷 and 🎤 are greyed out and unavailable, useRbox goes incognito.
   - 📷 and 🎤 each have their own allowance, remembered per device.

   Inside the popcorn window
     top middle    back-recording palette: replay 10s / 30s / 60s / all, keep the
                   buffer, snapshot, pause, 🎬 movie maker, 🗂 session
     top right     user box: name, 📷, 🎤, 🌐/🕶, ✕ leave
     left          drawing on the live picture: pen / line / circle / square / text
     bottom left   ⌨️ type onto the picture, 💬 chat (leaves the bunker first)
     bottom right  🍿 the page's popcorn (leaves the bunker first)
   Everything kept goes to the session saver (IndexedDB 'rvPopcornSession' on
   this device only), with a 🗑 bin and 🔥 hard remove.

   Config (window.rvPopcornConfig, set before this script, all optional):
     onPopcorn, onChat, onUser  — functions; 🍿 and 💬 run after leaving the bunker
     chatUrl, zIndex, bottomOffset, userOffset, button (floating 🍿 when the page has none),
     legacyDB                   — IndexedDB name of old recordings to bring into the session

   API: window.rvPopcorn  (open, close/leave, toggle, isOpen, sealed, db, saveMedia,
        micStream, audioContext, shapes, paintShapes, toast, root, config)
        window.rvPrivacy  (mode, set, isPrivate)
*/
(function () {
  if (window.rvPopcorn) return;

  var CFG = Object.assign({
    onPopcorn: null,
    onChat: null,
    onUser: null,
    legacyDB: null,
    zIndex: 2147483000,
    bottomOffset: 0,
    userOffset: 0,
    chatUrl: 'https://rudventur.github.io/global-chat-v5/',
    button: true,
    segmentSec: 60,      // a new recorder starts every 60 s; two overlap -> 60..120 s back
    bitrate: 1500000,
    fps: 30
  }, window.rvPopcornConfig || {});

  var K_CAM = 'rvCamAllowed', K_MIC = 'rvMicAllowed', K_MODE = 'rvPrivacy', K_NAME = 'rvUserName';
  var K_AFTER = 'rvpAfter', K_LEGACY = 'rvpLegacyDone';
  var COLORS = ['#00ff41', '#ff00ff', '#00ffff', '#ffeb3b', '#ff3333', '#ffffff'];
  var SIZES = [3, 6, 12];
  var TOOLS = [
    ['pen', '✏️', 'Pen'], ['line', '╱', 'Line'], ['circle', '◯', 'Circle'],
    ['rect', '▢', 'Square'], ['text', '🔤', 'Text — type, then tap where it goes']
  ];
  // what the page may still do once sealed: run the code it already has, show
  // local pictures/video. Every way out to the network is 'none'.
  var BUNKER_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
    "img-src blob: data:; media-src blob: mediastream: data:; font-src data:; connect-src 'none'; " +
    "frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; " +
    "manifest-src 'none'; base-uri 'none'";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function size(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

  // ---------------------------------------------------------------- 🌐 / 🕶 privacy mode (per device)
  var rvPrivacy = window.rvPrivacy || (function () {
    function mode() { return lsGet(K_MODE) === 'private' ? 'private' : 'online'; }
    function fire() {
      try { document.dispatchEvent(new CustomEvent('rvprivacy', { detail: { mode: mode() } })); } catch (e) {}
    }
    window.addEventListener('storage', function (e) { if (e.key === K_MODE) fire(); });
    return {
      mode: mode,
      isPrivate: function () { return mode() === 'private'; },
      set: function (m) { lsSet(K_MODE, m === 'private' ? 'private' : 'online'); fire(); }
    };
  })();
  window.rvPrivacy = rvPrivacy;

  // ---------------------------------------------------------------- session saver (IndexedDB, this device only)
  var dbp = null;
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('rvPopcornSession', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(store, mode);
        var req = fn(t.objectStore(store));
        t.oncomplete = function () { res(req ? req.result : undefined); };
        t.onerror = t.onabort = function () { rej(t.error); };
      });
    });
  }
  var DB = {
    put: function (st, obj) { return tx(st, 'readwrite', function (s) { return s.put(obj); }).then(function () { return obj; }); },
    get: function (st, id) { return tx(st, 'readonly', function (s) { return s.get(id); }); },
    all: function (st) { return tx(st, 'readonly', function (s) { return s.getAll(); }); },
    del: function (st, id) { return tx(st, 'readwrite', function (s) { return s.delete(id); }); }
  };
  var persistAsked = false;
  function saveMedia(o) {
    var rec = {
      id: uid(), kind: o.kind, blob: o.blob, mime: o.blob.type || '', name: o.name || o.kind,
      duration: o.duration || 0, note: o.note || '', created: Date.now(), binned: false
    };
    if (!persistAsked && navigator.storage && navigator.storage.persist) {
      persistAsked = true;
      navigator.storage.persist().catch(function () {});
    }
    return DB.put('media', rec).then(function (r) { refreshSession(); return r; });
  }

  // ---------------------------------------------------------------- styles
  var CSS =
    '.rvp-fab{position:fixed;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));' +
    'z-index:9050;width:54px;height:54px;border-radius:50%;border:2px solid #ffeb3b;background:#000;font-size:28px;' +
    'cursor:pointer;box-shadow:0 0 14px rgba(255,235,59,.5);padding:0}' +
    '@keyframes rvpBlink{50%{opacity:.25}}' +
    '.rvp{position:fixed;inset:0;z-index:var(--rvp-z,2147483000);background:#000;display:none;overflow:hidden;' +
    "font-family:'Courier New',ui-monospace,monospace;color:#00ff41;user-select:none;-webkit-user-select:none}" +
    '.rvp.open{display:block}' +
    '.rvp-cam{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}' +
    '.rvp-cam.mirror{transform:scaleX(-1)}' +
    '.rvp-draw{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}' +
    '.rvp-bar{position:absolute;display:flex;gap:5px;align-items:center;flex-wrap:wrap;z-index:2}' +
    '.rvp button{font:inherit;font-size:14px;color:#00ff41;background:rgba(0,0,0,.72);border:1px solid #00ff41;' +
    'border-radius:8px;padding:7px 9px;cursor:pointer;line-height:1;min-width:36px;min-height:36px}' +
    '.rvp button:hover{background:rgba(0,255,65,.22)}' +
    '.rvp button.on{border-color:#ffeb3b;color:#ffeb3b;background:rgba(255,235,59,.2);box-shadow:0 0 8px rgba(255,235,59,.5)}' +
    '.rvp button:disabled{opacity:.35;cursor:default}' +
    '.rvp button.na{filter:grayscale(1);opacity:.45;border-color:#666!important;color:#888!important;background:#111!important;box-shadow:none!important}' +
    '.rvp-top{top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);justify-content:center;' +
    'max-width:calc(100% - 330px);padding:5px;border:1px solid #ff00ff;border-radius:10px;background:rgba(0,0,0,.55)}' +
    '.rvp-top button{border-color:#ff00ff;color:#ff66ff;font-size:12px;padding:6px 7px}' +
    '.rvp-seal{font-size:11px;padding:0 4px;color:#00ff41;white-space:nowrap}' +
    '.rvp-seal.bad{color:#ff6666}' +
    '.rvp-rec{font-size:12px;padding:0 6px;white-space:nowrap;color:#aaa}' +
    '.rvp-rec.live{color:#ff4d4d}.rvp-rec.live b{animation:rvpBlink 1.2s infinite}' +
    '.rvp-user{top:calc(8px + env(safe-area-inset-top));right:calc(8px + var(--rvp-uo,0px) + env(safe-area-inset-right));padding:5px;' +
    'border:1px solid #00ffff;border-radius:10px;background:rgba(0,0,0,.55);max-width:320px;justify-content:flex-end}' +
    '.rvp-user button{border-color:#00ffff;color:#00ffff}' +
    '.rvp-me{display:flex;align-items:center;gap:6px;cursor:pointer;padding:0 4px;color:#00ffff;font-size:13px;max-width:120px}' +
    '.rvp-me i{font-style:normal;width:26px;height:26px;border-radius:50%;background:#00ffff;color:#000;display:flex;' +
    'align-items:center;justify-content:center;font-weight:900;flex:none}' +
    '.rvp-me span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.rvp-tools{left:calc(38px + env(safe-area-inset-left));top:50%;transform:translateY(-50%);flex-direction:column;' +
    'padding:5px;border:1px solid #00ff41;border-radius:10px;background:rgba(0,0,0,.55)}' +
    '.rvp-swatch{width:36px;height:36px;border-radius:50%!important}' +
    '.rvp-bl{left:calc(10px + env(safe-area-inset-left));bottom:calc(10px + var(--rvp-bo,0px) + env(safe-area-inset-bottom))}' +
    '.rvp-bl button{font-size:22px;padding:8px 10px}' +
    '.rvp-br{right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + var(--rvp-bo,0px) + env(safe-area-inset-bottom))}' +
    '.rvp-br button{width:66px;height:66px;border-radius:50%;font-size:34px;border:2px solid #ffeb3b;' +
    'box-shadow:0 0 16px rgba(255,235,59,.55);padding:0}' +
    '.rvp-type{left:50%;bottom:calc(14px + var(--rvp-bo,0px) + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;' +
    'width:min(460px,calc(100% - 200px));flex-wrap:nowrap}' +
    '.rvp-type.open{display:flex}' +
    '.rvp input,.rvp textarea,.rvp select{font:inherit;font-size:16px;color:#00ff41;background:rgba(0,0,0,.85);' +
    'border:1px solid #00ff41;border-radius:8px;padding:8px;user-select:text;-webkit-user-select:text}' +
    '.rvp-type input{flex:1;min-width:0}' +
    '.rvp-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;width:min(420px,calc(100% - 24px));' +
    'max-height:82%;overflow:auto;background:rgba(0,0,0,.94);border:1px solid #00ff41;border-radius:12px;padding:18px;' +
    'text-align:center;box-shadow:0 0 30px rgba(0,255,65,.35);display:none}' +
    '.rvp-panel.open{display:block}' +
    '.rvp-panel h3{margin:0 0 10px;font-size:16px;color:#ffeb3b}' +
    '.rvp-panel p{margin:0 0 14px;font-size:13px;color:#ccc;line-height:1.45}' +
    '.rvp-panel .rvp-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
    '.rvp-big{display:flex;flex-direction:column;gap:10px;margin:6px 0 14px}' +
    '.rvp-big button{font-size:18px;padding:16px;border-width:2px;text-align:left;display:flex;justify-content:space-between;align-items:center}' +
    '.rvp-big button small{font-size:11px;opacity:.8}' +
    '.rvp-item{display:flex;align-items:center;gap:6px;margin:6px 0;font-size:12px;color:#ccc;text-align:left}' +
    '.rvp-item span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}' +
    '.rvp-item button{min-width:32px;min-height:32px;padding:5px}' +
    '.rvp-replay{position:absolute;inset:0;z-index:9;background:#000;display:none}' +
    '.rvp-replay.open{display:block}' +
    '.rvp-replay video,.rvp-replay img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}' +
    '.rvp-replay img{display:none}' +
    '.rvp-rbar{top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);padding:5px;' +
    'border:1px solid #ff00ff;border-radius:10px;background:rgba(0,0,0,.7)}' +
    '.rvp-rbar b{color:#ff66ff;font-size:13px;padding:0 6px}' +
    '.rvp-toast{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);z-index:20;' +
    'background:rgba(0,0,0,.9);border:1px solid #ffeb3b;color:#ffeb3b;font-size:13px;padding:7px 12px;border-radius:8px;' +
    'pointer-events:none;opacity:0;transition:opacity .3s;max-width:90%;text-align:center}' +
    '.rvp-toast.show{opacity:1}' +
    'html.rvp-open .rvd-corner,html.rvp-open #rvd-taskbar,html.rvp-open .rvd-win{display:none!important}' +
    '@media (max-width:760px){' +
    '.rvp-user{max-width:calc(100% - 16px - var(--rvp-uo,0px));flex-wrap:nowrap}.rvp-me span{display:none}' +
    '.rvp-top{top:calc(62px + env(safe-area-inset-top));max-width:calc(100% - 16px)}' +
    '.rvp-rbar{top:calc(62px + env(safe-area-inset-top))}' +
    '.rvp-type{width:calc(100% - 20px);bottom:calc(90px + var(--rvp-bo,0px) + env(safe-area-inset-bottom))}' +
    '.rvp-toast{top:calc(170px + env(safe-area-inset-top))}}';

  // ---------------------------------------------------------------- state
  var sealed = false, sealOk = false;
  var camStream = null, micStream = null, facing = 'user';
  var actx = null, recDest = null, micNode = null;
  var mix, mixCtx, mixStream = null, loopOn = false, lastFrame = 0;
  var recs = [], recPaused = false, mime = '', recTimer = null, keptAt = 0;
  var shapes = [], cur = null, tool = 'pen', color = COLORS[0], lineSize = SIZES[1], pendingText = '';
  var root, cam, draw, drawCtx, ui = {};
  var built = false, isOpen = false;

  function camAllowed() { return lsGet(K_CAM) === '1'; }
  function micAllowed() { return lsGet(K_MIC) === '1'; }
  function devicesUsable() { return sealOk && !rvPrivacy.isPrivate(); }
  function userName() {
    if (rvPrivacy.isPrivate()) return 'incognito';
    try {
      var u = JSON.parse(lsGet('rud_useRbox_v2') || 'null');
      if (u && u.username) return u.username;
    } catch (e) {}
    return lsGet(K_NAME) || 'guest';
  }

  // ---------------------------------------------------------------- 🔒 the seal
  function seal() {
    if (sealed) return Promise.resolve(sealOk);
    sealed = true;
    document.documentElement.classList.add('rvp-bunker');
    // anything that can talk to the network on its own goes first
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (f) {
      try { f.src = 'about:blank'; } catch (e) {}
      f.remove();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.rv-layer,.rvd-win,.rvd-task'), function (n) { n.remove(); });
    var dns = el('meta'); dns.httpEquiv = 'x-dns-prefetch-control'; dns.content = 'off';
    var csp = el('meta'); csp.httpEquiv = 'Content-Security-Policy'; csp.content = BUNKER_CSP;
    document.head.appendChild(dns);
    document.head.appendChild(csp);
    ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription'].forEach(function (k) {
      try { Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false }); }
      catch (e) { try { window[k] = undefined; } catch (e2) {} }
    });
    try { window.open = function () { return null; }; } catch (e) {}
    // prove it: a request to our own site must be refused by the browser itself
    return new Promise(function (resolve) {
      var done = false;
      function onViolation(e) { if (/connect-src/.test(e.violatedDirective || e.effectiveDirective || '')) finish(true); }
      function finish(v) {
        if (done) return;
        done = true;
        document.removeEventListener('securitypolicyviolation', onViolation);
        sealOk = v;
        resolve(v);
      }
      document.addEventListener('securitypolicyviolation', onViolation);
      var probe = (location.origin && location.origin !== 'null' ? location.origin : '') + '/__rv_bunker_probe?' + Date.now();
      try {
        fetch(probe, { cache: 'no-store' }).then(function () { finish(false); },
          function () { setTimeout(function () { finish(false); }, 500); });
      } catch (e) { finish(false); }
      setTimeout(function () { finish(false); }, 2000);
    });
  }

  // leaving = reloading: the seal can't be lifted from inside the page
  function leave(after) {
    if (!sealed) { hideWindow(); if (after) runAfter(after); return; }
    var unsaved = recs.length && bufferSec() > 3 && Date.now() - keptAt > 5000;
    ui.leaveMsg.textContent = unsaved
      ? 'The page reloads to reconnect to the internet. The back-recording (' + fmt(bufferSec()) +
        ') is not kept yet and will be gone.'
      : 'The page reloads to reconnect to the internet. Everything in 🗂 session stays on this device.';
    ui.leaveKeep.style.display = unsaved ? '' : 'none';
    ui.leave.dataset.after = after || '';
    openPanel(ui.leave);
  }
  function doLeave(after) {
    try { sessionStorage.setItem(K_AFTER, after || ''); } catch (e) {}
    stopCam(true); stopMic(true);
    location.reload();
  }
  function runAfter(after) {
    if (after === 'popcorn') {
      if (typeof CFG.onPopcorn === 'function') CFG.onPopcorn();
    } else if (after === 'chat') {
      if (typeof CFG.onChat === 'function') CFG.onChat();
      else if (window.rvView && window.rvView.openLayer) window.rvView.openLayer(CFG.chatUrl);
      else window.open(CFG.chatUrl, '_blank', 'noopener');
    }
  }

  // ---------------------------------------------------------------- 📷 camera / 🎤 microphone
  function ensureAudio() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    recDest = actx.createMediaStreamDestination();   // silent until the mic is on
    return actx;
  }
  function watchEnd(s, fn) {
    s.getTracks().forEach(function (t) { t.addEventListener('ended', function () { fn(); }); });
  }
  function startCam() {
    if (camStream) return Promise.resolve(camStream);
    if (!devicesUsable()) return Promise.reject(new Error('unavailable'));
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    }).then(function (s) {
      camStream = s;
      lsSet(K_CAM, '1');
      cam.srcObject = s;
      cam.play().catch(function () {});
      watchEnd(s, function () { if (camStream === s) stopCam(true); });
      startMix();
      startRecording();
      refresh();
      return s;
    });
  }
  function stopCam(keep) {
    stopRecording();
    loopOn = false;
    if (camStream) camStream.getTracks().forEach(function (t) { t.stop(); });
    camStream = null;
    if (cam) cam.srcObject = null;
    if (keep !== true) lsSet(K_CAM, '0');
    refresh();
  }
  function flipCam() {
    if (!camStream) return;
    facing = facing === 'user' ? 'environment' : 'user';
    var old = camStream;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    }).then(function (s) {
      old.getTracks().forEach(function (t) { t.stop(); });
      camStream = s;          // the recorders record the mix canvas, so they carry on
      cam.srcObject = s;
      cam.play().catch(function () {});
      watchEnd(s, function () { if (camStream === s) stopCam(true); });
      refresh();
    }, function () { facing = facing === 'user' ? 'environment' : 'user'; toast('Could not switch camera'); });
  }
  function startMic() {
    if (micStream) return Promise.resolve(micStream);
    if (!devicesUsable()) return Promise.reject(new Error('unavailable'));
    ensureAudio();
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }, video: false
    }).then(function (s) {
      micStream = s;
      lsSet(K_MIC, '1');
      if (actx) {
        if (actx.state === 'suspended') actx.resume().catch(function () {});
        micNode = actx.createMediaStreamSource(s);
        micNode.connect(recDest);
      }
      watchEnd(s, function () { if (micStream === s) stopMic(true); });
      refresh();
      return s;
    });
  }
  function stopMic(keep) {
    if (micNode) { try { micNode.disconnect(); } catch (e) {} micNode = null; }
    if (micStream) micStream.getTracks().forEach(function (t) { t.stop(); });
    micStream = null;
    if (keep !== true) lsSet(K_MIC, '0');
    refresh();
  }
  function deviceError(what, err) {
    toast(err && err.name === 'NotAllowedError'
      ? what + ' blocked — allow it in the browser’s site settings'
      : what + ': ' + ((err && err.message) || 'unavailable'));
  }
  function toggleCam() {
    if (!devicesUsable()) { explainNA(); return; }
    if (camStream) stopCam(); else startCam().catch(function (e) { deviceError('Camera', e); });
  }
  function toggleMic() {
    if (!devicesUsable()) { explainNA(); return; }
    if (micStream) stopMic(); else startMic().catch(function (e) { deviceError('Microphone', e); });
  }
  function explainNA() {
    toast(rvPrivacy.isPrivate() ? '🕶 Private mode — camera and mic are unavailable'
      : !sealed ? 'Enter the bunker first' : 'This browser could not seal the page — camera and mic stay off');
  }

  // ---------------------------------------------------------------- mix canvas (what gets recorded)
  function sizeMix() {
    if (!mix) return;
    var w = window.innerWidth || 1280, h = window.innerHeight || 720;
    var k = 1280 / Math.max(w, h);
    mix.width = Math.max(2, Math.round(w * k / 2) * 2);
    mix.height = Math.max(2, Math.round(h * k / 2) * 2);
  }
  function startMix() {
    if (!mix) { mix = document.createElement('canvas'); mixCtx = mix.getContext('2d'); }
    sizeMix();
    if (!mixStream && mix.captureStream) {
      mixStream = mix.captureStream(CFG.fps);
      ensureAudio();
      // always one audio track: silence, or the mic when it's on
      if (recDest) recDest.stream.getAudioTracks().forEach(function (t) { mixStream.addTrack(t); });
    }
    if (!loopOn) { loopOn = true; requestAnimationFrame(frame); }
  }
  function coverDraw(ctx, video, W, H, mirror) {
    var vw = video.videoWidth, vh = video.videoHeight;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (!vw || !vh) return;
    var s = Math.max(W / vw, H / vh), dw = vw * s, dh = vh * s;
    ctx.save();
    if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    ctx.restore();
  }
  function frame(t) {
    if (!loopOn) return;
    requestAnimationFrame(frame);
    if (t - lastFrame < 1000 / CFG.fps - 2) return;
    lastFrame = t;
    if (camStream) coverDraw(mixCtx, cam, mix.width, mix.height, facing === 'user');
    paintShapes(mixCtx, mix.width, mix.height, shapes.concat(cur ? [cur] : []));
  }

  // ---------------------------------------------------------------- back-recording
  function pickMime() {
    if (!window.MediaRecorder) return '';
    var list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
    for (var i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {}
    }
    return '';
  }
  function canRecord() { return !!(window.MediaRecorder && mixStream); }
  function newRecorder() {
    var opts = { videoBitsPerSecond: CFG.bitrate };
    if (mime) opts.mimeType = mime;
    var r = { chunks: [], t0: Date.now(), rec: null };
    try { r.rec = new MediaRecorder(mixStream, opts); }
    catch (e) { try { r.rec = new MediaRecorder(mixStream); } catch (e2) { return null; } }
    if (!mime) mime = r.rec.mimeType || 'video/webm';
    r.rec.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
    try { r.rec.start(1000); } catch (e) { return null; }
    return r;
  }
  function dropRecorder(r) {
    try { if (r.rec.state !== 'inactive') r.rec.stop(); } catch (e) {}
    r.chunks = [];
  }
  // every second: start a fresh recorder once the newest is a minute old, keep
  // only two — so the oldest always holds 60..120 s of the past
  function recTick() {
    if (!camStream || recPaused || !canRecord()) { refreshRec(); return; }
    var newest = recs[recs.length - 1];
    if (!newest || Date.now() - newest.t0 >= CFG.segmentSec * 1000) {
      var r = newRecorder();
      if (r) recs.push(r);
    }
    while (recs.length > 2) dropRecorder(recs.shift());
    refreshRec();
  }
  function startRecording() {
    if (!mime) mime = pickMime();
    if (!recTimer) recTimer = setInterval(recTick, 1000);
    recTick();
  }
  function stopRecording() {
    if (recTimer) { clearInterval(recTimer); recTimer = null; }
    recs.forEach(dropRecorder);
    recs = [];
    refreshRec();
  }
  function bufferSec() { return recs.length ? (Date.now() - recs[0].t0) / 1000 : 0; }
  function bufferBlob() {
    var r = recs[0];
    if (!r || !r.chunks.length) return null;
    return new Blob(r.chunks, { type: (mime || 'video/webm').split(';')[0] });
  }
  function togglePause() {
    recPaused = !recPaused;
    if (recPaused) { recs.forEach(dropRecorder); recs = []; toast('⏸ Back-recording paused — buffer cleared'); }
    else { recTick(); toast('● Back-recording on'); }
    refresh();
  }
  function keepBuffer() {
    var b = bufferBlob();
    if (!b) { toast('Nothing recorded yet'); return Promise.resolve(null); }
    var d = bufferSec();
    keptAt = Date.now();
    return saveMedia({ kind: 'video', blob: b, duration: d, name: 'back-recording ' + stamp() })
      .then(function (m) { toast('💾 Kept in 🗂 session (' + fmt(d) + ')'); return m; },
        function () { toast('Could not save — is the device storage full?'); });
  }
  function snapshot() {
    var cv = document.createElement('canvas');
    var w = window.innerWidth, h = window.innerHeight;
    var k = Math.min(2, Math.max(1, 1920 / Math.max(w, h)));
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var ctx = cv.getContext('2d');
    if (camStream) coverDraw(ctx, cam, cv.width, cv.height, facing === 'user');
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }
    paintShapes(ctx, cv.width, cv.height, shapes);
    cv.toBlob(function (b) {
      if (!b) { toast('Snapshot failed'); return; }
      saveMedia({ kind: 'image', blob: b, name: 'snapshot ' + stamp() })
        .then(function () { toast('📸 Kept in 🗂 session'); });
    }, 'image/png');
  }

  // ---------------------------------------------------------------- replay / viewer
  var viewing = null;
  function replay(back) {
    var b = bufferBlob();
    if (!b) { toast(camStream ? 'Still filling the buffer…' : 'Camera is off — nothing recorded'); return; }
    var have = bufferSec();
    show({ url: URL.createObjectURL(b), kind: 'video', temp: true },
      back ? '⏪ ' + fmt(Math.min(back, have)) + ' back' : '🎞 all ' + fmt(have), back);
  }
  function show(c, title, back) {
    closeViewer();
    viewing = c;
    ui.rTitle.textContent = title;
    var v = ui.rVideo, img = ui.rImg;
    if (c.kind === 'image') {
      v.style.display = 'none'; img.style.display = 'block'; img.src = c.url;
    } else {
      img.style.display = 'none'; v.style.display = 'block';
      v.onloadedmetadata = function () {
        var go = function () {
          var d = v.duration;
          if (back && isFinite(d)) v.currentTime = Math.max(0, d - back);
          var p = v.play(); if (p && p.catch) p.catch(function () {});
        };
        if (isFinite(v.duration)) { go(); return; }
        // live-recorded webm has no duration yet — seek to the end once to learn it
        v.ontimeupdate = function () { v.ontimeupdate = null; v.currentTime = 0; go(); };
        v.currentTime = 1e101;
      };
      v.src = c.url;
    }
    ui.rKeep.style.display = c.temp ? '' : 'none';
    ui.replay.classList.add('open');
  }
  function closeViewer() {
    if (!viewing) return;
    ui.rVideo.pause();
    ui.rVideo.removeAttribute('src');
    ui.rVideo.load();
    if (viewing.temp) URL.revokeObjectURL(viewing.url);
    viewing = null;
    ui.replay.classList.remove('open');
  }
  function showMedia(m) {
    closePanels();
    show({ url: URL.createObjectURL(m.blob), kind: m.kind === 'image' ? 'image' : 'video', temp: false, own: true }, m.name);
  }
  function download(blob, name) {
    var a = el('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    a.setAttribute('data-rv-nolayer', '');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
  }
  function fileName(m) {
    var ext = m.kind === 'image' ? 'png' : /mp4/.test(m.mime) ? 'mp4' : /ogg/.test(m.mime) ? 'ogg' : 'webm';
    return 'rudventur-' + String(m.name).replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) + '.' + ext;
  }

  // ---------------------------------------------------------------- 🗂 session + 🗑 bin panels
  var KIND_ICON = { video: '🎞', audio: '🔊', image: '🖼', movie: '🎬' };
  function row(parent, label, buttons) {
    var r = el('div', 'rvp-item');
    r.appendChild(el('span', '', label));
    buttons.forEach(function (b) { if (b) button(r, b[0], b[1], b[2]); });
    parent.appendChild(r);
  }
  function refreshSession() {
    if (!built) return;
    DB.all('media').then(function (all) {
      all.sort(function (a, b) { return b.created - a.created; });
      var live = all.filter(function (m) { return !m.binned; });
      ui.sessBtn.textContent = '🗂 ' + live.length;
      if (!ui.session.classList.contains('open')) return;
      var list = $('.rvp-list', ui.session);
      list.innerHTML = live.length ? '' : '<p>Nothing kept yet — 💾 and 📸 from the palette, or 📥 import.</p>';
      live.forEach(function (m) {
        row(list, KIND_ICON[m.kind] + ' ' + esc(m.name) + '<br><small>' +
          (m.duration ? fmt(m.duration) + ' · ' : '') + size(m.blob.size) + '</small>', [
          ['▶', 'Show', function () { showMedia(m); }],
          ['🎬', 'Use in the movie maker', function () { openMovie(m); }],
          ['⬇', 'Save a copy to this device', function () { download(m.blob, fileName(m)); }],
          ['🗑', 'Move to the bin', function () { m.binned = true; DB.put('media', m).then(refreshSession); }]
        ]);
      });
    }).catch(function () {});
  }
  function refreshBin() {
    Promise.all([DB.all('media'), DB.all('projects')]).then(function (res) {
      var media = res[0].filter(function (m) { return m.binned; });
      var projects = res[1].filter(function (p) { return p.binned; });
      var list = $('.rvp-list', ui.bin);
      list.innerHTML = media.length || projects.length ? '' : '<p>The bin is empty.</p>';
      projects.forEach(function (p) {
        row(list, '📽 ' + esc(p.name || 'movie plan') + '<br><small>movie plan</small>', [
          ['↩', 'Restore', function () { p.binned = false; DB.put('projects', p).then(refreshBin); }],
          ['🔥', 'Remove for good', function () { DB.del('projects', p.id).then(refreshBin); }]
        ]);
      });
      media.forEach(function (m) {
        row(list, KIND_ICON[m.kind] + ' ' + esc(m.name) + '<br><small>' + size(m.blob.size) + '</small>', [
          ['↩', 'Restore', function () { m.binned = false; DB.put('media', m).then(function () { refreshBin(); refreshSession(); }); }],
          ['🔥', 'Remove for good', function () { DB.del('media', m.id).then(refreshBin); }]
        ]);
      });
      ui.binEmpty.disabled = !(media.length || projects.length);
    });
  }
  function emptyBin() {
    if (!confirm('Remove everything in the bin for good? This can’t be undone.')) return;
    Promise.all([DB.all('media'), DB.all('projects')]).then(function (res) {
      var jobs = [];
      res[0].forEach(function (m) { if (m.binned) jobs.push(DB.del('media', m.id)); });
      res[1].forEach(function (p) { if (p.binned) jobs.push(DB.del('projects', p.id)); });
      return Promise.all(jobs);
    }).then(function () { refreshBin(); toast('🔥 Bin emptied'); });
  }
  function importFiles(files) {
    var jobs = Array.prototype.map.call(files, function (f) {
      var kind = /^image\//.test(f.type) ? 'image' : /^audio\//.test(f.type) ? 'audio' : /^video\//.test(f.type) ? 'video' : '';
      if (!kind) return Promise.resolve();
      return saveMedia({ kind: kind, blob: f, name: f.name.replace(/\.[^.]+$/, '') });
    });
    Promise.all(jobs).then(function () { toast('📥 Imported into 🗂 session'); refreshSession(); });
  }
  function openMovie(m) {
    closePanels();
    if (window.rvMovie) window.rvMovie.open(m ? { add: m } : {});
    else toast('Movie maker not loaded on this page');
  }

  // old camera recordings from before the bunker (the hub's IndexedDB) come along once
  function migrateLegacy() {
    if (!CFG.legacyDB || lsGet(K_LEGACY) === '1') return;
    var fresh = false;
    var r = indexedDB.open(CFG.legacyDB);
    r.onupgradeneeded = function () { fresh = true; };
    r.onsuccess = function () {
      var d = r.result;
      if (fresh || !d.objectStoreNames.contains('videos')) { d.close(); lsSet(K_LEGACY, '1'); return; }
      var q = d.transaction('videos', 'readonly').objectStore('videos').getAll();
      q.onsuccess = function () {
        Promise.all((q.result || []).map(function (v) {
          return v.blob ? saveMedia({ kind: 'video', blob: v.blob, name: 'old recording ' + (v.timestamp || '') }) : null;
        })).then(function () { lsSet(K_LEGACY, '1'); d.close(); });
      };
    };
  }

  // ---------------------------------------------------------------- drawing
  // shapes live in 0..1 screen space so they redraw at any size
  function paintShapes(ctx, W, H, list) {
    var k = W / (window.innerWidth || W);
    list.forEach(function (s) {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = s.color;
      ctx.lineWidth = s.size * k;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.shadowColor = s.color; ctx.shadowBlur = 6 * k;
      var a = s.pts[0], b = s.pts[s.pts.length - 1];
      var ax = a[0] * W, ay = a[1] * H, bx = b[0] * W, by = b[1] * H;
      ctx.beginPath();
      if (s.t === 'pen') {
        ctx.moveTo(ax, ay);
        for (var i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i][0] * W, s.pts[i][1] * H);
        if (s.pts.length === 1) ctx.lineTo(ax + 0.1, ay);
        ctx.stroke();
      } else if (s.t === 'line') {
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      } else if (s.t === 'rect') {
        ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
      } else if (s.t === 'circle') {
        ctx.arc(ax, ay, Math.hypot(bx - ax, by - ay), 0, Math.PI * 2); ctx.stroke();
      } else if (s.t === 'text') {
        var fs = (14 + s.size * 3) * k;
        ctx.font = 'bold ' + fs + "px 'Courier New', monospace";
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4 * k;
        ctx.lineWidth = 3 * k; ctx.strokeStyle = '#000';
        String(s.text).split('\n').forEach(function (line, n) {
          ctx.strokeText(line, ax, ay + n * fs * 1.2);
          ctx.fillText(line, ax, ay + n * fs * 1.2);
        });
      }
      ctx.restore();
    });
  }
  function sizeDraw() {
    if (!draw) return;
    var d = window.devicePixelRatio || 1;
    draw.width = Math.round(window.innerWidth * d);
    draw.height = Math.round(window.innerHeight * d);
    redraw();
  }
  function redraw() {
    if (!drawCtx) return;
    drawCtx.clearRect(0, 0, draw.width, draw.height);
    paintShapes(drawCtx, draw.width, draw.height, shapes.concat(cur ? [cur] : []));
  }
  function pt(e) {
    var r = draw.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }
  function onDown(e) {
    if (e.button && e.button !== 0) return;
    var p = pt(e);
    if (tool === 'text') {
      if (!pendingText) { openType(); return; }
      shapes.push({ t: 'text', color: color, size: lineSize, pts: [p], text: pendingText });
      pendingText = '';
      tool = 'pen';
      redraw(); refresh();
      return;
    }
    if (draw.setPointerCapture) draw.setPointerCapture(e.pointerId);
    cur = { t: tool, color: color, size: lineSize, pts: tool === 'pen' ? [p] : [p, p] };
    redraw();
  }
  function onMove(e) {
    if (!cur) return;
    var p = pt(e);
    if (cur.t === 'pen') cur.pts.push(p); else cur.pts[1] = p;
    redraw();
  }
  function onUp() {
    if (!cur) return;
    shapes.push(cur);
    cur = null;
    redraw(); refresh();
  }
  function openType() {
    ui.type.classList.add('open');
    ui.typeIn.value = pendingText;
    setTimeout(function () { ui.typeIn.focus(); }, 30);
  }
  function closeType() { ui.type.classList.remove('open'); ui.typeIn.blur(); }
  function commitType() {
    var v = ui.typeIn.value.trim();
    closeType();
    if (!v) return;
    pendingText = v;
    tool = 'text';
    refresh();
    toast('Tap where the text goes');
  }

  // ---------------------------------------------------------------- toast
  var toastT = 0;
  function toast(msg) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { ui.toast.classList.remove('show'); }, 2600);
  }

  // ---------------------------------------------------------------- building the window
  function button(parent, label, title, fn, cls) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(e); });
    parent.appendChild(b);
    return b;
  }
  function panel(html) {
    var p = el('div', 'rvp-panel', html);
    root.appendChild(p);
    return p;
  }
  var PANELS = [];
  function openPanel(p) { closePanels(); p.classList.add('open'); }
  function closePanels() { PANELS.forEach(function (p) { p.classList.remove('open'); }); }
  function attachStyles() {
    if ($('#rvp-style')) return;
    var st = el('style');
    st.id = 'rvp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function build() {
    if (built) return;
    built = true;
    attachStyles();
    root = el('div', 'rvp');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Popcorn window');
    root.style.setProperty('--rvp-z', String(CFG.zIndex));
    root.style.setProperty('--rvp-bo', (CFG.bottomOffset || 0) + 'px');
    root.style.setProperty('--rvp-uo', (CFG.userOffset || 0) + 'px');

    cam = el('video', 'rvp-cam');
    cam.muted = true; cam.playsInline = true; cam.autoplay = true;
    cam.setAttribute('playsinline', ''); cam.setAttribute('muted', '');
    draw = el('canvas', 'rvp-draw');
    drawCtx = draw.getContext('2d');
    draw.addEventListener('pointerdown', onDown);
    draw.addEventListener('pointermove', onMove);
    draw.addEventListener('pointerup', onUp);
    draw.addEventListener('pointercancel', onUp);
    root.appendChild(cam); root.appendChild(draw);

    // top middle — seal status + back-recording palette
    var top = el('div', 'rvp-bar rvp-top');
    ui.seal = el('span', 'rvp-seal');
    top.appendChild(ui.seal);
    ui.rec = el('span', 'rvp-rec');
    top.appendChild(ui.rec);
    ui.back = [10, 30, 60].map(function (s) {
      return button(top, '⏪' + s + 's', 'Replay the last ' + s + ' seconds', function () { replay(s); });
    });
    ui.all = button(top, '🎞 ALL', 'Replay everything in the buffer', function () { replay(0); });
    ui.keep = button(top, '💾', 'Keep the back-recording in the session', keepBuffer);
    button(top, '📸', 'Snapshot (with drawings) into the session', snapshot);
    ui.pause = button(top, '⏸', 'Pause / resume back-recording', togglePause);
    button(top, '🎬', 'Movie maker', function () { openMovie(null); });
    ui.sessBtn = button(top, '🗂 0', 'Session — everything kept on this device', function () {
      if (ui.session.classList.contains('open')) closePanels(); else { openPanel(ui.session); refreshSession(); }
    });
    root.appendChild(top);

    // top right — user box
    var user = el('div', 'rvp-bar rvp-user');
    ui.me = el('div', 'rvp-me', '<i></i><span></span>');
    ui.me.title = 'Your profile';
    ui.me.addEventListener('click', function (e) {
      e.stopPropagation();
      if (rvPrivacy.isPrivate()) { toast('🕶 Incognito — no profile in private mode'); return; }
      if (typeof CFG.onUser === 'function') { CFG.onUser(); return; }
      var n = prompt('Your name', lsGet(K_NAME) || '');
      if (n != null) { lsSet(K_NAME, n.trim().slice(0, 24)); refresh(); }
    });
    user.appendChild(ui.me);
    ui.camBtn = button(user, '📷', 'Camera on / off', toggleCam);
    ui.micBtn = button(user, '🎤', 'Microphone on / off', toggleMic);
    ui.flip = button(user, '🔄', 'Switch front / back camera', flipCam);
    ui.mode = button(user, '🌐', 'Online / private', function () {
      var goPrivate = !rvPrivacy.isPrivate();
      rvPrivacy.set(goPrivate ? 'private' : 'online');
      toast(goPrivate ? '🕶 Private — camera, mic and profile are off' : '🌐 Online — only your name is shown');
    });
    button(user, '✕', 'Leave the bunker', function () { leave(''); });
    root.appendChild(user);

    // left — drawing tools
    var tools = el('div', 'rvp-bar rvp-tools');
    ui.tools = {};
    TOOLS.forEach(function (t) {
      ui.tools[t[0]] = button(tools, t[1], t[2], function () {
        if (t[0] === 'text') { openType(); return; }
        tool = t[0]; refresh();
      });
    });
    ui.swatch = button(tools, '', 'Colour', function () {
      color = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]; refresh();
    }, 'rvp-swatch');
    ui.size = button(tools, '', 'Thickness', function () {
      lineSize = SIZES[(SIZES.indexOf(lineSize) + 1) % SIZES.length]; refresh();
    });
    ui.undo = button(tools, '↶', 'Undo', function () { shapes.pop(); redraw(); refresh(); });
    ui.clear = button(tools, '🗑', 'Clear drawing', function () { shapes = []; redraw(); refresh(); });
    root.appendChild(tools);

    // bottom left — keyboard + chat
    var bl = el('div', 'rvp-bar rvp-bl');
    button(bl, '⌨️', 'Type a description onto the picture', openType);
    ui.chat = button(bl, '💬', 'Global chat (leaves the bunker)', function () { leave('chat'); });
    root.appendChild(bl);

    // bottom right — the real popcorn button
    var br = el('div', 'rvp-bar rvp-br');
    button(br, '🍿', 'Popcorn (leaves the bunker)', function () { leave('popcorn'); });
    root.appendChild(br);

    // typing bar
    ui.type = el('div', 'rvp-bar rvp-type');
    ui.typeIn = el('input');
    ui.typeIn.type = 'text';
    ui.typeIn.placeholder = 'Describe the picture… (Enter, then tap where it goes)';
    ui.typeIn.maxLength = 140;
    ui.typeIn.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter') commitType();
      else if (e.key === 'Escape') closeType();
    });
    ui.type.appendChild(ui.typeIn);
    button(ui.type, '✔', 'Place text', commitType);
    root.appendChild(ui.type);

    // the bunker door
    ui.door = panel('<h3>🔒 ENTER THE BUNKER</h3>' +
      '<p>Inside, your camera and microphone work <b>only on this device</b>. This page is cut off from ' +
      'the internet while you are in — the browser itself refuses every connection. Open windows like ' +
      'chat close. Leaving reloads the page.</p><p class="rvp-door-private" style="color:#aaa"></p>' +
      '<div class="rvp-row"></div>');
    var dr = $('.rvp-row', ui.door);
    button(dr, '🔒 ENTER', 'Enter the bunker', enter);
    button(dr, 'NOT NOW', 'Close', function () { hideWindow(); });

    // camera + microphone allowance (two big separate switches)
    ui.devices = panel('<h3>📷 🎤 YOUR DEVICES</h3>' +
      '<p>Each one is separate. Pictures and sound stay on this device — nothing can leave the bunker.</p>' +
      '<div class="rvp-big"></div><p class="rvp-dev-why" style="color:#ff9999;margin:0 0 10px"></p><div class="rvp-row"></div>');
    var big = $('.rvp-big', ui.devices);
    ui.bigCam = button(big, '', 'Camera', toggleCam);
    ui.bigMic = button(big, '', 'Microphone', toggleMic);
    button($('.rvp-row', ui.devices), '✔ DONE', 'Close', closePanels);

    // leaving
    ui.leave = panel('<h3>🔓 LEAVE THE BUNKER?</h3><p></p><div class="rvp-row"></div>');
    ui.leaveMsg = $('p', ui.leave);
    var lr = $('.rvp-row', ui.leave);
    ui.leaveKeep = button(lr, '💾 KEEP & LEAVE', 'Keep the back-recording, then leave', function () {
      var after = ui.leave.dataset.after;
      keepBuffer().then(function () { doLeave(after); });
    });
    button(lr, '🔓 LEAVE', 'Leave', function () { doLeave(ui.leave.dataset.after); });
    button(lr, 'STAY', 'Stay in the bunker', closePanels);

    // session
    ui.session = panel('<h3>🗂 SESSION — ON THIS DEVICE ONLY</h3><div class="rvp-row" style="margin-bottom:10px"></div>' +
      '<div class="rvp-list"></div>');
    var sr = $('.rvp-row', ui.session);
    ui.importIn = el('input');
    ui.importIn.type = 'file'; ui.importIn.multiple = true; ui.importIn.accept = 'video/*,audio/*,image/*';
    ui.importIn.style.display = 'none';
    ui.importIn.addEventListener('change', function () { importFiles(ui.importIn.files); ui.importIn.value = ''; });
    ui.session.appendChild(ui.importIn);
    button(sr, '📥 IMPORT', 'Bring files from this device', function () { ui.importIn.click(); });
    button(sr, '🗑 BIN', 'The bin', function () { openPanel(ui.bin); refreshBin(); });
    button(sr, '✕', 'Close', closePanels);

    // bin
    ui.bin = panel('<h3>🗑 BIN</h3><p style="font-size:11px">↩ puts things back. 🔥 removes them from this device for good.</p>' +
      '<div class="rvp-list"></div><div class="rvp-row" style="margin-top:12px"></div>');
    var brow = $('.rvp-row', ui.bin);
    ui.binEmpty = button(brow, '🔥 EMPTY BIN', 'Remove everything in the bin for good', emptyBin);
    button(brow, '↩ SESSION', 'Back to the session', function () { openPanel(ui.session); refreshSession(); });
    button(brow, '✕', 'Close', closePanels);
    PANELS = [ui.door, ui.devices, ui.leave, ui.session, ui.bin];

    // viewer
    ui.replay = el('div', 'rvp-replay');
    ui.rVideo = el('video'); ui.rVideo.controls = true; ui.rVideo.playsInline = true;
    ui.rVideo.setAttribute('playsinline', '');
    ui.rImg = el('img'); ui.rImg.alt = 'Snapshot';
    ui.replay.appendChild(ui.rVideo); ui.replay.appendChild(ui.rImg);
    var rbar = el('div', 'rvp-bar rvp-rbar');
    ui.rTitle = el('b');
    rbar.appendChild(ui.rTitle);
    ui.rKeep = button(rbar, '💾 KEEP', 'Keep this in the session', function () { keepBuffer(); });
    button(rbar, '● LIVE', 'Back to live', closeViewer);
    ui.replay.appendChild(rbar);
    root.appendChild(ui.replay);

    ui.toast = el('div', 'rvp-toast');
    root.appendChild(ui.toast);

    document.body.appendChild(root);
    document.addEventListener('keydown', function (e) {
      if (!isOpen || e.key !== 'Escape') return;
      if (window.rvMovie && window.rvMovie.isOpen && window.rvMovie.isOpen()) return;
      if (viewing) closeViewer();
      else if (ui.type.classList.contains('open')) closeType();
      else if (PANELS.some(function (p) { return p.classList.contains('open'); })) {
        if (ui.door.classList.contains('open')) hideWindow(); else closePanels();
      } else leave('');
    });
    document.addEventListener('rvprivacy', function () {
      if (rvPrivacy.isPrivate()) { stopCam(true); stopMic(true); }
      refresh();
    });
  }

  function enter() {
    closePanels();
    toast('Sealing…');
    seal().then(function (ok) {
      refresh();
      migrateLegacy();
      refreshSession();
      if (!ok) {
        toast('⚠ This browser could not seal the page — camera and mic stay off');
        openPanel(ui.devices);
        return;
      }
      toast('🔒 Sealed — nothing leaves this device');
      if (rvPrivacy.isPrivate()) return;
      var jobs = [];
      if (camAllowed()) jobs.push(startCam().catch(function () {}));
      if (micAllowed()) jobs.push(startMic().catch(function () {}));
      if (!jobs.length) openPanel(ui.devices);
    });
  }

  // ---------------------------------------------------------------- refresh UI
  function refreshRec() {
    var live = !!camStream && !recPaused && recs.length > 0;
    if (!built) return;
    var have = bufferSec();
    ui.rec.className = 'rvp-rec' + (live ? ' live' : '');
    ui.rec.innerHTML = !camStream ? '○ CAM OFF'
      : !canRecord() ? '○ NO REC HERE'
      : recPaused ? '⏸ PAUSED'
      : '<b>●</b> REC ' + fmt(have) + (micStream ? ' 🔊' : '');
    ui.back.forEach(function (b) { b.disabled = !live || have < 1; });
    ui.all.disabled = ui.keep.disabled = !live || have < 1;
  }
  function refresh() {
    refreshRec();
    if (!built) return;
    var priv = rvPrivacy.isPrivate(), usable = devicesUsable();
    var name = userName();
    $('i', ui.me).textContent = priv ? '🕶' : name.charAt(0).toUpperCase();
    $('span', ui.me).textContent = name;
    ui.seal.className = 'rvp-seal' + (sealed && !sealOk ? ' bad' : '');
    ui.seal.textContent = !sealed ? '🔓' : sealOk ? '🔒 SEALED' : '⚠ NOT SEALED';
    ui.seal.title = sealOk ? 'The browser refuses every connection from this page' : '';
    ui.camBtn.classList.toggle('on', !!camStream);
    ui.micBtn.classList.toggle('on', !!micStream);
    ui.camBtn.classList.toggle('na', !usable);
    ui.micBtn.classList.toggle('na', !usable);
    ui.bigCam.innerHTML = '<span>📷 CAMERA</span><small>' +
      (!usable ? 'unavailable' : camStream ? 'ON — tap to turn off' : 'OFF — tap to allow') + '</small>';
    ui.bigMic.innerHTML = '<span>🎤 MICROPHONE</span><small>' +
      (!usable ? 'unavailable' : micStream ? 'ON — tap to turn off' : 'OFF — tap to allow') + '</small>';
    ui.bigCam.className = camStream ? 'on' : ''; ui.bigMic.className = micStream ? 'on' : '';
    if (!usable) { ui.bigCam.classList.add('na'); ui.bigMic.classList.add('na'); }
    $('.rvp-dev-why', ui.devices).textContent = priv ? '🕶 Private mode — camera and microphone are unavailable.'
      : sealed && !sealOk ? '⚠ This browser could not seal the page, so camera and microphone stay off.' : '';
    $('.rvp-door-private', ui.door).textContent = priv
      ? '🕶 You are in private mode: camera and microphone stay off, but you can still work on your films.' : '';
    ui.flip.disabled = !camStream;
    ui.mode.textContent = priv ? '🕶' : '🌐';
    ui.mode.title = priv ? 'Private mode (tap for online)' : 'Online (tap for private)';
    ui.mode.classList.toggle('on', priv);
    ui.pause.classList.toggle('on', recPaused);
    ui.pause.disabled = !camStream || !canRecord();
    cam.classList.toggle('mirror', facing === 'user');
    Object.keys(ui.tools).forEach(function (k) { ui.tools[k].classList.toggle('on', tool === k); });
    ui.swatch.style.background = color;
    ui.swatch.style.borderColor = color;
    ui.size.innerHTML = '<span style="display:inline-block;width:' + (lineSize + 4) + 'px;height:' + (lineSize + 4) +
      'px;border-radius:50%;background:' + color + '"></span>';
    ui.undo.disabled = ui.clear.disabled = !shapes.length;
  }

  // ---------------------------------------------------------------- open / close
  function open() {
    build();
    isOpen = true;
    root.classList.add('open');
    document.documentElement.classList.add('rvp-open');
    document.documentElement.style.overflow = 'hidden';
    sizeDraw();
    if (!sealed) openPanel(ui.door);
    refresh();
    refreshSession();
  }
  // before sealing the window can simply close; after, closing means leaving
  function hideWindow() {
    if (!built) return;
    isOpen = false;
    closeViewer(); closeType(); closePanels();
    root.classList.remove('open');
    document.documentElement.classList.remove('rvp-open');
    document.documentElement.style.overflow = '';
  }
  function close() { if (sealed) leave(''); else hideWindow(); }
  function toggle() { if (isOpen) close(); else open(); }

  // ---------------------------------------------------------------- boot
  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { sizeDraw(); sizeMix(); }, 120);
  });

  function bindButtons() {
    var btns = document.querySelectorAll('[data-rv-popcorn]');
    if (!btns.length && CFG.button) {
      var fab = el('button', 'rvp-fab', '🍿');
      fab.type = 'button';
      fab.title = 'Popcorn window';
      fab.setAttribute('data-rv-popcorn', '');
      document.body.appendChild(fab);
      btns = [fab];
    }
    Array.prototype.forEach.call(btns, function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
    });
  }

  function init() {
    attachStyles();
    bindButtons();
    var after = '';
    try { after = sessionStorage.getItem(K_AFTER) || ''; sessionStorage.removeItem(K_AFTER); } catch (e) {}
    // what the popcorn / chat button asked for before the reload out of the bunker
    if (after) setTimeout(function () { runAfter(after); }, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.rvPopcorn = {
    open: open, close: close, leave: leave, toggle: toggle,
    isOpen: function () { return isOpen; },
    sealed: function () { return sealOk; },
    db: DB, saveMedia: saveMedia, refreshSession: refreshSession,
    micStream: function () { return micStream; },
    audioContext: function () { return ensureAudio(); },
    shapes: function () { return shapes.slice(); },
    paintShapes: paintShapes, toast: toast, download: download, fileName: fileName,
    root: function () { build(); return root; },
    config: CFG
  };
})();
