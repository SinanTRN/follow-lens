// In-page panel UI: shell, drag, minimize pill, scan progress, results with two tabs.
(() => {
  "use strict";

  const FL = globalThis.FollowLens;
  const { state, t, store, escapeHTML, formatCount, formatDate, formatDuration, clamp, APP_ID, PROGRESS_TITLE_ID, PANEL_MARGIN } = FL;
  const escapeAttr = escapeHTML;

  const SVG = {
    minimize: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3" y="7.25" width="10" height="1.5" rx="0.75" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    gear: '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm6.7 2.5a6.7 6.7 0 0 0-.1-1.1l1.4-1.1-1.5-2.6-1.7.7a6.6 6.6 0 0 0-1.9-1.1L10.5 1h-3l-.4 1.8a6.6 6.6 0 0 0-1.9 1.1l-1.7-.7L1.9 5.8 3.3 6.9a6.7 6.7 0 0 0 0 2.2L1.9 10.2l1.5 2.6 1.7-.7a6.6 6.6 0 0 0 1.9 1.1L7.5 15h3l.4-1.8a6.6 6.6 0 0 0 1.9-1.1l1.7.7 1.5-2.6-1.4-1.1c.1-.4.1-.7.1-1.1z"/></svg>',
    open: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6 3h7v7M13 3L6.5 9.5M9 13H3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6L12 2zm6 11l1 2.8L22 17l-3 .8L18 21l-1-3.2L14 17l3-1.2 1-2.8z"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path fill="currentColor" d="M12 2 1 21h22L12 2zm0 6 7.5 13h-15L12 8zm-1 4v4h2v-4h-2zm0 5v2h2v-2h-2z"/></svg>',
    check: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M14 4.5L6 12.5l-4-4L3 7.5l3 3 7-7z"/></svg>'
  };

  let countdownTimer = null;
  let toastTimer = null;
  let closeActiveDialog = null;
  let unfollowTimer = null;
  let armed = null; // { id, button, timer } for the unfollow button awaiting its second click
  let comparedFor = null;
  let compared = { notFollowingBack: [], notFollowedByMe: [] };

  function getRoot() {
    return document.getElementById(APP_ID);
  }

  function mount() {
    if (getRoot()) return;
    const root = document.createElement("div");
    root.id = APP_ID;
    document.body.appendChild(root);
  }

  function unmount() {
    stopCountdown();
    stopUnfollowTimer();
    closeActiveDialog?.();
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    getRoot()?.remove();
  }

  function setOpen(value) {
    state.open = Boolean(value);
    store.saveSettings();
    render();
  }

  function render() {
    if (state.destroyed) return;
    if (!state.open) {
      unmount();
      return;
    }
    mount();
    const root = getRoot();
    if (state.minimized) {
      stopCountdown();
      stopUnfollowTimer();
      root.innerHTML = `
        <button class="fl-pill" data-action="expand" type="button" aria-label="${escapeAttr(t("expand"))}">
          <span class="fl-pill-dot ${pillStateClass()}"></span>
          <span data-pill-label>${escapeHTML(pillLabel())}</span>
        </button>`;
      root.querySelector("[data-action='expand']").addEventListener("click", () => setMinimized(false));
      applyPanelPosition();
      return;
    }
    root.innerHTML = `
      <section class="fl-panel" role="dialog" aria-label="${escapeAttr(t("title"))}">
        <header class="fl-header" data-drag>
          <div class="fl-brand">
            <span class="fl-brand-dot"></span>
            <div class="fl-brand-text">
              <strong>${escapeHTML(t("title"))}</strong>
              <span>v${FL.VERSION} · ${escapeHTML(t("subtitle"))}</span>
            </div>
          </div>
          <div class="fl-header-actions">
            <button type="button" data-action="settings" aria-label="${escapeAttr(t("settings"))}" title="${escapeAttr(t("settings"))}">${SVG.gear}</button>
            <button type="button" data-action="language" aria-label="${escapeAttr(t("langSwitch"))}" title="${escapeAttr(t("langSwitch"))}"><span aria-hidden="true">${escapeHTML(t("langCode"))}</span></button>
            <button type="button" data-action="minimize" aria-label="${escapeAttr(t("minimize"))}" title="${escapeAttr(t("minimize"))}">${SVG.minimize}</button>
            <button type="button" data-action="close" aria-label="${escapeAttr(t("close"))}" title="${escapeAttr(t("close"))}">${SVG.close}</button>
          </div>
        </header>
        <div class="fl-body" data-body></div>
      </section>`;
    root.querySelector("[data-action='close']").addEventListener("click", () => setOpen(false));
    root.querySelector("[data-action='minimize']").addEventListener("click", () => setMinimized(true));
    root.querySelector("[data-action='settings']").addEventListener("click", showSettings);
    root.querySelector("[data-action='language']").addEventListener("click", toggleLanguage);
    bindDrag(root.querySelector("[data-drag]"));
    applyPanelPosition();
    renderBody();
  }

  function renderBody() {
    const body = document.querySelector(`#${APP_ID} [data-body]`);
    if (!body) return;
    stopUnfollowTimer();
    disarm();
    if (state.mode === "scanning") {
      body.innerHTML = renderScanView();
      bindScan(body);
      startCountdown();
      return;
    }
    stopCountdown();
    if (state.mode === "results" && state.result) {
      body.innerHTML = renderResultsView();
      bindResults(body);
    } else {
      body.innerHTML = renderIdleView();
      bindIdle(body);
    }
  }

  function setMinimized(value) {
    state.minimized = Boolean(value);
    store.saveSettings();
    render();
  }

  function toggleLanguage() {
    state.language = state.language === "tr" ? "en" : "tr";
    store.saveSettings();
    render();
  }

  function pillLabel() {
    if (state.mode === "scanning") return t("pillScanning", { current: progressCounter(state.progress.current, state.progress.total) });
    if (state.mode === "results" && state.result) return t("pillResults", { a: formatCount(getCompared().notFollowingBack.length) });
    return t("pillIdle");
  }

  function pillStateClass() {
    if (state.mode === "scanning") return "fl-pill-dot--active";
    if (state.error) return "fl-pill-dot--error";
    return "";
  }

  // ---------- Position & drag ----------

  function applyPanelPosition() {
    const root = getRoot();
    const node = root?.querySelector(".fl-panel") || root?.querySelector(".fl-pill");
    if (!node) return;
    const pos = state.panelPos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      const max = panelBounds(node);
      node.style.left = clamp(pos.x, 0, max.x) + "px";
      node.style.top = clamp(pos.y, 0, max.y) + "px";
      node.style.right = "auto";
      node.style.bottom = "auto";
    } else {
      node.style.left = "auto";
      node.style.top = "auto";
      node.style.right = PANEL_MARGIN + "px";
      node.style.bottom = PANEL_MARGIN + "px";
    }
  }

  function panelBounds(node) {
    const rect = node.getBoundingClientRect();
    return { x: Math.max(0, window.innerWidth - rect.width), y: Math.max(0, window.innerHeight - rect.height) };
  }

  function bindDrag(handle) {
    const panel = handle?.closest(".fl-panel");
    if (!panel) return;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    let dragging = false;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = true;
      const rect = panel.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      startX = event.clientX;
      startY = event.clientY;
      panel.style.left = originX + "px";
      panel.style.top = originY + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      handle.setPointerCapture(event.pointerId);
      handle.classList.add("fl-dragging");
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const max = panelBounds(panel);
      panel.style.left = clamp(originX + (event.clientX - startX), 0, max.x) + "px";
      panel.style.top = clamp(originY + (event.clientY - startY), 0, max.y) + "px";
    });
    const stop = (event) => {
      if (!dragging) return;
      dragging = false;
      handle.releasePointerCapture?.(event.pointerId);
      handle.classList.remove("fl-dragging");
      const rect = panel.getBoundingClientRect();
      state.panelPos = { x: rect.left, y: rect.top };
      store.saveSettings();
    };
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  // ---------- Idle / error ----------

  function checkpointCounts(checkpoint) {
    return { following: formatCount(checkpoint.following.length), followers: formatCount(checkpoint.followers.length) };
  }

  function resumeActionsHTML() {
    return `
      <div class="fl-welcome-actions">
        <button type="button" class="fl-btn fl-btn--primary fl-btn--lg" data-action="resume-scan">${escapeHTML(t("resumeScan"))}</button>
        <button type="button" class="fl-btn fl-btn--ghost" data-action="restart-scan">${escapeHTML(t("startOver"))}</button>
      </div>`;
  }

  function backToResultsHTML() {
    return state.result
      ? `<button type="button" class="fl-btn fl-btn--ghost" data-action="back-results">${escapeHTML(t("goBack"))}</button>`
      : "";
  }

  function renderIdleView() {
    const checkpoint = state.checkpoint;
    if (state.error) {
      return `
        <div class="fl-welcome">
          <div class="fl-welcome-icon fl-welcome-icon--error">${SVG.alert}</div>
          <h2>${escapeHTML(t("scanFailed"))}</h2>
          <p>${escapeHTML(state.error)}</p>
          ${checkpoint ? `<p>${escapeHTML(t("partialBody", checkpointCounts(checkpoint)))}</p>${resumeActionsHTML()}`
            : `<button type="button" class="fl-btn fl-btn--primary" data-action="scan">${escapeHTML(t("retry"))}</button>`}
          ${backToResultsHTML()}
        </div>`;
    }
    if (checkpoint) {
      return `
        <div class="fl-welcome">
          <div class="fl-welcome-icon">${SVG.sparkle}</div>
          <h2>${escapeHTML(t("welcomeTitle"))}</h2>
          <p>${escapeHTML(t("resumeHint", checkpointCounts(checkpoint)))}</p>
          ${checkpoint.stopReason ? `<p>${escapeHTML(checkpoint.stopReason)}</p>` : ""}
          ${resumeActionsHTML()}
          ${backToResultsHTML()}
        </div>`;
    }
    return `
      <div class="fl-welcome">
        <div class="fl-welcome-icon">${SVG.sparkle}</div>
        <h2>${escapeHTML(t("welcomeTitle"))}</h2>
        <p>${escapeHTML(t("welcomeBody"))}</p>
        <p>${escapeHTML(t("scanNotice"))}</p>
        <button type="button" class="fl-btn fl-btn--primary fl-btn--lg" data-action="scan">${escapeHTML(t("scanBtn"))}</button>
        ${backToResultsHTML()}
      </div>`;
  }

  function bindIdle(body) {
    body.querySelector("[data-action='scan']")?.addEventListener("click", () => FL.scanner.startScan());
    body.querySelector("[data-action='back-results']")?.addEventListener("click", () => {
      state.error = "";
      state.mode = "results";
      renderBody();
    });
    bindScanResume(body);
  }

  function bindScanResume(body) {
    body.querySelector("[data-action='resume-scan']")?.addEventListener("click", () => FL.scanner.startScan({ resume: true }));
    body.querySelector("[data-action='restart-scan']")?.addEventListener("click", async () => {
      await store.clearCheckpoint();
      FL.scanner.startScan();
    });
  }

  // ---------- Scanning ----------

  function progressCounter(current, total) {
    if (total) return t("ofTotal", { current: formatCount(current), total: formatCount(total) });
    return t("ofUnknown", { current: formatCount(current) });
  }

  function progressPercent(current, total) {
    return total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  }

  function renderScanView() {
    const { current, total, label, note } = state.progress;
    const percent = progressPercent(current, total);
    const counter = progressCounter(current, total);
    const now = total ? ` aria-valuenow="${percent}"` : "";
    return `
      <div class="fl-progress">
        <div class="fl-progress-head">
          <h2 id="${PROGRESS_TITLE_ID}" data-progress-label>${escapeHTML(state.scanPaused ? t("paused") : t(label))}</h2>
          <p data-progress-note>${escapeHTML(note)}</p>
        </div>
        <div class="fl-bar" role="progressbar" aria-labelledby="${PROGRESS_TITLE_ID}" aria-valuemin="0" aria-valuemax="100"${now} aria-valuetext="${escapeAttr(counter)}" data-bar>
          <span data-progress-bar style="width:${percent}%"></span>
        </div>
        <div class="fl-progress-meta">
          <span data-progress-counter>${escapeHTML(counter)}</span>
          <span data-countdown class="fl-muted"></span>
        </div>
        <div class="fl-progress-actions">
          <button type="button" class="fl-btn" data-action="pause-scan">${escapeHTML(t(state.scanPaused ? "resume" : "pause"))}</button>
          <button type="button" class="fl-btn fl-btn--ghost" data-action="cancel-scan">${escapeHTML(t("cancel"))}</button>
        </div>
      </div>`;
  }

  function bindScan(body) {
    body.querySelector("[data-action='pause-scan']").addEventListener("click", (event) => {
      FL.scanner.togglePause();
      event.currentTarget.textContent = t(state.scanPaused ? "resume" : "pause");
      updateProgress();
    });
    body.querySelector("[data-action='cancel-scan']").addEventListener("click", () => FL.scanner.cancelScan());
  }

  function updateProgress() {
    updatePill();
    const root = document.querySelector(`#${APP_ID} [data-body]`);
    if (!root) return;
    const { current, total, label, note } = state.progress;
    const percent = progressPercent(current, total);
    const counter = progressCounter(current, total);
    const bar = root.querySelector("[data-progress-bar]");
    if (bar) bar.style.width = percent + "%";
    const box = root.querySelector("[data-bar]");
    if (box) {
      if (total) box.setAttribute("aria-valuenow", String(percent));
      else box.removeAttribute("aria-valuenow");
      box.setAttribute("aria-valuetext", counter);
    }
    const counterEl = root.querySelector("[data-progress-counter]");
    if (counterEl) counterEl.textContent = counter;
    const labelEl = root.querySelector("[data-progress-label]");
    if (labelEl) labelEl.textContent = state.scanPaused ? t("paused") : t(label);
    const noteEl = root.querySelector("[data-progress-note]");
    if (noteEl) noteEl.textContent = note || "";
  }

  function updatePill() {
    if (!state.minimized) return;
    const el = document.querySelector(`#${APP_ID} [data-pill-label]`);
    if (el) el.textContent = pillLabel();
  }

  function startCountdown() {
    if (countdownTimer) return;
    countdownTimer = setInterval(updateCountdown, 500);
  }

  function stopCountdown() {
    if (!countdownTimer) return;
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  function updateCountdown() {
    const node = document.querySelector(`#${APP_ID} [data-countdown]`);
    if (!node) return;
    if (!state.waitUntil) {
      node.textContent = "";
      return;
    }
    const seconds = Math.max(0, Math.ceil((state.waitUntil - Date.now()) / 1000));
    node.textContent = t(state.waitReason || "cooldownIn", { seconds });
  }

  // ---------- Results ----------

  function getCompared() {
    if (comparedFor !== state.result) {
      compared = FL.scanner.compare(state.result);
      comparedFor = state.result;
    }
    return compared;
  }

  function getDisplayUsers() {
    const query = state.search.trim().toLowerCase();
    return getCompared()[state.tab]
      .filter((u) => state.filters.verified || !u.is_verified)
      .filter((u) => state.filters.private || !u.is_private)
      .filter((u) => !query || (u.username + " " + (u.full_name || "")).toLowerCase().includes(query))
      .sort((a, b) => a.username.localeCompare(b.username));
  }

  function renderResultsView() {
    const { notFollowingBack, notFollowedByMe } = getCompared();
    const result = state.result;
    const checkpoint = state.checkpoint;
    return `
      <div class="fl-results">
        <div class="fl-results-summary">
          <div class="fl-results-stats">
            <span data-stats>${escapeHTML(statsText())}</span>
            <span class="fl-muted">${escapeHTML(t("lastScan", { date: formatDate(result.scannedAt) }))}</span>
          </div>
          <button type="button" class="fl-btn fl-btn--small" data-action="rescan">${escapeHTML(t("rescan"))}</button>
        </div>
        ${checkpoint ? `
          <div class="fl-notice" role="status">
            <strong>${escapeHTML(t("partialTitle"))}</strong>
            <p>${escapeHTML(t("partialBody", checkpointCounts(checkpoint)))}</p>
            ${checkpoint.stopReason ? `<p class="fl-notice-reason">${escapeHTML(checkpoint.stopReason)}</p>` : ""}
            <div class="fl-notice-actions">
              <button type="button" class="fl-btn fl-btn--primary fl-btn--small" data-action="resume-scan">${escapeHTML(t("resumeScan"))}</button>
              <button type="button" class="fl-btn fl-btn--ghost fl-btn--small" data-action="restart-scan">${escapeHTML(t("startOver"))}</button>
            </div>
          </div>` : ""}
        <div class="fl-tabs" role="tablist">
          ${tabButton("notFollowingBack", t("tabNotFollowingBack"), notFollowingBack.length)}
          ${tabButton("notFollowedByMe", t("tabNotFollowedByMe"), notFollowedByMe.length)}
        </div>
        <div class="fl-search-row">
          <input class="fl-search" type="search" data-search placeholder="${escapeAttr(t("search"))}" value="${escapeAttr(state.search)}" autocomplete="off" spellcheck="false">
        </div>
        <div class="fl-filters">
          ${filterChip("verified", t("filterVerified"))}
          ${filterChip("private", t("filterPrivate"))}
        </div>
        ${state.tab === "notFollowingBack" ? `<div class="fl-unfollow-status" data-unfollow-status hidden></div>` : ""}
        <div class="fl-list" data-list>${renderUserList()}</div>
      </div>`;
  }

  function tabButton(key, label, count) {
    const active = state.tab === key;
    return `
      <button type="button" class="fl-tab ${active ? "fl-tab--on" : ""}" role="tab" aria-selected="${active}" data-tab="${key}">
        ${escapeHTML(label)} <span class="fl-tab-count">${escapeHTML(formatCount(count))}</span>
      </button>`;
  }

  function filterChip(key, label) {
    const active = state.filters[key];
    return `
      <button type="button" class="fl-chip ${active ? "fl-chip--on" : ""}" data-filter="${key}" aria-pressed="${active}">
        <span class="fl-chip-tick">${active ? SVG.check : ""}</span>
        ${escapeHTML(label)}
      </button>`;
  }

  function renderUserList() {
    if (!getCompared()[state.tab].length) {
      const key = state.tab === "notFollowingBack" ? "emptyNotFollowingBack" : "emptyNotFollowedByMe";
      return `<div class="fl-list-empty">${escapeHTML(t(key))}</div>`;
    }
    const display = getDisplayUsers();
    if (!display.length) return `<div class="fl-list-empty">${escapeHTML(t("noMatches"))}</div>`;
    return display.map(renderUserRow).join("");
  }

  function renderUserRow(user) {
    const tags = [];
    if (user.is_verified) tags.push(`<span class="fl-tag fl-tag--accent">${escapeHTML(t("filterVerified"))}</span>`);
    if (user.is_private) tags.push(`<span class="fl-tag">${escapeHTML(t("filterPrivate"))}</span>`);
    const href = `https://www.instagram.com/${encodeURIComponent(user.username)}/`;
    const unfollowButton = state.tab === "notFollowingBack"
      ? `<button type="button" class="fl-unfollow" data-unfollow="${escapeAttr(user.id)}">${escapeHTML(t("unfollow"))}</button>`
      : "";
    return `
      <div class="fl-row" data-row="${escapeAttr(user.id)}">
        <a class="fl-row-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(t("openProfile"))}">
          <img class="fl-avatar" src="${escapeAttr(user.profile_pic_url || "")}" alt="" loading="lazy">
          <div class="fl-row-text">
            <div class="fl-row-name"><span class="fl-row-username">@${escapeHTML(user.username)}</span>${tags.join("")}</div>
            <div class="fl-row-sub">${escapeHTML(user.full_name || "")}</div>
          </div>
          <span class="fl-row-open">${SVG.open}</span>
        </a>
        ${unfollowButton}
      </div>`;
  }

  function statsText() {
    return t("stats", { following: formatCount(state.result.following.length), followers: formatCount(state.result.followers.length) });
  }

  function bindResults(body) {
    const list = body.querySelector("[data-list]");
    // Instagram's own inline handlers are blocked by its CSP, so hide broken avatars here.
    list.addEventListener("error", (event) => {
      if (event.target.tagName === "IMG") event.target.style.visibility = "hidden";
    }, true);
    // Keep Instagram's SPA router away from our links; the browser still opens the new tab.
    list.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = event.target.closest("[data-unfollow]");
      if (button) onUnfollowClick(button, body);
    });

    body.querySelector("[data-search]").addEventListener("input", (event) => {
      state.search = event.target.value;
      disarm();
      list.innerHTML = renderUserList();
      updateUnfollowStatus();
    });
    if (state.tab === "notFollowingBack") {
      updateUnfollowStatus();
      unfollowTimer = setInterval(updateUnfollowStatus, 500);
    }
    body.querySelectorAll("[data-tab]").forEach((el) => {
      el.addEventListener("click", () => {
        state.tab = el.getAttribute("data-tab");
        store.saveSettings();
        renderBody();
      });
    });
    body.querySelectorAll("[data-filter]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-filter");
        state.filters[key] = !state.filters[key];
        store.saveSettings();
        renderBody();
      });
    });
    body.querySelector("[data-action='rescan']").addEventListener("click", async () => {
      await store.clearCheckpoint();
      FL.scanner.startScan();
    });
    bindScanResume(body);
  }

  // ---------- Unfollow ----------

  // First click arms the button ("Sure?"), a second click within UNFOLLOW_ARM_MS unfollows.
  async function onUnfollowClick(button, body) {
    if (button.disabled) return;
    const id = button.getAttribute("data-unfollow");
    if (armed?.id !== id) {
      disarm();
      button.classList.add("fl-unfollow--armed");
      button.textContent = t("unfollowConfirm");
      armed = { id, button, timer: setTimeout(disarm, FL.UNFOLLOW_ARM_MS) };
      return;
    }
    disarm();
    const user = state.result?.following.find((u) => String(u.id) === id);
    if (!user) return;
    button.classList.add("fl-unfollow--pending");
    button.textContent = "…";
    const request = FL.unfollow.unfollow(user);
    updateUnfollowStatus();
    const outcome = await request;
    if (outcome.ok) {
      toast(t("unfollowDone", { username: user.username }));
      removeRow(body, id);
    } else {
      button.classList.remove("fl-unfollow--pending");
      button.textContent = t("unfollow");
      if (outcome.reason !== "busy") toast(t("unfollowFailed", { reason: outcome.reason || "?" }));
    }
    updateUnfollowStatus();
  }

  function disarm() {
    if (!armed) return;
    clearTimeout(armed.timer);
    armed.button.classList.remove("fl-unfollow--armed");
    armed.button.textContent = t("unfollow");
    armed = null;
  }

  // Update in place so the list keeps its scroll position.
  function removeRow(body, id) {
    const list = body.querySelector("[data-list]");
    list?.querySelector(`[data-row="${CSS.escape(id)}"]`)?.remove();
    if (list && !list.querySelector("[data-row]")) list.innerHTML = renderUserList();
    const { notFollowingBack, notFollowedByMe } = getCompared();
    const counts = { notFollowingBack: notFollowingBack.length, notFollowedByMe: notFollowedByMe.length };
    body.querySelectorAll("[data-tab]").forEach((tab) => {
      const count = tab.querySelector(".fl-tab-count");
      if (count) count.textContent = formatCount(counts[tab.getAttribute("data-tab")]);
    });
    const stats = body.querySelector("[data-stats]");
    if (stats) stats.textContent = statsText();
    updatePill();
  }

  function updateUnfollowStatus() {
    const body = document.querySelector(`#${APP_ID} [data-body]`);
    const node = body?.querySelector("[data-unfollow-status]");
    if (!node) return;
    const { until, reason } = FL.unfollow.status();
    const time = formatDuration(until - Date.now());
    let text = "";
    if (reason === "blocked") text = t("unfollowBlocked", { time });
    else if (reason === "cooldown") text = t("unfollowCooldown", { time });
    else if (reason === "delay") text = t("unfollowNextIn", { time });
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle("fl-unfollow-status--blocked", reason === "blocked");
    const locked = Boolean(until) || reason === "busy";
    body.querySelectorAll("[data-unfollow]").forEach((button) => {
      button.disabled = locked || button.classList.contains("fl-unfollow--pending");
    });
  }

  function stopUnfollowTimer() {
    if (!unfollowTimer) return;
    clearInterval(unfollowTimer);
    unfollowTimer = null;
  }

  // ---------- Settings dialog ----------

  function showSettings() {
    const fields = [
      ["scanDelayMin", "minScanDelay", 100, 0],
      ["scanDelayMax", "maxScanDelay", 100, 0],
      ["scanPauseEveryPages", "scanPauseEvery", 1, 0],
      ["scanPauseMs", "scanPauseLength", 1000, 0],
      ["usersPerRequest", "usersPerRequest", 1, 1, 200],
      ["unfollowDelayMin", "minUnfollowDelay", 1000, 0],
      ["unfollowPauseEvery", "unfollowPauseEvery", 1, 0],
      ["unfollowPauseMs", "unfollowPauseLength", 1000, 0]
    ];
    const formHTML = fields.map(([key, label, step, min, max]) => `
      <label class="fl-field">
        <span>${escapeHTML(t(label))}</span>
        <input type="number" min="${min}"${max ? ` max="${max}"` : ""} step="${step}" data-setting="${key}" value="${Number(state.timings[key])}">
      </label>`).join("");
    showDialog({
      title: t("settingsTitle"),
      body: t("settingsBody"),
      contentHTML: `<div class="fl-form">${formHTML}</div>`,
      confirmLabel: t("save"),
      extraButton: { label: t("restoreDefaults") },
      onConfirm: (dialog) => {
        dialog.querySelectorAll("[data-setting]").forEach((input) => {
          const key = input.getAttribute("data-setting");
          const val = Number(input.value);
          const min = Number(input.min || 0);
          const max = input.max ? Number(input.max) : Infinity;
          if (Number.isFinite(val) && val >= min && val <= max) state.timings[key] = val;
        });
        store.saveSettings();
        toast(t("saved"));
      },
      onExtra: (dialog) => {
        dialog.querySelectorAll("[data-setting]").forEach((input) => {
          input.value = FL.DEFAULT_TIMINGS[input.getAttribute("data-setting")];
        });
      }
    });
  }

  function showDialog({ title, body, contentHTML, confirmLabel, extraButton, onConfirm, onExtra }) {
    const root = getRoot();
    if (!root) return;
    closeActiveDialog?.();
    const previouslyFocused = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "fl-overlay";
    overlay.innerHTML = `
      <div class="fl-dialog" role="dialog" aria-modal="true" aria-labelledby="fl-dialog-title" tabindex="-1">
        <h3 id="fl-dialog-title">${escapeHTML(title)}</h3>
        ${body ? `<p>${escapeHTML(body)}</p>` : ""}
        ${contentHTML || ""}
        <div class="fl-dialog-actions">
          ${extraButton ? `<button type="button" class="fl-btn fl-btn--ghost fl-btn--small" data-extra>${escapeHTML(extraButton.label)}</button>` : ""}
          <button type="button" class="fl-btn fl-btn--small" data-cancel>${escapeHTML(t("cancel"))}</button>
          <button type="button" class="fl-btn fl-btn--small fl-btn--primary" data-confirm>${escapeHTML(confirmLabel)}</button>
        </div>
      </div>`;
    root.appendChild(overlay);
    const dialog = overlay.querySelector(".fl-dialog");
    const close = () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (closeActiveDialog === close) closeActiveDialog = null;
      overlay.remove();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    closeActiveDialog = close;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.querySelector("[data-cancel]").addEventListener("click", close);
    overlay.querySelector("[data-confirm]").addEventListener("click", () => {
      try {
        onConfirm?.(dialog);
      } finally {
        close();
      }
    });
    if (extraButton && onExtra) overlay.querySelector("[data-extra]").addEventListener("click", () => onExtra(dialog));
    (dialog.querySelector("input") || dialog).focus();
  }

  // ---------- Toast ----------

  function toast(message) {
    const root = getRoot();
    if (!root) return;
    root.querySelector(".fl-toast")?.remove();
    if (toastTimer) clearTimeout(toastTimer);
    const node = document.createElement("div");
    node.className = "fl-toast";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    node.textContent = message;
    root.appendChild(node);
    toastTimer = setTimeout(() => {
      node.remove();
      toastTimer = null;
    }, 3500);
  }

  FL.ui = { render, unmount, setOpen, updateProgress, updateCountdown, toast };
})();
