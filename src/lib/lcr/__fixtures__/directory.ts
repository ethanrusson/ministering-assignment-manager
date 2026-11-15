// Scrubbed sample of the Member Directory households API:
//   GET https://directory.churchofjesuschrist.org/api/v4/households?unit=<unitNumber>
// The user opens that URL while signed in, selects all, and pastes the raw JSON.
// Key names, key order, value types and optional-key behaviour match the live
// response. Names, IDs, addresses, phones and coordinates are invented; points sit
// near 0°N 0°E (Gulf of Guinea) with roughly realistic spacing.
// See docs/lcr-directory-structure.md.

const UNIT = 1234567;
const COUNTRY = 251;

type Privacy = "STAKE" | "WARD" | "LEADERS";

interface MemberOpts {
  head?: boolean;
  phone?: boolean;
  email?: boolean;
  position?: string;
  privacy?: Privacy;
  /** Extra record fields the API only returns for the viewer's own household. */
  extended?: { sex: "MALE" | "FEMALE"; age: number; priesthood?: string };
}

/** Person UUIDs are `22222222-…-0000000HHMM` (household HH, member MM). */
export const personUuid = (hh: number, m: number) =>
  `22222222-0000-4000-8000-0000000${String(hh).padStart(3, "0")}${String(m).padStart(2, "0")}`;
export const householdUuid = (hh: number) =>
  `11111111-0000-4000-8000-${String(hh).padStart(12, "0")}`;

function member(
  hh: number,
  m: number,
  given: string,
  surname: string,
  o: MemberOpts = {},
) {
  const level = o.privacy ?? "STAKE";
  const phone = o.phone
    ? {
        number: "(555) 555-0100",
        e164: "+15555550100",
        country: COUNTRY,
        supports: ["VOICE", "TEXT"],
      }
    : undefined;
  const email = o.email ? { email: "member@example.com" } : undefined;
  const positions = o.position
    ? [
        {
          uuid: "33333333-0000-4000-8000-000000000001",
          positionTypeId: 208,
          positionTypeName: o.position,
          unitNumber: UNIT,
          unitName: "Example Ward",
        },
      ]
    : undefined;
  const privacy = {
    photo: level,
    ...(phone && { phone: level }),
    ...(email && { email: level }),
    birthDate: level,
  };
  const base = {
    uuid: personUuid(hh, m),
    householdUuid: householdUuid(hh),
    unitNumber: UNIT,
    countryId: COUNTRY,
    head: o.head ?? false,
    name: `${surname}, ${given}`,
    displayName: `${given} ${surname}`,
  };
  if (o.extended) {
    const x = o.extended;
    return {
      ...base,
      officialName: `${surname}, ${given} Example`,
      givenName: given,
      surname,
      ...(phone && { phone }),
      ...(email && { email }),
      ...(positions && { positions }),
      classes: ["Elders Quorum"],
      ministeringBrothers: ["Placeholder, Name"],
      ministeringAssignments: [
        { companions: ["Placeholder, Name"], families: ["Placeholder, Name"] },
      ],
      sex: x.sex,
      mrn: "000-0000-0000",
      ...(x.priesthood && { priesthood: x.priesthood }),
      birthDate: "1 January 1990",
      birthPlace: "Sampletown",
      birthCountry: "Exampleland",
      age: x.age,
      ordinances: [{ label: "Baptism", date: "1 January 1998" }],
      father: {
        uuid: "44444444-0000-4000-8000-000000000001",
        name: "Placeholder, Father",
        birthDate: "1 January 1960",
        editable: false,
      },
      mother: {
        uuid: "44444444-0000-4000-8000-000000000002",
        name: "Placeholder, Mother",
        birthDate: "1 January 1962",
        editable: false,
      },
      priorUnit: {
        unitNumber: 7654321,
        unitType: "WARD",
        name: "Prior Example Ward",
      },
      priorUnitMoveOutDate: "1 January 2024",
      privacy,
      editable: true,
      photoUnapproved: false,
    };
  }
  return {
    ...base,
    givenName: given,
    surname,
    ...(phone && { phone }),
    ...(email && { email }),
    ...(positions && { positions }),
    privacy,
    editable: false,
  };
}

interface HouseholdOpts {
  name: string;
  surname: string;
  street: string;
  coordinates?: { latitude: number; longitude: number };
  verified: boolean;
  privacy?: { address: Privacy; coordinates: Privacy; photo: Privacy };
  editable?: boolean;
}

function household(
  hh: number,
  o: HouseholdOpts,
  members: ReturnType<typeof member>[],
) {
  return {
    uuid: householdUuid(hh),
    unitNumber: UNIT,
    name: o.name,
    surname: o.surname,
    address: `${o.street}\nSampletown ZZ 00000-0000`,
    ...(o.coordinates && { coordinates: o.coordinates }),
    verified: o.verified,
    members,
    privacy: o.privacy ?? {
      address: "STAKE",
      coordinates: "STAKE",
      photo: "STAKE",
    },
    editable: o.editable ?? false,
    movable: true,
    ...(o.editable && { photoUnapproved: false }),
  };
}

/** Two apartments geocoded to one building point. */
const SHARED_POINT = { latitude: 0.032101, longitude: 0.031055 };

export const DIRECTORY_HOUSEHOLDS = [
  // Two heads, three children; the adult son (member 3) is an elder who is not head.
  household(
    1,
    {
      name: "Alpha, Aaron & Amy",
      surname: "Alpha",
      street: "101 Example St",
      coordinates: { latitude: 0.0312345, longitude: 0.0298765 },
      verified: true,
    },
    [
      member(1, 1, "Aaron", "Alpha", {
        head: true,
        phone: true,
        email: true,
        position: "Sunday School Teacher",
      }),
      member(1, 2, "Amy", "Alpha", { head: true, phone: true, email: true }),
      member(1, 3, "Arlo", "Alpha", { phone: true }),
      member(1, 4, "Abby", "Alpha"),
      member(1, 5, "Alex", "Alpha"),
    ],
  ),
  // One person. Unverified pin with the long float precision the map's drag tool leaves.
  household(
    2,
    {
      name: "Bravo, Bodhi",
      surname: "Bravo",
      street: "202 Sample Ave",
      coordinates: { latitude: 0.03345678901234, longitude: 0.03123456789012 },
      verified: false,
    },
    [member(2, 1, "Bodhi", "Bravo", { head: true, email: true })],
  ),
  // Location visible to the ward only.
  household(
    3,
    {
      name: "Charlie, Carl & Cara",
      surname: "Charlie",
      street: "303 Placeholder Rd",
      coordinates: { latitude: 0.0287654, longitude: 0.0335432 },
      verified: true,
      privacy: { address: "WARD", coordinates: "WARD", photo: "WARD" },
    },
    [
      member(3, 1, "Carl", "Charlie", {
        head: true,
        phone: true,
        privacy: "WARD",
      }),
      member(3, 2, "Cara", "Charlie", { head: true, privacy: "WARD" }),
    ],
  ),
  // Location hidden from members: leaders still receive the coordinates.
  household(
    4,
    {
      name: "Delta, Drew & Dana",
      surname: "Delta",
      street: "404 Fixture Ln",
      coordinates: { latitude: 0.0301234, longitude: 0.0271234 },
      verified: false,
      privacy: { address: "LEADERS", coordinates: "LEADERS", photo: "LEADERS" },
    },
    [
      member(4, 1, "Drew", "Delta", { head: true, privacy: "LEADERS" }),
      member(4, 2, "Dana", "Delta", {
        head: true,
        phone: true,
        privacy: "LEADERS",
      }),
      member(4, 3, "Dax", "Delta", { privacy: "LEADERS" }),
    ],
  ),
  // Households 5 and 6: different apartments, identical coordinates.
  household(
    5,
    {
      name: "Echo, Evan & Erin",
      surname: "Echo",
      street: "505 Example St Apt 2",
      coordinates: SHARED_POINT,
      verified: false,
    },
    [
      member(5, 1, "Evan", "Echo", { head: true, phone: true, email: true }),
      member(5, 2, "Erin", "Echo", { head: true, email: true }),
    ],
  ),
  household(
    6,
    {
      name: "Foxtrot, Frank",
      surname: "Foxtrot",
      street: "505 Example St Apt 3",
      coordinates: SHARED_POINT,
      verified: false,
    },
    [member(6, 1, "Frank", "Foxtrot", { head: true, phone: true })],
  ),
  // Pinned about 21 km from the rest of the ward.
  household(
    7,
    {
      name: "Golf, Greg & Greta",
      surname: "Golf",
      street: "707 Remote Hwy",
      coordinates: { latitude: 0.2251234, longitude: 0.0412345 },
      verified: true,
      privacy: { address: "LEADERS", coordinates: "LEADERS", photo: "LEADERS" },
    },
    [
      member(7, 1, "Greg", "Golf", { head: true, privacy: "LEADERS" }),
      member(7, 2, "Greta", "Golf", { head: true, privacy: "LEADERS" }),
    ],
  ),
  // The signed-in viewer's own household: editable, with extended record fields.
  household(
    8,
    {
      name: "Hotel, Hank & Holly",
      surname: "Hotel",
      street: "808 Sample Ave",
      coordinates: { latitude: 0.0295555, longitude: 0.0311111 },
      verified: true,
      editable: true,
    },
    [
      member(8, 1, "Hank", "Hotel", {
        head: true,
        phone: true,
        email: true,
        extended: { sex: "MALE", age: 34, priesthood: "ELDER" },
      }),
      member(8, 2, "Holly", "Hotel", {
        head: true,
        phone: true,
        email: true,
        extended: { sex: "FEMALE", age: 33 },
      }),
      member(8, 3, "Hugo", "Hotel", { extended: { sex: "MALE", age: 6 } }),
    ],
  ),
];

/**
 * A household with no map location. Not seen in the sampled ward: the shape is
 * inferred from the directory app's own code (`unmapped = !household.coordinates`),
 * so the `coordinates` key is simply absent.
 */
export const DIRECTORY_UNMAPPED_HOUSEHOLD = household(
  9,
  {
    name: "India, Ivan",
    surname: "India",
    street: "909 Placeholder Rd",
    verified: false,
  },
  [member(9, 1, "Ivan", "India", { head: true })],
);

/** Exactly what the user pastes: the raw response body (minified JSON array). */
export function directoryJson(
  households: unknown[] = DIRECTORY_HOUSEHOLDS,
): string {
  return JSON.stringify(households);
}
