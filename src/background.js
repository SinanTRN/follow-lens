"use strict";

const INSTAGRAM_URL = "https://www.instagram.com/";
const CONTENT_JS = ["src/core.js", "src/storage.js", "src/scanner.js", "src/unfollow.js", "src/panel.js", "src/content.js"];
const CONTENT_CSS = ["src/panel.css"];

function isInstagram(url) {
  try {
    return new URL(url).hostname === "www.instagram.com";
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !isInstagram(tab.url || "")) {
    await chrome.tabs.create({ url: INSTAGRAM_URL });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "fl-toggle" });
  } catch {
    // The tab was opened before the extension was installed or reloaded,
    // so no content script is listening yet. Inject it and try again.
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: CONTENT_CSS });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_JS });
      await chrome.tabs.sendMessage(tab.id, { type: "fl-toggle" });
    } catch (error) {
      console.error("[follow-lens] could not open the panel:", error);
    }
  }
});
