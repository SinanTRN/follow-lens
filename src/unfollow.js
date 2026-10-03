// Single-user unfollow ported from code-ornek.txt, with a persisted rate limit:
// a minimum gap between unfollows, a cooldown every N unfollows and a long lock
// after Instagram reports an action block.
(() => {
  "use strict";

  const FL = globalThis.FollowLens;
  const { state, store, getCookie, randomBetween, t } = FL;

  let limits = { lastAt: 0, count: 0, cooldownUntil: 0, blocked: false };
  let busy = false;
  const ready = store.loadUnfollowLimits().then((saved) => {
    limits = saved;
  });

  // { until, reason }: reason is "blocked" | "cooldown" | "delay" | "busy" | "".
  function status() {
    const now = Date.now();
    if (limits.cooldownUntil > now) return { until: limits.cooldownUntil, reason: limits.blocked ? "blocked" : "cooldown" };
    const delayUntil = limits.lastAt + state.timings.unfollowDelayMin;
    if (delayUntil > now) return { until: delayUntil, reason: "delay" };
    return { until: 0, reason: busy ? "busy" : "" };
  }

  async function unfollow(user) {
    await ready;
    if (busy || status().until) return { ok: false, blocked: false, reason: "busy" };
    const csrf = getCookie("csrftoken");
    if (!csrf) return { ok: false, blocked: false, reason: t("csrfMissing") };
    busy = true;
    let outcome;
    try {
      outcome = await unfollowUser(user.id, csrf);
    } catch (error) {
      outcome = { ok: false, blocked: false, reason: error?.message || "network error" };
    } finally {
      busy = false;
    }
    const now = Date.now();
    if (outcome.ok) {
      if (now - limits.lastAt > state.timings.unfollowPauseMs) limits.count = 0;
      limits.count += 1;
      limits.blocked = false;
      const every = state.timings.unfollowPauseEvery;
      if (every > 0 && limits.count >= every) {
        limits.cooldownUntil = now + state.timings.unfollowPauseMs;
        limits.count = 0;
      }
      removeFromResult(user.id);
    } else if (outcome.blocked) {
      console.warn("[follow-lens] Instagram blocked the unfollow action:", outcome.reason);
      limits.blocked = true;
      limits.count = 0;
      limits.cooldownUntil = now + FL.UNFOLLOW_BLOCK_MS;
    }
    limits.lastAt = now;
    await store.saveUnfollowLimits(limits);
    return outcome;
  }

  function removeFromResult(id) {
    if (!state.result) return;
    state.result = {
      ...state.result,
      following: state.result.following.filter((u) => String(u.id) !== String(id))
    };
    store.saveLastResult(state.result);
  }

  async function unfollowUser(id, csrf) {
    const formHeaders = { "content-type": "application/x-www-form-urlencoded", "x-csrftoken": csrf };
    const attempts = [
      { url: `/api/v1/friendships/destroy/${encodeURIComponent(id)}/`, headers: { ...FL.IG_HEADERS, ...formHeaders } },
      { url: `/web/friendships/${encodeURIComponent(id)}/unfollow/`, headers: formHeaders }
    ];
    let outcome = { ok: false, blocked: false, reason: "" };
    for (let i = 0; i < attempts.length; i += 1) {
      if (i > 0) await new Promise((resolve) => setTimeout(resolve, randomBetween(1200, 2500)));
      if (state.destroyed) return { ok: false, blocked: false, reason: "cancelled" };
      let response;
      try {
        response = await fetch(attempts[i].url, { method: "POST", credentials: "include", headers: attempts[i].headers });
      } catch (error) {
        outcome = { ok: false, blocked: false, reason: error?.message || "network error" };
        continue;
      }
      const text = await response.text().catch(() => "");
      outcome = evaluateUnfollowResponse(response.status, text);
      if (outcome.ok || outcome.blocked) return outcome;
    }
    return outcome;
  }

  function evaluateUnfollowResponse(status, bodyText) {
    const text = typeof bodyText === "string" ? bodyText : "";
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = null; }
    const message = String(payload?.message || "");
    const blockedByPayload = payload?.feedback_required === true || payload?.spam === true || payload?.require_login === true ||
      /feedback_required|checkpoint_required|challenge_required|login_required/i.test(message);
    if (status === 401 || status === 403 || status === 429 || blockedByPayload) {
      return { ok: false, blocked: true, reason: message || `HTTP ${status}` };
    }
    if (status >= 500) return { ok: false, blocked: false, reason: `HTTP ${status}` };
    if (status < 200 || status >= 300) return { ok: false, blocked: false, reason: message || `HTTP ${status}` };
    if (payload === null) return { ok: false, blocked: false, reason: "unexpected response" };
    if (payload.status === "ok" || payload.friendship_status !== undefined) return { ok: true, blocked: false, reason: "" };
    return { ok: false, blocked: false, reason: message || String(payload.status || "unfollow rejected") };
  }

  FL.unfollow = { unfollow, status, ready };
})();
