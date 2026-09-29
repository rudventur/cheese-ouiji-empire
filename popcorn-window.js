/* popcorn-window.js — the RUDVENTUR 🍿 popcorn window.

   Drop-in (one line, any page):
     <script src="popcorn-window.js"></script>

   What it does:
   1. Camera background: if the visitor already allowed the camera (browser
      permission is "granted" and they said yes in here before), the camera runs
      softly behind the page. If not, nothing changes — no prompt on page load.
   2. Popcorn window: any element marked data-rv-popcorn (or a floating 🍿 the
      script adds when there is none) opens a full-screen window with:
        - live camera behind everything (asks again if needed; no = black)
        - draw on the live picture: pen / line / circle / square / text
        - top middle: back-recording palette (replay 10s / 30s / 60s / all,
          save the buffer as a file, snapshot, pause, kept clips)
        - top right: user box (name, camera on/off, flip, background on/off, close)
        - bottom left: ⌨️ type a description onto the picture, 💬 global chat
        - bottom right: 🍿 the real popcorn button (does what the page's popcorn does)
   3. Back-recording: while the camera is on it records all the time (the
      picture you see, drawings included). Two recorders overlap — a fresh one
      starts every minute and the oldest is dropped — so the last 60–120 s are
      always retrievable, and each save is its own separate file.

   Config (set before the script loads, all optional):
     window.rvPopcornConfig = {
       onPopcorn: function () {},  // inner 🍿 action (default: close the window)
       chatUrl: '...',             // 💬 global chat address
       background: true,           // camera behind the page when already allowed
       bgOpacity: 0.28,
       button: true                // add a floating 🍿 when the page has none
     };

   API (window.rvPopcorn):
     rvPopcorn.open(), rvPopcorn.close(), rvPopcorn.toggle(),
     rvPopcorn.startCamera(), rvPopcorn.stopCamera(), rvPopcorn.config
*/
(function () {
  if (window.rvPopcorn) return;

  var CFG = Object.assign({
    onPopcorn: null,
    chatUrl: 'https://rudventur.github.io/global-chat-v5/',
    background: true,
    bgOpacity: 0.28,
    button: true,
    segmentSec: 60,      // a new recorder starts every 60 s; two overlap -> 60..120 s back
    bitrate: 1500000,
    fps: 30
  }, window.rvPopcornConfig || {});

  var K_ALLOWED = 'rvCamAllowed', K_BG = 'rvCamBg', K_NAME = 'rvUserName';
  var COLORS = ['#00ff41', '#ff00ff', '#00ffff', '#ffeb3b', '#ff3333', '#ffffff'];
  var SIZES = [3, 6, 12];
  var TOOLS = [
    ['pen', '✏️', 'Pen'], ['line', '╱', 'Line'], ['circle', '◯', 'Circle'],
    ['rect', '▢', 'Square'], ['text', '🔤', 'Text — type, then tap where it goes']
  ];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function stamp() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // ---------------------------------------------------------------- styles
  var CSS =
    '.rvp-bg{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;' +
    'opacity:0;transition:opacity .6s}' +
    '.rvp-bg.mirror,.rvp-cam.mirror{transform:scaleX(-1)}' +
    '.rvp-fab{position:fixed;right:calc(12px + env(safe-area-inset-right));bottom:calc(12px + env(safe-area-inset-bottom));' +
    'z-index:9050;width:54px;height:54px;border-radius:50%;border:2px solid #ffeb3b;background:#000;font-size:28px;' +
    'cursor:pointer;box-shadow:0 0 14px rgba(255,235,59,.5);padding:0}' +
    '[data-rv-popcorn].rvp-recording{position:relative}' +
    '[data-rv-popcorn].rvp-recording::after{content:"";position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;' +
    'background:#ff2a2a;box-shadow:0 0 6px #ff2a2a;animation:rvpBlink 1.2s infinite}' +
    '@keyframes rvpBlink{50%{opacity:.25}}' +
    '.rvp{position:fixed;inset:0;z-index:2147483000;background:#000;display:none;overflow:hidden;' +
    "font-family:'Courier New',ui-monospace,monospace;color:#00ff41;user-select:none;-webkit-user-select:none}" +
    '.rvp.open{display:block}' +
    '.rvp-cam{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}' +
    '.rvp-draw{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}' +
    '.rvp-bar{position:absolute;display:flex;gap:5px;align-items:center;flex-wrap:wrap;z-index:2}' +
    '.rvp button{font:inherit;font-size:14px;color:#00ff41;background:rgba(0,0,0,.72);border:1px solid #00ff41;' +
    'border-radius:8px;padding:7px 9px;cursor:pointer;line-height:1;min-width:36px;min-height:36px}' +
    '.rvp button:hover{background:rgba(0,255,65,.22)}' +
    '.rvp button.on{border-color:#ffeb3b;color:#ffeb3b;background:rgba(255,235,59,.2);box-shadow:0 0 8px rgba(255,235,59,.5)}' +
    '.rvp button:disabled{opacity:.35;cursor:default}' +
    '.rvp-top{top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);justify-content:center;' +
    'max-width:calc(100% - 250px);padding:5px;border:1px solid #ff00ff;border-radius:10px;background:rgba(0,0,0,.55)}' +
    '.rvp-top button{border-color:#ff00ff;color:#ff66ff;font-size:12px;padding:6px 7px}' +
    '.rvp-rec{font-size:12px;padding:0 6px;white-space:nowrap;color:#aaa}' +
    '.rvp-rec.live{color:#ff4d4d}.rvp-rec.live b{animation:rvpBlink 1.2s infinite}' +
    '.rvp-user{top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));padding:5px;' +
    'border:1px solid #00ffff;border-radius:10px;background:rgba(0,0,0,.55);max-width:230px;justify-content:flex-end}' +
    '.rvp-user button{border-color:#00ffff;color:#00ffff}' +
    '.rvp-me{display:flex;align-items:center;gap:6px;cursor:pointer;padding:0 4px;color:#00ffff;font-size:13px;max-width:120px}' +
    '.rvp-me i{font-style:normal;width:26px;height:26px;border-radius:50%;background:#00ffff;color:#000;display:flex;' +
    'align-items:center;justify-content:center;font-weight:900;flex:none}' +
    '.rvp-me span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.rvp-tools{left:calc(38px + env(safe-area-inset-left));top:50%;transform:translateY(-50%);flex-direction:column;' +
    'padding:5px;border:1px solid #00ff41;border-radius:10px;background:rgba(0,0,0,.55)}' +
    '.rvp-swatch{width:36px;height:36px;border-radius:50%!important}' +
    '.rvp-bl{left:calc(10px + env(safe-area-inset-left));bottom:calc(10px + env(safe-area-inset-bottom))}' +
    '.rvp-bl button{font-size:22px;padding:8px 10px}' +
    '.rvp-br{right:calc(10px + env(safe-area-inset-right));bottom:calc(10px + env(safe-area-inset-bottom))}' +
    '.rvp-br button{width:66px;height:66px;border-radius:50%;font-size:34px;border:2px solid #ffeb3b;' +
    'box-shadow:0 0 16px rgba(255,235,59,.55);padding:0}' +
    '.rvp-type{left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);display:none;' +
    'width:min(460px,calc(100% - 200px));flex-wrap:nowrap}' +
    '.rvp-type.open{display:flex}' +
    '.rvp-type input{flex:1;min-width:0;font:inherit;font-size:16px;color:#00ff41;background:rgba(0,0,0,.85);' +
    'border:1px solid #00ff41;border-radius:8px;padding:9px}' +
    '.rvp-panel{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:min(360px,calc(100% - 32px));' +
    'max-height:70%;overflow:auto;background:rgba(0,0,0,.92);border:1px solid #00ff41;border-radius:12px;padding:18px;' +
    'text-align:center;box-shadow:0 0 30px rgba(0,255,65,.35);display:none}' +
    '.rvp-panel.open{display:block}' +
    '.rvp-panel h3{margin:0 0 10px;font-size:16px;color:#ffeb3b}' +
    '.rvp-panel p{margin:0 0 14px;font-size:13px;color:#ccc;line-height:1.4}' +
    '.rvp-panel .rvp-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}' +
    '.rvp-clip{display:flex;align-items:center;gap:6px;margin:6px 0;font-size:12px;color:#ccc;text-align:left}' +
    '.rvp-clip span{flex:1}' +
    '.rvp-replay{position:absolute;inset:0;z-index:4;background:#000;display:none}' +
    '.rvp-replay.open{display:block}' +
    '.rvp-replay video,.rvp-replay img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000}' +
    '.rvp-replay img{display:none}' +
    '.rvp-rbar{top:calc(8px + env(safe-area-inset-top));left:50%;transform:translateX(-50%);padding:5px;' +
    'border:1px solid #ff00ff;border-radius:10px;background:rgba(0,0,0,.7)}' +
    '.rvp-rbar b{color:#ff66ff;font-size:13px;padding:0 6px}' +
    '.rvp-toast{position:absolute;left:50%;top:calc(64px + env(safe-area-inset-top));transform:translateX(-50%);z-index:5;' +
    'background:rgba(0,0,0,.85);border:1px solid #ffeb3b;color:#ffeb3b;font-size:13px;padding:7px 12px;border-radius:8px;' +
    'pointer-events:none;opacity:0;transition:opacity .3s;white-space:nowrap}' +
    '.rvp-toast.show{opacity:1}' +
    '@media (max-width:640px){' +
    '.rvp-user{max-width:calc(100% - 16px);flex-wrap:nowrap}.rvp-me span{display:none}' +
    '.rvp-top{top:calc(62px + env(safe-area-inset-top));max-width:calc(100% - 16px)}' +
    '.rvp-rbar{top:calc(62px + env(safe-area-inset-top))}' +
    '.rvp-type{width:calc(100% - 20px);bottom:calc(90px + env(safe-area-inset-bottom))}' +
    '.rvp-toast{top:calc(150px + env(safe-area-inset-top))}}';

  // ---------------------------------------------------------------- state
  var stream = null, facing = 'user', starting = null;
  var bgV, mix, mixCtx, mixStream = null, loopOn = false, lastFrame = 0;
  var recs = [], recPaused = false, mime = '', recTimer = null;
  var clips = [];
  var shapes = [], cur = null, tool = 'pen', color = COLORS[0], size = SIZES[1], pendingText = '';
  var root, cam, draw, drawCtx, ui = {};
  var built = false, isOpen = false;

  function camAllowed() { return lsGet(K_ALLOWED) === '1'; }
  function bgWanted() { return CFG.background && lsGet(K_BG) !== '0'; }

  // ---------------------------------------------------------------- camera
  function attachStyles() {
    if ($('#rvp-style')) return;
    var st = el('style');
    st.id = 'rvp-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  function ensureBgVideo() {
    if (bgV) return bgV;
    bgV = el('video', 'rvp-bg');
    bgV.muted = true; bgV.playsInline = true; bgV.autoplay = true;
    bgV.setAttribute('playsinline', ''); bgV.setAttribute('muted', '');
    document.body.insertBefore(bgV, document.body.firstChild);
    return bgV;
  }
  function syncBg() {
    if (!bgV) return;
    bgV.style.opacity = stream && bgWanted() ? String(CFG.bgOpacity) : '0';
    bgV.classList.toggle('mirror', facing === 'user');
  }

  function startCamera() {
    if (stream) return Promise.resolve(stream);
    if (starting) return starting;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('This browser has no camera access'));
    }
    starting = navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    }).then(function (s) {
      starting = null;
      stream = s;
      lsSet(K_ALLOWED, '1');
      var v = ensureBgVideo();
      v.srcObject = s;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      if (cam) { cam.srcObject = s; var q = cam.play(); if (q && q.catch) q.catch(function () {}); }
      s.getVideoTracks().forEach(function (t) {
        t.addEventListener('ended', function () { if (stream === s) stopCamera(true); });
      });
      syncBg();
      startMix();
      startRecording();
      refresh();
      return s;
    }, function (err) {
      starting = null;
      throw err;
    });
    return starting;
  }

  // keepAllowed: the camera died by itself (unplugged, revoked) — don't forget the yes
  function stopCamera(keepAllowed) {
    stopRecording();
    stopMix();
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
    if (bgV) bgV.srcObject = null;
    if (cam) cam.srcObject = null;
    if (keepAllowed !== true) lsSet(K_ALLOWED, '0');
    syncBg();
    refresh();
  }

  function flipCamera() {
    facing = facing === 'user' ? 'environment' : 'user';
    if (!stream) { refresh(); return; }
    var old = stream;
    stream = null;
    old.getTracks().forEach(function (t) { t.stop(); });
    // keep the recorders — they record the mix canvas, which carries on
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    }).then(function (s) {
      stream = s;
      bgV.srcObject = s; bgV.play().catch(function () {});
      if (cam) { cam.srcObject = s; cam.play().catch(function () {}); }
      s.getVideoTracks().forEach(function (t) {
        t.addEventListener('ended', function () { if (stream === s) stopCamera(true); });
      });
      syncBg(); refresh();
    }, function () {
      toast('Could not switch camera');
      stopCamera(true);
    });
  }

  // ---------------------------------------------------------------- mix canvas
  // What gets recorded: the camera as you see it (cover-cropped to the screen
  // shape, mirrored for the selfie cam) plus everything drawn on top.
  function sizeMix() {
    if (!mix) return;
    var w = window.innerWidth || 1280, h = window.innerHeight || 720;
    var k = 1280 / Math.max(w, h);
    // even sizes keep video encoders happy
    mix.width = Math.max(2, Math.round(w * k / 2) * 2);
    mix.height = Math.max(2, Math.round(h * k / 2) * 2);
  }
  function startMix() {
    if (!mix) {
      mix = document.createElement('canvas');
      mixCtx = mix.getContext('2d');
    }
    sizeMix();
    if (!mixStream && mix.captureStream) mixStream = mix.captureStream(CFG.fps);
    if (!loopOn) { loopOn = true; requestAnimationFrame(frame); }
  }
  function stopMix() { loopOn = false; }
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
    if (bgV && stream) coverDraw(mixCtx, bgV, mix.width, mix.height, facing === 'user');
    paintShapes(mixCtx, mix.width, mix.height, shapes.concat(cur ? [cur] : []));
  }

  // ---------------------------------------------------------------- back-recording
  function pickMime() {
    if (!window.MediaRecorder) return '';
    var list = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];
    for (var i = 0; i < list.length; i++) {
      try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {}
    }
    return '';
  }
  function canRecord() { return !!(window.MediaRecorder && mix && mix.captureStream); }
  function ext() { return /mp4/.test(mime) ? 'mp4' : 'webm'; }

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
  // every second: start a fresh recorder once the newest one is a minute old,
  // and keep only two — so the oldest always holds 60..120 s of the past
  function recTick() {
    if (!stream || recPaused || !canRecord()) { refreshRec(); return; }
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
  function bufferSec() {
    return recs.length ? (Date.now() - recs[0].t0) / 1000 : 0;
  }
  // the whole back-buffer as one playable file (the oldest recorder, from its start)
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

  // ---------------------------------------------------------------- clips (separate files)
  function keepClip(blob, kind, label) {
    var c = { blob: blob, kind: kind, label: label, url: URL.createObjectURL(blob), name: '' };
    c.name = 'rudventur-' + (kind === 'image' ? 'snap' : 'cam') + '-' + stamp() + '.' +
      (kind === 'image' ? 'png' : ext());
    clips.unshift(c);
    refresh();
    return c;
  }
  function download(c) {
    var a = el('a');
    a.href = c.url; a.download = c.name;
    a.setAttribute('data-rv-nolayer', '');
    document.body.appendChild(a); a.click(); a.remove();
  }
  function saveBuffer() {
    var b = bufferBlob();
    if (!b) { toast('Nothing recorded yet'); return; }
    var c = keepClip(b, 'video', 'last ' + fmt(bufferSec()));
    download(c);
    toast('💾 Saved ' + c.name);
  }
  function snapshot() {
    var cv = document.createElement('canvas');
    var w = window.innerWidth, h = window.innerHeight;
    var k = Math.min(2, Math.max(1, 1920 / Math.max(w, h)));
    cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    var ctx = cv.getContext('2d');
    if (stream && bgV) coverDraw(ctx, bgV, cv.width, cv.height, facing === 'user');
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height); }
    paintShapes(ctx, cv.width, cv.height, shapes);
    cv.toBlob(function (b) {
      if (!b) { toast('Snapshot failed'); return; }
      var c = keepClip(b, 'image', 'snapshot');
      download(c);
      toast('📸 ' + c.name);
    }, 'image/png');
  }

  // ---------------------------------------------------------------- replay
  function replay(back) {
    var b = bufferBlob();
    if (!b) { toast(stream ? 'Still filling the buffer…' : 'Camera is off — nothing recorded'); return; }
    var have = bufferSec();
    showReplay({ url: URL.createObjectURL(b), kind: 'video', temp: true, blob: b },
      back ? '⏪ ' + fmt(Math.min(back, have)) + ' back' : '🎞 all ' + fmt(have), back);
  }
  var replaying = null;
  function showReplay(c, title, back) {
    closeReplay();
    replaying = c;
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
        v.ontimeupdate = function () {
          v.ontimeupdate = null;
          v.currentTime = 0;
          go();
        };
        v.currentTime = 1e101;
      };
      v.src = c.url;
    }
    ui.rKeep.style.display = c.temp ? '' : 'none';
    ui.replay.classList.add('open');
  }
  function closeReplay() {
    if (!replaying) return;
    ui.rVideo.pause();
    ui.rVideo.removeAttribute('src');
    ui.rVideo.load();
    if (replaying.temp) URL.revokeObjectURL(replaying.url);
    replaying = null;
    ui.replay.classList.remove('open');
  }
  function keepReplay() {
    if (!replaying || !replaying.temp) return;
    var c = keepClip(replaying.blob, 'video', ui.rTitle.textContent);
    download(c);
    toast('💾 Saved ' + c.name);
  }

  // ---------------------------------------------------------------- drawing
  // shapes live in 0..1 screen space so they redraw at any size (screen, recording, snapshot)
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
      shapes.push({ t: 'text', color: color, size: size, pts: [p], text: pendingText });
      pendingText = '';
      setTool('pen');
      redraw(); refresh();
      return;
    }
    draw.setPointerCapture && draw.setPointerCapture(e.pointerId);
    cur = { t: tool, color: color, size: size, pts: [p, p] };
    if (tool === 'pen') cur.pts = [p];
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
  function setTool(t) { tool = t; refresh(); }
  function undo() { shapes.pop(); redraw(); refresh(); }
  function clearDrawing() { shapes = []; redraw(); refresh(); }

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
    setTool('text');
    toast('Tap where the text goes');
  }

  // ---------------------------------------------------------------- toast
  var toastT = 0;
  function toast(msg) {
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { ui.toast.classList.remove('show'); }, 2200);
  }

  // ---------------------------------------------------------------- the window
  function button(parent, label, title, fn, cls) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(e); });
    parent.appendChild(b);
    return b;
  }
  function build() {
    if (built) return;
    built = true;
    attachStyles();
    root = el('div', 'rvp');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Popcorn window');

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

    // top middle — back-recording palette
    var top = el('div', 'rvp-bar rvp-top');
    ui.rec = el('span', 'rvp-rec');
    top.appendChild(ui.rec);
    ui.back = [10, 30, 60].map(function (s) {
      return button(top, '⏪' + s + 's', 'Replay the last ' + s + ' seconds', function () { replay(s); });
    });
    ui.all = button(top, '🎞 ALL', 'Replay everything in the buffer', function () { replay(0); });
    ui.save = button(top, '💾', 'Save the back-recording as a file', saveBuffer);
    button(top, '📸', 'Snapshot (with drawings)', snapshot);
    ui.pause = button(top, '⏸', 'Pause / resume back-recording', togglePause);
    ui.clipsBtn = button(top, '🗂 0', 'Kept clips and snapshots', function () { togglePanel(ui.clips); });
    root.appendChild(top);

    // top right — user box
    var user = el('div', 'rvp-bar rvp-user');
    ui.me = el('div', 'rvp-me', '<i></i><span></span>');
    ui.me.title = 'Tap to change your name';
    ui.me.addEventListener('click', function (e) {
      e.stopPropagation();
      var n = prompt('Your name', lsGet(K_NAME) || '');
      if (n != null) { lsSet(K_NAME, n.trim().slice(0, 24)); refresh(); }
    });
    user.appendChild(ui.me);
    ui.camBtn = button(user, '📷', 'Camera on / off', function () {
      if (stream) stopCamera(); else askCamera();
    });
    ui.flip = button(user, '🔄', 'Switch front / back camera', flipCamera);
    ui.bg = button(user, '🖼', 'Camera behind the website on / off', function () {
      lsSet(K_BG, bgWanted() ? '0' : '1'); syncBg(); refresh();
    });
    button(user, '✕', 'Close', close);
    root.appendChild(user);

    // left — drawing tools
    var tools = el('div', 'rvp-bar rvp-tools');
    ui.tools = {};
    TOOLS.forEach(function (t) {
      ui.tools[t[0]] = button(tools, t[1], t[2], function () {
        if (t[0] === 'text') { openType(); return; }
        setTool(t[0]);
      });
    });
    ui.swatch = button(tools, '', 'Colour', function () {
      color = COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]; refresh();
    }, 'rvp-swatch');
    ui.size = button(tools, '', 'Thickness', function () {
      size = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]; refresh();
    });
    ui.undo = button(tools, '↶', 'Undo', undo);
    ui.clear = button(tools, '🗑', 'Clear drawing', clearDrawing);
    root.appendChild(tools);

    // bottom left — keyboard + global chat
    var bl = el('div', 'rvp-bar rvp-bl');
    button(bl, '⌨️', 'Type a description onto the picture', openType);
    button(bl, '💬', 'Global chat', openChat);
    root.appendChild(bl);

    // bottom right — the real popcorn button
    var br = el('div', 'rvp-bar rvp-br');
    button(br, '🍿', 'Popcorn', popcorn);
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

    // camera question
    ui.ask = el('div', 'rvp-panel',
      '<h3>📷 USE YOUR CAMERA?</h3>' +
      '<p>The popcorn window shows your camera live, lets you draw on it, and keeps ' +
      'recording the last minute or two so you can replay it. Nothing leaves your device ' +
      'unless you save it. Say no and it stays black — drawing still works.</p>' +
      '<div class="rvp-row"></div><p class="rvp-err" style="color:#ff6666;margin:12px 0 0"></p>');
    var row = $('.rvp-row', ui.ask);
    button(row, '✅ ALLOW', 'Allow camera', function () {
      $('.rvp-err', ui.ask).textContent = '';
      startCamera().then(function () { ui.ask.classList.remove('open'); }, function (err) {
        $('.rvp-err', ui.ask).textContent = (err && err.name === 'NotAllowedError')
          ? 'Camera blocked — allow it in the browser’s site settings, then try again.'
          : 'No camera: ' + ((err && err.message) || 'unavailable');
      });
    });
    button(row, '⬛ NO — STAY BLACK', 'Keep it black', function () { ui.ask.classList.remove('open'); });
    root.appendChild(ui.ask);

    // kept clips
    ui.clips = el('div', 'rvp-panel', '<h3>🗂 KEPT FILES</h3><div class="rvp-list"></div>' +
      '<p style="margin:12px 0 0;font-size:11px;color:#888">Kept until you close the page — ' +
      'each one is also downloaded as its own file.</p><div class="rvp-row" style="margin-top:10px"></div>');
    button($('.rvp-row', ui.clips), '✕ CLOSE', 'Close', function () { ui.clips.classList.remove('open'); });
    root.appendChild(ui.clips);

    // replay player
    ui.replay = el('div', 'rvp-replay');
    ui.rVideo = el('video'); ui.rVideo.controls = true; ui.rVideo.playsInline = true;
    ui.rVideo.setAttribute('playsinline', '');
    ui.rImg = el('img'); ui.rImg.alt = 'Snapshot';
    ui.replay.appendChild(ui.rVideo); ui.replay.appendChild(ui.rImg);
    var rbar = el('div', 'rvp-bar rvp-rbar');
    ui.rTitle = el('b');
    rbar.appendChild(ui.rTitle);
    ui.rKeep = button(rbar, '💾 SAVE', 'Save this as a file', keepReplay);
    button(rbar, '● LIVE', 'Back to live', closeReplay);
    ui.replay.appendChild(rbar);
    root.appendChild(ui.replay);

    ui.toast = el('div', 'rvp-toast');
    root.appendChild(ui.toast);

    document.body.appendChild(root);
    document.addEventListener('keydown', function (e) {
      if (!isOpen || e.key !== 'Escape') return;
      if (document.querySelector('.rv-layer')) return; // the chat layer closes first
      if (replaying) closeReplay();
      else if (ui.type.classList.contains('open')) closeType();
      else if (ui.ask.classList.contains('open') || ui.clips.classList.contains('open')) {
        ui.ask.classList.remove('open'); ui.clips.classList.remove('open');
      } else close();
    });
  }

  function togglePanel(p) {
    var was = p.classList.contains('open');
    ui.ask.classList.remove('open'); ui.clips.classList.remove('open');
    if (!was) p.classList.add('open');
  }
  function askCamera() { ui.clips.classList.remove('open'); ui.ask.classList.add('open'); }

  function openChat() {
    if (window.rvView && window.rvView.openLayer) window.rvView.openLayer(CFG.chatUrl);
    else window.open(CFG.chatUrl, '_blank', 'noopener');
  }
  function popcorn() {
    if (typeof CFG.onPopcorn === 'function') CFG.onPopcorn();
    else close();
  }

  // ---------------------------------------------------------------- refresh UI
  function refreshRec() {
    var live = !!stream && !recPaused && recs.length > 0;
    Array.prototype.forEach.call(document.querySelectorAll('[data-rv-popcorn]'), function (b) {
      b.classList.toggle('rvp-recording', live);
    });
    if (!built) return;
    var have = bufferSec();
    ui.rec.className = 'rvp-rec' + (live ? ' live' : '');
    ui.rec.innerHTML = !stream ? '○ CAM OFF'
      : !canRecord() ? '○ NO REC HERE'
      : recPaused ? '⏸ PAUSED'
      : '<b>●</b> REC ' + fmt(have) + ' back';
    ui.back.forEach(function (b) { b.disabled = !live || have < 1; });
    ui.all.disabled = ui.save.disabled = !live || have < 1;
  }
  function refresh() {
    refreshRec();
    if (!built) return;
    var name = lsGet(K_NAME) || 'guest';
    $('i', ui.me).textContent = name.charAt(0).toUpperCase();
    $('span', ui.me).textContent = name;
    ui.camBtn.classList.toggle('on', !!stream);
    ui.flip.disabled = !stream;
    ui.bg.classList.toggle('on', bgWanted());
    ui.pause.classList.toggle('on', recPaused);
    ui.pause.disabled = !stream || !canRecord();
    cam.classList.toggle('mirror', facing === 'user');
    Object.keys(ui.tools).forEach(function (k) { ui.tools[k].classList.toggle('on', tool === k); });
    ui.swatch.style.background = color;
    ui.swatch.style.borderColor = color;
    ui.size.innerHTML = '<span style="display:inline-block;width:' + (size + 4) + 'px;height:' + (size + 4) +
      'px;border-radius:50%;background:' + color + '"></span>';
    ui.undo.disabled = ui.clear.disabled = !shapes.length;
    ui.clipsBtn.textContent = '🗂 ' + clips.length;
    var list = $('.rvp-list', ui.clips);
    list.innerHTML = clips.length ? '' : '<p>Nothing kept yet — 💾 or 📸 from the palette.</p>';
    clips.forEach(function (c) {
      var r = el('div', 'rvp-clip');
      r.appendChild(el('span', '', (c.kind === 'image' ? '🖼 ' : '🎞 ') + c.label + '<br><small>' + c.name + '</small>'));
      button(r, '▶', 'Show', function () { ui.clips.classList.remove('open'); showReplay(c, c.name); });
      button(r, '⬇', 'Download', function () { download(c); });
      button(r, '✕', 'Forget', function () {
        URL.revokeObjectURL(c.url);
        clips.splice(clips.indexOf(c), 1);
        refresh();
      });
      list.appendChild(r);
    });
  }

  // ---------------------------------------------------------------- open / close
  function open() {
    build();
    isOpen = true;
    root.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    sizeDraw();
    if (stream) { cam.srcObject = stream; cam.play().catch(function () {}); }
    else ui.ask.classList.add('open');   // ask again every time the camera is off
    refresh();
  }
  function close() {
    if (!built) return;
    isOpen = false;
    closeReplay(); closeType();
    ui.ask.classList.remove('open'); ui.clips.classList.remove('open');
    root.classList.remove('open');
    cam.pause();
    document.documentElement.style.overflow = '';
  }
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

  // camera behind the page only when it was already agreed — never a prompt on load
  function autoStart() {
    if (!CFG.background || !camAllowed()) return;
    var go = function () { startCamera().catch(function () {}); };
    try {
      navigator.permissions.query({ name: 'camera' }).then(function (p) {
        if (p.state === 'granted') go();
      }, go);
    } catch (e) { go(); }
  }

  function init() {
    attachStyles();
    bindButtons();
    autoStart();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.rvPopcorn = {
    open: open, close: close, toggle: toggle,
    startCamera: startCamera, stopCamera: stopCamera,
    config: CFG
  };
})();
