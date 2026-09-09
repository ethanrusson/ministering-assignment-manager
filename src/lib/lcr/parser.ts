// LCR ministering page parser.
// Inputs accepted:
//   1. Saved page HTML containing <script id="__NEXT_DATA__">{...}</script>
//   2. Chrome "View Source" HTML (table-of-spans), where the JSON lives in
//      a <script> tag whose text content survives DOM parsing.
//   3. Raw __NEXT_DATA__ JSON pasted directly.
//
// Two parts of the page state matter:
//   • ministeringData.elders — districts → companionships → ministers/assignments.
//     This is the assigned structure.
//   • ministeringData.eligibleMinistersAndAssignments — the full eligible roster
//     (eligibleMinisters / eligibleAssignments). Anyone in that roster who never
//     appears in a companionship is unassigned; that is the only place LCR
//     exposes them.

export interface ParsedElder {
  legacyId: string; // LCR personUuid
  name: string; // "Lastname, Firstname"
  age: number | null;
  /** No companionship on the imported page lists this person as a minister. */
  unassigned: boolean;
  /** LCR flags bishoprics, stake leaders, and missionaries as not generally assigned. */
  notGenerallyAssigned: boolean;
}

export interface ParsedHousehold {
  legacyId: string; // LCR personUuid of head-of-household
  name: string; // "Lastname, Firstname"
  /** No companionship on the imported page is assigned to this household. */
  unassigned: boolean;
}

export interface ParsedDistrict {
  legacyId: string; // LCR districtUuid
  name: string;
}

export interface ParsedCompanionship {
  legacyId: string; // LCR companionship id
  districtLegacyId: string | null;
  elderLegacyIds: string[];
  householdLegacyIds: string[];
}

export interface ParseResult {
  districts: ParsedDistrict[];
  elders: ParsedElder[];
  households: ParsedHousehold[];
  companionships: ParsedCompanionship[];
  /** True when the page carried an eligible roster, so unassigned people are trustworthy. */
  hasEligibleRoster: boolean;
  warnings: string[];
}

export interface LcrParser {
  parse(input: string): ParseResult;
}

// LCR JSON shapes we care about (loose; we only read what we need).
interface LcrPerson {
  personUuid: string;
  name: string;
  age?: number | null;
}
interface LcrEligibleMinister extends LcrPerson {
  notGenerallyAssigned?: boolean;
}
interface LcrCompanionship {
  id: string;
  ministers?: LcrPerson[];
  assignments?: LcrPerson[];
}
interface LcrDistrict {
  districtUuid: string;
  districtName: string;
  companionships?: LcrCompanionship[];
}
interface LcrEligible {
  eligibleMinisters?: LcrEligibleMinister[];
  eligibleAssignments?: LcrPerson[];
}
interface LcrNextData {
  props?: {
    pageProps?: {
      initialState?: {
        ministeringData?: {
          elders?: LcrDistrict[];
          eligibleMinistersAndAssignments?: LcrEligible;
        };
      };
    };
  };
}

export class LcrHtmlParserV1 implements LcrParser {
  parse(input: string): ParseResult {
    const json = extractNextDataJson(input);
    if (!json) {
      throw new Error(
        'Could not find ministering data. Save the LCR ministering page as HTML (Cmd+S → "Webpage, HTML Only") and paste the contents.',
      );
    }
    let data: LcrNextData;
    try {
      data = JSON.parse(json) as LcrNextData;
    } catch (e) {
      throw new Error(`Found __NEXT_DATA__ but JSON parse failed: ${(e as Error).message}`);
    }
    const ministering = data.props?.pageProps?.initialState?.ministeringData;
    const districts = ministering?.elders;
    if (!Array.isArray(districts)) {
      throw new Error('Page state did not include ministeringData.elders. Wrong page?');
    }
    return walk(districts, ministering?.eligibleMinistersAndAssignments);
  }
}

function walk(districts: LcrDistrict[], eligible: LcrEligible | undefined): ParseResult {
  const result: ParseResult = {
    districts: [],
    elders: [],
    households: [],
    companionships: [],
    hasEligibleRoster: false,
    warnings: [],
  };
  const eldersByUuid = new Map<string, ParsedElder>();
  const householdsByUuid = new Map<string, ParsedHousehold>();

  // 1) Assigned structure. Everyone reached here is, by definition, assigned.
  for (const d of districts) {
    if (!d.districtUuid || !d.districtName) {
      result.warnings.push('Skipped a district without uuid/name.');
      continue;
    }
    result.districts.push({ legacyId: d.districtUuid, name: d.districtName });

    for (const c of d.companionships ?? []) {
      if (!c.id) {
        result.warnings.push(`Skipped a companionship in "${d.districtName}" with no id.`);
        continue;
      }
      const elderIds: string[] = [];
      const householdIds: string[] = [];

      for (const m of c.ministers ?? []) {
        if (!m.personUuid || !m.name) continue;
        if (!eldersByUuid.has(m.personUuid)) {
          eldersByUuid.set(m.personUuid, {
            legacyId: m.personUuid,
            name: m.name,
            age: typeof m.age === 'number' ? m.age : null,
            unassigned: false,
            notGenerallyAssigned: false,
          });
        }
        elderIds.push(m.personUuid);
      }

      for (const a of c.assignments ?? []) {
        if (!a.personUuid || !a.name) continue;
        if (!householdsByUuid.has(a.personUuid)) {
          householdsByUuid.set(a.personUuid, {
            legacyId: a.personUuid,
            name: a.name,
            unassigned: false,
          });
        }
        householdIds.push(a.personUuid);
      }

      result.companionships.push({
        legacyId: c.id,
        districtLegacyId: d.districtUuid,
        elderLegacyIds: elderIds,
        householdLegacyIds: householdIds,
      });
    }
  }

  // 2) Eligible roster. Anything not already seen above is unassigned.
  const ministers = eligible?.eligibleMinisters;
  const assignments = eligible?.eligibleAssignments;
  result.hasEligibleRoster = Array.isArray(ministers) || Array.isArray(assignments);

  if (!result.hasEligibleRoster) {
    result.warnings.push(
      'This page had no eligible roster, so unassigned elders and households were not imported. ' +
        'Open the ministering page in LCR (the Unassigned tab is a reliable source) and copy it again.',
    );
  }

  for (const m of ministers ?? []) {
    if (!m.personUuid || !m.name) continue;
    const age = typeof m.age === 'number' ? m.age : null;
    const flagged = m.notGenerallyAssigned === true;
    const seen = eldersByUuid.get(m.personUuid);
    if (seen) {
      // Already assigned — enrich, never downgrade `unassigned`.
      seen.notGenerallyAssigned = flagged;
      if (seen.age === null) seen.age = age;
      continue;
    }
    eldersByUuid.set(m.personUuid, {
      legacyId: m.personUuid,
      name: m.name,
      age,
      unassigned: true,
      notGenerallyAssigned: flagged,
    });
  }

  for (const a of assignments ?? []) {
    if (!a.personUuid || !a.name) continue;
    if (householdsByUuid.has(a.personUuid)) continue;
    householdsByUuid.set(a.personUuid, {
      legacyId: a.personUuid,
      name: a.name,
      unassigned: true,
    });
  }

  result.elders = [...eldersByUuid.values()].sort((a, b) => a.name.localeCompare(b.name));
  result.households = [...householdsByUuid.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return result;
}

/**
 * Extract the body of `<script id="__NEXT_DATA__" type="application/json">…</script>`.
 * Handles three input formats: saved HTML, Chrome view-source HTML, or raw JSON.
 */
export function extractNextDataJson(input: string): string | null {
  const trimmed = input.trim();

  // Path 1: pasted raw JSON
  if (trimmed.startsWith('{') && trimmed.includes('"__NEXT_DATA__"' /* unlikely */) === false) {
    // Quick sanity: looks like JSON and contains the expected nested key
    if (trimmed.includes('ministeringData')) return trimmed;
  }

  // Path 2: parse as HTML and look for the script element. Works for both
  // saved-page HTML and Chrome view-source HTML, because in view-source the
  // page's source tokens become text content inside .line-content cells —
  // textContent gives us the original HTML markup as a string, including the
  // unencoded `<script id="__NEXT_DATA__">` tag.
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(input, 'text/html');

    // 2a) Saved-page HTML: the actual <script> element is in the DOM.
    const scriptEl = doc.querySelector('script#__NEXT_DATA__');
    const scriptText = scriptEl?.textContent;
    if (scriptText && scriptText.includes('ministeringData')) return scriptText;

    // 2b) Chrome view-source HTML: the page is wrapped in <table class="line-wrap">.
    // Pull the body's full text and regex for the script tag.
    const bodyText = doc.body?.textContent ?? '';
    const m = bodyText.match(
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (m && m[1].includes('ministeringData')) return m[1];
  }

  // Path 3: regex on the raw input — for non-browser callers (tests) where
  // DOMParser may not be configured, or as a final fallback.
  const direct = input.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (direct && direct[1].includes('ministeringData')) return direct[1];

  // Path 4: view-source style — angle brackets HTML-escaped. Decode just enough
  // to find the script body.
  const viewSource = input.match(
    /__NEXT_DATA__[^]*?application\/json[^]*?(?:&gt;|>)<\/span>([\s\S]*?)<span[^>]*>(?:&lt;|<)\/script/,
  );
  if (viewSource && viewSource[1].includes('ministeringData')) return viewSource[1];

  return null;
}
