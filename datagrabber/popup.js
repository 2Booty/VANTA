// VANTA Credential Helper — Popup Script
// Passively captures OnlyFans auth data (cookie, x-bc, user-agent, auth_id)
// and provides one-click copy for pasting into VANTA Settings.
//
// No data leaves the browser. Everything stays in local extension storage
// or the user's clipboard.

const $ = (id) => document.getElementById(id);

function setStatus(state, text) {
  $("status-dot").className = `status-dot ${state}`;
  $("status-text").textContent = text;
}

function showToast(msg = "Copied!") {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast();
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast();
  }
}

function flash(btn) {
  btn.classList.add("copied");
  setTimeout(() => btn.classList.remove("copied"), 1200);
}

function buildCookieString(cookies) {
  return cookies?.length
    ? cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    : "";
}

function extractAuthId(cookies) {
  const c = cookies.find((c) => c.name === "auth_id");
  return c ? c.value : "";
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

let captured = {
  cookie: "",
  x_bc: "",
  user_agent: navigator.userAgent,
  auth_id: "",
};

// ─── Main Capture ───────────────────────────────────────────────────────────

async function capture() {
  setStatus("loading", "Capturing...");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isOF = tab?.url?.includes("onlyfans.com");

  if (!isOF) {
    $("wrong-site").style.display = "block";
    $("capture-ui").style.display = "none";
    setStatus("error", "Not on OnlyFans");
    return;
  }

  $("wrong-site").style.display = "none";
  $("capture-ui").style.display = "block";

  // Cookies
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ domain: ".onlyfans.com" });
  } catch {}

  captured.cookie = buildCookieString(cookies);
  captured.auth_id = extractAuthId(cookies);
  $("val-cookies").value = captured.cookie || "(no cookies)";
  $("cookie-count").textContent = `${cookies.length} cookies`;
  $("val-authid").value = captured.auth_id || "(not found)";

  // x-bc (captured by background service worker)
  try {
    const data = await chrome.storage.local.get(["xbc", "xbc_captured"]);
    if (data.xbc) {
      captured.x_bc = data.xbc;
      $("val-xbc").value = data.xbc;
      if (data.xbc_captured) {
        $("xbc-time").textContent = `Captured ${timeAgo(new Date(data.xbc_captured))}`;
      }
    } else {
      $("val-xbc").value = "(browse OnlyFans to capture)";
      $("xbc-time").textContent = "Not captured yet";
    }
  } catch {
    $("val-xbc").value = "(error)";
  }

  // User-Agent
  $("val-ua").value = captured.user_agent;

  // Status
  const hasCookie = !!captured.cookie;
  const hasXbc = !!captured.x_bc;
  const hasAuthId = !!captured.auth_id;

  if (hasCookie && hasXbc && hasAuthId) {
    setStatus("ok", "All credentials captured");
  } else if (hasCookie && hasXbc) {
    setStatus("ok", "Credentials captured");
  } else if (hasCookie) {
    setStatus("partial", "Cookies OK — browse OF for x-bc");
  } else {
    setStatus("error", "Log in to OnlyFans first");
  }
}

// ─── Events ─────────────────────────────────────────────────────────────────

$("btn-copy-cookies").addEventListener("click", () => {
  copyText(captured.cookie);
  flash($("btn-copy-cookies"));
});

$("btn-copy-xbc").addEventListener("click", () => {
  copyText(captured.x_bc);
  flash($("btn-copy-xbc"));
});

$("btn-copy-ua").addEventListener("click", () => {
  copyText(captured.user_agent);
  flash($("btn-copy-ua"));
});

$("btn-copy-authid").addEventListener("click", () => {
  copyText(captured.auth_id);
  flash($("btn-copy-authid"));
});

$("btn-copy-all").addEventListener("click", () => {
  const payload = JSON.stringify(
    {
      cookie: captured.cookie,
      x_bc: captured.x_bc,
      user_agent: captured.user_agent,
      auth_id: captured.auth_id,
    },
    null,
    2
  );
  copyText(payload);
  flash($("btn-copy-all"));
  showToast("Copied — paste into VANTA Settings");
});

$("btn-refresh").addEventListener("click", () => capture());

// Run on popup open
capture();
