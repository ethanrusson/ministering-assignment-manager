# Ministering Assignment Manager — PRD

## Overview

A web-based tool for managing Elders Quorum ministering assignments at the ward level. Replaces ad-hoc spreadsheet and paper workflows with a spatial, drag-and-drop canvas where districts, companionships, elders, and households can be visually arranged and reorganized.

**Primary user:** EQ presidency members (typically 1–4 people per ward).
**Initial deployment scope:** single-ward, single-presidency use, with cross-device login support.

## Goals

- Reduce the time and friction of reorganizing ministering assignments at scale (~57 companionships, ~160 households, ~100+ elders).
- Provide a visual model where companionship and district structure is obvious at a glance.
- Generate a clear worklist of what changed since the last LCR sync, so manual data entry back into LCR is fast and accurate.
- Preserve historical assignment states (snapshots) for reference and rollback.

## Non-Goals (v1)

- Direct LCR API integration (read or write).
- Multi-user collaboration or real-time editing.
- Phone-sized responsive layout (iPad and desktop only).
- View-only or role-based access controls.
- Tracking ministering interview outcomes or visit history.

## Users & Auth

- Single user per account; same account can log in from multiple devices (desktop + iPad).
- Email + password via Supabase Auth.
- No social login, no view-only roles.
- Each account maintains its own ward data (no shared workspaces in v1).

## Tech Stack

- **Frontend:** Vue 3 + Vite, TypeScript.
- **Drag-and-drop / canvas:** likely `@panzoom/panzoom` (or `vue-pan-zoom`) for canvas pan/zoom, plus custom pointer-event-based drag logic so the same code path handles touch and mouse cleanly. `vuedraggable` is a viable alternative for sidebar lists.
- **Backend:** Supabase (Postgres + Auth + Row Level Security).
- **Hosting:** Vercel, Netlify, or Cloudflare Pages (TBD).

## Data Model (high-level)

- **wards** — workspace container, one per user.
- **elders** — name, age, hidden flag, ward_id.
- **households** — name, hidden flag, ward_id.
- **labels** — name, color, ward_id.
- **household_labels** — household_id, label_id (many-to-many).
- **districts** — name, position {x, y, w, h}, ward_id.
- **companionships** — district_id (nullable), position {x, y}, ward_id.
- **companionship_elders** — companionship_id, elder_id (many-to-many; cardinality enforced in app logic).
- **companionship_households** — companionship_id, household_id (many-to-many table; effectively one-to-many in v1).
- **snapshots** — name, created_at, full state JSON, ward_id.

## Core Features

### 1. Data Import

Initial source: paste HTML from the LCR ministering assignments page. The app parses the HTML to extract elders (with ages where available), households, and current companionship structure.

After initial import, the user can:
- Manually add, edit, and remove elders, households, and labels in the UI.
- Re-paste LCR HTML to sync. The tool diffs against current state and prompts before overwriting.

The parser should be isolated behind a clear interface so it can be replaced when LCR's HTML changes.

### 2. Canvas

- Infinite, pannable, zoomable canvas (Figma-style).
- **Touch:** two-finger pan and pinch-zoom, one-finger drag for cards.
- **Mouse:** scroll wheel zoom, space+drag or middle-click to pan, click-drag for cards.
- Smooth zoom from ~25% to ~200%.
- "Fit to screen" button for fast re-orientation.

### 3. Districts

- User-created drop zones on the canvas, rendered as labeled, resizable rectangles.
- Movable and resizable via drag handles.
- Add / rename / delete via context menu.
- Companionships dropped inside a district are assigned to it.
- Companionships outside any district display a warning indicator.

### 4. Companionships

- **Creation:** drag one elder onto another unassigned elder. A new companionship card appears at the drop location.
- **Card content (collapsed default):**
  - Elder names with an age badge (small numeric pill; under-18 styled in a warning color).
  - Household count (e.g., "4 households").
  - No editable title.
- **Card content (expanded):** full household list.
- **Global toggle:** "Expand / Collapse all" button affects every companionship card on the canvas.
- **Identity for export/worklist:** auto-derived from elder surnames (e.g., "Smith & Jones," "Smith, Jones & Brown").
- **Adding a 3rd elder:** drop onto an existing companionship. Allowed, with a soft warning.
- **Removing an elder:** drag the elder card out. If the companionship drops to 1 elder, the companionship auto-dissolves. The remaining elder stays on the canvas at that location as a stranded unassigned elder card with a warning color.
- **Removing a household:** drag back to the sidebar to unassign.
- **Companionship deletion:** removing the last elder dissolves it; any households that were assigned return to the unassigned panel.

### 5. Elders

- Default home: "Unassigned Elders" side panel.
- Can also exist on the canvas as part of a companionship or as a stranded unassigned card.
- Card shows: name, age badge.
- Actions: hide (persistent), unhide, send back to sidebar (or "remove from canvas").
- Hidden elders are excluded from the sidebar by default; a toggle reveals them.

### 6. Households

- Default home: "Unassigned Households" side panel.
- Card shows: family name, label chips, hidden indicator if applicable.
- Drag onto a companionship to assign; drag back to sidebar to unassign.
- Actions via context menu: edit labels, hide/unhide, rename.
- **Constraint (v1):** one household assigned to at most one companionship at a time.
- Hidden households excluded from sidebar by default; toggle reveals them.

### 7. Labels

- Library of household labels (e.g., "Widow," "Less-active," "New move-in").
- Each label has a name and a color.
- Created and managed via a "Manage Labels" modal.
- A household can have multiple labels.
- Side panel filter: filter unassigned households by one or more labels.

### 8. Search

- Global search box at the top of the UI.
- Searches elder names, household names, and labels.
- Matching cards are highlighted on the canvas and in side panels.
- Pressing Enter cycles focus through matches; the canvas auto-pans/zooms to bring the focused match into view.

### 9. Snapshots

- "Save Snapshot" button captures the full state with a user-provided name.
- "Snapshots" panel lists all past snapshots with timestamps and names.
- Selecting a snapshot opens a read-only view.
- "Restore" button on a snapshot replaces the current state (with confirmation).
- Snapshots are the basis for worklist diffs.

### 10. Worklist

- "Generate Worklist" button prompts the user to pick a snapshot to diff against (default: most recent).
- Output is a checklist grouped by companionship, showing:
  - Elders added or removed.
  - Households added or removed.
  - District changes for the companionship.
- Pure visual changes (card position, district resize) are excluded.
- Hidden elders and households are excluded.
- Format: printable HTML view + downloadable as Markdown.

### 11. CSV Export

- "Export CSV" button generates a flat CSV of current state.
- v1 format, one row per household assignment:
  - `District, Companionship, Elder 1, Elder 2, Elder 3, Household, Household Labels`
- Hidden items excluded by default; checkbox to include them.

## Constraints & Validations

| Rule | Type | Behavior |
|------|------|----------|
| Elder belongs to exactly one companionship at a time | Hard | Dragging onto a new companionship removes from previous. |
| Household assigned to at most one companionship | Hard (v1) | Dragging onto a new companionship removes from previous. |
| 1-person companionships auto-dissolve | Hard | Stranded elder stays on canvas with warning styling. |
| Companionship with 0 households | Soft warning | Yellow indicator on card. |
| Companionship with >5 households | Soft warning | Yellow indicator on card. |
| Companionship with 2+ members under 18 | Soft warning | Red indicator; needs at least one adult. |
| Companionship outside any district | Soft warning | Yellow indicator on card. |
| Household with no companionship | Surfaced in sidebar | Not a warning per se. |

## Open Questions

1. **HTML parser scope.** Does the LCR ministering page contain ages, or do we need to parse a separate directory page to get them? Worth confirming with a real page sample before building.
2. **Worklist primary format for MVP.** Printable HTML, downloadable Markdown, or both at launch? Recommend HTML print view first since it's the actual workflow (read while clicking through LCR), Markdown export second.
3. **Auto-snapshot cadence.** Recommend explicit-only for v1. Auto-snapshots clutter the list and add noise to worklist diffs.
4. **Card overlap on the canvas.** When new companionships are created at the drop location, multiple cards can stack. Decide whether to nudge cards apart automatically or leave it to the user.

## Future / Out of Scope

- Official LCR API integration if/when one exists.
- Multi-user collaboration with real-time edits and role-based access.
- Proposal workflow (named drafts that can be applied or discarded).
- Click-to-expand richer info per elder/household (phone, address, notes, photo).
- Ministering interview log (last contact date, notes per assignment).
- Phone-sized responsive layout.
- Multi-ward / multi-presidency support.
- Undo/redo history beyond snapshots.
- Reassigning a household to multiple companionships simultaneously.
