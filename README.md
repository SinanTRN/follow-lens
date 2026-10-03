# Follow Lens

**Türkçe** · [English](#english)

Instagram'da seni geri takip etmeyenleri ve senin takip etmediğin takipçilerini listeleyen bir Chrome / Edge eklentisi. Kişisel kullanım için yazılmıştır.

## Özellikler

- **Geri takip etmeyenler:** takip ettiğin ama seni takip etmeyen hesaplar.
- **Senin takip etmediklerin:** seni takip eden ama senin takip etmediğin hesaplar.
- **Profili açma:** bir satıra tıklayınca o kişinin profili yeni sekmede açılır.
- **Takibi bırakma:** "Geri takip etmeyenler" listesinde her satırda bir düğme var. İlk tıklamada "Emin misin?" sorar, ikinci tıklamada takibi bırakır.
- **Arama ve filtre:** kullanıcı adı veya isimle arama yapılabilir, onaylı ve gizli hesaplar filtrelenebilir.
- **Kaldığı yerden devam:** tarama yarıda kalırsa (sekme kapanırsa, Instagram isteği keserse) kaldığı sayfadan sürer.
- **Son sonuç saklanır:** paneli tekrar açtığında son tarama, tarihiyle birlikte yeniden taramadan görünür.
- **Arayüz:** Türkçe / İngilizce, sürüklenebilir ve küçültülebilir panel.

## Kurulum

Eklenti Chrome Web Mağazası'nda yok, elle yüklenir:

1. Bu repoyu indir: **Code → Download ZIP**, sonra ZIP'i bir klasöre çıkar. Ya da `git clone https://github.com/SinanTRN/follow-lens.git` komutunu çalıştır.
2. Chrome'da `chrome://extensions` adresini aç. Edge'de bu adres `edge://extensions`.
3. Sağ üstten **Geliştirici modu**'nu aç.
4. **Paketlenmemiş öğe yükle**'ye tıkla ve `manifest.json` dosyasının bulunduğu klasörü seç.

Güncellemek için yeni dosyaları aynı klasöre koy, `chrome://extensions` sayfasında eklentinin ↻ düğmesine bas ve Instagram sekmesini yenile.

## Kullanım

1. [instagram.com](https://www.instagram.com/)'da hesabına giriş yap.
2. Araç çubuğundaki Follow Lens ikonuna tıkla. Panel açılır, tekrar tıklayınca kapanır.
3. **Taramayı başlat**'a bas. Önce takip ettiklerin, sonra takipçilerin yüklenir.
4. Tarama bitince iki sekme arasında geçiş yapabilirsin.

Tarama sırasında sekmeyi önde tut. Chrome arka plandaki sekmeleri yavaşlatır.

## Hesap güvenliği

Eklenti Instagram'ın web sitesinin kendi kullandığı istekleri, senin oturumunla gönderir. Instagram çok hızlı veya çok fazla istek yapan hesapları geçici olarak kısıtlayabilir. Bu yüzden:

- **Tarama yavaştır.** Sayfalar arasında rastgele beklemeler ve belirli aralıklarla uzun molalar var. Büyük hesaplarda tarama 20 dakikayı geçebilir.
- **Takip bırakma sınırlıdır.** İki işlem arasında en az 4 saniye beklenir ve her 5 işlemde 5 dakika mola verilir. Instagram işlemi engellerse düğmeler 1 saat kilitlenir.
- **Ayarlardan (⚙) süreleri değiştirebilirsin,** ama düşürmen önerilmez.
- **Instagram taramayı keserse** hemen tekrar deneme. Birkaç saat bekleyip "Taramaya devam et"e bas.

Bu eklenti Instagram veya Meta ile ilişkili değildir. Otomatik araç kullanımı Instagram'ın kullanım koşullarına aykırı sayılabilir. Kullanım riski sana aittir.

## Gizlilik

- Hiçbir veri üçüncü bir sunucuya gönderilmez. Tüm istekler doğrudan instagram.com'a gider.
- Ayarlar ve son tarama sonucu sadece tarayıcında (`chrome.storage.local`) saklanır.
- Şifren okunmaz. Eklenti, Instagram'a zaten giriş yapmış olduğun oturumu kullanır.

## Proje yapısı

| Dosya | Görev |
| --- | --- |
| `manifest.json` | Eklenti tanımı (Manifest V3) |
| `src/background.js` | İkona tıklanınca paneli açıp kapatır |
| `src/core.js` | Ortak sabitler, durum ve çeviriler |
| `src/storage.js` | Ayarlar, kaldığı yer kaydı ve son sonuç |
| `src/scanner.js` | Takip ve takipçi listelerini tarar |
| `src/unfollow.js` | Takip bırakma ve hız sınırı |
| `src/panel.js`, `src/panel.css` | Panel arayüzü |
| `src/content.js` | Instagram sayfasında başlatma |

Derleme adımı veya bağımlılık yoktur. Dosyaları düzenleyip eklentiyi yeniden yüklemen yeterlidir.

---

## English

A Chrome / Edge extension that lists who doesn't follow you back on Instagram, and which of your followers you don't follow back. Built for personal use.

### Features

- **Not following back:** accounts you follow that don't follow you.
- **You don't follow:** followers you haven't followed back.
- **Open profile:** click a row to open that profile in a new tab.
- **Unfollow:** a per-row button in the "not following back" list. The first click asks "Sure?", the second click unfollows.
- **Search and filters:** search by username or name, and filter verified or private accounts.
- **Resumable scans:** if a scan stops partway (tab closed, Instagram interrupts), it continues from the last page.
- **Last result kept:** reopening the panel shows the last scan with its date, without scanning again.
- **Interface:** Turkish / English, with a draggable panel you can minimize.

### Installation

The extension is not on the Chrome Web Store, so it is loaded manually:

1. Download this repo: **Code → Download ZIP**, then extract it. Or run `git clone https://github.com/SinanTRN/follow-lens.git`.
2. Open `chrome://extensions` in Chrome. In Edge the address is `edge://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.

To update, replace the files in the same folder, press the extension's ↻ button on `chrome://extensions`, and refresh the Instagram tab.

### Usage

1. Sign in on [instagram.com](https://www.instagram.com/).
2. Click the Follow Lens icon in the toolbar. The panel opens; click the icon again to close it.
3. Press **Scan now**. The people you follow load first, then your followers.
4. When the scan finishes, switch between the two tabs.

Keep the tab in front while scanning, because Chrome throttles background tabs.

### Account safety

The extension sends the same requests the Instagram website uses, with your own session. Instagram may temporarily restrict accounts that make too many requests too quickly. Therefore:

- **Scanning is slow on purpose.** There are random delays between pages and long pauses at intervals. Large accounts can take more than 20 minutes.
- **Unfollowing is rate limited.** There are at least 4 seconds between actions and a 5-minute cooldown every 5 unfollows. If Instagram blocks the action, the buttons lock for 1 hour.
- **Timings can be changed in Settings (⚙),** but lowering them is not recommended.
- **If Instagram interrupts a scan,** don't retry right away. Wait a few hours, then press "Resume scan".

This extension is not affiliated with Instagram or Meta. Using automated tools may violate Instagram's Terms of Use. Use at your own risk.

### Privacy

- No data is sent to any third-party server. All requests go directly to instagram.com.
- Settings and the last scan result are stored only in your browser (`chrome.storage.local`).
- Your password is never read. The extension uses the Instagram session you are already signed in with.

### Development

There is no build step and there are no dependencies. Edit the files under `src/`, reload the extension and refresh the Instagram tab. A quick syntax check:

```sh
for f in src/*.js; do node --check "$f"; done
```
