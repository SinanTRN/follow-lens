// Entry point: restores saved state and toggles the panel when the toolbar icon is clicked.
(() => {
  "use strict";

  const FL = globalThis.FollowLens;
  const { state, store, scanner, ui } = FL;

  // Tear down a panel left behind by an earlier copy of these scripts
  // (for example after the extension was reloaded without refreshing the page).
  document.dispatchEvent(new Event(FL.CLEANUP_EVENT));

  function onVisibilityChange() {
    if (state.mode !== "scanning") return;
    state.progress.note = scanner.visibilityNote();
    ui.updateProgress();
  }

  function onMessage(message, _sender, sendResponse) {
    if (message?.type !== "fl-toggle") return;
    ready.then(() => ui.setOpen(!state.open));
    sendResponse({ ok: true });
  }

  function cleanup() {
    scanner.destroy();
    ui.unmount();
    document.removeEventListener(FL.CLEANUP_EVENT, cleanup);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch { }
  }

  async function init() {
    await store.loadSettings();
    const viewerId = FL.getCookie("ds_user_id");
    const [checkpoint, result] = await Promise.all([store.loadCheckpoint(), store.loadLastResult()]);
    if (viewerId && checkpoint?.viewerId === viewerId) state.checkpoint = checkpoint;
    if (viewerId && result?.viewerId === viewerId) {
      state.result = result;
      state.mode = "results";
    }
    ui.render();
  }

  document.addEventListener(FL.CLEANUP_EVENT, cleanup);
  document.addEventListener("visibilitychange", onVisibilityChange);
  chrome.runtime.onMessage.addListener(onMessage);
  const ready = init().catch((error) => console.error("[follow-lens] init failed:", error));
})();
