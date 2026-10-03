// chrome.storage.local wrappers: settings, scan checkpoint and the last finished result.
(() => {
  "use strict";

  const FL = globalThis.FollowLens;
  const { state } = FL;

  const SETTINGS_KEY = "fl_settings";
  const CHECKPOINT_KEY = "fl_checkpoint";
  const RESULT_KEY = "fl_last_result";
  const UNFOLLOW_LIMITS_KEY = "fl_unfollow_limits";

  async function get(key) {
    try {
      const data = await chrome.storage.local.get(key);
      return data[key] ?? null;
    } catch {
      return null;
    }
  }

  async function set(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch (error) {
      console.warn("[follow-lens] storage write failed:", error);
    }
  }

  async function remove(key) {
    try {
      await chrome.storage.local.remove(key);
    } catch { }
  }

  function sanitizeTimings(saved = {}) {
    const timings = { ...FL.DEFAULT_TIMINGS };
    for (const key of Object.keys(timings)) {
      if (Number.isFinite(saved?.[key]) && saved[key] >= 0) timings[key] = saved[key];
    }
    timings.usersPerRequest = Math.min(200, Math.max(1, Math.round(timings.usersPerRequest)));
    return timings;
  }

  async function loadSettings() {
    const saved = (await get(SETTINGS_KEY)) || {};
    state.timings = sanitizeTimings(saved.timings);
    if (saved.filters && typeof saved.filters === "object") state.filters = { ...state.filters, ...saved.filters };
    if (saved.panelPos) state.panelPos = saved.panelPos;
    state.minimized = Boolean(saved.minimized);
    state.open = Boolean(saved.open);
    if (saved.language === "tr" || saved.language === "en") state.language = saved.language;
    if (saved.tab === "notFollowingBack" || saved.tab === "notFollowedByMe") state.tab = saved.tab;
  }

  function saveSettings() {
    return set(SETTINGS_KEY, {
      timings: state.timings,
      filters: state.filters,
      panelPos: state.panelPos,
      minimized: state.minimized,
      open: state.open,
      language: state.language,
      tab: state.tab
    });
  }

  function createCheckpoint(viewerId) {
    return {
      viewerId: String(viewerId),
      savedAt: Date.now(),
      followingTotal: 0,
      followersTotal: 0,
      following: [],
      followingCursor: "",
      followingDone: false,
      followers: [],
      followersCursor: "",
      followersDone: false,
      stopReason: ""
    };
  }

  async function loadCheckpoint() {
    const parsed = await get(CHECKPOINT_KEY);
    if (!parsed || typeof parsed !== "object" || !parsed.viewerId) return null;
    if (!Array.isArray(parsed.following) || !Array.isArray(parsed.followers)) return null;
    if (Date.now() - Number(parsed.savedAt || 0) > FL.CHECKPOINT_TTL) return null;
    if (parsed.followingDone && parsed.followersDone) return null;
    if (!parsed.following.length && !parsed.followers.length) return null;
    return { ...createCheckpoint(parsed.viewerId), ...parsed };
  }

  function saveCheckpoint(checkpoint) {
    if (!checkpoint) return Promise.resolve();
    checkpoint.savedAt = Date.now();
    return set(CHECKPOINT_KEY, checkpoint);
  }

  function clearCheckpoint() {
    state.checkpoint = null;
    state.partial = false;
    return remove(CHECKPOINT_KEY);
  }

  async function loadLastResult() {
    const parsed = await get(RESULT_KEY);
    if (!parsed || !parsed.viewerId || !Array.isArray(parsed.following) || !Array.isArray(parsed.followers)) return null;
    return parsed;
  }

  function saveLastResult(result) {
    return set(RESULT_KEY, result);
  }

  // Kept in storage so a page refresh doesn't reset the unfollow rate limit.
  async function loadUnfollowLimits() {
    const saved = (await get(UNFOLLOW_LIMITS_KEY)) || {};
    return {
      lastAt: Number(saved.lastAt) || 0,
      count: Number(saved.count) || 0,
      cooldownUntil: Number(saved.cooldownUntil) || 0,
      blocked: Boolean(saved.blocked)
    };
  }

  function saveUnfollowLimits(limits) {
    return set(UNFOLLOW_LIMITS_KEY, limits);
  }

  FL.store = {
    loadSettings,
    saveSettings,
    createCheckpoint,
    loadCheckpoint,
    saveCheckpoint,
    clearCheckpoint,
    loadLastResult,
    saveLastResult,
    loadUnfollowLimits,
    saveUnfollowLimits
  };
})();
