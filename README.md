# Mikro Dosya Merkezi

GitHub Pages üzerinde çalışan, mobil uyumlu dosya düzenleme alanı. Derleme adımı yoktur.

## Kurulum / yayın
1. Klasör içeriğini GitHub repository köküne yükle.
2. **Settings → Pages** bölümünden branch ve root klasörü seç.
3. Yayınlanan Pages adresini aç.

## Özellikler
- Açık / koyu / sistem teması
- **PDF:** satır metnini değiştirme, taşıma, silme, kesip yapıştırma; yazı, görsel/imza, kapatma, vurgulama; araya boş sayfa, yazı sayfası, görsel veya başka PDF'den sayfa ekleme; sıralama, kopyalama, silme, döndürme, kırpma, ayırma, birleştirme; geri al/yinele; normal ve güvenli (düzleştirilmiş) indirme; TXT çıkarma
- **DOCX / PPTX:** yapıyı koruyarak paragraf düzenleme, ekleme, silme, bul-değiştir
- **CSV / XLSX:** hücre, satır ve sütun düzenleme
- **Metin/kod:** bul-değiştir, JSON araçları, HTML önizleme (scriptsiz), Windows-1254 okuma
- **Görsel:** kırpma, döndürme, çevirme, boyut, ayarlar, yazı, kalem; PNG/JPG/WEBP
- **ZIP:** metin dosyası düzenleme, ekleme, silme, yeniden adlandırma

## Sınırlamalar
- PDF metin düzenleme, eski yazının üstünü kapatıp yenisini yazar. Eski yazıyı dosyadan kaldırmak için **Güvenli indir** kullanılmalıdır (çıktıda metin seçilemez). Sonucu paylaşmadan önce kontrol et.
- Orijinal PDF yazı tipi kullanılmaz. ğ, ş, ı, İ gibi harf içeren yeni yazılar görüntü olarak eklenir. Paragraf yeniden akışı yoktur.
- OCR yoktur. Yalnızca yatay metin satırları algılanır. Parolalı PDF desteklenmez. Form alanları, yer imleri ve sayfalar arası bağlantılar korunmayabilir.
- DOCX/PPTX için görsel önizleme yoktur.
- XLSX kaydında stil, grafik ve bazı özellikler kaybolabilir (SheetJS Community). Formüller uygulamada yeniden hesaplanmaz. Orijinal dosyayı sakla.
- DOC, PPT, ODT ve ODP desteklenmez.
- Değişiklikler tarayıcıda saklanmaz; sayfayı kapatmadan indir.

## Motorlar
JSZip, pdf-lib, pdf.js ve SheetJS CDN'den ilk kullanımda indirilir, sonra service worker tarafından önbelleğe alınır. Dosya içeriği bir sunucuya gönderilmez.

## Dosyalar
- `index.html`, `css/style.css`
- `js/core.js`: gezinme, tema, ortak yardımcılar
- `js/pdf-editor.js`: PDF düzenleyici
- `js/office.js`: DOCX/PPTX
- `js/editors.js`: metin, tablo, görsel, ZIP
- `service-worker.js`: yeni sürüm yayınlarken `CACHE` adını artır
- `manifest.webmanifest`
