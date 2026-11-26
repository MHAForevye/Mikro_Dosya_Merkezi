'use strict';
/* Çekirdek: gezinme, tema, ortak yardımcılar */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const App = {
  pages: {}, files: [], current: 'home', dirty: {},
  register(name, def) { this.pages[name] = def; },
  go(name, file) {
    const p = this.pages[name] || this.pages.home;
    this.current = this.pages[name] ? name : 'home';
    $('#pagetitle').textContent = p.title;
    $('#pagesub').textContent = p.sub || '';
    $$('#nav button[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === this.current));
    $('#sidebar').classList.remove('open');
    $$('.modal').forEach(m => m.remove());
    $('#view').innerHTML = '';
    p.render($('#view'), file);
  },
  start() {
    $('#nav').onclick = e => { const b = e.target.closest('[data-page]'); if (b) this.go(b.dataset.page); };
    $('#menu').onclick = () => $('#sidebar').classList.toggle('open');
    $('#backdrop').onclick = () => $('#sidebar').classList.remove('open');
    $('#quickopen').onclick = () => $('#fileinput').click();
    $('#fileinput').onchange = e => { const f = [...e.target.files]; e.target.value = ''; if (f.length) openFiles(f); };
    $('#themebtn').onclick = () => Theme.set(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    Theme.apply();
    // Sayfanın herhangi bir yerine dosya bırakılırsa tarayıcının dosyayı açmasını engelle
    addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    addEventListener('drop', e => { if (e.dataTransfer?.files.length) { e.preventDefault(); openFiles([...e.dataTransfer.files]); } });
    addEventListener('beforeunload', e => { if (Object.values(this.dirty).some(Boolean)) { e.preventDefault(); e.returnValue = ''; } });
    this.go('home');
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
};

/* ---------- Tema ---------- */
const Theme = {
  get() { try { return localStorage.getItem('mdm-theme') || this.mem || 'system'; } catch { return this.mem || 'system'; } },
  set(mode) { this.mem = mode; try { localStorage.setItem('mdm-theme', mode); } catch {} this.apply(); },
  apply() {
    const m = this.get();
    const dark = m === 'dark' || (m === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    $('meta[name="theme-color"]').content = dark ? '#0d1117' : '#0f766e';
    $('#themebtn').textContent = dark ? '☀ Açık' : '☾ Koyu';
    $$('[data-theme-choice]').forEach(b => b.classList.toggle('active', b.dataset.themeChoice === m));
  }
};
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => Theme.apply());

/* ---------- Yardımcılar ---------- */
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
let toastTimer;
function toast(m, ms = 3800) {
  const t = $('#toast'); t.textContent = m; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'), u = URL.createObjectURL(blob);
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 4000);
}
const extOf = n => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
const baseName = n => n.replace(/\.[^./\\]+$/, '');
const editedName = (n, ext) => baseName(n) + '-duzenlenmis.' + (ext || extOf(n) || 'txt');
const sizeText = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const canDiscard = key => !App.dirty[key] || confirm('Kaydedilmemiş (indirilmemiş) değişiklikler var. Silinsin mi?');

function pickFiles(accept, multiple = false) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res([...i.files]);
    i.oncancel = () => res([]);
    i.click();
  });
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = '<div class="box" role="dialog" aria-modal="true">' + html + '</div>';
  m.addEventListener('click', e => { if (e.target.closest('[data-close]')) m.remove(); });
  document.body.appendChild(m); return m;
}

/* ---------- Harici motorlar (CDN) ---------- */
const ENGINES = {
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs',
  pdfworker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs',
  xlsx: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
};
const scriptCache = {};
function loadScript(url) {
  return scriptCache[url] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.onload = resolve;
    s.onerror = () => { s.remove(); delete scriptCache[url]; reject(new Error('Motor yüklenemedi (internet bağlantısını kontrol et)')); };
    document.head.appendChild(s);
  });
}

/* ---------- Dosya yönlendirme ---------- */
const TEXT_EXT = ['txt','md','json','html','htm','css','js','mjs','ts','tsx','jsx','xml','yaml','yml','log','ini','conf','sql','py','java','c','h','cpp','hpp','sh','php','svg','webmanifest','gitignore','env','toml','bat','rs','go','kt','swift'];
function pageFor(f) {
  const e = extOf(f.name);
  if (e === 'pdf') return 'pdf';
  if (['png','jpg','jpeg','webp','gif','bmp'].includes(e)) return 'image';
  if (['csv','tsv','xlsx','xls','ods'].includes(e)) return 'table';
  if (e === 'docx') return 'word';
  if (e === 'pptx') return 'slides';
  if (e === 'zip') return 'archive';
  if (TEXT_EXT.includes(e) || (f.type || '').startsWith('text/')) return 'text';
  return null;
}
function openFile(f) {
  const p = pageFor(f);
  if (p) App.go(p, f);
  else toast('Bu dosya türü desteklenmiyor: ' + f.name);
}
function openFiles(list) {
  for (const f of list) if (!App.files.includes(f)) App.files.push(f);
  if (list.length === 1) openFile(list[0]); else App.go('open');
}

/* ---------- Genel sayfalar ---------- */
App.register('home', {
  title: 'Ana Sayfa', sub: 'Dosyalarını aç, düzenle, indir.',
  render(view) {
    const tiles = [['pdf','▤','PDF düzenle','Metin düzenle, araya sayfa ekle, sırala, kırp'],['word','▧','Word','DOCX metnini düzeni koruyarak düzenle'],['table','▦','Tablolar','CSV / XLSX hücre düzenleme'],['slides','▣','Sunum','PPTX slayt metinlerini düzenle'],['text','⌘','Metin ve kod','Bul-değiştir, JSON, HTML önizleme'],['image','◩','Görsel','Kırp, döndür, yazı ekle, ayarla'],['archive','▥','ZIP','İçeriği düzenle ve yeniden paketle']];
    view.innerHTML = `<section class="hero"><h2>Dosyaların, tek bir çalışma alanında.</h2><p>Aç, düzenle ve dışa aktar. İşlemler cihazında gerçekleşir.</p><div class="drop" id="drop"><div style="font-size:30px">↥</div><b>Dosyalarını buraya bırak</b><p>veya dokunup seç</p><small class="filemeta">PDF • DOCX • XLSX • CSV • PPTX • TXT • Görsel • ZIP</small></div></section>
    <div class="panel"><h3>Düzenleyiciler</h3><div class="tiles">${tiles.map(t => `<button class="tile" data-go="${t[0]}"><div class="ico">${t[1]}</div><b>${t[2]}</b><small>${t[3]}</small></button>`).join('')}</div></div>`;
    $$('[data-go]', view).forEach(b => b.onclick = () => App.go(b.dataset.go));
    const d = $('#drop', view);
    d.onclick = () => $('#fileinput').click();
    d.ondragover = e => { e.preventDefault(); d.classList.add('drag'); };
    d.ondragleave = () => d.classList.remove('drag');
  }
});

App.register('open', {
  title: 'Dosyalar', sub: 'Bu oturumda seçtiğin dosyalar.',
  render(view) {
    const pdfs = App.files.filter(f => extOf(f.name) === 'pdf');
    view.innerHTML = `<div class="panel"><div class="toolbar"><button class="primary" id="add">＋ Dosya ekle</button>${pdfs.length > 1 ? '<button id="mergeall">Tüm PDF\'leri düzenleyicide birleştir</button>' : ''}${App.files.length ? '<button id="zipall">Hepsini ZIP yap</button><button class="warn" id="clear">Listeyi temizle</button>' : ''}</div>
    <div class="list">${App.files.map((f, i) => `<div class="row"><span class="grow"><b>${esc(f.name)}</b> <span class="filemeta">${sizeText(f.size)}${pageFor(f) ? '' : ' • desteklenmiyor'}</span></span><button data-open="${i}" ${pageFor(f) ? '' : 'disabled'}>Aç</button></div>`).join('') || '<p class="filemeta">Henüz dosya yok.</p>'}</div></div>`;
    $('#add', view).onclick = () => $('#fileinput').click();
    $$('[data-open]', view).forEach(b => b.onclick = () => openFile(App.files[+b.dataset.open]));
    $('#mergeall', view)?.addEventListener('click', () => PdfEditor.openMany(pdfs));
    $('#zipall', view)?.addEventListener('click', () => ZipEditor.fromFiles(App.files));
    $('#clear', view)?.addEventListener('click', () => { App.files = []; App.go('open'); });
  }
});

App.register('settings', {
  title: 'Ayarlar', sub: 'Görünüm tercihleri.',
  render(view) {
    view.innerHTML = `<div class="panel"><h2>Tema</h2><div class="toolbar"><button data-theme-choice="light">☀ Açık</button><button data-theme-choice="dark">☾ Koyu</button><button data-theme-choice="system">◐ Sistem</button></div><p class="filemeta">Tema tercihi bu tarayıcıda saklanır. Dosya içerikleri kaydedilmez; sayfayı kapatmadan önce değişikliklerini indir.</p></div>`;
    $$('[data-theme-choice]', view).forEach(b => b.onclick = () => Theme.set(b.dataset.themeChoice));
    Theme.apply();
  }
});

App.register('help', {
  title: 'Yardım', sub: 'Neler yapılabilir, sınırlar neler.',
  render(view) {
    view.innerHTML = `<div class="panel"><h2>PDF düzenleyici</h2><ul>
    <li><b>Araya sayfa:</b> küçük resimlerin arasındaki ＋ düğmesi. Boş sayfa, yazı sayfası, başka PDF'den seçili sayfalar veya görsel eklenir.</li>
    <li><b>Sıralama:</b> küçük resmi sürükle (masaüstü) veya ↑ ↓ kullan. Kopyala, sil, döndür, seçilenleri ayrı PDF yap.</li>
    <li><b>Metni düzenle:</b> mavi kutuya dokun; yazıyı değiştir, sürükle, sil veya ✂ Kes ile alıp başka sayfaya yapıştır.</li>
    <li><b>Yazı, görsel/imza, beyaz kapatma, vurgulama, kırpma</b> ve geri al / yinele.</li></ul>
    <div class="notice"><b>Önemli:</b> Normal "PDF indir" seçeneğinde silinen veya değiştirilen eski yazı ve kırpılan alan dosyanın içinde kalır (sadece üstü kapatılır/gizlenir). Gizli bilgiyi gerçekten kaldırmak için <b>Güvenli indir</b> kullan: tüm sayfalar görüntüye çevrilir, metin artık seçilemez.</div>
    <ul><li>Orijinal PDF yazı tipi kullanılmaz; benzer bir standart tip kullanılır. ğ, ş, ı, İ gibi harf içeren yeni yazılar PDF'e net bir görüntü olarak eklenir (seçilemez).</li><li>Form alanları ve yer imleri dışa aktarımda korunmayabilir. Parolalı PDF düzenlenemez. Taranmış sayfalarda metin algılanmaz (OCR yok); kapatma + yazı kullan.</li></ul>
    <h2>Diğer dosyalar</h2><ul><li><b>DOCX / PPTX:</b> paragraf metni düzenlenir; stiller, görseller ve tablolar dosyada kalır. Yeni biçim eklenemez.</li><li><b>CSV / XLSX:</b> hücre, satır, sütun düzenleme. XLSX kaydında stil/biçim kaybolabilir; formüller burada yeniden hesaplanmaz.</li><li><b>Görsel:</b> kırpma, döndürme, çevirme, boyut, ayarlar, yazı, kalem.</li><li><b>ZIP:</b> metin dosyasını içinde düzenle, ekle, sil, yeniden adlandır.</li><li>DOC, XLS dışındaki eski ikili Office biçimleri, ODT ve ODP desteklenmez.</li></ul>
    <h3>Gizlilik</h3><p class="filemeta">Dosya içerikleri bir sunucuya yüklenmez. JSZip, pdf-lib, pdf.js ve SheetJS motorları ilk kullanımda internetten indirilir.</p></div>`;
  }
});
