# Detail Ticket Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate the ticket detail screen faithfully to the provided reference while preserving real ticket data and copy actions.

**Architecture:** Keep the static HTML/CSS/JS structure. Replace the current detail markup with a ticket-like layout, rewrite `detail.css` for the reference visual, and update only the DOM bindings in `detail.js` needed by the new structure.

**Tech Stack:** Static HTML, CSS, vanilla JavaScript, Google Fonts, Material Symbols.

---

## File Structure

- Modify `detail.html`: remove topbar, add ticket card markup, decorative QR, chamado/observations card, two-item bottom nav.
- Modify `detail.css`: implement light ticket layout, big ID typography, perforated separator, red accents, bottom nav.
- Modify `detail.js`: populate new element IDs and preserve copy/status/theme behavior.

## Task 1: Replace detail screen markup

**Files:**
- Modify: `detail.html`

- [ ] Replace the body content with a detail page containing: `detail-page`, `ticket-card`, `ticket-site-code`, `detail-location`, `detail-access-type`, `detail-status`, `ticket-access-status`, `detail-chamado`, `copy-chamado-btn`, `detail-obs-section`, `detail-obs`, `detail-id-tbsa`, `detail-id-claro`, `detail-status-dot`, `copy-all-btn`, `theme-check`, `toast`.

- [ ] Keep Material Symbols loaded for icons.

- [ ] Keep `detail.js` loaded at the end.

## Task 2: Rebuild detail CSS faithfully

**Files:**
- Modify: `detail.css`

- [ ] Add page background matching the reference and remove dependency on the old topbar layout.

- [ ] Style `.ticket-card` as a white rounded ticket with large `#ticket-site-code` title, three metadata columns, dotted divider with side cutouts, lower status row, and decorative QR block.

- [ ] Style `.chamado-card` as a white card with red left border, label `EQS TAB`, large chamado number, copy icon, separator, and observations.

- [ ] Style `.detail-bottomnav` as a fixed iOS-like bottom nav with `Consulta` inactive gray and `Detalhe` active red.

## Task 3: Update JS bindings

**Files:**
- Modify: `detail.js`

- [ ] Populate `ticket-site-code` and `detail-id-tbsa` from `data.t`.

- [ ] Populate `detail-location` and `detail-id-claro` from `data.l`.

- [ ] Populate `detail-chamado` from `data.c`.

- [ ] Populate `detail-status`, `detail-status-dot`, and `ticket-access-status` from the existing approved/blocked/vencido logic.

- [ ] Preserve copy-chamado and copy-all actions.

## Task 4: Verification

**Files:**
- Verify: `detail.html`
- Verify: `detail.css`
- Verify: `detail.js`

- [ ] Run required ID check for all new IDs.

- [ ] Serve static app with `python -m http.server 8000` and fetch `detail.html`.

- [ ] Open a sample detail URL or session fallback and verify the visual layout against the reference.

## Self-Review

- Spec coverage: faithful detail screen, decorative QR, real data, copy action, status logic, bottom nav are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: IDs named in HTML are the same IDs referenced in JS verification.
