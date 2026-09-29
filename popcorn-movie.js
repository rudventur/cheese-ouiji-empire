/* popcornMovie.js — the 🎬 movie maker inside the RUDVENTUR popcorn window.
   Everything happens on this device, inside the sealed bunker.

   Load after popcornWindow.js:
     <script src="https://rudventur.github.io/RudVentur.com/embed/popcornMovie.js"></script>

   A movie plan (project) is saved in the session (IndexedDB 'rvPopcornSession',
   store 'projects') as it changes:
     { id, name, description, aspect, clips: [{ id, mediaId, in, out, vol }],
       audio: [{ id, mediaId, start, in, out, vol }],
       items: [{ id, type, start, end, ...settings }], binned, updated }
   Tools:
     🎞 CLIPS   put videos / pictures in order, trim in/out, ✂ split, ⏸📸 freeze a
                frame as a still picture, volume per clip
     🔊 AUDIO   extra sound (imported audio, the sound of any video, 🎙 voice-over)
                placed at any moment, trimmed, own volume
     ✨ ITEMS   anything at any moment: text, horizon line, air, ground (striped or
                plain), your popcorn drawing
     📝 NOTES   the description of the movie (saved with it)
     📚 LIBRARY everything in the session, 📥 import
     🎞 MAKE MOVIE plays the plan once and records it into ONE file, kept in the session.
*/
(function () {
  if (window.rvMovie) return;

  var ASPECTS = { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960] };
  var ITEM_TYPES = {
    text: { label: '🔤 Text', d: { text: 'Hello', color: '#ffeb3b', size: 7, y: 0.85 },
      f: [['text', 'Text', 'text'], ['color', 'Colour', 'color'], ['size', 'Size', 'range', 2, 20, 1], ['y', 'Height', 'range', 0, 1, 0.01]] },
    horizon: { label: '━ Horizon line', d: { y: 0.55, color: '#ffffff', width: 4 },
      f: [['y', 'Height', 'range', 0, 1, 0.01], ['color', 'Colour', 'color'], ['width', 'Thickness', 'range', 1, 16, 1]] },
    air: { label: '☁ Air', d: { y: 0.55, color: '#66ccff', alpha: 0.5 },
      f: [['y', 'Down to', 'range', 0, 1, 0.01], ['color', 'Colour', 'color'], ['alpha', 'Strength', 'range', 0, 1, 0.05]] },
    ground: { label: '⛰ Ground', d: { y: 0.55, color: '#6b4f2a', alpha: 0.65, stripes: true },
      f: [['y', 'From', 'range', 0, 1, 0.01], ['color', 'Colour', 'color'], ['alpha', 'Strength', 'range', 0, 1, 0.05],
        ['stripes', 'Stripes', 'check']] },
    drawing: { label: '✏️ My drawing', d: {}, f: [] }
  };

  var P = null;                 // the open movie plan
  var media = {};               // mediaId -> { rec, url, img }
  var root, cv, ctx, ui = {}, built = false, opened = false;
  var T = 0, playing = false, loading = false, curSeg = null, lastNow = 0, raf = 0;
  var vA, gV, master, actx, audioPool = {};
  var rendering = null, voice = null, tab = 'clips';

  var pc = function () { return window.rvPopcorn; };
  function $(s, r) { return (r || document).querySelector(s); }
  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function t1(s) { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2) + '.' + Math.floor((s * 10) % 10); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function toast(m) { if (pc()) pc().toast(m); }
  function button(parent, label, title, fn, cls) {
    var b = el('button', cls || '', label);
    b.type = 'button';
    if (title) { b.title = title; b.setAttribute('aria-label', title); }
    b.addEventListener('click', function (e) { e.stopPropagation(); fn(e); });
    parent.appendChild(b);
    return b;
  }

  var CSS =
    '.rvm{position:absolute;inset:0;z-index:12;background:#030604;display:none;flex-direction:column;overflow:hidden;color:#00ff41}' +
    '.rvm.open{display:flex}' +
    '.rvm-head,.rvm-trans,.rvm-tabs,.rvm-foot{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 8px;flex:none}' +
    '.rvm-head{padding-top:calc(6px + env(safe-area-inset-top));border-bottom:1px solid #0a3}' +
    '.rvm-head input{flex:1;min-width:90px;font-size:15px!important;padding:6px!important}' +
    '.rvm-stage{flex:1 1 38%;min-height:140px;display:flex;align-items:center;justify-content:center;background:#000;position:relative}' +
    '.rvm-stage canvas{max-width:100%;max-height:100%;background:#000;box-shadow:0 0 0 1px #0a3}' +
    '.rvm-trans input[type=range]{flex:1;min-width:120px;padding:0!important;border:0!important;accent-color:#00ff41}' +
    '.rvm-time{font-size:12px;min-width:110px;text-align:center;color:#cfe}' +
    '.rvm-tabs button{font-size:12px!important}' +
    '.rvm-body{flex:1 1 42%;overflow:auto;padding:6px 10px;border-top:1px solid #0a3;border-bottom:1px solid #0a3;user-select:text}' +
    '.rvm-card{border:1px solid #0a3;border-radius:8px;padding:8px;margin:0 0 8px;background:rgba(0,255,65,.04);font-size:12px}' +
    '.rvm-card.now{border-color:#ffeb3b;box-shadow:0 0 8px rgba(255,235,59,.35)}' +
    '.rvm-card b{color:#fff}' +
    '.rvm-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}' +
    '.rvm-row label{font-size:11px;color:#9c9}' +
    '.rvm input[type=number]{width:74px;font-size:14px!important;padding:5px!important}' +
    '.rvm input[type=range]{accent-color:#00ff41}' +
    '.rvm input[type=color]{width:40px;height:32px;padding:2px!important}' +
    '.rvm textarea{width:100%;min-height:140px;box-sizing:border-box}' +
    '.rvm button{min-height:32px!important;min-width:32px!important;padding:5px 8px!important;font-size:13px!important}' +
    '.rvm .rvm-go{border-color:#ffeb3b!important;color:#ffeb3b!important;font-size:15px!important;padding:10px 14px!important}' +
    '.rvm-prog{flex:1;height:10px;border:1px solid #0a3;border-radius:5px;overflow:hidden;min-width:80px}' +
    '.rvm-prog i{display:block;height:100%;width:0;background:#ffeb3b}' +
    '.rvm-note{font-size:11px;color:#8a8;margin:4px 0}' +
    '.rvm-list .rvp-item{border-bottom:1px dashed #063;padding-bottom:6px}' +
    '.rvm-over{position:absolute;inset:0;z-index:3;background:rgba(0,0,0,.94);display:none;overflow:auto;padding:16px;padding-top:calc(16px + env(safe-area-inset-top))}' +
    '.rvm-over.open{display:block}' +
    '.rvm-over h3{color:#ffeb3b;font-size:16px;margin:0 0 10px}';

  // ---------------------------------------------------------------- data
  function DB() { return pc().db; }
  function save() {
    if (!P) return;
    clearTimeout(save.t);
    save.t = setTimeout(function () { P.updated = Date.now(); DB().put('projects', P); }, 400);
  }
  function newProject() {
    var land = window.innerWidth >= window.innerHeight;
    return { id: uid(), name: 'my movie', description: '', aspect: land ? '16:9' : '9:16',
      clips: [], audio: [], items: [], binned: false, created: Date.now(), updated: Date.now() };
  }
  function loadMedia(id) {
    if (media[id]) return Promise.resolve(media[id]);
    return DB().get('media', id).then(function (rec) {
      if (!rec) return null;
      var m = { rec: rec, url: URL.createObjectURL(rec.blob), img: null };
      media[id] = m;
      if (rec.kind === 'image') {
        return new Promise(function (res) {
          var im = new Image();
          im.onload = function () { m.img = im; res(m); };
          im.onerror = function () { res(m); };
          im.src = m.url;
        });
      }
      return m;
    });
  }
  // live-recorded webm has no duration in its header; seek to the end once to learn it
  function probeDuration(url) {
    return new Promise(function (res) {
      var v = document.createElement('video'), done = false;
      function fin(d) { if (done) return; done = true; v.removeAttribute('src'); v.load(); res(isFinite(d) && d > 0 ? d : 0); }
      v.preload = 'metadata'; v.muted = true;
      v.onloadedmetadata = function () {
        if (isFinite(v.duration)) { fin(v.duration); return; }
        v.ontimeupdate = function () { v.ontimeupdate = null; fin(v.duration); };
        v.currentTime = 1e101;
      };
      v.onerror = function () { fin(0); };
      setTimeout(function () { fin(0); }, 8000);
      v.src = url;
    });
  }
  function durationOf(m) {
    if (m.rec.kind === 'image') return Promise.resolve(3);
    if (m.rec.probed) return Promise.resolve(m.rec.duration || 3);
    return probeDuration(m.url).then(function (d) {
      if (d) m.rec.duration = d;
      m.rec.probed = true;
      DB().put('media', m.rec);
      return m.rec.duration || 3;
    });
  }
  function loadProject(p) {
    P = p;
    var ids = {};
    p.clips.concat(p.audio).forEach(function (c) { ids[c.mediaId] = 1; });
    return Promise.all(Object.keys(ids).map(loadMedia)).then(function () {
      // things removed for good from the bin drop out of the plan
      p.clips = p.clips.filter(function (c) { return media[c.mediaId]; });
      p.audio = p.audio.filter(function (a) { return media[a.mediaId]; });
      sizeCanvas();
      T = 0; curSeg = null;
      return seekTo(0);
    }).then(render);
  }

  // ---------------------------------------------------------------- timeline
  function segs() {
    var t = 0;
    return P.clips.map(function (c, i) {
      var d = Math.max(0.1, c.out - c.in), s = { c: c, i: i, t0: t, d: d };
      t += d;
      return s;
    });
  }
  function total() { var s = segs(); return s.length ? s[s.length - 1].t0 + s[s.length - 1].d : 0; }
  function segAt(t) {
    var list = segs();
    for (var i = 0; i < list.length; i++) if (t < list[i].t0 + list[i].d) return list[i];
    return list[list.length - 1] || null;
  }
  function isStill(s) { return s && media[s.c.mediaId] && media[s.c.mediaId].rec.kind === 'image'; }

  // ---------------------------------------------------------------- playback engine
  function ensureEngine() {
    if (vA) return;
    actx = pc().audioContext();
    vA = el('video');
    vA.playsInline = true; vA.setAttribute('playsinline', '');
    vA.style.cssText = 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none;left:0;top:0';
    root.appendChild(vA);
    if (actx) {
      master = actx.createGain();
      master.connect(actx.destination);
      gV = actx.createGain();
      actx.createMediaElementSource(vA).connect(gV);
      gV.connect(master);
    }
  }
  function loadSeg(s) {
    curSeg = s;
    if (!s) return Promise.resolve();
    var m = media[s.c.mediaId];
    if (!m || m.rec.kind === 'image') { vA.pause(); return Promise.resolve(); }
    var local = s.c.in + Math.max(0, T - s.t0);
    return new Promise(function (res) {
      var done = false;
      function fin() { if (done) return; done = true; vA.removeEventListener('seeked', fin); res(); }
      function go() { vA.addEventListener('seeked', fin); vA.currentTime = local; setTimeout(fin, 2500); }
      if (vA.dataset.url !== m.url) {
        vA.dataset.url = m.url;
        vA.addEventListener('loadeddata', function h() { vA.removeEventListener('loadeddata', h); go(); });
        vA.src = m.url;
        setTimeout(fin, 5000);
      } else go();
    });
  }
  function seekTo(t) {
    T = Math.max(0, Math.min(t, total()));
    ensureEngine();
    vA.pause();
    loading = true;
    return loadSeg(segAt(T)).then(function () { loading = false; syncAudio(true); drawFrame(); refreshTime(); });
  }
  function play() {
    if (!P.clips.length) { toast('Add a clip first (📚 LIBRARY)'); return; }
    if (actx && actx.state === 'suspended') actx.resume();
    if (T >= total() - 0.05) T = 0;
    playing = true;
    loading = true;
    loadSeg(segAt(T)).then(function () {
      loading = false;
      if (!playing) return;
      if (rendering && rendering.rec.state === 'paused') rendering.rec.resume();
      if (!isStill(curSeg)) { gV.gain.value = curSeg.c.vol; vA.play().catch(function () {}); }
    });
    ui.play.textContent = '⏸';
  }
  function pause() {
    playing = false;
    if (vA) vA.pause();
    Object.keys(audioPool).forEach(function (k) { audioPool[k].el.pause(); });
    if (ui.play) ui.play.textContent = '▶';
  }
  function advance() {
    var list = segs(), next = curSeg ? list[curSeg.i + 1] : null;
    if (!next) { end(); return; }
    loading = true;
    vA.pause();
    Object.keys(audioPool).forEach(function (k) { audioPool[k].el.pause(); });
    if (rendering && rendering.rec.state === 'recording') rendering.rec.pause();   // no frozen gap in the movie
    T = next.t0;
    loadSeg(next).then(function () {
      loading = false;
      if (!playing) return;
      if (rendering && rendering.rec.state === 'paused') rendering.rec.resume();
      if (!isStill(next)) { gV.gain.value = next.c.vol; vA.play().catch(function () {}); }
    });
  }
  function end() {
    pause();
    T = total();
    refreshTime();
    if (rendering) finishRender();
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = lastNow ? (now - lastNow) / 1000 : 0;
    lastNow = now;
    if (playing && !loading && curSeg) {
      if (isStill(curSeg)) {
        T += Math.min(dt, 0.1);
        if (T >= curSeg.t0 + curSeg.d) advance();
      } else {
        T = curSeg.t0 + (vA.currentTime - curSeg.c.in);
        if (vA.currentTime >= curSeg.c.out - 0.03 || vA.ended) advance();
      }
      syncAudio(false);
      refreshTime();
    }
    drawFrame();
  }

  // extra audio tracks follow the timeline
  function track(a) {
    var p = audioPool[a.id];
    if (!p) {
      var e = new Audio();
      e.preload = 'auto';
      p = audioPool[a.id] = { el: e, gain: null, url: '' };
      if (actx) {
        p.gain = actx.createGain();
        actx.createMediaElementSource(e).connect(p.gain);
        p.gain.connect(master);
      }
    }
    var m = media[a.mediaId];
    if (m && p.url !== m.url) { p.url = m.url; p.el.src = m.url; }
    return p;
  }
  function syncAudio(force) {
    if (!P) return;
    var alive = {};
    P.audio.forEach(function (a) {
      alive[a.id] = 1;
      var p = track(a), local = a.in + (T - a.start);
      var on = playing && !loading && T >= a.start && local < a.out;
      if (p.gain) p.gain.gain.value = a.vol; else p.el.volume = Math.min(1, a.vol);
      if (on) {
        if (p.el.paused) { p.el.currentTime = local; p.el.play().catch(function () {}); }
        else if (Math.abs(p.el.currentTime - local) > 0.35) p.el.currentTime = local;
      } else {
        if (!p.el.paused) p.el.pause();
        if (force) try { p.el.currentTime = Math.max(0, local); } catch (e) {}
      }
    });
    Object.keys(audioPool).forEach(function (k) { if (!alive[k]) audioPool[k].el.pause(); });
  }

  // ---------------------------------------------------------------- drawing a frame
  function sizeCanvas() {
    var a = ASPECTS[P.aspect] || ASPECTS['16:9'];
    if (cv.width !== a[0] || cv.height !== a[1]) { cv.width = a[0]; cv.height = a[1]; }
  }
  function contain(c, src, sw, sh) {
    if (!sw || !sh) return;
    var W = c.canvas.width, H = c.canvas.height, k = Math.min(W / sw, H / sh);
    c.drawImage(src, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k);
  }
  function drawSource(c) {
    c.fillStyle = '#000';
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    if (!curSeg) return;
    var m = media[curSeg.c.mediaId];
    if (!m) return;
    if (m.rec.kind === 'image') { if (m.img) contain(c, m.img, m.img.naturalWidth, m.img.naturalHeight); }
    else if (vA.readyState >= 2) contain(c, vA, vA.videoWidth, vA.videoHeight);
  }
  function rgba(hex, a) {
    var n = parseInt(String(hex).replace('#', ''), 16) || 0;
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function drawItem(c, it) {
    var W = c.canvas.width, H = c.canvas.height, y = (it.y == null ? 0.5 : it.y) * H;
    c.save();
    if (it.type === 'text') {
      var fs = it.size / 100 * H;
      c.font = 'bold ' + fs + "px 'Courier New', monospace";
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = Math.max(2, fs / 8); c.strokeStyle = '#000'; c.fillStyle = it.color;
      String(it.text).split('\n').forEach(function (line, n) {
        c.strokeText(line, W / 2, y + n * fs * 1.15);
        c.fillText(line, W / 2, y + n * fs * 1.15);
      });
    } else if (it.type === 'horizon') {
      c.strokeStyle = it.color; c.lineWidth = it.width * H / 720;
      c.shadowColor = it.color; c.shadowBlur = 8;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    } else if (it.type === 'air') {
      var g = c.createLinearGradient(0, 0, 0, y);
      g.addColorStop(0, rgba(it.color, it.alpha));
      g.addColorStop(1, rgba(it.color, it.alpha * 0.2));
      c.fillStyle = g; c.fillRect(0, 0, W, y);
    } else if (it.type === 'ground') {
      c.fillStyle = rgba(it.color, it.alpha); c.fillRect(0, y, W, H - y);
      if (it.stripes) {
        c.beginPath(); c.rect(0, y, W, H - y); c.clip();
        c.strokeStyle = rgba('#000000', Math.min(0.5, it.alpha * 0.6)); c.lineWidth = H / 90;
        var step = H / 22;
        for (var x = -H; x < W + H; x += step) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + (H - y), y); c.stroke(); }
      }
    } else if (it.type === 'drawing' && it.shapes && pc()) {
      pc().paintShapes(c, W, H, it.shapes);
    }
    c.restore();
  }
  function drawFrame() {
    if (!P || !opened) return;
    drawSource(ctx);
    P.items.forEach(function (it) { if (T >= it.start && T < it.end) drawItem(ctx, it); });
  }

  // ---------------------------------------------------------------- editing
  function addClip(m, at) {
    return durationOf(m).then(function (d) {
      var c = { id: uid(), mediaId: m.rec.id, in: 0, out: r2(d), vol: 1 };
      if (at == null) P.clips.push(c); else P.clips.splice(at, 0, c);
      save(); render(); return seekTo(T);
    });
  }
  function addAudio(m) {
    return durationOf(m).then(function (d) {
      P.audio.push({ id: uid(), mediaId: m.rec.id, start: r2(T), in: 0, out: r2(d), vol: 1 });
      save(); render(); tabTo('audio');
    });
  }
  function useMedia(rec, as) {
    return loadMedia(rec.id).then(function (m) {
      if (!m) return;
      if (as === 'audio' || m.rec.kind === 'audio') return addAudio(m);
      return addClip(m).then(function () { tabTo('clips'); });
    });
  }
  function split() {
    var s = segAt(T);
    if (!s) return;
    var local = s.c.in + (T - s.t0);
    if (local - s.c.in < 0.1 || s.c.out - local < 0.1) { toast('Move the playhead inside a clip to split it'); return; }
    var b = Object.assign({}, s.c, { id: uid(), in: r2(local) });
    s.c.out = r2(local);
    P.clips.splice(s.i + 1, 0, b);
    save(); render(); toast('✂ Split at ' + t1(T));
  }
  // a stop picture: the current frame becomes a still you can draw items onto
  function freeze() {
    var s = segAt(T);
    if (!s) { toast('Nothing to freeze yet'); return; }
    var tmp = document.createElement('canvas');
    tmp.width = cv.width; tmp.height = cv.height;
    drawSource(tmp.getContext('2d'));
    tmp.toBlob(function (blob) {
      pc().saveMedia({ kind: 'image', blob: blob, name: 'freeze ' + t1(T) }).then(function (rec) {
        return loadMedia(rec.id);
      }).then(function (m) {
        var s2 = segAt(T), local = s2.c.in + (T - s2.t0), at = s2.i + 1;
        if (local - s2.c.in < 0.1) at = s2.i;
        else if (s2.c.out - local >= 0.1) {
          P.clips.splice(s2.i + 1, 0, Object.assign({}, s2.c, { id: uid(), in: r2(local) }));
          s2.c.out = r2(local);
        }
        P.clips.splice(at, 0, { id: uid(), mediaId: m.rec.id, in: 0, out: 3, vol: 1 });
        save(); render(); toast('⏸📸 Frozen for 3 s — add ✨ items on it');
      });
    }, 'image/png');
  }
  function addItem(type) {
    var it = Object.assign({ id: uid(), type: type, start: r2(T), end: r2(T + 3) }, JSON.parse(JSON.stringify(ITEM_TYPES[type].d)));
    if (type === 'drawing') {
      it.shapes = pc().shapes();
      if (!it.shapes.length) { toast('Draw something on the live picture first'); return; }
    }
    // air and ground sit on the horizon if there is one
    if (type === 'air' || type === 'ground') {
      var h = P.items.filter(function (x) { return x.type === 'horizon'; })[0];
      if (h) it.y = h.y;
    }
    P.items.push(it);
    save(); render(); drawFrame();
  }
  function move(list, i, d) {
    var j = i + d;
    if (j < 0 || j >= list.length) return;
    var x = list[i]; list[i] = list[j]; list[j] = x;
    save(); render(); seekTo(T);
  }

  // ---------------------------------------------------------------- 🎙 voice-over
  function toggleVoice() {
    if (voice) { voice.rec.stop(); return; }
    var mic = pc().micStream();
    if (!mic) { toast('Turn 🎤 on in the popcorn window first'); return; }
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'], mt = '';
    for (var i = 0; i < types.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) { mt = types[i]; break; }
    var rec;
    try { rec = new MediaRecorder(mic, mt ? { mimeType: mt } : undefined); } catch (e) { toast('Voice recording not supported here'); return; }
    voice = { rec: rec, chunks: [], start: T, t0: Date.now() };
    rec.ondataavailable = function (e) { if (e.data.size) voice.chunks.push(e.data); };
    rec.onstop = function () {
      var v = voice; voice = null;
      var blob = new Blob(v.chunks, { type: (rec.mimeType || 'audio/webm').split(';')[0] });
      var d = (Date.now() - v.t0) / 1000;
      pc().saveMedia({ kind: 'audio', blob: blob, name: 'voice ' + t1(v.start), duration: d }).then(function (r) {
        r.probed = true;
        return loadMedia(r.id);
      }).then(function (m) {
        P.audio.push({ id: uid(), mediaId: m.rec.id, start: r2(v.start), in: 0, out: r2(d), vol: 1 });
        save(); render(); toast('🎙 Voice added at ' + t1(v.start));
      });
      render();
    };
    rec.start(500);
    if (P.clips.length && !playing) play();   // speak over the movie as it plays
    render();
  }

  // ---------------------------------------------------------------- 🎞 make the movie (one file)
  function makeMovie() {
    if (rendering) return;
    if (!P.clips.length) { toast('Add a clip first'); return; }
    if (!cv.captureStream || !window.MediaRecorder) { toast('This browser can’t make movie files'); return; }
    pause();
    ensureEngine();
    var tracks = cv.captureStream(30).getVideoTracks(), dest = null;
    if (actx) {
      dest = actx.createMediaStreamDestination();
      master.connect(dest);
      tracks = tracks.concat(dest.stream.getAudioTracks());
    }
    var types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'], mt = '';
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) { mt = types[i]; break; }
    var rec;
    try { rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mt || undefined, videoBitsPerSecond: 3000000 }); }
    catch (e) { toast('Could not start the movie recorder'); return; }
    rendering = { rec: rec, chunks: [], dest: dest, mime: rec.mimeType || mt || 'video/webm' };
    rec.ondataavailable = function (e) { if (e.data.size) rendering.chunks.push(e.data); };
    rec.onstop = function () {
      var r = rendering; rendering = null;
      if (r.dest) try { master.disconnect(r.dest); } catch (e) {}
      if (r.cancelled) { render(); toast('Movie cancelled'); return; }
      var blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
      pc().saveMedia({ kind: 'movie', blob: blob, name: P.name || 'movie', duration: total(), note: P.description })
        .then(function (m) {
          ui.done = m;
          render();
          toast('🎬 Movie made — kept in 🗂 session');
        });
    };
    T = 0;
    seekTo(0).then(function () {
      rec.start(1000);
      play();
      render();
    });
  }
  function finishRender() {
    if (!rendering) return;
    setTimeout(function () { if (rendering && rendering.rec.state !== 'inactive') rendering.rec.stop(); }, 150);
  }
  function cancelRender() {
    if (!rendering) return;
    rendering.cancelled = true;
    pause();
    if (rendering.rec.state !== 'inactive') rendering.rec.stop();
  }

  // ---------------------------------------------------------------- UI
  function build() {
    if (built) return;
    built = true;
    var st = el('style'); st.textContent = CSS; document.head.appendChild(st);
    root = el('div', 'rvm');
    var head = el('div', 'rvm-head');
    head.appendChild(el('span', '', '🎬'));
    ui.name = el('input'); ui.name.placeholder = 'movie name';
    ui.name.addEventListener('input', function () { P.name = ui.name.value; save(); });
    head.appendChild(ui.name);
    ui.aspect = el('select');
    Object.keys(ASPECTS).forEach(function (k) { var o = el('option', '', k); o.value = k; ui.aspect.appendChild(o); });
    ui.aspect.addEventListener('change', function () { P.aspect = ui.aspect.value; sizeCanvas(); save(); drawFrame(); });
    head.appendChild(ui.aspect);
    button(head, '📽', 'Movie plans', function () { openPlans(); });
    button(head, '✕', 'Back to the camera', close);
    root.appendChild(head);

    var stage = el('div', 'rvm-stage');
    cv = el('canvas'); ctx = cv.getContext('2d');
    stage.appendChild(cv);
    root.appendChild(stage);

    var tr = el('div', 'rvm-trans');
    button(tr, '⏮', 'To the start', function () { pause(); seekTo(0); });
    ui.play = button(tr, '▶', 'Play / pause', function () { if (playing) pause(); else play(); });
    ui.scrub = el('input'); ui.scrub.type = 'range'; ui.scrub.min = 0; ui.scrub.step = 0.05;
    ui.scrub.addEventListener('input', function () { pause(); seekTo(parseFloat(ui.scrub.value)); });
    tr.appendChild(ui.scrub);
    ui.time = el('span', 'rvm-time');
    tr.appendChild(ui.time);
    button(tr, '✂', 'Split the clip here', split);
    button(tr, '⏸📸', 'Freeze this frame (stop picture)', freeze);
    root.appendChild(tr);

    var tabs = el('div', 'rvm-tabs');
    ui.tabs = {};
    [['clips', '🎞 CLIPS'], ['audio', '🔊 AUDIO'], ['items', '✨ ITEMS'], ['notes', '📝 NOTES'], ['library', '📚 LIBRARY']]
      .forEach(function (t) { ui.tabs[t[0]] = button(tabs, t[1], t[1], function () { tabTo(t[0]); }); });
    root.appendChild(tabs);

    ui.body = el('div', 'rvm-body');
    root.appendChild(ui.body);

    var foot = el('div', 'rvm-foot');
    ui.go = button(foot, '🎞 MAKE MOVIE', 'Record the plan into one movie file', makeMovie, 'rvm-go');
    ui.prog = el('div', 'rvm-prog', '<i></i>');
    foot.appendChild(ui.prog);
    ui.cancel = button(foot, '✕ STOP', 'Stop making the movie', cancelRender);
    root.appendChild(foot);

    ui.plans = el('div', 'rvm-over');
    root.appendChild(ui.plans);

    ui.importIn = el('input'); ui.importIn.type = 'file'; ui.importIn.multiple = true;
    ui.importIn.accept = 'video/*,audio/*,image/*'; ui.importIn.style.display = 'none';
    ui.importIn.addEventListener('change', function () {
      var files = Array.prototype.slice.call(ui.importIn.files);
      ui.importIn.value = '';
      Promise.all(files.map(function (f) {
        var kind = /^image\//.test(f.type) ? 'image' : /^audio\//.test(f.type) ? 'audio' : /^video\//.test(f.type) ? 'video' : '';
        return kind ? pc().saveMedia({ kind: kind, blob: f, name: f.name.replace(/\.[^.]+$/, '') }) : null;
      })).then(function () { toast('📥 Imported'); render(); });
    });
    root.appendChild(ui.importIn);

    pc().root().appendChild(root);
    raf = requestAnimationFrame(tick);
    document.addEventListener('keydown', function (e) {
      if (!opened) return;
      if (e.key === 'Escape') { e.stopPropagation(); if (ui.plans.classList.contains('open')) ui.plans.classList.remove('open'); else close(); }
      else if (e.key === ' ' && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.preventDefault(); if (playing) pause(); else play(); }
    }, true);
  }

  function tabTo(t) { tab = t; render(); }
  function refreshTime() {
    if (!ui.time) return;
    var tt = total();
    ui.time.textContent = t1(T) + ' / ' + t1(tt);
    ui.scrub.max = Math.max(0.1, tt);
    ui.scrub.value = T;
    if (rendering) $('i', ui.prog).style.width = (tt ? Math.min(100, T / tt * 100) : 0) + '%';
  }
  function num(parent, label, value, fn, step) {
    var l = el('label', '', label);
    var i = el('input'); i.type = 'number'; i.step = step || 0.1; i.value = value;
    i.addEventListener('change', function () { fn(parseFloat(i.value) || 0); });
    parent.appendChild(l); parent.appendChild(i);
    return i;
  }
  function slider(parent, label, value, min, max, step, fn) {
    var l = el('label', '', label);
    var i = el('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    i.addEventListener('input', function () { fn(parseFloat(i.value)); });
    parent.appendChild(l); parent.appendChild(i);
    return i;
  }
  function card(now) { var c = el('div', 'rvm-card' + (now ? ' now' : '')); ui.body.appendChild(c); return c; }

  function render() {
    if (!built || !P) return;
    ui.name.value = P.name;
    ui.aspect.value = P.aspect;
    Object.keys(ui.tabs).forEach(function (k) { ui.tabs[k].classList.toggle('on', tab === k); });
    ui.go.disabled = !!rendering || !P.clips.length;
    ui.go.textContent = rendering ? '● MAKING…' : '🎞 MAKE MOVIE';
    ui.cancel.style.display = rendering ? '' : 'none';
    ui.prog.style.display = rendering ? '' : 'none';
    refreshTime();
    var b = ui.body;
    b.innerHTML = '';
    if (ui.done && !rendering) {
      var dc = card(true), done = ui.done;
      dc.innerHTML = '🎬 <b>' + esc(done.name) + '</b> is made — one file, kept in 🗂 session. ' +
        '<div class="rvm-note">To share it, leave the bunker and use your useRbox links (e.g. YouTube).</div>';
      var dr = el('div', 'rvm-row'); dc.appendChild(dr);
      button(dr, '▶ WATCH', 'Watch', function () { showDone(done); });
      button(dr, '⬇ SAVE COPY', 'Save a copy to this device', function () { pc().download(done.blob, pc().fileName(done)); });
      button(dr, '📝 DESCRIPTION .TXT', 'Save the description', function () { downloadNotes(); });
      button(dr, '✕', 'Hide', function () { ui.done = null; render(); });
    }
    if (tab === 'clips') renderClips();
    else if (tab === 'audio') renderAudio();
    else if (tab === 'items') renderItems();
    else if (tab === 'notes') renderNotes();
    else renderLibrary();
  }
  function showDone(m) {
    pause();
    var url = URL.createObjectURL(m.blob), o = ui.plans;
    o.innerHTML = '<h3>🎬 ' + esc(m.name) + '</h3>';
    var vid = el('video'); vid.controls = true; vid.playsInline = true; vid.src = url;
    vid.style.cssText = 'width:100%;max-height:70vh;background:#000';
    o.appendChild(vid);
    var r = el('div', 'rvm-row'); o.appendChild(r);
    button(r, '✕ CLOSE', 'Close', function () {
      vid.pause(); vid.removeAttribute('src'); vid.load(); URL.revokeObjectURL(url);
      o.classList.remove('open');
    });
    o.classList.add('open');
    vid.play().catch(function () {});
  }
  function downloadNotes() {
    var lines = ['# ' + (P.name || 'movie'), '', P.description || '(no description)', '', 'Clips:'];
    P.clips.forEach(function (c, i) {
      var m = media[c.mediaId];
      lines.push((i + 1) + '. ' + (m ? m.rec.name : '?') + '  ' + t1(c.in) + ' → ' + t1(c.out));
    });
    if (P.audio.length) { lines.push('', 'Audio:'); P.audio.forEach(function (a) { var m = media[a.mediaId]; lines.push('- ' + (m ? m.rec.name : '?') + ' at ' + t1(a.start)); }); }
    if (P.items.length) { lines.push('', 'Items:'); P.items.forEach(function (it) { lines.push('- ' + ITEM_TYPES[it.type].label + ' ' + t1(it.start) + ' → ' + t1(it.end) + (it.text ? ' "' + it.text + '"' : '')); }); }
    pc().download(new Blob([lines.join('\n')], { type: 'text/plain' }), 'rudventur-' + String(P.name || 'movie').replace(/[^\w\-]+/g, '-') + '-description.txt');
  }

  function renderClips() {
    var list = segs(), now = segAt(T);
    if (!list.length) ui.body.appendChild(el('p', 'rvm-note', 'No clips yet — add videos or pictures from 📚 LIBRARY, or 💾 keep the back-recording first.'));
    list.forEach(function (s) {
      var c = s.c, m = media[c.mediaId], still = m.rec.kind === 'image';
      var k = card(now === s);
      k.innerHTML = (still ? '🖼 ' : '🎞 ') + '<b>' + esc(m.rec.name) + '</b> <span class="rvm-note">at ' + t1(s.t0) + ' · ' + t1(s.d) + '</span>';
      var r1 = el('div', 'rvm-row'); k.appendChild(r1);
      if (still) {
        num(r1, 'show for (s)', r2(c.out - c.in), function (v) { c.in = 0; c.out = Math.max(0.2, v); save(); render(); });
      } else {
        num(r1, 'in', c.in, function (v) { c.in = Math.max(0, Math.min(v, c.out - 0.1)); save(); render(); seekTo(T); });
        num(r1, 'out', c.out, function (v) { c.out = Math.max(c.in + 0.1, v); save(); render(); seekTo(T); });
        button(r1, '⇤', 'Start this clip at the playhead', function () {
          if (now !== s) { toast('Playhead is not in this clip'); return; }
          c.in = r2(c.in + (T - s.t0)); save(); render(); seekTo(s.t0);
        });
        button(r1, '⇥', 'End this clip at the playhead', function () {
          if (now !== s) { toast('Playhead is not in this clip'); return; }
          c.out = r2(c.in + (T - s.t0)); save(); render(); seekTo(T);
        });
      }
      var r3 = el('div', 'rvm-row'); k.appendChild(r3);
      if (!still) slider(r3, '🔊', c.vol, 0, 2, 0.05, function (v) { c.vol = v; save(); if (curSeg === s && gV) gV.gain.value = v; });
      button(r3, '▶', 'Go to this clip', function () { pause(); seekTo(s.t0); });
      button(r3, '↑', 'Earlier', function () { move(P.clips, s.i, -1); });
      button(r3, '↓', 'Later', function () { move(P.clips, s.i, 1); });
      button(r3, '✕', 'Take out of the movie', function () { P.clips.splice(s.i, 1); save(); render(); seekTo(Math.min(T, total())); });
    });
  }
  function renderAudio() {
    var top = card(false);
    top.innerHTML = '<div class="rvm-note">Extra sound on top of the clips. Each clip keeps its own sound (🔊 in CLIPS — 0 mutes it).</div>';
    var tr = el('div', 'rvm-row'); top.appendChild(tr);
    button(tr, voice ? '⏹ STOP VOICE' : '🎙 REC VOICE', 'Record your voice over the movie from the playhead',
      toggleVoice, voice ? 'on' : '');
    button(tr, '➕ FROM LIBRARY', 'Add sound from the library', function () { tabTo('library'); });
    if (!pc().micStream()) tr.appendChild(el('span', 'rvm-note', '🎤 is off in the popcorn window'));
    P.audio.forEach(function (a, i) {
      var m = media[a.mediaId];
      var k = card(T >= a.start && T < a.start + (a.out - a.in));
      k.innerHTML = '🔊 <b>' + esc(m.rec.name) + '</b>';
      var r1 = el('div', 'rvm-row'); k.appendChild(r1);
      num(r1, 'starts at', a.start, function (v) { a.start = Math.max(0, v); save(); render(); });
      button(r1, '⌖', 'Start at the playhead', function () { a.start = r2(T); save(); render(); });
      num(r1, 'in', a.in, function (v) { a.in = Math.max(0, Math.min(v, a.out - 0.1)); save(); render(); });
      num(r1, 'out', a.out, function (v) { a.out = Math.max(a.in + 0.1, v); save(); render(); });
      var r2_ = el('div', 'rvm-row'); k.appendChild(r2_);
      slider(r2_, 'volume', a.vol, 0, 2, 0.05, function (v) { a.vol = v; save(); });
      button(r2_, '✕', 'Remove this sound', function () { P.audio.splice(i, 1); save(); render(); syncAudio(true); });
    });
  }
  function renderItems() {
    var top = card(false);
    top.innerHTML = '<div class="rvm-note">Items appear from their start to their end, on top of the picture. New ones start at the playhead (' + t1(T) + ').</div>';
    var tr = el('div', 'rvm-row'); top.appendChild(tr);
    Object.keys(ITEM_TYPES).forEach(function (k) { button(tr, ITEM_TYPES[k].label, 'Add ' + ITEM_TYPES[k].label, function () { addItem(k); }); });
    P.items.forEach(function (it, i) {
      var def = ITEM_TYPES[it.type];
      var k = card(T >= it.start && T < it.end);
      k.innerHTML = '<b>' + def.label + '</b>';
      var r1 = el('div', 'rvm-row'); k.appendChild(r1);
      num(r1, 'from', it.start, function (v) { it.start = Math.max(0, v); save(); drawFrame(); });
      button(r1, '⌖', 'From the playhead', function () { it.start = r2(T); if (it.end <= it.start) it.end = r2(T + 3); save(); render(); drawFrame(); });
      num(r1, 'to', it.end, function (v) { it.end = Math.max(it.start + 0.1, v); save(); drawFrame(); });
      button(r1, '⌖', 'To the playhead', function () { if (T > it.start) { it.end = r2(T); save(); render(); drawFrame(); } });
      var r2_ = el('div', 'rvm-row'); k.appendChild(r2_);
      def.f.forEach(function (f) {
        var key = f[0];
        if (f[2] === 'text') {
          var i2 = el('input'); i2.type = 'text'; i2.value = it[key];
          i2.addEventListener('input', function () { it[key] = i2.value; save(); drawFrame(); });
          r2_.appendChild(i2);
        } else if (f[2] === 'color') {
          r2_.appendChild(el('label', '', f[1]));
          var ci = el('input'); ci.type = 'color'; ci.value = it[key];
          ci.addEventListener('input', function () { it[key] = ci.value; save(); drawFrame(); });
          r2_.appendChild(ci);
        } else if (f[2] === 'range') {
          slider(r2_, f[1], it[key], f[3], f[4], f[5], function (v) { it[key] = v; save(); drawFrame(); });
        } else if (f[2] === 'check') {
          var lab = el('label', '', ''); var ch = el('input'); ch.type = 'checkbox'; ch.checked = !!it[key];
          ch.addEventListener('change', function () { it[key] = ch.checked; save(); drawFrame(); });
          lab.appendChild(ch); lab.appendChild(document.createTextNode(' ' + f[1]));
          r2_.appendChild(lab);
        }
      });
      button(r2_, '✕', 'Remove', function () { P.items.splice(i, 1); save(); render(); drawFrame(); });
    });
  }
  function renderNotes() {
    var k = card(false);
    k.innerHTML = '<div class="rvm-note">The description of your movie — what happens, who is in it, where. It is saved with the plan and with the finished movie.</div>';
    var ta = el('textarea'); ta.value = P.description || '';
    ta.placeholder = 'Describe the movie…';
    ta.addEventListener('input', function () { P.description = ta.value; save(); });
    k.appendChild(ta);
    var r = el('div', 'rvm-row'); k.appendChild(r);
    button(r, '⬇ DESCRIPTION .TXT', 'Save the description as a text file', downloadNotes);
  }
  function renderLibrary() {
    var top = card(false);
    var tr = el('div', 'rvm-row'); top.appendChild(tr);
    button(tr, '📥 IMPORT', 'Bring video / audio / pictures from this device', function () { ui.importIn.click(); });
    top.appendChild(el('div', 'rvm-note', 'Everything here is on this device only. 🗑 moves to the bin (in 🗂 session).'));
    var holder = el('div', 'rvm-list'); ui.body.appendChild(holder);
    DB().all('media').then(function (all) {
      if (tab !== 'library') return;
      all = all.filter(function (m) { return !m.binned; }).sort(function (a, b) { return b.created - a.created; });
      if (!all.length) holder.appendChild(el('p', 'rvm-note', 'Empty — 💾 keep a back-recording, 📸 snapshot, or 📥 import.'));
      all.forEach(function (m) {
        var r = el('div', 'rvp-item');
        r.appendChild(el('span', '', ({ video: '🎞', audio: '🔊', image: '🖼', movie: '🎬' })[m.kind] + ' ' + esc(m.name) +
          (m.duration ? ' <small>' + t1(m.duration) + '</small>' : '')));
        if (m.kind !== 'audio') button(r, '➕ CLIP', 'Add to the clips', function () { useMedia(m, 'clip'); });
        if (m.kind !== 'image') button(r, '➕ 🔊', 'Add its sound as audio', function () { useMedia(m, 'audio'); });
        button(r, '🗑', 'Move to the bin', function () { m.binned = true; DB().put('media', m).then(render); });
        holder.appendChild(r);
      });
    });
  }

  function openPlans() {
    pause();
    var o = ui.plans;
    o.innerHTML = '<h3>📽 MOVIE PLANS</h3>';
    var r = el('div', 'rvm-row'); o.appendChild(r);
    button(r, '➕ NEW PLAN', 'Start a new movie plan', function () {
      var p = newProject(); DB().put('projects', p); o.classList.remove('open'); ui.done = null; loadProject(p);
    });
    button(r, '✕', 'Close', function () { o.classList.remove('open'); });
    var list = el('div', 'rvm-list'); o.appendChild(list);
    DB().all('projects').then(function (all) {
      all.filter(function (p) { return !p.binned; }).sort(function (a, b) { return b.updated - a.updated; }).forEach(function (p) {
        var it = el('div', 'rvp-item');
        it.appendChild(el('span', '', (p.id === P.id ? '▶ ' : '') + esc(p.name || 'movie') + '<br><small>' +
          p.clips.length + ' clips · ' + new Date(p.updated).toLocaleString() + '</small>'));
        button(it, 'OPEN', 'Open this plan', function () { o.classList.remove('open'); ui.done = null; loadProject(p); });
        button(it, '🗑', 'Move to the bin', function () {
          p.binned = true;
          DB().put('projects', p).then(function () {
            if (p.id === P.id) { var n = newProject(); DB().put('projects', n); loadProject(n); }
            openPlans();
          });
        });
        list.appendChild(it);
      });
    });
    o.classList.add('open');
  }

  // ---------------------------------------------------------------- open / close
  function open(opts) {
    opts = opts || {};
    if (!pc()) return;
    build();
    opened = true;
    root.classList.add('open');
    var start = P ? Promise.resolve() : DB().all('projects').then(function (all) {
      all = all.filter(function (p) { return !p.binned; }).sort(function (a, b) { return b.updated - a.updated; });
      var p = all[0] || newProject();
      if (!all[0]) DB().put('projects', p);
      return loadProject(p);
    });
    start.then(function () {
      if (opts.add) {
        var m = opts.add;
        return useMedia(m, m.kind === 'audio' ? 'audio' : 'clip');
      }
    }).then(render);
  }
  function close() {
    if (rendering) { toast('Wait until the movie is made (or ✕ STOP)'); return; }
    if (voice) voice.rec.stop();
    pause();
    opened = false;
    if (root) root.classList.remove('open');
  }

  window.rvMovie = { open: open, close: close, isOpen: function () { return opened; } };
})();
