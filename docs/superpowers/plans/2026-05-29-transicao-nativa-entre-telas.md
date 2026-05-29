# Transição Nativa entre Telas (View Transitions API) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-document View Transitions between `index.html` and `detail.html` with a subtle card→ticket morph echo on the site-code number.

**Architecture:** CSS-only approach using the View Transitions API. `@view-transition { navigation: auto; }` enables cross-document transitions. Two keyframe sets handle: (1) the overall page fade/scale between pages, and (2) a subtle scale-up of `.ticket-site-code` on the detail page as a narrative echo of the card that was clicked. All animation respects `prefers-reduced-motion` via existing CSS.

**Tech Stack:** CSS View Transitions API — no JS, no SPA conversion, no new dependencies.

**Design doc:** `docs/superpowers/specs/2026-05-29-transicao-nativa-entre-telas-design.md`

---

### Task 1: Add cross-document View Transitions to index.css

**Files:**
- Modify: `index.css` (after line 961, append new block)
- Verify: CSS syntax, View Transitions API support

`index.css` is loaded on both pages via `<link>`, so the `@view-transition` rule and `::view-transition-old/new(root)` keyframes will be available on both pages. The existing `@media (prefers-reduced-motion: reduce)` block at line 954 already handles motion reduction.

- [ ] **Step 1: Append @view-transition and animation keyframes to index.css**

Add at the **end** of `index.css` (after line 961):

```css
/* ════════════════════════════════════════
   View Transitions API — cross-document
   ════════════════════════════════════════ */

@view-transition {
    navigation: auto;
}

/* fade + scale out on leaving page */
::view-transition-old(root) {
    animation: 200ms ease-out both viewOut;
}

/* fade + translate in on entering page */
::view-transition-new(root) {
    animation: 300ms ease-out both viewIn;
}

@keyframes viewOut {
    to {
        opacity: 0;
        transform: scale(0.98);
    }
}

@keyframes viewIn {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
}
```

- [ ] **Step 2: Verify file is valid CSS**

Run: `Get-Content -LiteralPath "index.css" | Select-Object -Last 30`
Expected output: shows the new block starting with `/* ════════ View Transitions API ════════ */`

---

### Task 2: Add site-code grow animation to detail.css

**Files:**
- Modify: `detail.css` (append after line 677)

When the detail page loads, `.ticket-site-code` starts at scale(0.85) and grows to scale(1) — a subtle visual echo of the card that was clicked on the index page.

**Why no `view-transition-name`:** The element stays part of the root view-transition group, so it fades/translates with the rest of the page. The CSS animation starts from `scale(0.85)` when the page renders; the view transition snapshot captures this initial state. After the 300ms root transition finishes, the actual element is revealed mid-grow (~0.94→1 over the remaining 200ms) — a natural, seamless effect.

- [ ] **Step 1: Append site-code grow animation to detail.css**

Add at the **end** of `detail.css` (after line 677):

```css
/* ════════════════════════════════════════
   Subtle card→ticket echo — site-code growth
   ════════════════════════════════════════ */

.ticket-site-code {
    animation: siteCodeGrow 500ms ease-out both;
}

@keyframes siteCodeGrow {
    from {
        transform: scale(0.85);
        opacity: 0.9;
    }
}
```

- [ ] **Step 2: Verify file is valid CSS**

Run: `Get-Content -LiteralPath "detail.css" | Select-Object -Last 15`
Expected output: shows the new block starting with `/* ════════ View Transitions ════════ */`

---

### Task 3: Verify locally

**Files:** None — just browser testing.

- [ ] **Step 1: Check server is running**

Run: `try { $r=Invoke-WebRequest -Uri "http://127.0.0.1:8080/index.html" -UseBasicParsing -TimeoutSec 5; "HTTP $($r.StatusCode) - OK" } catch { "SERVER PARADO, start with: python -m http.server 8080" }`

Expected: "HTTP 200 - OK"

- [ ] **Step 2: Open in browser and test navigation**

Navigate to `http://127.0.0.1:8080/`, search a valid query, click a result card, observe animation. Then click "Voltar" or browser back and observe reverse animation.

**Acceptance criteria** (manual check):
- [ ] Page fades out with slight scale(0.98) when navigating to detail
- [ ] Detail page fades in from translateY(12px)
- [ ] The large site-code number on the ticket grows subtly from 0.85→1 scale
- [ ] Reverse navigation (back to index) is equally smooth
- [ ] No errors in browser console
- [ ] On a browser *without* View Transitions support (e.g. older Safari/Firefox), pages load normally with no error or flash

---

### Task 4: Commit

- [ ] **Step 1: Review changes**

Run: `git diff --stat`
Expected: shows `index.css` and `detail.css` modified.

- [ ] **Step 2: Stage and commit**

```bash
git add index.css detail.css
git commit -m "feat: add native page transitions between index and detail

Add cross-document View Transitions API for smooth navigation:
- index→detail: fade out + scale 0.98 (200ms), fade in + translateY 12px (300ms)
- detail→index: reverse, same animation
- Subtle site-code grow animation (0.85→1) on detail page entry
- Respects prefers-reduced-motion via existing CSS rule
- CSS-only, ~1KB, no JS changes"
```

- [ ] **Step 3: Push to GitHub**

```bash
git push origin main
```
