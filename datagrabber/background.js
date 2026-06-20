// VANTA Credential Helper — Background Service Worker
// Passively captures the x-bc header from OnlyFans API requests.
// No data is sent anywhere — everything stays in local extension storage.

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;

    for (const h of details.requestHeaders) {
      if (h.name.toLowerCase() === "x-bc" && h.value) {
        chrome.storage.local.set({
          xbc: h.value,
          xbc_captured: new Date().toISOString(),
        });
        break;
      }
    }
  },
  { urls: ["https://onlyfans.com/api2/v2/*", "https://*.onlyfans.com/api2/v2/*"] },
  ["requestHeaders"]
);
