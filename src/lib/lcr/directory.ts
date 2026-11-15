// Member Directory households parser (docs/lcr-directory-structure.md).
// Input: the raw JSON array from
//   https://directory.churchofjesuschrist.org/api/v4/households?unit=<unitNumber>
// copied straight out of the browser tab. Only the keys below are read; the
// payload also carries phones, emails and record details, which are ignored.

export interface DirectoryMember {
  /** LCR person UUID, the same ID the ministering page calls `personUuid`. */
  uuid: string;
  name: string; // "Surname, Given"
  head: boolean;
}

export interface DirectoryHousehold {
  /** Household UUID. Never a person's UUID. */
  uuid: string;
  name: string;
  /** Null when the household has no map location. */
  lat: number | null;
  lng: number | null;
  members: DirectoryMember[];
}

export interface DirectoryParseResult {
  households: DirectoryHousehold[];
  warnings: string[];
}

/** 6 decimal places is about 0.1 m; the source carries float noise past that. */
const COORD_DECIMALS = 6;

interface RawMember {
  uuid?: unknown;
  name?: unknown;
  head?: unknown;
}
interface RawHousehold {
  uuid?: unknown;
  name?: unknown;
  coordinates?: { latitude?: unknown; longitude?: unknown } | null;
  members?: unknown;
}

export function parseDirectory(input: string): DirectoryParseResult {
  // Tolerate stray text around the array (browser JSON viewers add some).
  const start = input.indexOf('[');
  const end = input.lastIndexOf(']');
  if (start < 0 || end <= start) {
    throw new Error(
      'Could not find directory data. Open the directory households link, select all, copy, and paste it here.',
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(input.slice(start, end + 1));
  } catch (e) {
    throw new Error(`The pasted text isn't complete JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(raw) || !raw.every(isHouseholdLike)) {
    throw new Error('The pasted text is JSON, but not the directory household list. Wrong link?');
  }

  const warnings: string[] = [];
  const households: DirectoryHousehold[] = [];
  for (const h of raw as RawHousehold[]) {
    const members = (h.members as RawMember[])
      .filter((m) => typeof m.uuid === 'string' && typeof m.name === 'string')
      .map((m) => ({ uuid: m.uuid as string, name: m.name as string, head: m.head === true }));
    if (!members.some((m) => m.head)) {
      warnings.push(`Skipped household "${String(h.name)}": no head of household listed.`);
      continue;
    }
    const lat = coord(h.coordinates?.latitude, 90);
    const lng = coord(h.coordinates?.longitude, 180);
    const located = lat !== null && lng !== null;
    households.push({
      uuid: h.uuid as string,
      name: typeof h.name === 'string' ? h.name : members[0].name,
      lat: located ? lat : null,
      lng: located ? lng : null,
      members,
    });
  }
  return { households, warnings };
}

function isHouseholdLike(v: unknown): boolean {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as RawHousehold).uuid === 'string' &&
    Array.isArray((v as RawHousehold).members)
  );
}

function coord(v: unknown, limit: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) return null;
  return Number(v.toFixed(COORD_DECIMALS));
}
