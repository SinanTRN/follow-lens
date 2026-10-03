// Scan engine ported from code-ornek.txt: paginated following/followers fetch with
// random delays, long pauses, retry/backoff, pause/cancel and a resumable checkpoint.
(() => {
  "use strict";

  const FL = globalThis.FollowLens;
  const { state, t, store, getCookie, randomBetween } = FL;

  let activeRequest = null;
  let wakeSleep = null;

  const ui = {
    render: () => FL.ui?.render(),
    updateProgress: () => FL.ui?.updateProgress(),
    updateCountdown: () => FL.ui?.updateCountdown(),
    toast: (message) => FL.ui?.toast(message)
  };

  function isStopped() {
    return state.destroyed || state.scanCancelled;
  }

  async function startScan(options = {}) {
    if (state.destroyed || state.mode === "scanning") return;
    state.error = "";
    state.mode = "scanning";
    state.scanPaused = false;
    state.scanCancelled = false;
    state.partial = false;
    state.progress = { current: 0, total: 0, label: "loadingFollowing", note: visibilityNote() };
    ui.render();
    let checkpoint = null;
    try {
      const viewerId = getCookie("ds_user_id");
      if (!viewerId) throw new Error(t("cookieMissing"));
      const previous = options.resume ? state.checkpoint : null;
      checkpoint = previous && previous.viewerId === String(viewerId) ? previous : store.createCheckpoint(viewerId);
      checkpoint.stopReason = "";
      state.checkpoint = checkpoint;
      if (!checkpoint.followingTotal || !checkpoint.followersTotal) await fetchCounts(viewerId, checkpoint);
      if (isStopped()) return resetAfterCancel();
      if (!checkpoint.followingDone) {
        const following = await scanList(checkpoint, viewerId, "following");
        if (isStopped()) return resetAfterCancel();
        checkpoint.following = following;
        checkpoint.followingCursor = "";
        checkpoint.followingDone = true;
        await store.saveCheckpoint(checkpoint);
      }
      if (isStopped()) return resetAfterCancel();
      if (!checkpoint.followersDone) {
        const followers = await scanList(checkpoint, viewerId, "followers");
        if (isStopped()) return resetAfterCancel();
        checkpoint.followers = followers;
        checkpoint.followersCursor = "";
        checkpoint.followersDone = true;
      }
      const result = {
        viewerId: String(viewerId),
        scannedAt: Date.now(),
        following: checkpoint.following,
        followers: checkpoint.followers
      };
      await store.saveLastResult(result);
      await store.clearCheckpoint();
      state.result = result;
      state.mode = "results";
      ui.render();
      ui.toast(t("scanCompletedToast"));
    } catch (error) {
      if (state.destroyed) return;
      if (state.scanCancelled) return resetAfterCancel();
      console.error("[follow-lens] scan failed:", error);
      const message = error?.message || String(error) || t("scanFailed");
      if (checkpoint && (checkpoint.following.length || checkpoint.followers.length)) {
        checkpoint.stopReason = message;
        await store.saveCheckpoint(checkpoint);
        state.partial = true;
      }
      state.error = message;
      state.mode = "idle";
      ui.render();
    }
  }

  function resetAfterCancel() {
    if (state.destroyed) return;
    state.mode = state.result ? "results" : "idle";
    state.scanCancelled = false;
    state.scanPaused = false;
    state.error = "";
    if (state.checkpoint && !(state.checkpoint.following.length || state.checkpoint.followers.length)) {
      state.checkpoint = null;
    }
    ui.render();
  }

  function togglePause() {
    state.scanPaused = !state.scanPaused;
    wakeUp();
  }

  function cancelScan() {
    state.scanCancelled = true;
    state.scanPaused = false;
    activeRequest?.abort();
    wakeUp();
  }

  function destroy() {
    state.destroyed = true;
    state.scanCancelled = true;
    state.scanPaused = false;
    activeRequest?.abort();
    wakeUp();
  }

  // Best effort: knowing the totals lets the progress bar show a percentage.
  async function fetchCounts(viewerId, checkpoint) {
    const controller = new AbortController();
    activeRequest = controller;
    try {
      const response = await fetch(`/api/v1/users/${encodeURIComponent(viewerId)}/info/`, {
        credentials: "include",
        headers: FL.IG_HEADERS,
        signal: controller.signal
      });
      if (!response.ok) return;
      const json = await response.json();
      const user = json?.user;
      if (Number.isFinite(user?.following_count)) checkpoint.followingTotal = user.following_count;
      if (Number.isFinite(user?.follower_count)) checkpoint.followersTotal = user.follower_count;
    } catch {
      // Totals are optional; the scan still works without them.
    } finally {
      if (activeRequest === controller) activeRequest = null;
    }
  }

  async function scanList(checkpoint, viewerId, kind) {
    const isFollowing = kind === "following";
    const cursorKey = isFollowing ? "followingCursor" : "followersCursor";
    const total = isFollowing ? checkpoint.followingTotal : checkpoint.followersTotal;
    const label = isFollowing ? "loadingFollowing" : "loadingFollowers";
    const seed = checkpoint[kind];
    const onPage = (results, nextCursor) => {
      checkpoint[kind] = results;
      checkpoint[cursorKey] = nextCursor;
      store.saveCheckpoint(checkpoint);
      state.progress = { current: results.length, total, label, note: visibilityNote() };
      ui.updateProgress();
    };
    state.progress = { current: seed.length, total, label, note: visibilityNote() };
    ui.updateProgress();
    try {
      return await fetchFriendshipList(viewerId, kind, onPage, { cursor: checkpoint[cursorKey], seed });
    } catch (error) {
      if (error?.kind !== "http" || error?.status !== 400 || !checkpoint[cursorKey]) throw error;
      console.warn(`[follow-lens] stored ${kind} cursor was rejected, restarting that list`);
      checkpoint[cursorKey] = "";
      checkpoint[kind] = [];
      return fetchFriendshipList(viewerId, kind, onPage, {});
    }
  }

  async function fetchFriendshipList(viewerId, kind, onPage, options = {}) {
    const results = Array.isArray(options.seed) ? [...options.seed] : [];
    let cursor = options.cursor || "";
    let page = 0;
    const seenCursors = new Set(cursor ? [cursor] : []);
    while (true) {
      if (state.scanPaused) await waitWhile(() => state.scanPaused && !state.scanCancelled);
      if (isStopped()) return dedupe(results);
      const json = await igFetch(friendshipListUrl(viewerId, kind, cursor, state.timings.usersPerRequest));
      if (isStopped()) return dedupe(results);
      if (!Array.isArray(json?.users)) throw new Error(t("scanFailed"));
      if (json.should_limit_list_of_followers === true || json.should_limit_list_of_followings === true) {
        throw scanError("incomplete", t("limitedList"));
      }
      const users = json.users.map(normalizeUser).filter((u) => u.id && u.username);
      results.push(...users);
      const nextCursor = json.next_max_id == null ? "" : String(json.next_max_id);
      const finished = json.has_more === false || !nextCursor;
      if (finished && json.has_more === true && !nextCursor) throw new Error(t("scanFailed"));
      if (!finished && (!users.length || seenCursors.has(nextCursor))) throw new Error(t("scanFailed"));
      onPage(dedupe(results), finished ? "" : nextCursor);
      if (finished) break;
      seenCursors.add(nextCursor);
      cursor = nextCursor;
      page += 1;
      await waitBeforeNextScanPage(page);
    }
    return dedupe(results);
  }

  async function waitBeforeNextScanPage(page) {
    await sleepWithCountdown(randomBetween(FL.SCAN_MICRO_DELAY_MIN, FL.SCAN_MICRO_DELAY_MAX), "scanPause");
    await sleepWithCountdown(randomBetween(state.timings.scanDelayMin, state.timings.scanDelayMax), "scanPause");
    if (state.timings.scanPauseEveryPages > 0 && page % state.timings.scanPauseEveryPages === 0) {
      await sleepWithCountdown(Math.max(
        0,
        state.timings.scanPauseMs + (Math.random() * FL.SCAN_PAUSE_JITTER_MS * 2 - FL.SCAN_PAUSE_JITTER_MS)
      ), "scanPause");
    }
  }

  function friendshipListUrl(viewerId, kind, cursor = "", count = FL.DEFAULT_TIMINGS.usersPerRequest) {
    if (kind !== "following" && kind !== "followers") throw new Error("Unknown friendship list");
    const safeCount = Math.min(200, Math.max(1, Math.round(Number(count) || FL.DEFAULT_TIMINGS.usersPerRequest)));
    const base = `/api/v1/friendships/${encodeURIComponent(viewerId)}/${kind}/?count=${safeCount}`;
    return cursor ? `${base}&max_id=${encodeURIComponent(cursor)}` : base;
  }

  function scanError(kind, message, status) {
    const error = new Error(message);
    error.kind = kind;
    error.status = status;
    return error;
  }

  async function igFetch(url, init = {}) {
    let attempt = 0;
    while (true) {
      if (isStopped()) throw scanError("cancelled", "Scan cancelled");
      let response;
      const controller = new AbortController();
      activeRequest = controller;
      try {
        response = await fetch(url, {
          ...init,
          credentials: "include",
          headers: { ...FL.IG_HEADERS, ...(init.headers || {}) },
          signal: controller.signal
        });
      } catch (error) {
        if (isStopped()) throw scanError("cancelled", "Scan cancelled");
        if (attempt >= FL.MAX_RETRIES) throw scanError("network", t("networkError"), 0);
        await sleepWithCountdown(Math.min(30000, 3000 * Math.pow(2, attempt)), "cooldownIn");
        attempt += 1;
        continue;
      } finally {
        if (activeRequest === controller) activeRequest = null;
      }
      if (isStopped()) throw scanError("cancelled", "Scan cancelled");
      const body = await response.text();
      let json;
      try { json = JSON.parse(body); } catch { }
      const message = json ? String(json.message || json.error_type || "") : body;
      if (response.status === 401 || json?.require_login || /login_required/i.test(message)) {
        throw scanError("session", t("sessionExpired"), response.status);
      }
      if (response.status === 429 || /rate_limit|too many requests|please wait a few minutes/i.test(message)) {
        throw scanError("rate", t("tooManyRequests"), response.status);
      }
      if (response.status === 403 || json?.spam || json?.challenge || json?.checkpoint_url || json?.feedback_required ||
        /feedback_required|checkpoint_required|challenge_required/i.test(message)) {
        throw scanError("blocked", t("scanBlocked"), response.status);
      }
      if (response.status >= 500 && response.status < 600) {
        if (attempt >= FL.MAX_RETRIES) {
          throw scanError("http", t("requestFailed", { status: response.status }), response.status);
        }
        const retryAfter = parseRetryAfter(response.headers?.get?.("retry-after"));
        const wait = retryAfter || Math.min(60000, 5000 * Math.pow(2, attempt));
        await sleepWithCountdown(wait, "cooldownIn");
        attempt += 1;
        continue;
      }
      if (response.ok) {
        if (!json || typeof json !== "object") throw scanError("session", t("sessionExpired"), response.status);
        if (json.status && json.status !== "ok") throw scanError("http", t("scanFailed"), response.status);
        return json;
      }
      throw scanError("http", t("requestFailed", { status: response.status }), response.status);
    }
  }

  function parseRetryAfter(value) {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(value);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return 0;
  }

  function normalizeUser(raw) {
    return {
      id: String(raw.id || raw.pk || raw.pk_id || ""),
      username: String(raw.username || ""),
      full_name: String(raw.full_name || ""),
      profile_pic_url: String(raw.profile_pic_url || raw.profile_pic_url_hd || ""),
      is_verified: Boolean(raw.is_verified),
      is_private: Boolean(raw.is_private)
    };
  }

  function dedupe(list) {
    const seen = new Set();
    return list.filter((u) => {
      if (!u.id || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }

  function interruptibleSleep(ms) {
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const finish = (expired) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (wakeSleep === finish) wakeSleep = null;
        resolve(expired);
      };
      wakeSleep = finish;
      timer = setTimeout(() => finish(true), Math.max(0, ms));
    });
  }

  function wakeUp() {
    if (typeof wakeSleep === "function") wakeSleep(false);
  }

  async function waitWhile(predicate, interval = 1000) {
    while (predicate()) await interruptibleSleep(interval);
  }

  async function sleepWithCountdown(ms, reasonKey) {
    state.waitReason = reasonKey;
    let remaining = Math.max(0, ms);
    while (remaining > 0) {
      if (isStopped()) break;
      if (state.scanPaused) {
        state.waitUntil = 0;
        ui.updateCountdown();
        await waitWhile(() => state.scanPaused && !isStopped());
        continue;
      }
      state.waitUntil = Date.now() + remaining;
      ui.updateCountdown();
      const before = Date.now();
      const expired = await interruptibleSleep(remaining);
      remaining = expired ? 0 : Math.max(0, remaining - (Date.now() - before));
    }
    state.waitUntil = 0;
    state.waitReason = "";
    ui.updateCountdown();
  }

  function visibilityNote() {
    return document.hidden ? t("keepTabVisible") : "";
  }

  // Who doesn't follow back, and who follows the viewer without being followed back.
  function compare(result) {
    if (!result) return { notFollowingBack: [], notFollowedByMe: [] };
    const followerIds = new Set(result.followers.map((u) => String(u.id)));
    const followingIds = new Set(result.following.map((u) => String(u.id)));
    return {
      notFollowingBack: result.following.filter((u) => !followerIds.has(String(u.id))),
      notFollowedByMe: result.followers.filter((u) => !followingIds.has(String(u.id)))
    };
  }

  FL.scanner = { startScan, togglePause, cancelScan, destroy, visibilityNote, compare };
})();
