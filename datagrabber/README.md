# VANTA Credential Helper

A Chrome extension that captures OnlyFans authentication credentials for use with the VANTA desktop client.

## What It Does

When you're logged into OnlyFans and click the extension, it captures:
- **Cookie** — Your session cookie (used for authentication)
- **x-bc** — A header value passively captured from API requests
- **User-Agent** — Your browser's user agent string
- **Auth ID** — Your OnlyFans user ID (extracted from cookies)

Each field has a copy button, or you can click "Copy for VANTA" to copy everything as JSON.

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `datagrabber` folder
6. The VANTA icon will appear in your extensions bar

## Usage

1. Log into [onlyfans.com](https://onlyfans.com) in Chrome
2. Browse a few pages (this triggers API calls so x-bc can be captured)
3. Click the VANTA Credential Helper extension icon
4. Click **Copy for VANTA**
5. Open VANTA Desktop > Settings > Credentials
6. Paste each value into the corresponding field

## Privacy

- No data is sent to any server
- Credentials are stored only in Chrome's local extension storage
- The extension only requests `webRequest`, `cookies`, and `storage` permissions
- Host permissions are limited to `onlyfans.com`
- No analytics, tracking, or external communication

## Permissions Explained

| Permission | Why |
|---|---|
| `webRequest` | Passively captures the `x-bc` header from OF API requests |
| `cookies` | Reads your OnlyFans session cookies |
| `storage` | Temporarily stores the captured `x-bc` value |

## Files

```
datagrabber/
├── manifest.json    # Chrome extension manifest (MV3)
├── background.js    # Service worker — captures x-bc header
├── popup.html       # Extension popup UI
├── popup.css        # Dark theme styles (matches VANTA)
└── popup.js         # Popup logic — captures and copies credentials
```
