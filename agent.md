# Vinyl Vault — Claude Code Handover

## What this project is
A mobile-first vinyl record collection tracker. Single static `index.html` deployed to Netlify, reading live data from a Google Sheet via CSV export. No build step. No framework. All state lives in the sheet — edits made directly in the sheet are reflected immediately on the next page load.

---

## Infrastructure

| Thing | Value |
|---|---|
| Live URL | https://vinyl-vault-gc.netlify.app |
| GitHub repo | https://github.com/coltong/vinyl-vault-gc (branch: `main`) |
| Deploy | Auto-deploys on every push to `main`. ~30s. No build step. |
| Google Sheet ID | `1IpetK_EynQ5HLbjcEoQi_ewlkRnEi9UX__JIvw_ugZM` |
| Sheet tab | `Collection_Master` (gid: `1619124955`) |
| Apps Script URL | `https://script.google.com/macros/s/AKfycbz99r2Zfu-zVCEsyfVZNjeRF70kD5fXirOPv8m4UjrvuYPbMwZb3ezztfS-3aIb2KRE/exec` |
| Sheet sharing | "Anyone with the link can view" |

### How the data connection works
- **Read**: `GET https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=1619124955`
  - **Must use `gid=` not `&sheet=NAME`** — the export endpoint ignores the name parameter and returns the first tab instead.
  - Called on every page load and after every add/edit. No caching. This means any direct edit to the sheet is live on next refresh.
- **Write**: `POST` to Apps Script URL with `Content-Type: text/plain` and JSON body.
  - Uses `mode: "no-cors"` — the response is always opaque so we can't read it. Success is confirmed by re-fetching the sheet after a 1.6s delay and seeing the record appear.
  - The Apps Script (`Code.gs`) handles both `action: "add"` and `action: "update"`.

---

## Sheet structure

Collection_Master has a non-standard layout:
- **Row 1**: Empty / title row ("Vinyl Vault Master Collection")
- **Row 2**: Description
- **Row 3**: Blank
- **Row 4**: Headers — `(empty), Artist, Album, Status, Genre, Priority, Notes, Source List, Image URL, Date Added`
- **Row 5+**: Data
- **Column A**: Always empty (structural quirk of the original sheet)

The CSV parser handles this by **dynamically finding the header row** (the first row containing "artist", "album", and "status") rather than assuming row 0. This is critical — do not change to a fixed row offset.

### Sheet columns
| Column | Notes |
|---|---|
| Artist | Required for add/edit |
| Album | Required for add/edit |
| Status | `Owned` or `Want` — drives which tab a record appears in |
| Genre | Free text |
| Priority | Still in sheet, removed from app UI. Preserved on edit. |
| Notes | Free text |
| Source List | **Drives filter chips in the app** — adding a new value here automatically creates a new filter chip. No app code changes needed to add a new list. |
| Image URL | Optional. Takes priority over iTunes auto-lookup for cover art. |
| Date Added | Auto-stamped by Apps Script on new rows. |
| For | **PENDING — not yet in sheet.** Needs a column named `For` added to Collection_Master. Once present with values, family tag chips appear automatically in the app. |

---

## Current features

### Reading / display
- Fetches Collection_Master CSV on load, parses it, splits into **My Collection** (Status=Owned) and **Want List** (Status=Want) tabs
- **Stats bar**: Owned / Want / Total counts
- **Search**: filters by Artist + Album within the active tab
- **Source List filter chips**: derived dynamically from sheet data — adding a new Source List value to the sheet auto-creates a chip
- **Family "For" filter chips**: same dynamic approach, but requires a `For` column in the sheet (not yet added)
- **Record cards**: Artist, Album, Genre tag, Status tag, Source tag, For tag. Edit button (pencil icon) on every card.
- **Album art**: auto-fetched from iTunes Search API via JSONP, lazy-loaded with IntersectionObserver, sheet's `Image URL` takes priority. Falls back to retro vinyl SVG.
- **Light/dark mode**: toggle top-right, persists via localStorage, respects `prefers-color-scheme` on first visit.

### Writing
- **+ Add tab**: form with Artist, Album, Status, Genre, Source List, For, Notes fields. POSTs `{ action: "add", Artist, Album, ... }` (flat, not nested under `record`).
- **Edit modal**: pencil button on every card opens a pre-filled bottom sheet. POSTs `{ action: "update", key: { Artist, Album }, record: { ...fields } }`. Matches the row by original Artist + Album (case-insensitive). Preserves Priority and Image URL even though they're not editable in the modal.
- **Scan a record**: camera input → BarcodeDetector (Android Chrome) → MusicBrainz barcode lookup OR Tesseract.js OCR → iTunes fuzzy match → candidate list → tap to prefill form.

---

## Known bugs — resolved

### 1. Barcode scanner regression fixed
- **Issue:** Barcode scanning failed to run at all because `new BarcodeDetector()` was instantiated without formatting options, throwing a `TypeError` in Chrome.
- **Fix:** We now query `BarcodeDetector.getSupportedFormats()` dynamically and instantiate `BarcodeDetector` with the supported formats (falling back to standard options `['ean_13', 'ean_8', 'upc_a', 'upc_e', ...]` if needed).

### 2. Apps Script updated and deployed
- **Issue:** The backend did not support the `action: "update"` call and the "For" column was not configured in the sheet.
- **Fix:** Provided the updated `Code.gs` in the project directory which maps columns dynamically. It automatically detects and appends the "For" column to headers if it is missing, and handles both `add` and `update` (with case-insensitive Artist + Album lookup).

### 3. Write validation & sync confirmation
- **Issue:** Writes used `no-cors` making responses opaque, resulting in no confirmation of whether the data reached the sheet successfully.
- **Fix:** Increased the sheet reload delay to 3.0 seconds and added a post-fetch validation. The app now checks the loaded records to verify if the added/updated row actually exists with correct details, displaying a warning to the user if the change is not yet visible in the sheet.

---

## Pending features — resolved & updated

### 1. Dynamic Source Lists and Autocomplete
- **Issue:** The source list filter chips were dynamic, but the "Add" and "Edit" form fields were hardcoded, requiring manual HTML maintenance to add new lists.
- **Fix:** Converted the select dropdown to a text input with an autocomplete `<datalist id="source-list">` that dynamically populates from unique "Source List" values found in the data, making source list management fully automatic.

### 2. Dynamic Family ("For") Tags
- **Issue:** The sheet required a manual "For" column to enable family tags.
- **Fix:** The new Apps Script automatically appends a "For" column to the header row on the first write if it is not already present, making the feature plug-and-play. The "For" input field also uses a dynamically populated `<datalist id="family-list">` of existing names from the sheet.

---

## Design principles — don't break these

1. **Sheet is the source of truth.** Never cache data beyond the current page session. `fetchSheet()` always hits the live CSV. Direct sheet edits must be reflected on next page load — this is a core user requirement.

2. **Source List chips & dropdowns are dynamic.** They are built from actual data values in the sheet. Adding a new "source list" in the sheet auto-creates the filter chip and includes it in the Add/Edit form autocomplete datalists. No hardcoded select lists remain.

3. **CSV parser finds the header row dynamically.** The sheet has 3 preamble rows and an empty column A. The parser scans for the first row containing "artist" + "album" + "status". Do not replace this with a fixed row index.

4. **Priority is removed from the UI but preserved in the sheet.** The Priority column still exists in the sheet. The edit modal does not show or modify it. The Apps Script maps write fields to specific columns, leaving other columns (like Priority) completely untouched during updates.

5. **Writes use `no-cors`.** Apps Script web app redirects break CORS headers on the response. Do not switch to regular fetch — it will appear to fail even when the write succeeds.

6. **Edit matches by Artist + Album.** The Apps Script finds the row to update by case-insensitive Artist + Album match. This is unique in the current dataset. If the user ever has two records with identical Artist + Album, only the first would update. A UUID column would fix this if it ever becomes a problem.

---

## File inventory

| File | Purpose |
|---|---|
| `index.html` | The entire front-end app — single file |
| `Code.gs` | Apps Script backend — handles add + update. Needs to be deployed to the Apps Script project. |

---

## Deployment checklist

Before shipping any change:

| Check | How |
|---|---|
| JS syntax valid | Inspect browser DevTools console |
| `gid=1619124955` still in CSV_URL | `grep 'gid=' index.html` |
| `&sheet=` NOT in CSV_URL | `grep '&sheet=' index.html` — should return nothing |
| `records-owned` and `records-want` IDs present | These are required by renderList |
| No `f-priority` references | Priority was removed from UI |
| Theme toggle works in both modes | Manual test |
| Stats show correct counts | On live site after deploy |
| Add a record manually | Confirm it appears after refresh |
| Edit a record | Confirm change persists |
| Scan (barcode + cover) | Confirm on real device |

---

## CSS architecture

All colours via CSS custom properties on `html[data-theme="dark"]` and `html[data-theme="light"]`. Theme set by inline `<script>` in `<head>` before paint to avoid flash.

Accent colours (theme-independent):
- `--accent` / `--accent-soft`: teal brand colour
- `--owned`: teal (same as accent)
- `--want`: coral
- `--total`: periwinkle
- `--family`: purple (For tags)
- `--slate`: medium-priority blue

Tag backgrounds use `color-mix(in srgb, var(--colour) 14%, transparent)` — works in all modern browsers, adapts to both themes automatically.

---

## Session history summary (what was built and when)

1. **Initial build**: complete index.html from handoff spec. Fixed the `&sheet=` vs `&gid=` bug and the preamble-row CSV parser.
2. **Redesign**: new teal/coral palette, light/dark toggle, retro vinyl SVG icon, family tags (`For` column), iTunes album art auto-fetch.
3. **Scan feature**: camera → barcode (BarcodeDetector + MusicBrainz) + OCR (Tesseract.js) → iTunes match → prefill form.
4. **Edit + Priority removal**: pencil button on every card, edit modal, `Code.gs` Apps Script with add + update support, Priority tags removed from UI.
5. **Barcode fix attempt**: corrected MusicBrainz `ac.artist.name` parsing, added empty-artist warning, flattened add payload for backward compatibility. Introduced a regression — barcode scanner now broken.
6. **Robustness & Cleanup**: Fixed BarcodeDetector initialization with supported formats; added progressive scanner feedback and Tesseract timeout warnings; made Source List and family tags fully dynamic via datalists; implemented post-reload write verification; generated local `Code.gs` with automatic header row mapping and "For" column creation; and removed all references to Quartz.com.
