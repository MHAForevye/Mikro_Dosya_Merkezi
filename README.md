# Mikro Dosya Merkezi

GitHub Pages üzerinde çalıştırılabilecek mobil öncelikli dosya çalışma alanı.

## Kurulum / yayın
1. Bu klasörün içeriğini GitHub repository köküne yükleyin.
2. GitHub: **Settings → Pages** bölümünden branch ve root klasörü seçin.
3. Yayınlanan Pages URL'sini açın.

## Bu pakette işlevsel olarak bulunanlar
- Responsive navigasyon, dosya seçimi ve drag/drop
- Metin/kod editörü, JSON formatlama, minify ve doğrulama
- Görsel önizleme, parlaklık/kontrast/doygunluk, döndürme, boyutlandırma, PNG export
- CSV temel görüntüleme ve export
- Tarayıcı PDF görüntüleme ve CDN erişimiyle pdf-lib PDF merge
- Mammoth ile DOCX düz metin çıkarımı
- JSZip ile ZIP inceleme, dosya çıkarma ve seçili dosyaları ZIP oluşturma
- Manifest ve basit app-shell service worker

## Sınırlamalar
Bu, Master Talimatın bütün kabul testlerini tamamlamış üretim sürümü değildir. Excel/XLSX editörü, PPTX render, PDF page rearrange/annotate/OCR, PDF insert, RTF/ODT/ODS kapsamlı destek, sandbox HTML preview, metadata temizleme, güvenlik testleri ve gerçek cihaz/çevrimdışı doğrulama tamamlanmamıştır. UI bu işlevleri tam destekliyormuş gibi iddia etmez.

Bazı motorlar CDN üzerinden yüklenir (JSZip, pdf-lib, Mammoth); bu nedenle ilk yüklemede internet bağlantısı gerekir. Dosya içeriği CDN'e gönderilmez; CDN'den yalnızca motor scriptleri indirilir. Ağ denetimi yapılmadığı için mutlak gizlilik/telemetri garantisi olarak yorumlanmamalıdır.

## Dosyalar
- `index.html`: uygulama
- `manifest.webmanifest`: PWA manifest
- `service-worker.js`: app shell cache
