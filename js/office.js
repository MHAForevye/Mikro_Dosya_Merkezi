'use strict';
/* DOCX ve PPTX: dosyanın XML'i yerinde düzenlenir; stiller, görseller ve tablolar korunur. */
function makeOfficeEditor({ key, ext, mime, title, sub, ns }) {
  let S = null;

  /* Metni değiştirirken yalnızca değişen aralığa dokunur; böylece kalın/renkli parçalar korunur */
  function setText(nodes, next) {
    const old = nodes.map(n => n.textContent).join('');
    if (old === next) return;
    let a = 0; while (a < old.length && a < next.length && old[a] === next[a]) a++;
    let b = 0; while (b < old.length - a && b < next.length - a && old[old.length - 1 - b] === next[next.length - 1 - b]) b++;
    const end = old.length - b, ins = next.slice(a, next.length - b);
    let pos = 0, placed = false;
    for (const n of nodes) {
      const t = n.textContent, from = pos, to = pos + t.length; pos = to;
      const here = !placed && a >= from && a <= to; if (here) placed = true;
      const value = t.slice(0, Math.max(0, Math.min(t.length, a - from))) + (here ? ins : '') + t.slice(Math.max(0, Math.min(t.length, end - from)));
      if (value !== t) { n.textContent = value; if (ext === 'docx') n.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve'); }
    }
  }
  const ancestor = (el, name) => { for (let n = el.parentNode; n && n.nodeType === 1; n = n.parentNode) if (n.localName === name) return n; return null; };
  const texts = p => [...p.getElementsByTagNameNS(ns, 't')].filter(t => ancestor(t, 'p') === p);
  const paragraphs = doc => [...doc.getElementsByTagNameNS(ns, 'p')].filter(p => !ancestor(p, 'Fallback') && texts(p).length);

  async function partList(zip) {
    const names = Object.keys(zip.files);
    if (ext === 'docx') {
      if (!zip.file('word/document.xml')) throw new Error('Geçerli bir DOCX değil.');
      return [['word/document.xml', 'Belge'], ...names.filter(n => /^word\/(header|footer)\d*\.xml$/.test(n)).sort().map(n => [n, n.includes('header') ? 'Üst bilgi' : 'Alt bilgi']),
        ...names.filter(n => /^word\/(footnotes|endnotes)\.xml$/.test(n)).map(n => [n, 'Dipnotlar'])];
    }
    const xml = async n => new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
    let ordered = [];
    try { // slaytlar dosya adına göre değil sunumdaki sıraya göre listelenir
      const rels = {}; for (const r of (await xml('ppt/_rels/presentation.xml.rels')).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
      for (const s of (await xml('ppt/presentation.xml')).getElementsByTagNameNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'sldId')) {
        const t = rels[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')];
        if (t) ordered.push(t.startsWith('/') ? t.slice(1) : 'ppt/' + t);
      }
    } catch (e) { console.warn(e); }
    if (!ordered.length) ordered = names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => a.match(/\d+/)[0] - b.match(/\d+/)[0]);
    if (!ordered.length) throw new Error('Slayt bulunamadı.');
    return ordered.map((n, i) => [n, 'Slayt ' + (i + 1)]);
  }

  async function open(file) {
    if (S?.file === file || !canDiscard(key)) return;
    try {
      await loadScript(ENGINES.jszip);
      const zip = await JSZip.loadAsync(file), parts = [];
      for (const [path, label] of await partList(zip)) {
        if (!zip.file(path)) continue;
        const doc = new DOMParser().parseFromString(await zip.file(path).async('string'), 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error(path + ' okunamadı.');
        parts.push({ path, label, doc, changed: false });
      }
      S = { file, zip, parts }; App.dirty[key] = false; draw();
    } catch (e) { toast('Dosya açılamadı: ' + e.message, 6000); }
  }
  const touch = part => { part.changed = true; App.dirty[key] = true; };

  function addAfter(p) {
    const doc = p.ownerDocument, pre = ext === 'docx' ? 'w:' : 'a:', copy = p.cloneNode(false);
    for (const at of [...copy.attributes]) if (/paraId|textId/.test(at.name)) copy.removeAttributeNode(at);
    const pPr = [...p.children].find(c => c.localName === 'pPr');
    if (pPr) { const c = pPr.cloneNode(true); [...c.getElementsByTagNameNS(ns, 'sectPr')].forEach(x => x.remove()); copy.appendChild(c); }
    const run = doc.createElementNS(ns, pre + 'r'), rPr = ancestor(texts(p)[0], 'r') && [...ancestor(texts(p)[0], 'r').children].find(c => c.localName === 'rPr');
    if (rPr) run.appendChild(rPr.cloneNode(true));
    run.appendChild(doc.createElementNS(ns, pre + 't')); copy.appendChild(run);
    p.parentNode.insertBefore(copy, p.nextSibling);
  }
  function removeParagraph(p) {
    const only = [...p.parentNode.children].filter(c => c.localName === 'p').length < 2;
    const holds = ['sectPr', 'drawing', 'pict', 'object', 'fldChar'].some(n => p.getElementsByTagNameNS('*', n).length);
    if (only || holds) { setText(texts(p), ''); return false; } // yapı bozulmasın diye yalnızca yazı boşaltılır
    p.remove(); return true;
  }

  function draw() {
    const box = $('#officeout');
    if (!box || App.current !== key) return;
    $$('.need').forEach(b => b.disabled = !S);
    if (!S) return;
    const scroll = window.scrollY;
    box.innerHTML = `<p class="filemeta">${esc(S.file.name)} • ${sizeText(S.file.size)}</p>`;
    const areas = [];
    for (const part of S.parts) {
      const list = paragraphs(part.doc);
      if (!list.length && ext === 'docx') continue;
      const h = document.createElement('h3'); h.className = 'section-title'; h.textContent = part.label; box.appendChild(h);
      if (!list.length) box.insertAdjacentHTML('beforeend', '<p class="filemeta">Bu slaytta metin yok.</p>');
      for (const p of list) {
        const row = document.createElement('div'); row.className = 'para';
        const style = p.getElementsByTagNameNS(ns, 'pStyle')[0]?.getAttributeNS(ns, 'val') || '';
        if (/heading|title|balk|başlık|konubal/i.test(style)) row.classList.add('heading');
        if (ancestor(p, 'tc')) row.classList.add('intable');
        row.innerHTML = '<textarea rows="1"></textarea><button title="Altına paragraf ekle" aria-label="Altına paragraf ekle">＋</button><button class="warn" title="Paragrafı sil" aria-label="Paragrafı sil">✕</button>';
        const [ta, add, del] = row.children;
        ta.value = texts(p).map(t => t.textContent).join('');
        ta.oninput = () => { ta.value.includes('\n') && (ta.value = ta.value.replace(/\n+/g, ' ')); setText(texts(p), ta.value); touch(part); fit([ta]); };
        ta.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add.click(); } };
        add.onclick = () => { addAfter(p); touch(part); const i = $$('.para textarea', box).indexOf(ta); draw(); $$('.para textarea', box)[i + 1]?.focus(); };
        del.onclick = () => { const removed = removeParagraph(p); touch(part); draw(); if (!removed) toast('Dosya yapısı korunsun diye yalnızca yazı silindi.'); };
        box.appendChild(row); areas.push(ta);
      }
    }
    fit(areas); window.scrollTo(0, scroll);
  }
  function fit(areas) {
    areas.forEach(a => a.style.height = 'auto');
    const h = areas.map(a => a.scrollHeight + 2);
    areas.forEach((a, i) => a.style.height = h[i] + 'px');
  }

  function replaceAll() {
    const q = $('#ofind').value, r = $('#orepl').value;
    if (!q) { toast('Aranacak metni yaz.'); return; }
    let count = 0;
    for (const part of S.parts) for (const p of paragraphs(part.doc)) {
      const text = texts(p).map(t => t.textContent).join(''), hits = [];
      for (let i = text.indexOf(q); i >= 0; i = text.indexOf(q, i + q.length)) hits.push(i);
      for (const i of hits.reverse()) { const cur = texts(p).map(t => t.textContent).join(''); setText(texts(p), cur.slice(0, i) + r + cur.slice(i + q.length)); count++; touch(part); }
    }
    draw(); toast(count ? count + ' eşleşme değiştirildi.' : 'Eşleşme bulunamadı.');
  }
  async function save() {
    try {
      for (const part of S.parts) if (part.changed) {
        let xml = new XMLSerializer().serializeToString(part.doc);
        if (!xml.startsWith('<?xml')) xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + xml;
        S.zip.file(part.path, xml);
      }
      downloadBlob(await S.zip.generateAsync({ type: 'blob', mimeType: mime, compression: 'DEFLATE' }), editedName(S.file.name, ext));
      App.dirty[key] = false;
    } catch (e) { toast('Kaydedilemedi: ' + e.message); }
  }
  const plain = () => S.parts.map(part => `--- ${part.label} ---\n` + paragraphs(part.doc).map(p => texts(p).map(t => t.textContent).join('')).join('\n')).join('\n\n');

  App.register(key, {
    title, sub,
    render(view, file) {
      const E = ext.toUpperCase();
      view.innerHTML = `<div class="panel"><div class="toolbar"><button id="oopen">📂 ${E} aç</button><button id="osave" class="need primary">⬇ ${E} indir</button><button id="otxt" class="need">Metni TXT indir</button></div>
      <div class="toolbar"><input id="ofind" placeholder="Bul"><input id="orepl" placeholder="Yerine yaz"><button id="oall" class="need">Tümünü değiştir</button></div>
      <p class="notice">Yazılar düzenlenir; dosyanın biçimi, görselleri ve tabloları korunur. Bu bir sayfa/slayt önizlemesi değildir. Uzayan metinlerin taşıp taşmadığını Office'te kontrol et.</p>
      <div id="officeout"><p class="filemeta">Bir ${E} dosyası aç.</p></div></div>`;
      $('#oopen', view).onclick = async () => { const [f] = await pickFiles('.' + ext); if (f) open(f); };
      $('#osave', view).onclick = save;
      $('#oall', view).onclick = replaceAll;
      $('#otxt', view).onclick = () => downloadBlob(new Blob([plain()], { type: 'text/plain;charset=utf-8' }), baseName(S.file.name) + '.txt');
      draw(); $$('.need', view).forEach(b => b.disabled = !S);
      if (file) open(file);
    }
  });
}
makeOfficeEditor({ key: 'word', ext: 'docx', title: 'Word (DOCX)', sub: 'Paragrafları düzeni koruyarak düzenle.', ns: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
makeOfficeEditor({ key: 'slides', ext: 'pptx', title: 'Sunum (PPTX)', sub: 'Slayt metinlerini düzenle.', ns: 'http://schemas.openxmlformats.org/drawingml/2006/main', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
