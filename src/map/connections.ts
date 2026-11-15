// Connection lines for the selected household (D8), as household-id pairs.
// Drawing resolves them to positions; pairs touching a household with no
// location are dropped there.

export interface MinisteringModel {
  /** household id → companionship id ministering to it */
  companionshipForHousehold: Map<string, string>;
  /** elder id → companionship id they minister in */
  companionshipForElder: Map<string, string>;
  eldersInCompanionship: Map<string, string[]>;
  householdsInCompanionship: Map<string, string[]>;
  /** elder id → household id they live in */
  homeOf: Map<string, string>;
}

export interface Line {
  from: string;
  to: string;
}

export interface Connections {
  /** Each minister's home → the selected household. */
  ministers: Line[];
  /** Selected household → each household an elder living there ministers to. */
  served: Line[];
  /** Selected household → the companion's home. */
  companion: Line[];
  /** Every household that stays at full opacity. */
  focus: Set<string>;
}

export function eldersLivingIn(householdId: string, m: MinisteringModel): string[] {
  const out: string[] = [];
  for (const [elderId, home] of m.homeOf) if (home === householdId) out.push(elderId);
  return out;
}

export function buildConnections(householdId: string, m: MinisteringModel): Connections {
  const c: Connections = { ministers: [], served: [], companion: [], focus: new Set([householdId]) };
  const add = (list: Line[], from: string, to: string) => {
    if (from === to || list.some((l) => l.from === from && l.to === to)) return;
    list.push({ from, to });
    c.focus.add(from);
    c.focus.add(to);
  };

  const comp = m.companionshipForHousehold.get(householdId);
  for (const elderId of comp ? (m.eldersInCompanionship.get(comp) ?? []) : []) {
    const home = m.homeOf.get(elderId);
    if (home) add(c.ministers, home, householdId);
  }

  for (const elderId of eldersLivingIn(householdId, m)) {
    const own = m.companionshipForElder.get(elderId);
    if (!own) continue;
    for (const served of m.householdsInCompanionship.get(own) ?? []) {
      add(c.served, householdId, served);
    }
    for (const companionId of m.eldersInCompanionship.get(own) ?? []) {
      if (companionId === elderId) continue;
      const home = m.homeOf.get(companionId);
      if (home) add(c.companion, householdId, home);
    }
  }
  return c;
}

/** Every companionship's lines, for the "All connections" overlay: minister homes → households. */
export function allConnections(m: MinisteringModel): Line[] {
  const out: Line[] = [];
  for (const [comp, households] of m.householdsInCompanionship) {
    const homes = (m.eldersInCompanionship.get(comp) ?? [])
      .map((e) => m.homeOf.get(e))
      .filter((h): h is string => !!h);
    for (const home of homes) for (const h of households) if (home !== h) out.push({ from: home, to: h });
  }
  return out;
}
