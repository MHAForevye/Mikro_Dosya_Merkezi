'use strict';
/* PDF düzenleyici.
 * Nesne koordinatları: sayfanın kendi (/Rotate uygulanmış) görünümünde, 1x ölçekte, sol üst köşe (0,0).
 * Kullanıcı döndürmesi ayrıca tutulur ve ekranda CSS ile uygulanır. */
const PdfEditor = (() => {
  const fresh = () => ({ sources: {}, pages: [], cur: 0, checked: new Set(), tool: 'select', zoom: null, sel: null, undo: [], redo: [], name: 'belge.pdf', opened: null });
  let S = fresh();
  let images = {}, clipboard = null, ui = null, pdfjs = null, uid = 0, renderSeq = 0, renderTask = null, observer = null, queue = Promise.resolve(), scale = 1, busy = false;
  const thumbCache = new Map(), lineCache = new Map();
  const newId = () => 'i' + (++uid);
  const page = () => S.pages[S.cur];
  const selected = () => page()?.objs.find(o => o.id === S.sel);

  async function engines() {
    await loadScript(ENGINES.pdflib);
    if (!pdfjs) {
      pdfjs = await import(ENGINES.pdfjs);
      pdfjs.GlobalWorkerOptions.workerSrc = ENGINES.pdfworker;
    }
  }
  const jsDoc = bytes => pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;

  /* Bir PDF'i kaynak olarak ekler, sayfa kayıtlarını döndürür */
  async function addSource(bytes, indices) {
    try { await PDFLib.PDFDocument.load(bytes); }
    catch (e) { throw new Error(/encrypt/i.test(e.message) ? 'Parolalı/şifreli PDF düzenlenemiyor.' : e.message); }
    const js = await jsDoc(bytes), id = newId();
    S.sources[id] = { bytes, js };
    const list = indices || [...Array(js.numPages).keys()], out = [];
    for (const idx of list) {
      const p = await js.getPage(idx + 1), R = ((p.rotate % 360) + 360) % 360, v = p.getViewport({ scale: 1, rotation: R });
      out.push({ id: newId(), src: id, idx, R, W: v.width, H: v.height, rot: 0, crop: null, objs: [] });
    }
    return out;
  }
  const readBytes = async f => new Uint8Array(await f.arrayBuffer());

  async function withBusy(msg, fn) {
    if (busy) { toast('Önceki işlem sürüyor…'); return; }
    busy = true; toast(msg, 60000);
    try { await fn(); $('#toast').classList.add('hidden'); }
    catch (e) { console.error(e); toast('İşlem başarısız: ' + e.message, 7000); }
    finally { busy = false; }
  }

  async function open(file) {
    if (S.opened === file) return;
    if (!canDiscard('pdf')) return;
    await withBusy('PDF açılıyor…', async () => {
      await engines();
      const old = S; S = fresh(); thumbCache.clear(); lineCache.clear(); images = {};
      try { S.pages = await addSource(await readBytes(file)); }
      catch (e) { S = old; throw e; }
      S.name = file.name; S.opened = file; App.dirty.pdf = false;
    });
    refresh();
  }
  async function openMany(files) {
    App.go('pdf', files[0]);
    await waitIdle();
    if (S.opened !== files[0]) return;
    await withBusy('PDF\'ler birleştiriliyor…', async () => {
      const add = [];
      for (const f of files.slice(1)) add.push(...await addSource(await readBytes(f)));
      change(() => S.pages.push(...add));
    });
  }
  const waitIdle = () => new Promise(res => { const t = () => busy ? setTimeout(t, 100) : res(); setTimeout(t, 50); });

  /* ---------- Geri al / yinele ---------- */
  const snap = () => JSON.stringify({ pages: S.pages, cur: S.cur });
  function pushUndo() { S.undo.push(snap()); if (S.undo.length > 100) S.undo.shift(); S.redo = []; App.dirty.pdf = true; }
  function change(fn) { pushUndo(); fn(); refresh(); }
  function travel(from, to) {
    if (!from.length) return;
    to.push(snap()); const s = JSON.parse(from.pop()); S.pages = s.pages; S.cur = s.cur; S.sel = null; S.checked.clear(); App.dirty.pdf = true; refresh();
  }

  /* ---------- Arayüz ---------- */
  function render(view, file) {
    view.innerHTML = `<div class="panel">
    <div class="toolbar">
      <button data-a="open">📂 PDF aç</button><button data-a="insert" class="need">＋ Sayfa ekle</button><span class="sep"></span>
      <button data-a="undo" class="need" title="Geri al">↶</button><button data-a="redo" class="need" title="Yinele">↷</button><span class="sep"></span>
      <button data-a="rotl" class="need" title="Sola döndür">⟲</button><button data-a="rotr" class="need" title="Sağa döndür">⟳</button><button data-a="up" class="need" title="Sayfayı öne al">↑</button><button data-a="down" class="need" title="Sayfayı arkaya al">↓</button><button data-a="dup" class="need">⧉ Kopyala</button><button data-a="del" class="need warn">🗑 Sayfa sil</button>
    </div>
    <div class="toolbar">
      <button data-t="select" class="need">➤ Seç/Taşı</button><button data-t="edit" class="need">✎ Metni düzenle</button><button data-t="text" class="need">T Yazı ekle</button><button data-a="image" class="need">🖼 Görsel/İmza</button><button data-t="cover" class="need">▭ Kapat</button><button data-t="mark" class="need">🖍 Vurgula</button><button data-t="crop" class="need">⌗ Kırp</button><button data-a="paste" class="need">📋 Yapıştır</button><span class="sep"></span>
      <button data-a="zoomout" class="need">−</button><button data-a="fit" class="need">Sığdır</button><button data-a="zoomin" class="need">＋</button>
    </div>
    <div class="toolbar">
      <button data-a="save" class="need primary">⬇ PDF indir</button><button data-a="flat" class="need">🔒 Güvenli indir</button><button data-a="extract" class="need">Seçili sayfaları ayır</button><button data-a="delsel" class="need warn">Seçili sayfaları sil</button><button data-a="txt" class="need">Metni TXT indir</button>
    </div>
    <div class="notice hidden" id="pdfhint"></div>
    <div class="props hidden" id="props"></div>
    <div id="pdfempty"><p class="filemeta">Bir PDF aç ya da <button data-a="newdoc">boş belge oluştur</button>. PDF dosyası cihazında işlenir.</p></div>
    <div class="pdfwrap hidden" id="pdfwrap"><div class="thumbs" id="thumbs"></div><div><div class="stagebox" id="stagebox"><div class="sizer" id="sizer"><div class="stage" id="stage"><canvas></canvas><div class="layer" id="layer"></div></div></div></div><div class="filemeta" id="pageinfo"></div></div></div></div>`;
    ui = view;
    view.onclick = e => {
      const a = e.target.closest('[data-a]'), t = e.target.closest('[data-t]');
      if (a) actions[a.dataset.a]?.();
      if (t) setTool(t.dataset.t);
    };
    $('#layer', view).onpointerdown = layerDown;
    refresh();
    if (file) open(file);
  }
  const alive = () => ui && $('#pdfwrap', ui)?.isConnected;

  function setTool(t) {
    S.tool = t; if (t !== 'select') S.sel = null;
    drawTools(); drawLayer(); drawProps();
  }
  const HINTS = {
    edit: 'Değiştirmek istediğin satırın mavi kutusuna dokun. Sonra yazıyı düzenle, sürükle, sil ya da ✂ Kes. (Taranmış sayfalarda metin algılanmaz.)',
    text: 'Yazının geleceği yere dokun.', cover: 'Kapatmak istediğin alanı sürükleyerek çiz.', mark: 'Vurgulanacak alanı sürükleyerek çiz.', crop: 'Sayfada kalacak alanı sürükleyerek çiz.'
  };
  function drawTools() {
    if (!alive()) return;
    $$('[data-t]', ui).forEach(b => b.classList.toggle('active', b.dataset.t === S.tool));
    const h = $('#pdfhint', ui); let msg = S.pages.length ? HINTS[S.tool] || '' : '';
    h.innerHTML = esc(msg) + (S.tool === 'crop' && page()?.crop ? ' <button data-a="uncrop">Kırpmayı kaldır</button> <button data-a="cropall">Tüm sayfalara uygula</button>' : '');
    h.classList.toggle('hidden', !msg);
    $('#layer', ui).classList.toggle('drawing', ['text', 'cover', 'mark', 'crop'].includes(S.tool));
  }
  function refresh() {
    if (!alive()) return;
    S.cur = Math.max(0, Math.min(S.cur, S.pages.length - 1));
    const has = S.pages.length > 0;
    $('#pdfwrap', ui).classList.toggle('hidden', !has);
    $('#pdfempty', ui).classList.toggle('hidden', has);
    $$('.need', ui).forEach(b => b.disabled = !has);
    if (!has && S.undo.length) $('[data-a="undo"]', ui).disabled = false;
    drawTools(); drawProps();
    if (has) { drawThumbs(); drawPage(); }
  }

  /* ---------- Küçük resimler ---------- */
  const thumbKey = p => p.src + ':' + p.idx + ':' + p.rot;
  async function makeThumb(p) {
    const k = thumbKey(p);
    if (!thumbCache.has(k)) {
      const jp = await S.sources[p.src].js.getPage(p.idx + 1), rotation = (p.R + p.rot) % 360;
      const v1 = jp.getViewport({ scale: 1, rotation }), v = jp.getViewport({ scale: 220 / Math.max(v1.width, v1.height), rotation });
      const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
      await jp.render({ canvasContext: c.getContext('2d'), viewport: v }).promise;
      thumbCache.set(k, c.toDataURL('image/jpeg', .8));
    }
    return thumbCache.get(k);
  }
  function drawThumbs() {
    const box = $('#thumbs', ui), top = box.scrollTop, left = box.scrollLeft;
    const plus = i => `<button class="insert" data-ins="${i}" title="Buraya sayfa ekle" aria-label="Buraya sayfa ekle">＋</button>`;
    box.innerHTML = plus(0) + S.pages.map((p, i) => `<div class="thumb ${i === S.cur ? 'current' : ''}" draggable="true" data-i="${i}"><div class="pic"><img alt="Sayfa ${i + 1}"></div><label class="cap"><input type="checkbox" ${S.checked.has(p.id) ? 'checked' : ''}> ${i + 1}${p.objs.length ? ' ✎' : ''}${p.crop ? ' ⌗' : ''}</label></div>` + plus(i + 1)).join('');
    box.scrollTop = top; box.scrollLeft = left;
    observer?.disconnect();
    observer = new IntersectionObserver(entries => entries.forEach(en => {
      if (!en.isIntersecting) return;
      observer.unobserve(en.target);
      const el = en.target, p = S.pages[+el.dataset.i];
      if (!p) return;
      if (thumbCache.has(thumbKey(p))) $('img', el).src = thumbCache.get(thumbKey(p));
      else queue = queue.then(async () => { if (el.isConnected) $('img', el).src = await makeThumb(p); }).catch(e => console.warn(e));
    }), { root: box, rootMargin: '300px' });
    $$('.thumb', box).forEach(el => {
      const i = +el.dataset.i, p = S.pages[i];
      if (thumbCache.has(thumbKey(p))) $('img', el).src = thumbCache.get(thumbKey(p)); else observer.observe(el);
      el.onclick = e => {
        if (e.target.closest('.cap')) { if (e.target.type === 'checkbox') e.target.checked ? S.checked.add(p.id) : S.checked.delete(p.id); return; }
        go(i);
      };
      el.ondragstart = e => e.dataTransfer.setData('text/x-page', String(i));
      el.ondragover = e => { if (e.dataTransfer.types.includes('text/x-page')) { e.preventDefault(); el.classList.add('dragover', 'dropmark'); } };
      el.ondragleave = () => el.classList.remove('dropmark');
      el.ondrop = e => { const from = e.dataTransfer.getData('text/x-page'); if (from !== '') { e.preventDefault(); e.stopPropagation(); move(+from, i); } };
    });
    $$('[data-ins]', box).forEach(b => b.onclick = () => insertDialog(+b.dataset.ins));
  }
  function go(i) {
    S.cur = i; S.sel = null;
    $$('.thumb', ui).forEach(el => el.classList.toggle('current', +el.dataset.i === i));
    drawTools(); drawProps(); drawPage();
  }
  /* "from" sayfasını, "to" konumundaki sayfanın yerine taşır */
  function move(from, to) {
    if (from === to || to < 0 || to >= S.pages.length) return;
    change(() => { const [p] = S.pages.splice(from, 1); S.pages.splice(to, 0, p); S.cur = to; S.sel = null; });
  }

  /* ---------- Ana sayfa görünümü ---------- */
  function fitScale(p) {
    const box = $('#stagebox', ui), side = p.rot % 180 ? p.H : p.W;
    return Math.max(.2, Math.min(2.5, (box.clientWidth - 36) / side));
  }
  async function drawPage() {
    const p = page(); if (!p || !alive()) return;
    const seq = ++renderSeq;
    scale = S.zoom || fitScale(p);
    const w = p.W * scale, h = p.H * scale, sideways = p.rot % 180 !== 0;
    const stage = $('#stage', ui), sizer = $('#sizer', ui);
    sizer.style.width = (sideways ? h : w) + 'px'; sizer.style.height = (sideways ? w : h) + 'px';
    stage.style.width = w + 'px'; stage.style.height = h + 'px';
    stage.style.transform = `translate(-50%,-50%) rotate(${p.rot}deg)`;
    $('#pageinfo', ui).textContent = `${S.name} • Sayfa ${S.cur + 1} / ${S.pages.length} • %${Math.round(scale * 100)}`;
    const old = $('canvas', stage);
    if (old.dataset.page !== p.id) old.getContext('2d').clearRect(0, 0, old.width, old.height);
    drawLayer();
    const jp = await S.sources[p.src].js.getPage(p.idx + 1);
    if (seq !== renderSeq) return;
    const k = Math.min(scale * (window.devicePixelRatio || 1), Math.sqrt(12e6 / (p.W * p.H)));
    const v = jp.getViewport({ scale: k, rotation: p.R }), c = document.createElement('canvas');
    c.width = v.width; c.height = v.height; c.dataset.page = p.id;
    renderTask?.cancel();
    renderTask = jp.render({ canvasContext: c.getContext('2d', { willReadFrequently: true }), viewport: v });
    try { await renderTask.promise; } catch (e) { if (e.name !== 'RenderingCancelledException') console.warn(e); return; }
    if (seq === renderSeq && alive()) $('canvas', stage).replaceWith(c);
  }

  const FAMILY = { sans: 'Arial, Helvetica, "Liberation Sans", sans-serif', serif: '"Times New Roman", Times, "Liberation Serif", serif', mono: '"Courier New", Courier, "Liberation Mono", monospace' };
  const cssFont = (o, size) => `${o.bold ? 'bold ' : ''}${size}px ${FAMILY[o.family] || FAMILY.sans}`;
  const measureCtx = document.createElement('canvas').getContext('2d');
  function measure(o) {
    measureCtx.font = cssFont(o, 100);
    const lines = o.text.split('\n');
    o.w = Math.max(4, ...lines.map(l => measureCtx.measureText(l).width * o.size / 100));
    o.h = lines.length * o.size * 1.2;
    return o;
  }
  const px = n => (n * scale) + 'px';
  const place = (el, r) => Object.assign(el.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) });

  function drawLayer() {
    if (!alive()) return;
    const layer = $('#layer', ui), p = page(); layer.innerHTML = '';
    if (!p) return;
    for (const o of p.objs) {
      const el = document.createElement('div');
      el.className = 'obj ' + o.type + (o.id === S.sel ? ' selected' : '');
      el.dataset.id = o.id; place(el, o);
      if (o.type === 'cover') el.style.background = o.color;
      if (o.type === 'rect') el.style.background = o.color;
      if (o.type === 'mark') Object.assign(el.style, { background: o.color, opacity: .4, mixBlendMode: 'multiply' });
      if (o.type === 'image') { const im = new Image(); im.src = images[o.img]; el.appendChild(im); }
      if (o.type === 'text') {
        el.textContent = o.text;
        Object.assign(el.style, { font: cssFont(o, o.size * scale), lineHeight: '1.2', color: o.color, background: o.bg || 'transparent', width: 'max-content', minWidth: px(6) });
      }
      if (o.id === S.sel && o.type !== 'text') { const hd = document.createElement('i'); hd.className = 'handle'; el.appendChild(hd); }
      layer.appendChild(el);
    }
    if (p.crop) { const el = document.createElement('div'); el.className = 'cropbox'; place(el, p.crop); layer.appendChild(el); }
    if (S.tool === 'edit') drawHits(p);
  }

  /* Sayfadaki metni satır parçalarına ayırır */
  async function textLines(p) {
    const k = p.src + ':' + p.idx;
    if (lineCache.has(k)) return lineCache.get(k);
    const jp = await S.sources[p.src].js.getPage(p.idx + 1), v = jp.getViewport({ scale: 1, rotation: p.R });
    const tc = await jp.getTextContent(), items = [];
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const m = pdfjs.Util.transform(v.transform, it.transform);
      if (Math.abs(m[1]) > Math.abs(m[0]) * .05 || m[0] <= 0) continue; // yalnızca yatay yazı
      const size = Math.hypot(m[2], m[3]), st = tc.styles[it.fontName] || {};
      let real = ''; try { real = jp.commonObjs.get(it.fontName)?.name || ''; } catch {}
      const serif = st.fontFamily === 'serif' || /times|serif(?!.*sans)|georgia/i.test(real) && !/sans/i.test(real);
      items.push({ str: it.str, x: m[4], base: m[5], w: it.width, size, family: st.fontFamily === 'monospace' || /courier|mono/i.test(real) ? 'mono' : serif ? 'serif' : 'sans', bold: /bold|black|heavy/i.test(real) });
    }
    items.sort((a, b) => Math.abs(a.base - b.base) > 2 ? a.base - b.base : a.x - b.x);
    const lines = [];
    for (const it of items) {
      const L = lines[lines.length - 1], gap = L ? it.x - (L.x + L.w) : 0;
      if (L && Math.abs(L.base - it.base) <= 2 && Math.abs(L.size - it.size) < 1 && L.family === it.family && L.bold === it.bold && gap < it.size * 1.2 && gap > -it.size) {
        L.str += (gap > it.size * .18 && !/\s$/.test(L.str) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
        L.w = it.x + it.w - L.x;
      } else lines.push({ ...it });
    }
    lines.forEach((l, i) => { l.key = k + ':' + i; l.box = { x: l.x - 1, y: l.base - l.size * .95, w: l.w + 2, h: l.size * 1.22 }; });
    if (lines.length) lineCache.set(k, lines);
    return lines;
  }
  async function drawHits(p) {
    const lines = await textLines(p);
    if (!alive() || page()?.id !== p.id || S.tool !== 'edit') return;
    const layer = $('#layer', ui); $$('.hit', layer).forEach(e => e.remove());
    if (!lines.length) { $('#pdfhint', ui).textContent = 'Bu sayfada düzenlenebilir metin bulunamadı (taranmış görüntü olabilir). "Kapat" ve "Yazı ekle" araçlarını kullanabilirsin.'; return; }
    for (const l of lines) {
      if (p.objs.some(o => o.key === l.key)) continue;
      const el = document.createElement('div'); el.className = 'hit'; place(el, l.box); el.title = l.str;
      el.onclick = e => { e.stopPropagation(); takeLine(l); };
      layer.appendChild(el);
    }
  }
  /* Satırın arka plan ve yazı rengini ekrandaki görüntüden tahmin eder */
  function sampleColors(box) {
    const p = page(), c = $('#stage canvas', ui), fallback = { bg: '#ffffff', fg: '#000000' };
    if (c.dataset.page !== p.id) return fallback;
    const k = c.width / p.W, x = Math.max(0, Math.floor(box.x * k)), y = Math.max(0, Math.floor(box.y * k));
    const w = Math.min(c.width - x, Math.ceil(box.w * k)), h = Math.min(c.height - y, Math.ceil(box.h * k));
    if (w < 1 || h < 1) return fallback;
    const d = c.getContext('2d').getImageData(x, y, w, h).data;
    const hex = a => '#' + a.map(n => n.toString(16).padStart(2, '0')).join('');
    const edge = new Map();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!j || j === h - 1 || !i || i === w - 1) {
      const n = (j * w + i) * 4, key = hex([d[n], d[n + 1], d[n + 2]]); edge.set(key, (edge.get(key) || 0) + 1);
    }
    const bg = [...edge].sort((a, b) => b[1] - a[1])[0][0], B = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
    let max = 40, fg = null;
    for (let n = 0; n < d.length; n += 4) {
      const dist = Math.abs(d[n] - B[0]) + Math.abs(d[n + 1] - B[1]) + Math.abs(d[n + 2] - B[2]);
      if (dist > max) { max = dist; fg = [d[n], d[n + 1], d[n + 2]]; }
    }
    return { bg, fg: fg ? hex(fg) : '#000000' };
  }
  function takeLine(l) {
    const col = sampleColors(l.box);
    const t = measure({ id: newId(), type: 'text', x: l.x, y: l.base - l.size * .95, text: l.str, size: Math.round(l.size * 10) / 10, color: col.fg, bg: null, bold: l.bold, family: l.family });
    pushUndo();
    page().objs.push({ id: newId(), type: 'cover', ...l.box, color: col.bg, key: l.key }, t);
    S.sel = t.id; S.tool = 'select';
    drawTools(); drawLayer(); drawProps(); drawThumbs();
  }

  /* ---------- Fare / dokunma ---------- */
  function point(e) {
    const p = page(), r = $('#sizer', ui).getBoundingClientRect();
    const dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, a = -p.rot * Math.PI / 180;
    const x = (dx * Math.cos(a) - dy * Math.sin(a)) / scale + p.W / 2, y = (dx * Math.sin(a) + dy * Math.cos(a)) / scale + p.H / 2;
    return { x: Math.max(0, Math.min(p.W, x)), y: Math.max(0, Math.min(p.H, y)) };
  }
  function track(onMove, onUp) {
    const up = e => { removeEventListener('pointermove', onMove); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); onUp(e); };
    addEventListener('pointermove', onMove); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  function layerDown(e) {
    const p = page(); if (!p) return;
    const start = point(e);
    if (S.tool === 'text') {
      e.preventDefault();
      const o = measure({ id: newId(), type: 'text', x: start.x, y: start.y - 8, text: 'Yeni yazı', size: 14, color: '#000000', bg: null, bold: false, family: 'sans' });
      change(() => { p.objs.push(o); S.sel = o.id; S.tool = 'select'; });
      const ta = $('#props textarea', ui); ta?.focus(); ta?.select();
      return;
    }
    if (['cover', 'mark', 'crop'].includes(S.tool)) {
      e.preventDefault();
      const ghost = document.createElement('div'); ghost.className = 'obj selected'; $('#layer', ui).appendChild(ghost);
      let r = { x: start.x, y: start.y, w: 0, h: 0 };
      track(ev => { const q = point(ev); r = { x: Math.min(start.x, q.x), y: Math.min(start.y, q.y), w: Math.abs(q.x - start.x), h: Math.abs(q.y - start.y) }; place(ghost, r); },
        () => {
          ghost.remove();
          if (r.w < 4 || r.h < 4) return;
          if (S.tool === 'crop') { change(() => p.crop = r); return; }
          const o = { id: newId(), type: S.tool === 'cover' ? 'rect' : 'mark', ...r, color: S.tool === 'cover' ? '#ffffff' : '#ffe14d' };
          change(() => p.objs.push(o));
        });
      return;
    }
    if (S.tool !== 'select') return;
    const el = e.target.closest('.obj'), o = el && p.objs.find(q => q.id === el.dataset.id);
    if (!o || o.type === 'cover') { if (S.sel) { S.sel = null; drawLayer(); drawProps(); } return; }
    e.preventDefault();
    const resizing = e.target.classList.contains('handle');
    if (S.sel !== o.id) { S.sel = o.id; drawLayer(); drawProps(); }
    const node = $(`.obj[data-id="${o.id}"]`, ui), from = { ...o }, before = snap();
    let moved = false;
    track(ev => {
      const q = point(ev), dx = q.x - start.x, dy = q.y - start.y;
      if (!moved && Math.hypot(dx, dy) * scale < 4) return;
      moved = true;
      if (resizing) {
        o.w = Math.max(8, from.w + dx);
        o.h = o.type === 'image' ? o.w * from.h / from.w : Math.max(8, from.h + dy);
        place(node, o);
      } else { o.x = from.x + dx; o.y = from.y + dy; node.style.left = px(o.x); node.style.top = px(o.y); }
    }, () => { if (moved) { S.undo.push(before); S.redo = []; App.dirty.pdf = true; drawThumbs(); } });
  }

  /* ---------- Seçili nesne özellikleri ---------- */
  function drawProps() {
    if (!alive()) return;
    const box = $('#props', ui), o = selected();
    box.classList.toggle('hidden', !o);
    if (!o) { box.innerHTML = ''; return; }
    const isText = o.type === 'text';
    box.innerHTML = (isText ? `<textarea data-p="text" aria-label="Yazı">${esc(o.text)}</textarea>
      <label>Boyut <input type="number" data-p="size" min="4" max="300" step="0.5" value="${o.size}" style="width:76px"></label>
      <select data-p="family" aria-label="Yazı tipi"><option value="sans">Düz (Arial)</option><option value="serif">Tırnaklı (Times)</option><option value="mono">Sabit (Courier)</option></select>
      <button data-p="bold" class="${o.bold ? 'active' : ''}"><b>K</b></button>` : '')
      + (o.type !== 'image' ? `<input type="color" data-p="color" value="${o.color}" title="Renk" aria-label="Renk">` : '')
      + (isText ? '<button data-o="copy">⧉ Kopyala</button><button data-o="cut">✂ Kes</button>' : '<button data-o="copy">⧉ Kopyala</button>')
      + '<button data-o="del" class="warn">Sil</button>';
    if (isText) $('[data-p="family"]', box).value = o.family;
    let armed = true;
    const edit = fn => { if (armed) { pushUndo(); armed = false; } fn(); if (isText) measure(o); drawLayer(); };
    $$('[data-p]', box).forEach(el => {
      const k = el.dataset.p;
      if (k === 'bold') el.onclick = () => { edit(() => o.bold = !o.bold); el.classList.toggle('active', o.bold); armed = true; };
      else el.oninput = () => {
        if (k === 'size') { const n = parseFloat(el.value); if (n >= 4 && n <= 300) edit(() => o.size = n); }
        else edit(() => o[k] = el.value);
      };
      el.onchange = () => { armed = true; }; // liste burada yeniden çizilmez: sonraki tıklama kaybolurdu
    });
    $$('[data-o]', box).forEach(b => b.onclick = () => objAction(b.dataset.o));
  }
  function objAction(a) {
    const o = selected(); if (!o) return;
    if (a === 'copy' || a === 'cut') {
      clipboard = { ...o }; delete clipboard.key;
      if (o.type === 'text') navigator.clipboard?.writeText(o.text).catch(() => {});
      if (a === 'copy') toast('Kopyalandı. İstediğin sayfada "Yapıştır"a bas.');
    }
    if (a === 'cut' || a === 'del') change(() => { page().objs = page().objs.filter(q => q.id !== o.id); S.sel = null; });
    if (a === 'cut') toast('Kesildi. İstediğin sayfada "Yapıştır"a bas.');
  }

  /* ---------- Sayfa ekleme ---------- */
  function parseRange(text, max) {
    if (!text.trim()) return [...Array(max).keys()];
    const out = [];
    for (const part of text.split(',')) {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!m) throw new Error('Sayfa aralığı anlaşılamadı: ' + part);
      const a = +m[1], b = +(m[2] || m[1]);
      if (a < 1 || b < 1 || a > max || b > max) throw new Error(`Sayfa numarası 1-${max} arasında olmalı.`);
      for (let n = a; ; n += a <= b ? 1 : -1) { out.push(n - 1); if (n === b) break; }
    }
    return out;
  }
  const A4 = [595.28, 841.89];
  async function blankEntry(size) {
    const d = await PDFLib.PDFDocument.create(); d.addPage(size);
    return (await addSource(await d.save()))[0];
  }
  /* Her görseli PNG/JPEG'e çevirir (WEBP, GIF vb. dahil) */
  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image(); im.src = url; await im.decode();
      const k = Math.min(1, 2600 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      const jpg = file.type === 'image/jpeg';
      return { url: c.toDataURL(jpg ? 'image/jpeg' : 'image/png', .92), w: c.width, h: c.height };
    } finally { URL.revokeObjectURL(url); }
  }
  async function imageEntry(file) {
    const im = await loadImage(file), d = await PDFLib.PDFDocument.create();
    const size = im.w > im.h ? [A4[1], A4[0]] : A4, pg = d.addPage(size);
    const emb = im.url.startsWith('data:image/jpeg') ? await d.embedJpg(im.url) : await d.embedPng(im.url);
    const k = Math.min(size[0] / im.w, size[1] / im.h), w = im.w * k, h = im.h * k;
    pg.drawImage(emb, { x: (size[0] - w) / 2, y: (size[1] - h) / 2, width: w, height: h });
    return (await addSource(await d.save()))[0];
  }
  function wrap(text, o, width) {
    measureCtx.font = cssFont(o, o.size);
    const out = [];
    for (const para of text.replace(/\r/g, '').replace(/\t/g, '    ').split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        if (measureCtx.measureText(line + word).width <= width) { line += word; continue; }
        if (line.trim()) { out.push(line.trimEnd()); line = ''; }
        for (const ch of word.trim() ? word : '') { if (measureCtx.measureText(line + ch).width > width) { out.push(line); line = ''; } line += ch; }
      }
      out.push(line.trimEnd());
    }
    return out;
  }
  async function textEntries(text) {
    const o = { size: 12, family: 'sans', bold: false }, lines = wrap(text, o, A4[0] - 100), per = Math.floor((A4[1] - 100) / (o.size * 1.2)), out = [];
    for (let i = 0; i < lines.length; i += per) {
      const e = await blankEntry(A4);
      e.objs.push(measure({ id: newId(), type: 'text', x: 50, y: 50, text: lines.slice(i, i + per).join('\n'), color: '#000000', bg: null, ...o }));
      out.push(e);
    }
    return out;
  }
  function insertEntries(at, list) {
    if (!list.length) return;
    change(() => { S.pages.splice(at, 0, ...list); S.cur = at; S.sel = null; S.tool = 'select'; });
    toast(list.length + ' sayfa eklendi.');
  }
  function insertDialog(at = S.cur + 1) {
    const m = modal(`<h3>Sayfa ekle</h3>
    <label class="field"><span>Konum</span><select id="insat">${[...Array(S.pages.length + 1).keys()].map(i => `<option value="${i}">${!S.pages.length ? 'İlk sayfa' : i === 0 ? 'En başa' : i === S.pages.length ? 'En sona (' + i + '. sayfadan sonra)' : i + '. ve ' + (i + 1) + '. sayfanın arasına'}</option>`).join('')}</select></label>
    <label class="field"><span>Ne eklensin?</span><select id="inskind"><option value="pdf">Başka bir PDF'den sayfalar</option><option value="image">Görseller (her biri bir sayfa)</option><option value="blank">Boş sayfa</option><option value="text">Yazı sayfası</option></select></label>
    <div id="insopts"></div>
    <div class="toolbar"><button class="primary" id="insok">Ekle</button><button data-close>Vazgeç</button></div>`);
    $('#insat', m).value = Math.min(at, S.pages.length);
    const opts = () => {
      const k = $('#inskind', m).value;
      $('#insopts', m).innerHTML = k === 'pdf' ? '<label class="field"><span>PDF dosyası</span><input type="file" id="insfile" accept=".pdf,application/pdf" multiple></label><label class="field"><span>Sayfalar (boş = tümü; örn. 1-3,5). Birden fazla dosyada her birine uygulanır.</span><input id="insrange" placeholder="tümü"></label>'
        : k === 'image' ? '<label class="field"><span>Görseller</span><input type="file" id="insfile" accept="image/*" multiple></label>'
        : k === 'blank' ? '<label class="field"><span>Boyut</span><select id="inssize"><option value="same">Mevcut sayfayla aynı</option><option value="a4">A4 dikey</option><option value="a4l">A4 yatay</option></select></label><label class="field"><span>Adet</span><input type="number" id="inscount" value="1" min="1" max="50"></label>'
        : '<label class="field"><span>Yazı (uzunsa otomatik olarak birden çok A4 sayfaya bölünür)</span><textarea id="instext" rows="9"></textarea></label>';
    };
    $('#inskind', m).onchange = opts; opts();
    $('#insok', m).onclick = () => {
      const k = $('#inskind', m).value, pos = +$('#insat', m).value, files = [...($('#insfile', m)?.files || [])];
      if ((k === 'pdf' || k === 'image') && !files.length) { toast('Önce dosya seç.'); return; }
      if (k === 'text' && !$('#instext', m).value.trim()) { toast('Yazı boş.'); return; }
      withBusy('Sayfalar ekleniyor…', async () => {
        await engines();
        const list = [];
        if (k === 'pdf') for (const f of files) {
          const bytes = await readBytes(f), probe = await jsDoc(bytes), n = probe.numPages; await probe.loadingTask.destroy();
          list.push(...await addSource(bytes, parseRange($('#insrange', m).value, n)));
        }
        if (k === 'image') for (const f of files) list.push(await imageEntry(f));
        if (k === 'blank') {
          const c = page(), sz = $('#inssize', m).value;
          const size = sz === 'a4l' ? [A4[1], A4[0]] : sz === 'same' && c ? (c.rot % 180 ? [c.H, c.W] : [c.W, c.H]) : A4;
          const n = Math.max(1, Math.min(50, +$('#inscount', m).value || 1));
          for (let i = 0; i < n; i++) list.push(await blankEntry(size));
        }
        if (k === 'text') list.push(...await textEntries($('#instext', m).value));
        m.remove(); insertEntries(pos, list);
      });
    };
  }

  /* ---------- Dışa aktarma ---------- */
  function textImage(o) {
    const k = 5, c = document.createElement('canvas'), pad = o.size * .15;
    c.width = Math.ceil((o.w + pad * 2) * k); c.height = Math.ceil(o.h * k);
    const x = c.getContext('2d'); x.scale(k, k); x.font = cssFont(o, o.size); x.fillStyle = o.color; x.textBaseline = 'alphabetic';
    o.text.split('\n').forEach((l, i) => x.fillText(l, pad, i * o.size * 1.2 + o.size * .95));
    return { url: c.toDataURL('image/png'), pad, w: c.width / k, h: c.height / k };
  }
  async function build(list) {
    const L = PDFLib, out = await L.PDFDocument.create(), copies = new Map(), bySrc = {};
    list.forEach((p, i) => (bySrc[p.src] ||= []).push({ p, i }));
    for (const [src, entries] of Object.entries(bySrc)) {
      const doc = await L.PDFDocument.load(S.sources[src].bytes);
      let rest = entries;
      while (rest.length) { // aynı sayfa birden çok kez varsa ayrı turlarda kopyalanır
        const seen = new Set(), now = [], later = [];
        for (const e of rest) { (seen.has(e.p.idx) ? later : now).push(e); seen.add(e.p.idx); }
        const got = await out.copyPages(doc, now.map(e => e.p.idx));
        now.forEach((e, n) => copies.set(e.i, got[n])); rest = later;
      }
    }
    const fonts = {};
    const font = async o => {
      const names = { sans: ['Helvetica', 'HelveticaBold'], serif: ['TimesRoman', 'TimesRomanBold'], mono: ['Courier', 'CourierBold'] };
      const n = (names[o.family] || names.sans)[o.bold ? 1 : 0];
      return fonts[n] ||= await out.embedFont(L.StandardFonts[n]);
    };
    const rgb = h => L.rgb(...[1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255));
    for (let i = 0; i < list.length; i++) {
      const p = list[i], pg = out.addPage(copies.get(i));
      const jp = await S.sources[p.src].js.getPage(p.idx + 1), v = jp.getViewport({ scale: 1, rotation: p.R });
      const pt = (x, y) => v.convertToPdfPoint(x, y);
      const area = r => { const a = pt(r.x, r.y), b = pt(r.x + r.w, r.y + r.h); return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) }; };
      const rotate = L.degrees(p.R);
      const put = async (url, r) => {
        const img = url.startsWith('data:image/jpeg') ? await out.embedJpg(url) : await out.embedPng(url);
        const [x, y] = pt(r.x, r.y + r.h);
        pg.drawImage(img, { x, y, width: r.w, height: r.h, rotate });
      };
      for (const o of p.objs) {
        if (o.type === 'cover' || o.type === 'rect') pg.drawRectangle({ ...area(o), color: rgb(o.color) });
        if (o.type === 'mark') pg.drawRectangle({ ...area(o), color: rgb(o.color), opacity: .4, blendMode: L.BlendMode.Multiply });
        if (o.type === 'image') await put(images[o.img], o);
        if (o.type === 'text' && o.text.trim()) {
          if (o.bg) pg.drawRectangle({ ...area(o), color: rgb(o.bg) });
          const f = await font(o), lines = o.text.replace(/\t/g, '    ').split('\n');
          let encodable = true;
          try { lines.forEach(l => f.encodeText(l)); } catch { encodable = false; }
          if (encodable) lines.forEach((l, n) => { const [x, y] = pt(o.x, o.y + n * o.size * 1.2 + o.size * .95); pg.drawText(l, { x, y, size: o.size, font: f, color: rgb(o.color), rotate }); });
          else { const t = textImage(o); await put(t.url, { x: o.x - t.pad, y: o.y, w: t.w, h: t.h }); } // ğ ş ı İ gibi harfler
        }
      }
      pg.setRotation(L.degrees((p.R + p.rot) % 360));
      if (p.crop) { const a = area(p.crop); pg.setCropBox(a.x, a.y, a.width, a.height); }
    }
    return out.save();
  }
  /* Tüm sayfaları görüntüye çevirir: kapatılan/kırpılan içerik dosyadan tamamen çıkar */
  async function flatten(bytes) {
    const src = await jsDoc(bytes), out = await PDFLib.PDFDocument.create();
    for (let n = 1; n <= src.numPages; n++) {
      toast(`Güvenli kopya hazırlanıyor… ${n}/${src.numPages}`, 60000);
      const jp = await src.getPage(n), one = jp.getViewport({ scale: 1 });
      const v = jp.getViewport({ scale: Math.min(2.5, Math.sqrt(12e6 / (one.width * one.height))) }), c = document.createElement('canvas');
      c.width = v.width; c.height = v.height;
      await jp.render({ canvasContext: c.getContext('2d'), viewport: v, intent: 'print' }).promise;
      const img = await out.embedJpg(c.toDataURL('image/jpeg', .92));
      out.addPage([one.width, one.height]).drawImage(img, { x: 0, y: 0, width: one.width, height: one.height });
      c.width = c.height = 0;
    }
    await src.loadingTask.destroy();
    return out.save();
  }
  const pdfBlob = b => new Blob([b], { type: 'application/pdf' });
  const chosen = () => { const l = S.pages.filter(p => S.checked.has(p.id)); if (!l.length) toast('Önce küçük resimlerin altındaki kutuları işaretle.'); return l; };

  const actions = {
    async open() { const [f] = await pickFiles('.pdf,application/pdf'); if (f) { if (!App.files.includes(f)) App.files.push(f); open(f); } },
    newdoc() { withBusy('Belge oluşturuluyor…', async () => { await engines(); const e = await blankEntry(A4); S.name = 'yeni-belge.pdf'; change(() => S.pages.push(e)); }); },
    insert: () => insertDialog(),
    undo: () => travel(S.undo, S.redo),
    redo: () => travel(S.redo, S.undo),
    rotl: () => change(() => page().rot = (page().rot + 270) % 360),
    rotr: () => change(() => page().rot = (page().rot + 90) % 360),
    up: () => move(S.cur, S.cur - 1),
    down: () => move(S.cur, S.cur + 1),
    dup: () => change(() => { const c = JSON.parse(JSON.stringify(page())); c.id = newId(); c.objs.forEach(o => o.id = newId()); S.pages.splice(++S.cur, 0, c); S.sel = null; }),
    del() { if (S.pages.length < 2) { toast('Belgede en az bir sayfa kalmalı.'); return; } change(() => { S.checked.delete(page().id); S.pages.splice(S.cur, 1); S.sel = null; }); },
    delsel() { const l = chosen(); if (!l.length) return; if (l.length === S.pages.length) { toast('Tüm sayfalar silinemez.'); return; } change(() => { S.pages = S.pages.filter(p => !S.checked.has(p.id)); S.checked.clear(); S.sel = null; }); },
    extract() { const l = chosen(); if (l.length) withBusy('PDF hazırlanıyor…', async () => downloadBlob(pdfBlob(await build(l)), baseName(S.name) + '-secilen.pdf')); },
    save() { withBusy('PDF hazırlanıyor…', async () => { downloadBlob(pdfBlob(await build(S.pages)), editedName(S.name, 'pdf')); App.dirty.pdf = false; }); },
    flat() { withBusy('Güvenli kopya hazırlanıyor…', async () => { downloadBlob(pdfBlob(await flatten(await build(S.pages))), baseName(S.name) + '-guvenli.pdf'); App.dirty.pdf = false; }); },
    txt() {
      withBusy('Metin çıkarılıyor…', async () => {
        const parts = [];
        for (let i = 0; i < S.pages.length; i++) {
          const p = S.pages[i], hidden = new Set(p.objs.map(o => o.key));
          const rows = (await textLines(p)).filter(l => !hidden.has(l.key)).map(l => ({ y: l.base, x: l.x, s: l.str }));
          p.objs.filter(o => o.type === 'text').forEach(o => rows.push({ y: o.y + o.size * .95, x: o.x, s: o.text }));
          rows.sort((a, b) => Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x);
          parts.push(`--- Sayfa ${i + 1} ---\n` + rows.map(r => r.s).join('\n'));
        }
        downloadBlob(new Blob([parts.join('\n\n')], { type: 'text/plain;charset=utf-8' }), baseName(S.name) + '.txt');
      });
    },
    async image() {
      const [f] = await pickFiles('image/*'); if (!f) return;
      try {
        const im = await loadImage(f), p = page(), id = newId(), w = Math.min(p.W * .4, im.w), h = w * im.h / im.w;
        images[id] = im.url;
        change(() => { const o = { id: newId(), type: 'image', img: id, x: (p.W - w) / 2, y: (p.H - h) / 2, w, h }; p.objs.push(o); S.sel = o.id; S.tool = 'select'; });
      } catch { toast('Görsel okunamadı.'); }
    },
    paste() {
      if (!clipboard) { toast('Önce bir nesne kopyala veya kes.'); return; }
      const p = page(), o = { ...clipboard, id: newId() };
      o.x = Math.max(0, Math.min(o.x + 12, p.W - 20)); o.y = Math.max(0, Math.min(o.y + 12, p.H - 20));
      change(() => { p.objs.push(o); S.sel = o.id; S.tool = 'select'; });
    },
    uncrop: () => change(() => page().crop = null),
    cropall: () => change(() => {
      const c = page(), r = { x: c.crop.x / c.W, y: c.crop.y / c.H, w: c.crop.w / c.W, h: c.crop.h / c.H };
      S.pages.forEach(p => p.crop = { x: r.x * p.W, y: r.y * p.H, w: r.w * p.W, h: r.h * p.H });
    }),
    zoomin() { S.zoom = Math.min(4, scale * 1.25); drawPage(); },
    zoomout() { S.zoom = Math.max(.2, scale / 1.25); drawPage(); },
    fit() { S.zoom = null; drawPage(); }
  };

  addEventListener('keydown', e => {
    if (App.current !== 'pdf' || !S.pages.length || e.target.closest('input,textarea,select,[contenteditable]') || $('.modal')) return;
    const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey, o = selected();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? actions.redo() : actions.undo(); }
    else if (mod && k === 'y') { e.preventDefault(); actions.redo(); }
    else if (mod && k === 'c' && o) { e.preventDefault(); objAction('copy'); }
    else if (mod && k === 'x' && o) { e.preventDefault(); objAction('cut'); }
    else if (mod && k === 'v' && clipboard) { e.preventDefault(); actions.paste(); }
    else if ((k === 'delete' || k === 'backspace') && o) { e.preventDefault(); objAction('del'); }
    else if (k.startsWith('arrow') && o) { e.preventDefault(); const s = e.shiftKey ? 10 : 1; change(() => { o.x += k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0; o.y += k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0; }); }
  });
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (App.current === 'pdf' && !S.zoom && S.pages.length) drawPage(); }, 200); });

  App.register('pdf', { title: 'PDF Düzenleyici', sub: 'Metni düzenle, araya sayfa ekle, sırala, kırp.', render });
  return { open, openMany, _state: () => S };
})();
