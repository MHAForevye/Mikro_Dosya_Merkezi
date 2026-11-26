# Yama v2

## Uygulama
1. Bu zip'teki dosyaları projenin kök klasörüne kopyala (aynı adlıların üzerine yaz). `css/` ve `js/` klasörleri yenidir.
2. `manifest.webmanifest` değişmedi, yerinde kalsın.
3. GitHub'a yükle. Eski sürüm tarayıcıda önbellekte olabilir: siteyi aç, birkaç saniye bekle, **sayfayı yenile**. Olmazsa bir kez daha yenile veya site verilerini temizle.

Bu `YAMA_NOTLARI.md` dosyasını repoya eklemek zorunda değilsin.

## Yeni
- Koyu tema (üstteki düğme veya Ayarlar)
- PDF düzenleyici
- DOCX, PPTX, CSV/XLSX, metin, görsel ve ZIP düzenleme

## Düzeltilen hatalar
- Görselde yatay çevirme ve parlaklık/kontrast/doygunluk indirilen dosyaya yansımıyordu.
- TXT indirirken eski uzantı addan silinmiyordu.
- CSV'de tırnak içindeki ayraç ve satır sonları tabloyu bozuyordu.
- Service worker eski sürümü sürekli önbellekten veriyordu.
- Birden fazla dosya seçilince dosya listesi görünmüyordu.

## Test durumu
Chromium'da otomatik test edildi: tema, PDF akışları (döndürülmüş sayfa dahil), DOCX, PPTX, CSV, metin, görsel, ZIP, 390 px mobil görünüm, çevrimdışı sayfa açılışı.

Test ortamında CDN erişimi olmadığından motorlar yerel kopyalarla değiştirildi (pdf-lib 1.17.1, JSZip 3.10.1, pdf.js **6.2.108**; yayında 4.4.168 yüklenir).

**Test edilmeyenler:** XLSX/XLS/ODS açma ve kaydetme (SheetJS yoktu), gerçek CDN adresleri, iPhone/Safari, Firefox, gerçek dokunmatik cihaz. Üretilen DOCX/PPTX Microsoft Office'te açılarak denenmedi (python-docx / python-pptx ile okundu).
