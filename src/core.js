// Shared namespace, constants, translations and state for the content scripts.
// Every content script file is wrapped in an IIFE and talks to the others through
// globalThis.FollowLens, so re-injecting the scripts never redeclares a binding.
(() => {
  "use strict";

  const FL = (globalThis.FollowLens = globalThis.FollowLens || {});

  FL.VERSION = "1.1.0";
  FL.APP_ID = "follow-lens-app";
  FL.CLEANUP_EVENT = "follow-lens-cleanup";
  FL.PROGRESS_TITLE_ID = "fl-progress-title";
  FL.PANEL_MARGIN = 18;
  FL.MAX_RETRIES = 3;
  FL.CHECKPOINT_TTL = 24 * 60 * 60 * 1000;
  FL.IG_HEADERS = { "x-ig-app-id": "936619743392459", "x-requested-with": "XMLHttpRequest" };
  FL.DEFAULT_TIMINGS = {
    scanDelayMin: 1000, scanDelayMax: 1300, scanPauseEveryPages: 7, scanPauseMs: 10000, usersPerRequest: 50,
    unfollowDelayMin: 4000, unfollowPauseEvery: 5, unfollowPauseMs: 300000
  };
  FL.UNFOLLOW_BLOCK_MS = 60 * 60 * 1000;
  FL.UNFOLLOW_ARM_MS = 4000;
  FL.SCAN_MICRO_DELAY_MIN = 500;
  FL.SCAN_MICRO_DELAY_MAX = 2000;
  FL.SCAN_PAUSE_JITTER_MS = 5000;

  FL.I18N = {
    tr: {
      title: "Follow Lens",
      subtitle: "Instagram takip analizi",
      welcomeTitle: "Hazır olduğunda başlat",
      welcomeBody: "Takip ettiklerin ve takipçilerin karşılaştırılır. Tarama sırasında hesabında hiçbir şey değişmez.",
      scanNotice: "Büyük hesaplarda tarama 20 dakika veya daha uzun sürebilir. Instagram yine de taramayı kesebilir. Böyle olursa devam etmeden önce bekle; hemen tekrarlamak kısıtlamayı uzatabilir.",
      scanBtn: "Taramayı başlat",
      rescan: "Yeniden tara",
      goBack: "Sonuçlara dön",
      loadingFollowing: "Takip ettiklerin yükleniyor",
      loadingFollowers: "Takipçilerin yükleniyor",
      paused: "Duraklatıldı",
      pause: "Duraklat",
      resume: "Devam et",
      cancel: "İptal",
      ofTotal: "{current} / {total}",
      ofUnknown: "Şu ana kadar {current}",
      scanCompletedToast: "Tarama tamamlandı",
      scanFailed: "Tarama başarısız",
      retry: "Tekrar dene",
      search: "İsim veya kullanıcı adı ara",
      filterVerified: "Onaylı",
      filterPrivate: "Gizli",
      tabNotFollowingBack: "Geri takip etmeyenler",
      tabNotFollowedByMe: "Senin takip etmediklerin",
      emptyNotFollowingBack: "Harika — takip ettiğin herkes seni takip ediyor.",
      emptyNotFollowedByMe: "Seni takip eden herkesi sen de takip ediyorsun.",
      noMatches: "Filtrelerinle eşleşen kullanıcı yok.",
      openProfile: "Profili yeni sekmede aç",
      stats: "Takip ettiğin: {following} · Takipçin: {followers}",
      lastScan: "Son tarama: {date}",
      scanPause: "Mola — {seconds} sn",
      cooldownIn: "Bekleniyor — {seconds} sn",
      settings: "Ayarlar",
      settingsTitle: "Hız ayarları",
      settingsBody: "Düşük gecikmeler Instagram'ın hesabını kısıtlamasına neden olabilir. Yavaş tut.",
      minScanDelay: "Min tarama gecikmesi (ms)",
      maxScanDelay: "Maks tarama gecikmesi (ms)",
      scanPauseEvery: "Her N sayfada uzun mola",
      scanPauseLength: "Uzun mola süresi (ms)",
      usersPerRequest: "Sayfa başına istenen kullanıcı",
      minUnfollowDelay: "Takip bırakmalar arası min bekleme (ms)",
      unfollowPauseEvery: "Her N takip bırakmada mola",
      unfollowPauseLength: "Takip bırakma molası (ms)",
      unfollow: "Takibi bırak",
      unfollowConfirm: "Emin misin?",
      unfollowDone: "@{username} takibi bırakıldı",
      unfollowFailed: "Takip bırakılamadı: {reason}",
      unfollowNextIn: "Sonraki takip bırakma: {time}",
      unfollowCooldown: "Mola — {time} sonra devam edebilirsin",
      unfollowBlocked: "Instagram takip bırakmayı engelledi. Tekrar denemeden önce en az 1 saat bekle ({time}).",
      csrfMissing: "csrftoken çerezi okunamadı. Sayfayı yenileyip tekrar dene.",
      restoreDefaults: "Varsayılana dön",
      save: "Kaydet",
      saved: "Ayarlar kaydedildi",
      cookieMissing: "Giriş çerezi okunamadı. Instagram'a giriş yaptığından emin ol.",
      requestFailed: "İstek başarısız: {status}",
      tooManyRequests: "Instagram istekleri kısıtlıyor. Sonra dene veya ayarlardan gecikmeleri artır.",
      sessionExpired: "Instagram oturumunu kapattı. Tekrar giriş yap ve Taramaya devam et'e bas. Tarama kaldığı yerden sürer.",
      scanBlocked: "Instagram bu hesap için liste isteklerini geçici olarak reddetti. Birkaç saat bekle, sonra Taramaya devam et'e bas.",
      networkError: "Bağlantı koptu. Ağı kontrol et ve Taramaya devam et'e bas.",
      limitedList: "Instagram bu listeyi kısıtlıyor. Sonuçlar doğrulanamadı. Tekrar denemeden önce bekle.",
      keepTabVisible: "Bu sekmeyi önde tut. Chrome arka plandaki sekmeleri dakikada bir adıma yavaşlatır.",
      resumeScan: "Taramaya devam et",
      startOver: "Baştan başla",
      resumeHint: "Önceki tarama yarıda kaldı ({following} takip, {followers} takipçi yüklendi). Baştan başlamak yerine oradan devam edebilirsin.",
      partialTitle: "Tarama tamamlanmadı",
      partialBody: "{following} takip ve {followers} takipçi yüklendi. Listelerin tamamı alınana kadar sonuçlar gösterilmez. İlerlemen kaydedildi.",
      close: "Kapat",
      langSwitch: "İngilizce'ye geç",
      minimize: "Küçült",
      expand: "Aç",
      langCode: "EN",
      pillScanning: "Taranıyor {current}",
      pillResults: "{a} geri takip etmiyor",
      pillIdle: "Follow Lens"
    },
    en: {
      title: "Follow Lens",
      subtitle: "Instagram follow insights",
      welcomeTitle: "Ready when you are",
      welcomeBody: "We'll compare the people you follow with your followers. Nothing is changed on your account during the scan.",
      scanNotice: "Large accounts can take 20 minutes or more. Instagram may still interrupt a scan. If it does, wait before resuming; repeating the scan immediately can prolong restrictions.",
      scanBtn: "Scan now",
      rescan: "Scan again",
      goBack: "Back to results",
      loadingFollowing: "Loading the people you follow",
      loadingFollowers: "Loading your followers",
      paused: "Paused",
      pause: "Pause",
      resume: "Resume",
      cancel: "Cancel",
      ofTotal: "{current} of {total}",
      ofUnknown: "{current} so far",
      scanCompletedToast: "Scan complete",
      scanFailed: "Scan failed",
      retry: "Try again",
      search: "Search by name or username",
      filterVerified: "Verified",
      filterPrivate: "Private",
      tabNotFollowingBack: "Not following back",
      tabNotFollowedByMe: "You don't follow",
      emptyNotFollowingBack: "Nice — everyone you follow follows you back.",
      emptyNotFollowedByMe: "You follow everyone who follows you.",
      noMatches: "No users match your filters.",
      openProfile: "Open profile in a new tab",
      stats: "Following: {following} · Followers: {followers}",
      lastScan: "Last scan: {date}",
      scanPause: "Pause — {seconds}s",
      cooldownIn: "Waiting — {seconds}s",
      settings: "Settings",
      settingsTitle: "Timing settings",
      settingsBody: "Lower delays make Instagram more likely to throttle or block your account. Keep these conservative.",
      minScanDelay: "Min scan delay (ms)",
      maxScanDelay: "Max scan delay (ms)",
      scanPauseEvery: "Long pause every N pages",
      scanPauseLength: "Long pause length (ms)",
      usersPerRequest: "Users requested per page",
      minUnfollowDelay: "Min delay between unfollows (ms)",
      unfollowPauseEvery: "Cooldown every N unfollows",
      unfollowPauseLength: "Unfollow cooldown length (ms)",
      unfollow: "Unfollow",
      unfollowConfirm: "Sure?",
      unfollowDone: "Unfollowed @{username}",
      unfollowFailed: "Unfollow failed: {reason}",
      unfollowNextIn: "Next unfollow in {time}",
      unfollowCooldown: "Cooldown — continue in {time}",
      unfollowBlocked: "Instagram blocked unfollowing. Wait at least an hour before trying again ({time}).",
      csrfMissing: "Could not read the csrftoken cookie. Refresh the page and try again.",
      restoreDefaults: "Restore defaults",
      save: "Save",
      saved: "Settings saved",
      cookieMissing: "Could not read your login cookie. Make sure you are signed in to Instagram.",
      requestFailed: "Request failed: {status}",
      tooManyRequests: "Instagram is rate-limiting requests. Try again later or increase delays in settings.",
      sessionExpired: "Instagram signed you out. Sign in again and press Resume scan. The scan continues where it stopped.",
      scanBlocked: "Instagram temporarily refused list requests for this account. Wait a few hours, then press Resume scan.",
      networkError: "The connection dropped. Check the network and press Resume scan.",
      limitedList: "Instagram is limiting this list. Results can't be confirmed. Wait before trying again.",
      keepTabVisible: "Keep this tab in front. Chrome slows background tabs down to one step per minute.",
      resumeScan: "Resume scan",
      startOver: "Start over",
      resumeHint: "A previous scan stopped partway ({following} following, {followers} followers loaded). Continue from there instead of starting again.",
      partialTitle: "Scan incomplete",
      partialBody: "{following} following and {followers} followers were loaded. Results stay hidden until both lists are complete. Your progress is saved.",
      close: "Close",
      langSwitch: "Switch to Turkish",
      minimize: "Minimize",
      expand: "Expand",
      langCode: "TR",
      pillScanning: "Scanning {current}",
      pillResults: "{a} not following back",
      pillIdle: "Follow Lens"
    }
  };

  FL.state = {
    open: false,
    mode: "idle", // idle | scanning | results
    scanPaused: false,
    scanCancelled: false,
    progress: { current: 0, total: 0, label: "loadingFollowing", note: "" },
    waitUntil: 0,
    waitReason: "",
    result: null, // { viewerId, scannedAt, following, followers }
    checkpoint: null,
    partial: false,
    error: "",
    tab: "notFollowingBack",
    search: "",
    filters: { verified: true, private: true },
    timings: { ...FL.DEFAULT_TIMINGS },
    panelPos: null,
    minimized: false,
    language: String(navigator.language || "").toLowerCase().startsWith("en") ? "en" : "tr"
  };

  FL.t = function t(key, vars) {
    const dict = FL.I18N[FL.state.language] || FL.I18N.tr;
    const template = dict[key] ?? FL.I18N.tr[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? "");
  };

  FL.formatCount = function formatCount(value) {
    const number = Number(value) || 0;
    try {
      return number.toLocaleString(FL.state.language === "tr" ? "tr-TR" : "en-US");
    } catch {
      return String(number);
    }
  };

  FL.formatDate = function formatDate(timestamp) {
    try {
      return new Date(timestamp).toLocaleString(FL.state.language === "tr" ? "tr-TR" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short"
      });
    } catch {
      return new Date(timestamp).toISOString();
    }
  };

  FL.formatDuration = function formatDuration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    if (total < 60) return total + (FL.state.language === "tr" ? " sn" : "s");
    const minutes = Math.floor(total / 60);
    return minutes + ":" + String(total % 60).padStart(2, "0");
  };

  FL.escapeHTML = function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  };

  FL.clamp = function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  };

  FL.randomBetween = function randomBetween(min, max) {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo)) + lo;
  };

  FL.getCookie = function getCookie(name) {
    const match = document.cookie.match(new RegExp("(^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
    return match ? decodeURIComponent(match[2]) : null;
  };
})();
