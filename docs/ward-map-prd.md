# Ward Map — PRD

## Overview

A map view of the ward, drawn by the app itself rather than on a map provider. Each household appears as a labeled square, positioned from LCR coordinates. Streets, the ward boundary and district areas are drawn underneath. Tapping a household shows its ministering connections and lets the user reassign it.

Districts on the map are sets of households. The user assigns households to districts by tapping them. District boundaries are then drawn automatically around those households, and follow streets where streets separate them.

The map sits alongside the existing board (canvas). Both views read and write the same data.

Mockups (private link, sample data): https://claude.ai/artifact/2SDYYxwEP62wc2NXqGMtto — screens: Map view, Edit districts, Edit streets, Locations.

## Goals

- Show where every household and minister lives, with names always visible.
- Keep each district geographically compact, so ministering stays local and fewer assignments need redoing when people move in or out.
- Make it possible to solve problems one district at a time: households, companionships, capacity and gaps.
- Show the ministering connections for any household at a glance.
- Make ward tags (labels) and system-detected issues (flags) visible on the map, and filterable.
- Keep location data accurate as LCR data changes, with a short review queue for exceptions.

## Non-Goals

- Map tiles, satellite imagery or any commercial map provider.
- Geocoding addresses. Coordinates come from LCR, or are placed by hand.
- Driving or walking distance. All distances are straight-line.
- Writing back to LCR.
- Warnings about location issues on board companionship cards. These are planned for a later phase (see Phase 7).

## Delivery approach

The work is split into phases. Each phase can be shipped and tested on its own. Every phase ends with a **checkpoint**: the owner reviews the result on real ward data, the listed questions are answered, and this document is updated before the next phase starts. A phase must not start until the previous checkpoint is closed.

| Phase | Delivers | Depends on |
|---|---|---|
| 0 | Groundwork: stored LCR IDs, location columns, location import parser | — |
| 1 | Map view (read-only): households, names, groups, tap for connections | 0 |
| 2 | Locations review queue and hand placement | 1 |
| 3 | Flags and labels on the map: taxonomy, display, filters | 1 |
| 4 | Reassign from the map; gaps and capacity panels | 1, 3 |
| 5 | Streets: import (done) and editor (deferred) | 1 |
| 6 | Ward boundary and districts: household membership, automatic boundaries | 4, 5 |
| 7 | Later: board card warnings and other follow-ups | 6 |

Phases 2, 3 and 5 depend only on Phase 1 and can be reordered at a checkpoint.

## Cross-cutting decisions

| # | Decision |
|---|---|
| D1 | The map is drawn by the app (SVG). No tile provider, API keys or third-party map services. |
| D2 | Household coordinates come from LCR. A household with no coordinates in LCR can be placed by hand. On re-import, LCR coordinates replace any hand placement. |
| D3 | Stored coordinates are never changed for display, and marks are always drawn exactly at their location. Crowding is handled by leaving names out, never by moving marks. Households at the same point stack behind one square. |
| D4 | Households and elders are matched to LCR by person UUID, not by name. |
| D5 | A household's district is set directly (`households.district_id`). District areas on the map are worked out from that membership; they are never drawn by hand. |
| D6 | District boundaries follow streets where streets separate households of different districts. Elsewhere they run halfway between neighboring homes. |
| D7 | The ward boundary is the only area drawn by hand, with snapping. |
| D8 | Connection lines appear only for the selected household. A full-web overlay is an optional toggle, off by default. |
| D9 | Reassignments made on the map write to the same tables as the board, so they appear in the existing worklist and change tracking. |
| D10 | Distances are straight-line, shown in miles. |
| D11 | Districts are the existing `districts` rows, which are imported from LCR. No separate map-only district entity. |
| D12 | The only outside request the map makes is an optional one-time OpenStreetMap street download, which sends only the ward's map area. Building footprints for non-member houses are fetched by a local script (`scripts/footprints.ts`) and pasted in, not by the app. No member data is sent anywhere. |
| D13 | Non-member houses are drawn as faint squares so it's clear when other homes sit between member homes. They come from Microsoft's open building footprints or are placed by hand, and a house under a member household isn't drawn. |

## Data model changes

All new columns are nullable unless noted. All tables are ward-scoped and use the existing row-level security pattern (`is_my_ward` / `ward_members`) and realtime subscriptions.

**elders**
- `lcr_uuid text` — LCR person UUID; unique per ward.
- `not_generally_assigned boolean not null default false` — from LCR. The parser reads it today but does not store it.
- `home_household_id uuid references households on delete set null` — the household the elder lives in.

**households**
- `lcr_uuid text` — LCR person UUID of the head of household; unique per ward.
- `lat double precision`, `lng double precision`
- `location_source text check in ('lcr','manual')`
- `location_updated_at timestamptz`
- `district_id uuid references districts on delete set null` — district membership (D5). This is separate from `companionships.district_id`.
- `location_group_id uuid references location_groups on delete set null`

**location_groups** (households that share one point, such as apartments)
- `id, ward_id, name text, lat, lng, created_at`

**location_reviews** (the review queue; also records acknowledged exceptions)
- `id, ward_id, household_id`
- `kind text check in ('no_location','outside_ward','moved','shared_location')`
- `data jsonb` — e.g. previous and new coordinates for `moved`
- `status text check in ('open','resolved','dismissed') default 'open'`
- `resolution text`, `created_at`, `resolved_at`, `resolved_by uuid`

**wards**
- `boundary jsonb` — GeoJSON Polygon in lat/lng.

**streets**
- `id, ward_id, name text, kind text check in ('main','residential','lane')`
- `geometry jsonb` — GeoJSON LineString in lat/lng
- `smooth boolean default false`, `source text check in ('osm','manual')`, `osm_id text`, `created_at`

**homes** (non-member houses, D13; migration 0006)
- `id, ward_id, lat, lng, source text check in ('footprint','manual'), created_at`

Label-related changes are defined in Phase 3, after its checkpoint.

## Coordinates and rendering

- **Projection.** Use a flat (equirectangular) projection centered on the ward: `x = (lng − lng0) · cos(lat0) · 111320`, `y = −(lat − lat0) · 110540`, in meters. The center (`lat0`, `lng0`) is the middle of the ward boundary, or of all households if there is no boundary yet. Store everything in lat/lng and project only when drawing.
- **Rendering.** One SVG layer for ward area, district areas, streets and lines, with an HTML layer above it for household squares, names and popovers. Pan and zoom reuse `usePanZoom` or an equivalent, with the viewport saved per ward.
- **Household square.** 22 px square with its name below (or above) when it fits. Squares and labels keep a constant size on screen while zooming; positions scale. The tappable area covers the square and the label. Marks on the square:
  - a dot inside: a minister lives here; red if that elder has no companionship
  - up to two label dots at the top-right corner, then "+n"
  - a selection ring
- **Crowding.** Marks never move (D3). A name shows only where it covers no other name and no other household's square: surname below the square, else above, then "Surname, I." where the longer form still fits. The selected household always shows its full name, and its connections get first claim on space. Tapping the same spot again steps through every household whose square is there.
- **Shared points.** Households with identical coordinates (in practice, one family's house) stack: the others peek out behind the front square, and the front household's name shows. Tapping steps through them.
- **Non-member houses.** Faint 22 px squares with no border, in the residential street color, under everything else (D13).
- **Fit.** Frames the households, leaving out lone pins with no other household within 1 km.
- **Dark mode.** All map colors use the existing CSS-variable palette and follow the app theme.
- **Touch.** The map respects the existing view/edit lock (`useViewMode`). In view mode, a tap selects and a drag pans.

---

## Phase 0 — Groundwork

**Goal:** stable identity for people and a place to store locations. No user-facing map yet.

**Scope**
1. Migration `0005`: add the columns and tables above, except labels.
2. LCR ministering import stores `lcr_uuid` and `not_generally_assigned` on elders and households. The first import after the migration fills `lcr_uuid` on existing rows by name, then reports any rows that couldn't be matched.
3. All later imports match by `lcr_uuid` first, then fall back to name.
4. A location import parser behind an interface, like `LcrParser`. It accepts the LCR page or export that contains coordinates, and returns, for each household: person UUID, name, lat, lng, and member person UUIDs if present.
5. Link elders to their home: if an elder's UUID matches a household's head-of-household UUID, set `home_household_id`. If the location source lists household members, use that for the rest.

**Acceptance**
- Re-importing the same LCR page creates no duplicates. Renaming a person in LCR updates the existing row instead of creating a new one.
- Unit tests for the parser using a scrubbed fixture of the real coordinate source. Existing parser tests still pass.

**Checkpoint 0 — owner inputs**
- Provide a scrubbed sample of the LCR source that has coordinates. Which page or export is it, and in what format?
- Does the source include household members, i.e. which elders live in which household?
- How many elders can't be linked to a home automatically? Is picking "lives at" by hand acceptable for those?

---

## Phase 1 — Map view (read-only)

**Goal:** see the ward and the connections for any household.

**Scope**
1. A Board | Map switch in the header. The map is a view of the same ward data.
2. A location import entry point in the existing import area. Imports update `lat`/`lng` for households whose `location_source` is `lcr` or null (D2).
3. Draw households as specified under "Coordinates and rendering": district coloring by companionship district for now, shared-point boxes, crowding nudges, names always shown.
4. Tap a household to open a popover showing:
   - name and labels
   - its ministers, the distance to them, and their household count
   - if an elder lives here: who that elder ministers to, and their companion
   - warnings (see Phase 3; in this phase only "no companionship")
5. Lines for the selected household (D8):
   - **ministers:** solid line in the district color from each minister's home to this household
   - **served:** if an elder lives here, dashed lines to each household their companionship ministers to
   - **companion:** dotted line to the companion's home
   
   Everything not connected fades.
6. An "All connections" toggle, off by default.
7. A scale bar, zoom controls and fit-to-ward. Search reuses `SearchBar` and centers on the result.

**Acceptance**
- Every household with coordinates appears; households without coordinates are counted ("3 without a location").
- Selecting a household shows the correct ministers and lines, compared against the board for a sample of 10 households.
- Usable on iPad in view mode. Readable in light and dark themes.
- Unit tests for projection, distance, shared-point grouping and connection-line building.

**Checkpoint 1 — review on real data**
- Are labels readable in the densest areas? Do we need a zoom level below which only some names show, or is nudging enough?
- Is 22 px the right size on iPad and desktop?
- Coloring before districts exist: is the companionship's district right, or should squares be neutral until Phase 6?
- Is the "All connections" toggle useful, or should it be removed?

---

## Phase 2 — Locations review queue

**Goal:** keep locations trustworthy as LCR data changes.

**Scope**
1. Each location import creates `location_reviews` rows for:
   - `no_location`: the household has no location anywhere: LCR has none or doesn't list it, and it hasn't been placed by hand.
   - `moved`: coordinates changed by more than a threshold (default 50 m). Store the previous and new positions.
   - ~~`shared_location`~~: dropped (Checkpoint 1). Households at one point are one family's house and stack on the map; revisit for a ward with apartments.
   - `outside_ward`: created once a ward boundary exists (Phase 6). Skipped until then.
2. A Locations panel on the map (built as a panel over the map rather than a separate screen), opened from a toolbar button:
   - `no_location`: Place (tap the map where they live → `location_source = 'manual'`), or Leave (dismiss).
   - `moved`: tap to center it, with a dashed line from its old position. Accept, or accept and open reassign (reassign arrives in Phase 4; until then, accept only). The new LCR position is applied at import.
   - `outside_ward`: keep (dismiss with a reason), adjust the boundary, or mark as moved out (hides the household).
3. Dismissed items stay dismissed across imports until the underlying data changes again.
4. A map toolbar badge shows the number of open items.
5. "Adjust location" from the household popover: tap the map where the household lives. It sets `location_source = 'manual'` and creates no review item.
6. "Lives at" for elders the location import couldn't link (Checkpoint 0): Pick home, then tap their household on the map.

**Acceptance**
- Importing the same data twice creates no duplicate review items.
- A hand-placed household is replaced by LCR coordinates when LCR later provides them (D2), and the replacement is noted in the import summary.
- Unit tests for the review-generation diff.

**Checkpoint 2**
- Is 50 m the right threshold for "moved"?
- Should a move into a different district be called out more strongly in the import summary?
- Is "mark as moved out" needed, or does the next LCR import handle departures well enough?

---

## Phase 3 — Flags and labels

**Goal:** a clear, consistent system for the issues the app detects (flags) and the tags the presidency adds (labels), shown the same way on the map and the board.

### Definitions

- **Flag:** computed by the app from the data. Never edited directly. It goes away when the underlying data changes, or it can be acknowledged when that's supported.
- **Label:** a tag the user defines and applies. Stored. These are the existing `labels` and `household_labels`.

### Flags (initial set)

| Flag | Applies to | Rule | Acknowledgeable |
|---|---|---|---|
| No companionship | Household | no `companionship_households` row | No |
| Ministered from another district | Household | `household.district_id` ≠ its companionship's `district_id` (needs Phase 6) | Yes |
| Far from ministers | Household | distance to the midpoint between the ministers' homes > threshold (default 0.5 mi) | Yes |
| No location | Household | no `lat`/`lng` | Via `location_reviews` |
| Outside ward | Household | point outside `wards.boundary` (needs Phase 6) | Via `location_reviews` |
| Location changed | Household | open `moved` review | Via `location_reviews` |
| New since last import | Household / Elder | has an LCR ID and was created at or after the most recent `lcr_imports` row | Expires at the next import |
| Elder without companionship | Elder | not in `companionship_elders` and not `not_generally_assigned` | No |
| Not generally assigned | Elder | from LCR | No |
| Over capacity | Companionship | households > `HOUSEHOLD_LIMIT` (5) | No |
| Existing validation rules | Companionship | `validation.ts`: singleton, multi-minor, no-district, etc. | No |

Flag rules are pure functions next to `validation.ts`, with unit tests. Acknowledgeable flags need an acknowledgement record (`flag_acknowledgements`, below).

### Labels — current state

- Labels apply to households only.
- Created in `LabelsModal`; color is entered as a hex value through `window.prompt`.
- Applied to a household through a numbered `window.prompt` in `HouseholdsPanel`.

### Labels — scope

1. Replace the prompt-based flows: a color picker restricted to a fixed palette, and a label picker in the household popover (map) and the household row (board).
2. Map display: up to two label dots per square, then "+n"; label chips in the popover; a label section in the legend.
3. **Filter bar** on the map (and later the board). Choose labels, flags and districts; matching households stay at full strength and the rest fade. Show a count of matches. Filters combine with AND across types and OR within a type.
4. A "Color households by" switch: District | Status (flags) | one chosen label.
5. A "Gaps" panel listing flagged households and elders, grouped by flag. Tapping an entry selects it on the map.

### Checkpoint 3 — answer before building labels (this phase starts with this checkpoint)

1. Which labels does the presidency use or want? Seed a starting set, or start empty?
2. Should labels also apply to elders, e.g. "Prospective elder", "Needs a companion"? If yes, add an `elder_labels` table.
3. Should any label be applied automatically, e.g. "New move-in" when a household first appears in an import? Should labels expire after a set number of days?
4. Are some labels sensitive and best hidden by default when the screen is shared? If so, add a `labels.sensitive` flag and a "show sensitive labels" toggle.
5. Label order and priority when a household has more than two: user-set order, or alphabetical?
6. Which flags should be acknowledgeable, and should an acknowledgement require a note?
7. Is a free-text note per household wanted here, or kept out of scope?
8. Label colors: confirm the fixed palette. It must stay distinct from district colors and status colors in both themes.

**Answers (Checkpoint 3)**
1. Start with two labels: Widow (exists) and Less active. More are added in Manage Labels as needed.
2. No labels on elders for now.
3. No automatic or expiring labels.
4. Yes: a label can be marked sensitive. Sensitive labels, and household notes, are hidden unless "Show sensitive" is on. It's a per-device setting, off by default, in the settings menu, and applies to the map and the board.
5. Alphabetical; no user-set order.
6. "Far from ministers" can be acknowledged, and "Ministered from another district" once Phase 6 adds it, with an optional note. An acknowledgement holds while the household keeps the same companionship. Every other flag clears only when its data changes.
7. Yes: one free-text note per household, shown and edited in the map popover, treated as sensitive.
8. A fixed palette of 8 label colors, kept distinct from the 8 district colors and the red used for warnings: pink, fuchsia, sky, emerald, indigo, yellow, stone and brown. Existing labels move to the nearest palette color.

**Data changes (migration 0007)**
- `labels.sensitive boolean not null default false`
- `households.note text`
- `lcr_imports`: `id, ward_id, created_at`, one row per ministering import (drives "New since last import")
- `flag_acknowledgements`: `id, ward_id, household_id, flag text check in ('far_from_ministers','other_district'), companionship_id, note text, created_by, created_at`; unique per household and flag; deleted with its household or companionship

**Acceptance (after the checkpoint)**
- Labels can be created, recolored, applied and removed without browser prompts, on both map and board.
- Filters and coloring modes give the same counts as the gaps panel.
- Unit tests for every flag rule.

---

## Phase 4 — Reassign from the map

**Goal:** fix gaps directly on the map.

**Scope**
1. The household popover gets a "Reassign" list:
   - the four nearest companionships, measured to the midpoint between the ministers' homes, plus the current one and "No companionship"
   - each row shows its district, distance, and households after the move against the limit (e.g. 6/5 in red)
2. Choosing a row writes `companionship_households` through the existing store, so the board, worklist and realtime update.
3. A districts panel: for each district, households, companionships, slots (companionships × 5) and open or short slots. Before Phase 6 this counts households by their companionship's district; after Phase 6, by `households.district_id`. Built as a "Districts" section of the Filters panel; gaps have their own panel. Filters, Gaps, Locations and Edit houses sit in the toolbar's ⋯ menu.
4. The gaps panel (Phase 3) links straight into reassigning: a household picked from Gaps opens with its Reassign list showing.

**Acceptance**
- A reassignment on the map appears on the board and in the worklist without a reload, and in another signed-in session through realtime.
- Undo restores the previous assignment. Use whatever mechanism the board uses, if any; otherwise a one-step undo toast. (The board has none, so it's a toast with Undo, open for 8 seconds.)

**Checkpoint 4**
- Is "nearest four" the right list, or should it be "nearest with open slots"?
- Should the 5-household limit be configurable per ward?
- Is the reassign list enough, or is assigning by drag on the map wanted after all?

---

## Phase 5 — Streets

**Goal:** streets for orientation, and as the edges district boundaries follow (D6).

**Scope**
1. **Import** (done). One-time download of road lines inside the ward boundary from OpenStreetMap (Overpass API), sending only the ward's map area (D12). Before a ward boundary exists, use the area around all households plus a margin. The import is simplified into `streets` rows:
   - kinds `main` (OSM primary, secondary, tertiary and their links), `residential` (residential, unclassified, living street) and `lane` (service, except parking aisles and drive-throughs)
   - footpaths excluded
   - names from OSM
2. **Editor** (Edit streets screen; deferred until the OSM data turns out to need hand fixes):
   - move points
   - draw a street by clicking points; double-click or Enter finishes; ends snap to nearby streets
   - delete a point or a whole street
   - edit name, kind and the smooth flag (draws a curve through the points)
   - a toggle to show household squares to trace between
3. Rendering (done): `main` thick, `residential` medium, `lane` thin and dotted. Names drawn along the longest stretch of each road.
4. "Start blank": remove imported streets and draw by hand only.

**Acceptance**
- Import → edit → save round-trips. Re-running the import asks before replacing manual edits.
- Streets render correctly at all zoom levels and in both themes.

**Checkpoint 5**
- Is the OSM import good enough for this ward, or is hand drawing the main path?
- Are three kinds enough? Should driveways or private lanes be dropped entirely?

---

## Phase 6 — Ward boundary and districts

**Goal:** districts defined by their households, drawn cleanly along streets, with district-level problem solving.

**Scope**
1. **Ward boundary.** The starting outline is generated around all households with a margin, then edited by dragging corners. Corners snap to streets and to other corners. Stored in `wards.boundary`. This enables the `outside_ward` review items and flag.
2. **District membership.** An Edit districts screen:
   - Pick a district; tap households to add them, tap again to remove.
   - Lasso to move many households at once.
   - Shared-point boxes move as a unit.
   - "No district" is a valid choice.
   - Name editing and the district list come from the existing `districts` rows (D11).
   - An "If you save" panel lists each household whose district changes, and whether that creates or clears a "Ministered from another district" flag.
3. **Automatic district areas (D6).** Steps:
   1. Split the ward boundary into blocks using streets that cross it fully or connect to other streets. Dead-end streets don't split blocks.
   2. A block whose households all belong to one district goes to that district. A block with no households goes to the district of the nearest household.
   3. A block with households from more than one district is divided halfway between its households, staying inside the block.
   4. Merge each district's pieces into one area. Draw a boundary line wherever two areas meet. Where that meets along a street, the line follows the street.
   5. With no streets, fall back to dividing the whole ward halfway between neighboring homes.
   6. Treat households with identical coordinates as one point.
4. **Split-district warning.** If a district's area ends up in more than one piece, show a warning in the editor and on the map. It doesn't block saving.
5. **Move-ins.** A household with no district gets a suggested district: the area its point falls in. The suggestion appears in the household popover and the review queue, and the user confirms it. (Whether to apply it automatically is a checkpoint question.) *As built:* only after the first membership save; listed under Locations → No district. Households without a district don't claim area, so the areas cover the ward with real districts only.
6. **Flags.** Turn on "Ministered from another district" and "Outside ward". Switch the districts panel to `households.district_id`. *As built:* outside-ward items are rechecked on every boundary save and location import. Square colour, the district pill, the district filter and the districts panel follow the household's own district; minister lines and the reassign list follow the companionship's. Status colours, highest first: no companionship, outside ward, another district (amber), far from ministers (now orange), location changed.
7. **Initial membership.** On first use, set `households.district_id` from each household's companionship's district. Households without a companionship start with no district.

**Geometry library.** Start the phase with a short spike comparing JSTS (noding plus polygonize) against a lighter mix (polygon-clipping plus custom splitting). Criteria: correctness on the real street network, bundle size, and speed. Recompute target: under 100 ms on each edit for about 200 households. Record the result here.

*Spike result:* the lighter mix. `polygon-clipping` (0.15.7, about 10 KB minified and gzipped; JSTS is roughly 250 KB) merges each district's pieces, and a small custom planar graph (`src/map/blocks.ts`: noding, joining street ends within 3 m, pruning dead ends, face tracing) splits the ward into blocks. Fixture-ward unit tests cover blocks, assignment, mixed-block division, full coverage without overlaps, and split detection. On the real ward (99 streets, 178 households, generated outline) turning the areas on takes about 32 ms from click to painted frame.

**Acceptance**
- Every point inside the ward belongs to exactly one district area: no gaps, no overlaps. Covered by unit tests on a fixture ward.
- A household change redraws the area live.
- Boundaries follow streets wherever the two sides of a street belong to different districts.
- Unit tests for block splitting, assigning blocks, dividing mixed blocks, and detecting split districts.

**Checkpoint 6**
- Do the automatic boundaries look right on the real ward? Where don't they?
- Should move-ins get their suggested district automatically, or always need confirmation?
- Should district membership be part of snapshots and change tracking? It's app-only data; LCR doesn't store household districts.
- Should "Ministered from another district" also show on the board now, or wait for Phase 7?

---

## Phase 7 — Later

- Location and district warnings on board companionship cards, e.g. "1 household outside district" or "Ministers live 1.2 mi apart". These use the same flag functions as Phase 3.
- Suggestions: for each unassigned household, the nearest companionships with open slots in its district. For each district short of slots, unassigned elders who live in it.
- Print or export of a district map for a district leader.
- Phone layout improvements beyond the stacked sidebar.

---

## Testing strategy

- **Unit tests (Vitest):** parsers, projection, distance, grouping, connection lines, flag rules, review generation, street import simplification, and district area geometry. Geometry tests use a fixed fixture ward with known expected areas.
- **Fixture data:** a synthetic ward like the mockup (about 40 households, 3 districts, an apartment group, one household outside the ward, one without a location), plus a scrubbed real-shape location fixture once Checkpoint 0 provides one.
- **Manual checks at each checkpoint:** real ward data on iPad and desktop, light and dark themes.

## Privacy

- Household coordinates are personal data. They are stored only in the ward's Supabase rows, under the existing ward-scoped row-level security.
- No coordinates, names or IDs are sent to any outside service. The OpenStreetMap download sends only the map area (D12).
- Location import pastes stay in the browser until they're parsed. The raw pasted text is not stored.

## Open questions log

Questions are answered at each checkpoint and moved into the decision list or the phase scope. Unanswered questions block the next phase.

| Checkpoint | Question | Answer |
|---|---|---|
| 0 | Coordinate source and format | Member Directory API `GET /api/v4/households?unit=<unitNumber>`: raw JSON array, opened in a tab and pasted. See `docs/lcr-directory-structure.md`. |
| 0 | Household members included? | Yes: every member with person `uuid` (same as ministering `personUuid`) and a `head` flag. |
| 1 | Label density rule | Marks never move; names show only where they fit (below, then above), with initials added when there's room. The selection always keeps its name. |
| 1 | Square size | 22 px kept on desktop. Not yet checked on iPad. |
| 1 | Coloring before Phase 6 | The companionship's district, as built. |
| 2 | "Moved" threshold | |
| 2 | "Mark as moved out" needed? | No. Move-outs whose records haven't left show as "no location": Leave clears them, and they're hidden once the ministering import reports them gone. |
| 3 | Label taxonomy and seed set | |
| 3 | Labels on elders | |
| 3 | Automatic and expiring labels | |
| 3 | Sensitive labels | |
| 3 | Acknowledgeable flags | |
| 3 | Household notes | |
| 3 | Label palette | |
| 4 | Reassign list contents | |
| 4 | Configurable household limit | |
| 5 | OSM import vs hand drawing | The OSM import is good enough for this ward (99 streets); the editor is deferred. |
| 6 | Move-in automatic district | |
| 6 | Districts in snapshots | |
