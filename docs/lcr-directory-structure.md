# Member Directory: household locations

Where household coordinates come from, and what the location import parser must read. Findings come from one ward's directory, viewed by a ward leader in November 2026. The scrubbed sample is `src/lib/lcr/__fixtures__/directory.ts`.

## Source

The directory site (`directory.churchofjesuschrist.org/<unitNumber>`) is a Next.js app, but its `__NEXT_DATA__` holds only UI strings and settings. Households load afterwards from a JSON API:

```
GET https://directory.churchofjesuschrist.org/api/v4/households?unit=<unitNumber>
```

- Authenticated by the signed-in session cookie. No extra headers are needed, so opening the URL in a tab works.
- `Content-Type: application/json`. The body is one minified JSON array of households.
- No pagination: one response covers the whole ward (about 190 households and 370 KB in the sampled ward).

## Copy-out steps for the user

1. Sign in at **directory.churchofjesuschrist.org**. The address bar then reads `directory.churchofjesuschrist.org/1234567`, and that number is your ward's unit number.
2. In the same browser, open `directory.churchofjesuschrist.org/api/v4/households?unit=1234567`, using your own number.
3. A page of raw text starting with `[{"uuid"` appears. Press **Cmd+A**, then **Cmd+C** (Ctrl on Windows), and paste it into the app's location import.

Tested in the desktop app's built-in Chromium browser, where select-all copies exactly the JSON. Not yet tested in Safari or Firefox: Firefox opens JSON in a viewer whose "Raw Data" tab has a Copy button. The parser should tolerate stray text before the first `[` and after the last `]`.

The paste is the raw response, not HTML. It also contains phones, emails and, for the viewer's own household, full record details, so the parser must read only the keys below and never store the paste.

## Shape

Top level: `Household[]`.

### Household

| Key | Type | Notes |
|---|---|---|
| `uuid` | string (UUID) | **Household** ID. It is never a person's UUID, so it never matches the ministering page. |
| `unitNumber` | number | Ward unit number. |
| `name` | string | `"Surname, Given & Given"` for couples, `"Surname, Given"` otherwise. |
| `surname` | string | Usually the first head's surname, not always. |
| `address` | string | Two lines joined by `\n`: street (may include an apartment or `#n`), then `City ST ZIP[-ZIP4]`. Not stored. |
| `coordinates` | object | `{ latitude: number, longitude: number }`. Absent when unmapped (see Edge cases). |
| `verified` | boolean | The pin has been confirmed. Unverified pins are geocoded or dragged. |
| `members` | `Member[]` | Every person in the household, heads first. |
| `privacy` | object | `{ address, coordinates, photo }`, each `"STAKE"`, `"WARD"` or `"LEADERS"`. |
| `editable` | boolean | `true` only for the viewer's own household. |
| `movable` | boolean | The viewer may move the pin. |
| `photoUnapproved` | boolean | Optional. Seen only on the viewer's own household. |

Coordinates are JSON numbers. Most have 6–7 decimal places, but about a third carry float noise of 13–15 places, mostly on unverified pins, and a rare one has only 2. Round on import, for example to 6 places (about 0.1 m).

### Member

| Key | Type | Notes |
|---|---|---|
| `uuid` | string (UUID) | **Person UUID**, the same ID space as the ministering page's `personUuid`. |
| `householdUuid` | string | Always equals the parent household's `uuid`. |
| `head` | boolean | One or two heads per household. Both spouses are `head: true`. |
| `name` | string | `"Surname, Given"`, the same style as the ministering page. |
| `displayName` | string | `"Given Surname"`. |
| `givenName`, `surname` | string | |
| `unitNumber`, `countryId` | number | Noise. |
| `phone` | object, optional | `{ number, e164, country, supports? }`. Key absent when hidden or empty. |
| `email` | object, optional | `{ email }`. |
| `positions` | array, optional | `{ uuid, positionTypeId, positionTypeName, unitNumber, unitName }`. |
| `privacy` | object | `{ photo, phone?, email?, birthDate }`, each `STAKE`, `WARD` or `LEADERS`. |
| `editable` | boolean | |

Members of the viewer's own household carry about 20 more keys (`officialName`, `mrn`, `birthDate`, `ordinances`, `father`, `mother`, `priorUnit` and so on). The parser ignores them.

### Parser reads

For each household: `uuid`, `name`, `coordinates.latitude`, `coordinates.longitude`, `privacy.coordinates`, `verified`, and from `members[]` each `uuid`, `head` and `name`.

## Identity: directory vs ministering page

This was checked by comparing every person UUID on a saved ministering page with every member UUID in the directory. The comparison was run locally, and only hashes left either page.

- A ministering household's `personUuid` (in `assignments` and `eligibleAssignments`) is the `uuid` of **one head member** in the directory: 171 of 182 matched, and none matched a household `uuid`. In two-head households exactly one head's UUID is used, never both. Which head was not determined, so the parser should index every head.
- Eligible ministers: 176 of 188 appear in the directory. 137 of them are a household head and 39 are non-head members (adult children at home and the like). All 176 can be linked to a home through `members[].uuid`.
- The 11 households and 12 ministers not found are most likely people who moved, since the saved ministering page was six months older than the directory read. Likewise, 19 directory households had no head on that older roster.

Linking rule for the parser: build `personUuid → household` from every member. A ministering household matches through any head. An elder's `home_household_id` comes from whichever household lists him as a member.

## Edge cases

- **Hidden location.** This is a privacy level, not a missing value. `privacy.coordinates` is `"STAKE"` (default), `"WARD"` or `"LEADERS"`, and the directory app treats anything other than `STAKE` as "private". A leader's response still includes `coordinates` for `LEADERS` households. What a non-leader gets for those households was not verified, but most likely the coordinates are left out.
- **Unmapped household.** None appeared in the sampled ward. The directory app's own code tests `!household.coordinates` and offers "fix location", so expect the `coordinates` key to be absent (or null). The fixture's `DIRECTORY_UNMAPPED_HOUSEHOLD` uses absent.
- **Shared points.** A few households have exactly identical coordinates. About half of those have different address strings (separate apartment units geocoded to one building). The reverse also happens: identical address strings with different coordinates, from metres to about 3 km apart. So group by coordinates, never by address.
- **Far-off pins.** One `LEADERS` household was pinned about 22 km from the rest.
- **Single-person households.** One member, one head.

## Ward boundary

The households response does not include the boundary. The directory map draws the boundary as a server-rendered PNG (`/api/maps-proxy/v2/locations/overlay?...&ids=<unitNumber>`). `GET /api/maps-proxy/v2/locations/<unitNumber>` returns unit metadata with `extent` (4 numbers), `centroids`, `ringCount` and `vertexCount`, but no vertices. The maps client code references `/locations/boundaries` and `/locations/boundaries/union` (multi-polygon) endpoints. The directory page doesn't call them, and they were not probed. That makes them a candidate for Phase 5.

## Checkpoint 0 answers

1. **Source and format.** The Member Directory households API, `GET /api/v4/households?unit=<unitNumber>`, returns a raw JSON array, which the user copies by opening the URL and pasting. A scrubbed sample is in `src/lib/lcr/__fixtures__/directory.ts`.
2. **Household members included?** Yes. Every household lists all its members with person `uuid` and a `head` flag, and person UUIDs match the ministering page's `personUuid`.
3. **Elders that can't be linked automatically.** None among elders who are on both pages. Only elders missing from the directory stay unlinked: 12 of 188 against a six-month-old ministering save, most likely move-outs, so fewer with fresh data. A manual "lives at" pick is needed only for those, a handful at most. The owner confirmed that a manual pick is acceptable.
