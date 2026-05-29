# Home Material Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the home screen to match the provided Material/glass reference while preserving the current ticket search behavior.

**Architecture:** Keep the existing static HTML/CSS/JS architecture. Update the home markup only where needed for structure and icon placement, then replace the home stylesheet with a faithful mobile-first visual implementation. Preserve all JavaScript IDs so `app.js` continues to work without logic changes.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, existing assets `fundo.webp` and `logo-eqs.webp`.

---

## File Structure

- Modify `index.html`: add a search input shell with a lupa icon, keep existing IDs, keep hidden dashboard/filter/result containers for search behavior.
- Modify `index.css`: restyle the home page to match the reference: light abstract background, glass card, red CTA, status line, top-right theme toggle, footer logo.
- No planned changes to `app.js`: the existing data fetch, cache, theme, and search logic must remain intact.

## Task 1: Update home markup structure

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the search box markup inside `index.html`**

Replace the current block containing the input, button, and `status-sync` with this structure:

```html
<div class="search-box">
    <label class="search-field" for="search-input">
        <span class="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
                <path d="M9.5 3a6.5 6.5 0 0 1 5.18 10.43l4.45 4.44a1 1 0 0 1-1.42 1.42l-4.44-4.45A6.5 6.5 0 1 1 9.5 3Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z" />
            </svg>
        </span>
        <input type="text" id="search-input" placeholder="Estação, ID ou Chamado" autocomplete="off">
    </label>
    <button id="search-btn" type="button">Consultar Chamado</button>
    <div id="status-sync"></div>
</div>
```

- [ ] **Step 2: Verify required IDs remain present**

Run:

```powershell
Select-String -Path "index.html" -Pattern "theme-check|main-container|search-input|search-btn|status-sync|status-search|dashboard-panel|filters-panel|loading-spinner-container|loading-text|results-list|pwa-install-banner|toast"
```

Expected: each required ID appears in the output.

## Task 2: Recreate the reference visual in CSS

**Files:**
- Modify: `index.css`

- [ ] **Step 1: Apply the new visual system**

Update the beginning of `index.css` with variables for light Material/glass styling:

```css
:root {
    --page-bg: #f4f2ed;
    --card-glass: rgba(255, 255, 255, 0.48);
    --card-border: rgba(255, 255, 255, 0.92);
    --text-main: #252932;
    --text-secondary: #747b84;
    --accent-red: #b5121b;
    --accent-red-dark: #980f17;
    --success: #34b759;
    --shadow-soft: 0 24px 70px rgba(31, 38, 48, 0.16);
    --shadow-button: 0 12px 22px rgba(147, 15, 22, 0.32);
    --radius-card: 18px;
    --radius-control: 10px;
}

.dark-mode {
    --page-bg: #111318;
    --card-glass: rgba(26, 29, 36, 0.62);
    --card-border: rgba(255, 255, 255, 0.16);
    --text-main: #f5f7fb;
    --text-secondary: #b6beca;
    --shadow-soft: 0 24px 70px rgba(0, 0, 0, 0.42);
}
```

- [ ] **Step 2: Style the background and centered hero**

Ensure the page uses `fundo.webp`, a light overlay, a vertically centered `.hero-glass`, and a fixed footer logo. The hero must use a white border, blur, soft shadow, and large centered title matching the reference.

- [ ] **Step 3: Style the search controls**

Ensure `.search-field` is a white rounded input container with a gray search icon, large placeholder, and focus ring. Ensure `button#search-btn` is full-width red, uppercase, bold, rounded, and shadowed. Ensure `#status-sync` is centered green text below the button.

- [ ] **Step 4: Style the theme toggle**

Make the toggle a top-right rounded capsule with sun/moon visual treatment, matching the reference. Keep `#theme-check` hidden and `.toggle-knob` animated.

## Task 3: Preserve result-state components

**Files:**
- Modify: `index.css`

- [ ] **Step 1: Keep search result components readable**

Do not remove working styles for dashboard stats, filter chips, result cards, toast, PWA banner, loading skeletons, status errors, and sync failure messages. If the stylesheet is rewritten, re-add readable styles for these selectors:

```text
.dashboard-panel
.stat-box
.filters-panel
.filter-chip
.results-area
.card
.toast
.pwa-banner
.status-error
.status-sync-fail
.saving-text
.skeleton-glass
```

- [ ] **Step 2: Add mobile spacing**

Add a `@media (max-width: 520px)` block that reduces toggle size, card padding, input height, button height, and footer logo size so the page matches the submitted mobile reference.

## Task 4: Manual verification

**Files:**
- Verify: `index.html`
- Verify: `index.css`
- Verify: `app.js`

- [ ] **Step 1: Serve the static app locally**

Run:

```powershell
python -m http.server 8000
```

Expected: terminal shows a server listening on port 8000.

- [ ] **Step 2: Open the home page**

Open `http://localhost:8000/`.

Expected: home screen visually matches the reference: light abstract background, top-right theme toggle, centered translucent card, large title, white search field with icon, red CTA, green connection text, EQS footer.

- [ ] **Step 3: Verify search still works**

Search for `00358519`.

Expected: search results render and no JavaScript error appears in the browser console.

- [ ] **Step 4: Verify empty search validation**

Clear the field and click `CONSULTAR CHAMADO`.

Expected: the status area shows `Digite algo para buscar.`

- [ ] **Step 5: Verify theme toggle**

Click the top-right theme toggle.

Expected: page switches to dark mode and remains usable; click again returns to light mode.

## Self-Review

- Spec coverage: home-only redesign, faithful visual recreation, no bottom navigation, preserved search IDs, status display, theme toggle, and footer branding are covered by Tasks 1-4.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type/name consistency: all referenced IDs and selectors match the existing HTML/JS or are created in Task 1.
