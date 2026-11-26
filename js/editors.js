'use strict';
/* Metin, tablo, görsel ve ZIP düzenleyicileri */

/* UTF-8 değilse Türkçe Windows kodlaması (windows-1254) denenir */
function decodeText(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(b), enc: 'UTF-16' };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(b), enc: 'UTF-16' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), enc: 'UTF-8' }; }
  catch { return { text: new TextDecoder('windows-1254').decode(b), enc: 'Windows-1254' }; }
}

/* ================= Metin ve kod ================= */
(() => {
  const S = { name: 'metin.txt', text: '', file: null, enc: 'UTF-8', crlf: false, wrap: true };
  const output = () => S.crlf ? S.text.replace(/\n/g, '\r\n') : S.text;
  async function open(file) {
    if (S.file === file || !canDiscard('text')) return;
    if (file.size > 8e6 && !confirm('Büyük dosya: editör yavaşlayabilir. Açılsın mı?')) return;
    const d = decodeText(await file.arrayBuffer());
    Object.assign(S, { file, name: file.name, enc: d.enc, crlf: d.text.includes('\r\n'), text: d.text.replace(/\r\n?/g, '\n') });
    App.dirty.text = false;
    if (App.current === 'text') App.go('text');
  }
  App.register('text', {
    title: 'Metin ve Kod', sub: 'Aç, düzenle, bul-değiştir ve indir.',
    render(view, file) {
      view.innerHTML = `<div class="panel"><div class="toolbar"><button id="topen">📂 Aç</button><button id="tnew">Yeni</button><button id="tsave" class="primary">⬇ İndir</button>${window.showSaveFilePicker ? '<button id="tsaveas">💾 Farklı kaydet</button>' : ''}<label>Ad <input id="tname"></label><span class="sep"></span><button id="twrap">Satır kaydır</button><button id="tjson">JSON biçimle</button><button id="tmin">JSON küçült</button><button id="tcheck">JSON doğrula</button><button id="tprev">HTML önizle</button></div>
      <div class="toolbar"><input id="tfind" placeholder="Bul"><button id="tnext">Sonraki</button><input id="trepl" placeholder="Yerine yaz"><button id="tone">Değiştir</button><button id="tall">Tümünü değiştir</button></div>
      <div class="filemeta" id="tmeta"></div><textarea id="editor" class="textarea" spellcheck="false" placeholder="Metin veya kod..."></textarea><div id="tframe"></div></div>`;
      const ed = $('#editor', view), q = s => $(s, view);
      ed.value = S.text; q('#tname').value = S.name;
      const stats = () => q('#tmeta').textContent = `${ed.value.split('\n').length} satır • ${(ed.value.match(/\S+/g) || []).length} kelime • ${ed.value.length} karakter • ${S.enc}${S.enc !== 'UTF-8' ? ' (UTF-8 olarak kaydedilir)' : ''}`;
      const sync = () => { S.text = ed.value; App.dirty.text = true; stats(); };
      const wrap = () => { ed.wrap = S.wrap ? 'soft' : 'off'; q('#twrap').classList.toggle('active', S.wrap); };
      stats(); wrap(); ed.oninput = sync;
      ed.onkeydown = e => {
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); ed.setRangeText('  ', ed.selectionStart, ed.selectionEnd, 'end'); sync(); }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); q('#tsave').click(); }
        if (e.key === 'Escape') ed.blur();
      };
      q('#tname').oninput = e => S.name = e.target.value;
      q('#topen').onclick = async () => { const [f] = await pickFiles('', false); if (f) open(f); };
      q('#tnew').onclick = () => { if (canDiscard('text')) { Object.assign(S, { name: 'metin.txt', text: '', file: null, enc: 'UTF-8', crlf: false }); App.dirty.text = false; App.go('text'); } };
      q('#tsave').onclick = () => { downloadBlob(new Blob([output()], { type: 'text/plain;charset=utf-8' }), S.file ? editedName(S.name) : S.name || 'metin.txt'); App.dirty.text = false; };
      q('#tsaveas')?.addEventListener('click', async () => {
        try { const h = await showSaveFilePicker({ suggestedName: S.name }), w = await h.createWritable(); await w.write(output()); await w.close(); App.dirty.text = false; toast('Kaydedildi.'); }
        catch (e) { if (e.name !== 'AbortError') toast('Kaydedilemedi: ' + e.message); }
      });
      q('#twrap').onclick = () => { S.wrap = !S.wrap; wrap(); };
      const json = fn => { try { const v = JSON.parse(ed.value); if (fn) { ed.value = fn(v); sync(); } else toast('JSON geçerli ✓'); } catch (e) { toast('JSON hatası: ' + e.message, 6000); } };
      q('#tjson').onclick = () => json(v => JSON.stringify(v, null, 2));
      q('#tmin').onclick = () => json(v => JSON.stringify(v));
      q('#tcheck').onclick = () => json();
      q('#tprev').onclick = () => {
        const box = q('#tframe');
        if (box.firstChild) { box.innerHTML = ''; return; }
        const f = document.createElement('iframe'); f.className = 'preview-frame'; f.setAttribute('sandbox', ''); f.srcdoc = ed.value; f.title = 'Önizleme (scriptler çalışmaz)'; box.appendChild(f);
      };
      const find = from => {
        const needle = q('#tfind').value; if (!needle) return false;
        const hay = ed.value.toLocaleLowerCase('tr'), n = needle.toLocaleLowerCase('tr');
        let i = hay.indexOf(n, from); if (i < 0) i = hay.indexOf(n);
        if (i < 0) { toast('Eşleşme bulunamadı.'); return false; }
        ed.focus(); ed.setSelectionRange(i, i + needle.length);
        ed.scrollTop = Math.max(0, ed.value.slice(0, i).split('\n').length * 21 - ed.clientHeight / 2); return true;
      };
      q('#tnext').onclick = () => find(ed.selectionEnd);
      q('#tone').onclick = () => {
        const n = q('#tfind').value;
        if (n && ed.value.slice(ed.selectionStart, ed.selectionEnd).toLocaleLowerCase('tr') === n.toLocaleLowerCase('tr')) { ed.setRangeText(q('#trepl').value, ed.selectionStart, ed.selectionEnd, 'end'); sync(); }
        find(ed.selectionEnd);
      };
      q('#tall').onclick = () => {
        const n = q('#tfind').value; if (!n) return;
        const parts = ed.value.split(n);
        if (parts.length > 1) { ed.value = parts.join(q('#trepl').value); sync(); }
        toast(parts.length - 1 + ' eşleşme değiştirildi (büyük/küçük harf duyarlı).');
      };
      if (file) open(file);
    }
  });
})();

/* ================= Tablo ================= */
(() => {
  const PAGE = 200;
  let S = null;
  function parseCSV(text, d) {
    const rows = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c; }
      else if (c === '"' && !cell) quoted = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function detect(text) {
    const first = text.split('\n')[0].replace(/"[^"]*"/g, '');
    return [';', '\t', ','].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  }
  const toCSV = (rows, d) => rows.map(r => r.map(v => (v.includes(d) || /["\r\n]|^\s|\s$/.test(v)) ? '"' + v.replace(/"/g, '""') + '"' : v).join(d)).join('\r\n');
  const width = rows => rows.reduce((m, r) => Math.max(m, r.length), 1);
  const colName = i => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  const blankState = (name, sheets, extra) => ({ name, sheets, active: 0, page: 0, row: null, col: null, ...extra });

  async function open(file) {
    if (S?.file === file || !canDiscard('table')) return;
    try {
      const e = extOf(file.name);
      if (e === 'csv' || e === 'tsv') {
        const text = decodeText(await file.arrayBuffer()).text.replace(/^﻿/, ''), delim = e === 'tsv' ? '\t' : detect(text);
        const rows = parseCSV(text, delim);
        S = blankState(file.name, [{ name: 'CSV', rows: rows.length ? rows : [['']], edits: new Map(), rebuilt: false }], { file, delim, wb: null });
      } else {
        toast('Excel motoru yükleniyor…');
        await loadScript(ENGINES.xlsx);
        const wb = XLSX.read(await file.arrayBuffer(), { cellStyles: true, cellFormula: true });
        const sheets = wb.SheetNames.map(name => {
          const ws = wb.Sheets[name];
          let rows = [['']];
          if (ws['!ref']) rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true, range: { s: { r: 0, c: 0 }, e: XLSX.utils.decode_range(ws['!ref']).e } }).map(r => r.map(String));
          return { name, rows: rows.length ? rows : [['']], edits: new Map(), rebuilt: false };
        });
        S = blankState(file.name, sheets, { file, delim: ';', wb });
      }
      App.dirty.table = false; draw();
    } catch (e) { toast('Tablo açılamadı: ' + e.message, 6000); }
  }
  const sheet = () => S.sheets[S.active];
  const cellValue = v => v.startsWith('=') && v.length > 1 ? { t: 'n', f: v.slice(1) } : /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v) ? { t: 'n', v: Number(v) } : { t: 's', v };
  function saveXLSX(wbName) {
    const wb = S.wb || XLSX.utils.book_new();
    for (const sh of S.sheets) {
      if (!S.wb || sh.rebuilt) {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows.map(r => r.map(v => v === '' ? null : /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v) ? Number(v) : v)));
        if (S.wb) wb.Sheets[sh.name] = ws; else XLSX.utils.book_append_sheet(wb, ws, sh.name);
        continue;
      }
      const ws = wb.Sheets[sh.name]; // yalnızca değişen hücreler yazılır
      for (const addr of sh.edits.keys()) {
        const { r, c } = XLSX.utils.decode_cell(addr), v = sh.edits.get(addr);
        if (v === '') delete ws[addr]; else ws[addr] = cellValue(v);
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        range.e.r = Math.max(range.e.r, r); range.e.c = Math.max(range.e.c, c); ws['!ref'] = XLSX.utils.encode_range(range);
      }
    }
    XLSX.writeFile(wb, wbName);
  }
  /* Satır/sütun ekleme-silme XLSX sayfasını yeniden kurar */
  function structural(fn) {
    const sh = sheet();
    if (S.wb && !sh.rebuilt && !confirm('Satır/sütun ekleyip silmek bu sayfadaki formül ve biçimleri kaldırır; yalnızca görünen değerler kalır. Devam edilsin mi?')) return;
    if (S.wb) sh.rebuilt = true;
    const w = width(sh.rows); sh.rows.forEach(r => { while (r.length < w) r.push(''); });
    fn(sh.rows, w); S.row = S.col = null; App.dirty.table = true; draw();
  }

  function draw() {
    const box = $('#tableview'); if (!box || App.current !== 'table') return;
    $$('.need').forEach(b => b.disabled = !S);
    if (!S) return;
    const sh = sheet(), w = width(sh.rows), pages = Math.max(1, Math.ceil(sh.rows.length / PAGE));
    S.page = Math.min(S.page, pages - 1);
    const from = S.page * PAGE, rows = sh.rows.slice(from, from + PAGE);
    $('#sheettabs').innerHTML = (S.sheets.length > 1 ? S.sheets.map((s, i) => `<button data-sheet="${i}" class="${i === S.active ? 'active' : ''}">${esc(s.name)}</button>`).join('') : '')
      + (pages > 1 ? `<button data-pg="-1">‹</button><span class="filemeta">Satır ${from + 1}-${from + rows.length} / ${sh.rows.length}</span><button data-pg="1">›</button>` : '');
    $('#tablemeta').textContent = `${S.name} • ${sh.rows.length} satır × ${w} sütun`;
    box.innerHTML = '<table class="grid"><thead><tr><th></th>' + [...Array(w).keys()].map(c => `<th data-col="${c}" class="${S.col === c ? 'sel' : ''}">${colName(c)}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map((r, i) => `<tr class="${S.row === from + i ? 'sel' : ''}"><th class="rn" data-row="${from + i}">${from + i + 1}</th>` + [...Array(w).keys()].map(c => `<td contenteditable="true" data-r="${from + i}" data-c="${c}" class="${S.col === c ? 'sel' : ''}">${esc(r[c] ?? '')}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
  }
  App.register('table', {
    title: 'Tablo (CSV / XLSX)', sub: 'Hücreleri doğrudan düzenle.',
    render(view, file) {
      view.innerHTML = `<div class="panel"><div class="toolbar"><button id="bopen">📂 Aç</button><button id="bnew">Yeni tablo</button><button id="bcsv" class="need primary">⬇ CSV indir</button><button id="bxlsx" class="need">⬇ XLSX indir</button></div>
      <div class="toolbar"><button data-s="addrow" class="need">＋ Satır</button><button data-s="addcol" class="need">＋ Sütun</button><button data-s="delrow" class="need warn">Satır sil</button><button data-s="delcol" class="need warn">Sütun sil</button><span class="filemeta">Seçmek için satır numarasına veya sütun harfine dokun.</span></div>
      <div class="toolbar" id="sheettabs"></div><div class="filemeta" id="tablemeta">CSV veya XLSX aç.</div><div class="tablewrap" id="tableview"></div></div>`;
      const q = s => $(s, view);
      q('#bopen').onclick = async () => { const [f] = await pickFiles('.csv,.tsv,.xlsx,.xls,.ods'); if (f) open(f); };
      q('#bnew').onclick = () => { if (canDiscard('table')) { S = blankState('tablo.csv', [{ name: 'Sayfa1', rows: Array.from({ length: 10 }, () => Array(5).fill('')), edits: new Map(), rebuilt: false }], { file: null, delim: ';', wb: null }); App.dirty.table = false; draw(); } };
      q('#bcsv').onclick = () => { downloadBlob(new Blob(['﻿' + toCSV(sheet().rows, S.delim)], { type: 'text/csv;charset=utf-8' }), editedName(S.name, 'csv')); if (!S.wb) App.dirty.table = false; };
      q('#bxlsx').onclick = async () => { try { await loadScript(ENGINES.xlsx); saveXLSX(editedName(S.name, 'xlsx')); App.dirty.table = false; } catch (e) { toast('XLSX kaydedilemedi: ' + e.message, 6000); } };
      $$('[data-s]', view).forEach(b => b.onclick = () => {
        const a = b.dataset.s;
        if (a === 'addrow') structural((rows, w) => rows.splice(S.row == null ? rows.length : S.row + 1, 0, Array(w).fill('')));
        if (a === 'addcol') { const at = S.col == null ? null : S.col + 1; structural((rows, w) => rows.forEach(r => r.splice(at ?? w, 0, ''))); }
        if (a === 'delrow') { const at = S.row; if (at == null) toast('Önce satır numarasına dokun.'); else structural(rows => { if (rows.length > 1) rows.splice(at, 1); }); }
        if (a === 'delcol') { const at = S.col; if (at == null) toast('Önce sütun harfine dokun.'); else structural((rows, w) => { if (w > 1) rows.forEach(r => r.splice(at, 1)); }); }
      });
      q('#sheettabs').onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.sheet != null) { S.active = +b.dataset.sheet; S.page = 0; S.row = S.col = null; } else S.page = Math.max(0, S.page + +b.dataset.pg);
        draw();
      };
      const grid = q('#tableview');
      grid.onclick = e => {
        const r = e.target.closest('[data-row]'), c = e.target.closest('[data-col]');
        if (r) { S.row = +r.dataset.row; S.col = null; draw(); } else if (c) { S.col = +c.dataset.col; S.row = null; draw(); }
      };
      grid.oninput = e => {
        const td = e.target.closest('td'); if (!td) return;
        const r = +td.dataset.r, c = +td.dataset.c, sh = sheet(), v = td.innerText.replace(/\n$/, '');
        while (sh.rows[r].length <= c) sh.rows[r].push('');
        sh.rows[r][c] = v; sh.edits.set(colName(c) + (r + 1), v); App.dirty.table = true;
      };
      grid.onpaste = e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); };
      draw(); $$('.need', view).forEach(b => b.disabled = !S);
      if (file) open(file);
    }
  });
})();

/* ================= Görsel ================= */
(() => {
  let S = null, tool = null, frame = 0;
  const make = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const copy = src => { const c = make(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; };
  const neutral = () => ({ b: 100, c: 100, s: 100 });
  /* Ayarlar piksel üzerinde uygulanır; ekranda görünen ile indirilen aynıdır */
  function adjusted() {
    const { b, c, s } = S.adj, out = copy(S.work);
    if (b === 100 && c === 100 && s === 100) return out;
    const x = out.getContext('2d'), img = x.getImageData(0, 0, out.width, out.height), d = img.data, B = b / 100, C = c / 100, K = s / 100;
    for (let i = 0; i < d.length; i += 4) {
      const r = (d[i] * B - 128) * C + 128, g = (d[i + 1] * B - 128) * C + 128, bl = (d[i + 2] * B - 128) * C + 128, l = .2126 * r + .7152 * g + .0722 * bl;
      d[i] = l + (r - l) * K; d[i + 1] = l + (g - l) * K; d[i + 2] = l + (bl - l) * K;
    }
    x.putImageData(img, 0, 0); return out;
  }
  function paint() {
    const v = $('#imgcanvas'); if (!v || !S) return;
    const a = adjusted(); v.width = a.width; v.height = a.height; v.getContext('2d').drawImage(a, 0, 0);
    $('#imginfo').textContent = `${S.name} • ${a.width} × ${a.height} px`;
    $('#resizew').value = a.width;
  }
  const remember = () => { S.undo.push({ work: copy(S.work), adj: { ...S.adj } }); if (S.undo.length > 12) S.undo.shift(); App.dirty.image = true; };
  const bake = () => { S.work = adjusted(); S.adj = neutral(); $$('[data-adj]').forEach(i => i.value = 100); };
  const apply = fn => { if (!S) return; remember(); bake(); fn(); paint(); };
  async function open(file) {
    if (S?.file === file || !canDiscard('image')) return;
    const url = URL.createObjectURL(file);
    try {
      const im = new Image(); im.src = url; await im.decode();
      const k = Math.min(1, Math.sqrt(24e6 / (im.naturalWidth * im.naturalHeight))), c = make(im.naturalWidth * k, im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      S = { file, name: file.name, work: c, original: copy(c), adj: neutral(), undo: [] }; App.dirty.image = false;
      $$('.need').forEach(b => b.disabled = false); $$('[data-adj]').forEach(i => i.value = 100); paint();
    } catch { toast('Görsel okunamadı.'); }
    finally { URL.revokeObjectURL(url); }
  }
  function down(e) {
    if (!S || !tool) return;
    e.preventDefault();
    const v = e.currentTarget, at = ev => { const r = v.getBoundingClientRect(); return { x: Math.max(0, Math.min(v.width, (ev.clientX - r.left) * v.width / r.width)), y: Math.max(0, Math.min(v.height, (ev.clientY - r.top) * v.height / r.height)) }; };
    const a = at(e), color = $('#icolor').value, size = +$('#isize').value || 32;
    if (tool === 'text') {
      const t = $('#itext').value; if (!t) { toast('Önce yazıyı kutuya yaz.'); return; }
      apply(() => { const x = S.work.getContext('2d'); x.fillStyle = color; x.font = `${size}px system-ui, sans-serif`; x.textBaseline = 'top'; x.fillText(t, a.x, a.y); });
      return;
    }
    if (tool === 'pen') { remember(); bake(); }
    let last = a, box = null;
    const move = ev => {
      const b = at(ev);
      if (tool === 'pen') {
        for (const cv of [S.work, v]) { const x = cv.getContext('2d'); x.strokeStyle = color; x.lineWidth = Math.max(1, size / 6); x.lineCap = 'round'; x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(b.x, b.y); x.stroke(); }
        last = b;
      } else {
        box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { paint(); const x = v.getContext('2d'); x.strokeStyle = '#f59e0b'; x.lineWidth = Math.max(2, v.width / 300); x.setLineDash([x.lineWidth * 4, x.lineWidth * 3]); x.strokeRect(box.x, box.y, box.w, box.h); });
      }
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); cancelAnimationFrame(frame);
      if (tool === 'crop' && box && box.w > 3 && box.h > 3) apply(() => { const c = make(box.w, box.h); c.getContext('2d').drawImage(S.work, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height); S.work = c; });
      else if (tool === 'crop') paint();
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  App.register('image', {
    title: 'Görsel Düzenleyici', sub: 'Kırp, döndür, yazı ekle, çiz ve ayarla.',
    render(view, file) {
      tool = null;
      view.innerHTML = `<div class="panel"><div class="toolbar"><button id="iopen">📂 Aç</button><button data-i="undo" class="need">↶</button><button data-i="rot" class="need">⟳ Döndür</button><button data-i="fh" class="need">⇆ Yatay çevir</button><button data-i="fv" class="need">⇅ Dikey çevir</button><button data-i="reset" class="need">Sıfırla</button><span class="sep"></span><select id="ifmt" aria-label="Biçim"><option value="png">PNG</option><option value="jpeg">JPG</option><option value="webp">WEBP</option></select><button data-i="save" class="need primary">⬇ İndir</button></div>
      <div class="toolbar"><button data-tool="crop" class="need">⌗ Kırp</button><button data-tool="text" class="need">T Yazı</button><button data-tool="pen" class="need">✎ Kalem</button><input id="itext" placeholder="Eklenecek yazı"><label>Boyut <input id="isize" type="number" value="48" min="4" max="600" style="width:80px"></label><input type="color" id="icolor" value="#ff0000" aria-label="Renk"></div>
      <div class="imagearea"><div class="canvaswrap"><canvas id="imgcanvas" width="1" height="1"></canvas></div></div><div class="filemeta" id="imginfo">Bir görsel aç. Kırpmak için aracı seçip sürükle; yazı için görselde bir noktaya dokun.</div>
      <div class="toolbar"><label>Parlaklık <input type="range" data-adj="b" min="40" max="160" value="100"></label><label>Kontrast <input type="range" data-adj="c" min="40" max="160" value="100"></label><label>Doygunluk <input type="range" data-adj="s" min="0" max="200" value="100"></label><label>Genişlik <input id="resizew" type="number" min="1" style="width:90px"></label><button data-i="size" class="need">Boyutlandır</button></div></div>`;
      $$('.need', view).forEach(b => b.disabled = !S);
      $('#iopen', view).onclick = async () => { const [f] = await pickFiles('image/*'); if (f) open(f); };
      $('#imgcanvas', view).onpointerdown = down;
      $$('[data-tool]', view).forEach(b => b.onclick = () => { tool = tool === b.dataset.tool ? null : b.dataset.tool; $$('[data-tool]', view).forEach(x => x.classList.toggle('active', x.dataset.tool === tool)); $('#imgcanvas', view).style.cursor = tool ? 'crosshair' : ''; $('#imgcanvas', view).style.touchAction = tool ? 'none' : 'auto'; });
      $$('[data-adj]', view).forEach(i => {
        let armed = true;
        if (S) i.value = S.adj[i.dataset.adj];
        i.oninput = () => { if (!S) return; if (armed) { remember(); armed = false; } S.adj[i.dataset.adj] = +i.value; cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); };
        i.onchange = () => armed = true;
      });
      const turn = (w, h, fn) => { const c = make(w, h), x = c.getContext('2d'); fn(x, c); x.drawImage(S.work, 0, 0); S.work = c; };
      const acts = {
        undo() { const u = S.undo.pop(); if (u) { S.work = u.work; S.adj = u.adj; $$('[data-adj]', view).forEach(i => i.value = S.adj[i.dataset.adj]); paint(); } },
        rot: () => apply(() => turn(S.work.height, S.work.width, (x, c) => { x.translate(c.width, 0); x.rotate(Math.PI / 2); })),
        fh: () => apply(() => turn(S.work.width, S.work.height, (x, c) => { x.translate(c.width, 0); x.scale(-1, 1); })),
        fv: () => apply(() => turn(S.work.width, S.work.height, (x, c) => { x.translate(0, c.height); x.scale(1, -1); })),
        reset: () => apply(() => S.work = copy(S.original)),
        size() {
          const w = parseInt($('#resizew', view).value, 10), h = Math.round(S.work.height * w / S.work.width);
          if (!w || w < 1 || w * h > 4e7) { toast('Geçersiz boyut.'); return; }
          apply(() => { const c = make(w, h); c.getContext('2d').drawImage(S.work, 0, 0, w, c.height); S.work = c; });
        },
        save() {
          const fmt = $('#ifmt', view).value; let out = adjusted();
          if (fmt === 'jpeg') { const c = make(out.width, out.height), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(out, 0, 0); out = c; }
          out.toBlob(b => {
            if (!b) { toast('Dışa aktarılamadı.'); return; }
            const real = b.type.split('/')[1]; // tarayıcı WEBP yazamıyorsa PNG döner
            downloadBlob(b, editedName(S.name, real === 'jpeg' ? 'jpg' : real)); App.dirty.image = false;
          }, 'image/' + fmt, .92);
        }
      };
      $$('[data-i]', view).forEach(b => b.onclick = () => S && acts[b.dataset.i]());
      if (S) paint();
      if (file) open(file);
    }
  });
})();

/* ================= ZIP ================= */
const ZipEditor = (() => {
  let S = null;
  async function open(file) {
    if (S?.file === file || !canDiscard('zip')) return;
    try { await loadScript(ENGINES.jszip); S = { file, name: file.name, zip: await JSZip.loadAsync(file) }; App.dirty.zip = false; draw(); }
    catch (e) { toast('ZIP açılamadı: ' + e.message, 6000); }
  }
  function unique(zip, name) {
    let n = name, i = 2;
    while (zip.files[n]) n = name.replace(/(\.[^./]*)?$/, `-${i++}$1`);
    return n;
  }
  async function fromFiles(files) {
    if (!canDiscard('zip')) return;
    try {
      await loadScript(ENGINES.jszip);
      const zip = new JSZip(); files.forEach(f => zip.file(unique(zip, f.name), f));
      S = { file: null, name: 'dosyalar.zip', zip }; App.dirty.zip = true; App.go('archive');
    } catch (e) { toast('ZIP oluşturulamadı: ' + e.message); }
  }
  const big = entry => (entry._data?.uncompressedSize || 0) > 50e6;
  const guard = entry => !big(entry) || confirm('Bu öğe açıldığında çok büyük (' + sizeText(entry._data.uncompressedSize) + '). Devam edilsin mi?');

  async function editEntry(path) {
    const entry = S.zip.files[path]; if (!guard(entry)) return;
    const bytes = await entry.async('uint8array');
    const d = decodeText(bytes);
    if (d.enc !== 'UTF-16' && bytes.includes(0)) { toast('Bu dosya metin gibi görünmüyor.'); return; }
    const m = modal(`<h3 style="overflow-wrap:anywhere">${esc(path)}</h3>${d.enc !== 'UTF-8' ? `<p class="filemeta">${d.enc} olarak okundu; UTF-8 olarak kaydedilir.</p>` : ''}<textarea class="textarea" spellcheck="false"></textarea><div class="toolbar"><button class="primary" id="zsaveentry">ZIP içine kaydet</button><button data-close>Vazgeç</button></div>`);
    const ta = $('textarea', m); ta.value = d.text;
    const initial = ta.value, crlf = d.text.includes('\r\n');
    $('#zsaveentry', m).onclick = () => {
      if (ta.value !== initial) { S.zip.file(path, crlf ? ta.value.replace(/\n/g, '\r\n') : ta.value); App.dirty.zip = true; }
      m.remove(); draw();
    };
  }
  function draw() {
    const box = $('#zipout'); if (!box || App.current !== 'archive') return;
    $$('.need').forEach(b => b.disabled = !S);
    if (!S) return;
    const list = Object.values(S.zip.files).filter(f => !f.dir), shown = list.slice(0, 1000);
    box.innerHTML = `<p class="filemeta">${esc(S.name)} • ${list.length} dosya${list.length > shown.length ? ' (ilk 1000 gösteriliyor)' : ''}</p><div class="list">` + shown.map((f, i) => {
      const n = f.name.split('/').pop(), isText = TEXT_EXT.includes(extOf(n)) || ['csv', 'tsv'].includes(extOf(n)) || !n.includes('.');
      return `<div class="row" data-n="${i}"><span class="grow">${esc(f.name)}</span>${isText ? '<button data-z="edit">✎ Düzenle</button>' : pageFor({ name: n }) ? '<button data-z="view">Düzenleyicide aç</button>' : ''}<button data-z="get">Çıkar</button><button data-z="ren">Adlandır</button><button data-z="del" class="warn">Sil</button></div>`;
    }).join('') + '</div>';
    $$('[data-z]', box).forEach(b => b.onclick = async () => {
      const f = shown[+b.closest('[data-n]').dataset.n], a = b.dataset.z, short = f.name.split('/').pop();
      try {
        if (a === 'edit') await editEntry(f.name);
        if (a === 'get' && guard(f)) downloadBlob(await f.async('blob'), short);
        if (a === 'view' && guard(f)) { openFile(new File([await f.async('blob')], short)); toast('Not: buradaki değişiklikler ZIP\'e otomatik yazılmaz. İndirip "Dosya ekle" ile geri koy.', 7000); }
        if (a === 'ren') {
          const next = prompt('Yeni ad (klasör yolu dahil):', f.name)?.trim();
          if (next && next !== f.name) {
            if (S.zip.files[next]) { toast('Bu adda bir dosya zaten var.'); return; }
            S.zip.file(next, await f.async('uint8array'), { date: f.date }); S.zip.remove(f.name); App.dirty.zip = true; draw();
          }
        }
        if (a === 'del' && confirm(f.name + ' silinsin mi?')) { S.zip.remove(f.name); App.dirty.zip = true; draw(); }
      } catch (e) { toast('İşlem başarısız: ' + e.message, 6000); }
    });
  }
  App.register('archive', {
    title: 'ZIP Arşivi', sub: 'İçeriği düzenle ve yeniden paketle.',
    render(view, file) {
      view.innerHTML = `<div class="panel"><div class="toolbar"><button id="zopen">📂 ZIP aç</button><button id="znew">Yeni ZIP</button><button id="zadd" class="need">＋ Dosya ekle</button><button id="ztext" class="need">＋ Metin dosyası</button><button id="zsave" class="need primary">⬇ ZIP indir</button></div><div id="zipout"><p class="filemeta">Bir ZIP aç veya yeni bir tane oluştur.</p></div></div>`;
      const q = s => $(s, view);
      q('#zopen').onclick = async () => { const [f] = await pickFiles('.zip'); if (f) open(f); };
      q('#znew').onclick = () => fromFiles([]);
      q('#zadd').onclick = async () => { for (const f of await pickFiles('', true)) { if (!S.zip.files[f.name] || confirm(f.name + ' zaten var. Üzerine yazılsın mı?')) { S.zip.file(f.name, f); App.dirty.zip = true; } } draw(); };
      q('#ztext').onclick = () => { const n = prompt('Dosya adı:', 'not.txt')?.trim(); if (!n) return; if (!S.zip.files[n]) { S.zip.file(n, ''); App.dirty.zip = true; draw(); } editEntry(n); };
      q('#zsave').onclick = async () => { try { downloadBlob(await S.zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), S.file ? editedName(S.name, 'zip') : S.name); App.dirty.zip = false; } catch (e) { toast('Kaydedilemedi: ' + e.message); } };
      draw(); $$('.need', view).forEach(b => b.disabled = !S);
      if (file) open(file);
    }
  });
  return { fromFiles };
})();
