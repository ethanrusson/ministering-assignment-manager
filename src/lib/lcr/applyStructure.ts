// Helpers for the second half of an LCR import: write districts and
// companionships (and their elder/household links) at default canvas positions.
// Names are matched case-insensitively against existing rows.

import { supabase } from '@/lib/supabase';
import {
  COLS,
  DISTRICT_WIDTH,
  cellTopLeft,
  districtHeightForCount,
} from '@/canvas/layout';
import type { ParseResult } from './parser';

const norm = (s: string) => s.trim().toLowerCase();

const DISTRICT_X0 = 80;
const DISTRICT_Y0 = 80;
const DISTRICT_GAP_X = 40;

export interface ApplyStructureInput {
  parsed: ParseResult;
  /** Pre-loaded current state from stores. */
  existing: {
    wardId: string;
    districts: { id: string; name: string }[];
    companionships: { id: string }[];
    elders: { id: string; name: string }[];
    households: { id: string; name: string }[];
  };
}

export interface ApplyStructureResult {
  districtsCreated: number;
  companionshipsCreated: number;
  elderLinksCreated: number;
  householdLinksCreated: number;
  notes: string[];
}

/**
 * Wipes existing companionships (and their links) and existing districts in
 * the same ward, then recreates from the parsed import. Cascades handle the
 * link tables.
 */
export async function applyStructure(
  input: ApplyStructureInput,
): Promise<ApplyStructureResult> {
  const { parsed, existing } = input;
  const notes: string[] = [];

  // 1) Tear down existing structure.
  if (existing.companionships.length) {
    const { error } = await supabase
      .from('companionships')
      .delete()
      .in(
        'id',
        existing.companionships.map((c) => c.id),
      );
    if (error) throw error;
    notes.push(`Removed ${existing.companionships.length} existing companionships.`);
  }
  if (existing.districts.length) {
    const { error } = await supabase
      .from('districts')
      .delete()
      .in(
        'id',
        existing.districts.map((d) => d.id),
      );
    if (error) throw error;
    notes.push(`Removed ${existing.districts.length} existing districts.`);
  }

  // 2) Insert districts. One per parsed.districts, side-by-side columns sized
  //    to the 2-column grid.
  const districtsByLegacy = new Map<string, string>(); // legacy uuid -> db id
  const districtsToInsert = parsed.districts.map((d, i) => {
    const compsInDistrict = parsed.companionships.filter(
      (c) => c.districtLegacyId === d.legacyId,
    ).length;
    return {
      ward_id: existing.wardId,
      name: d.name,
      position_x: DISTRICT_X0 + i * (DISTRICT_WIDTH + DISTRICT_GAP_X),
      position_y: DISTRICT_Y0,
      width: DISTRICT_WIDTH,
      height: districtHeightForCount(compsInDistrict),
    };
  });

  let districtsCreated = 0;
  if (districtsToInsert.length) {
    const { data: inserted, error } = await supabase
      .from('districts')
      .insert(districtsToInsert)
      .select();
    if (error) throw error;
    districtsCreated = inserted!.length;
    inserted!.forEach((row, i) => {
      districtsByLegacy.set(parsed.districts[i].legacyId, row.id);
    });
  }

  // 3) Build elder/household name → DB id lookups.
  const eldersByName = new Map(existing.elders.map((e) => [norm(e.name), e.id]));
  const householdsByName = new Map(existing.households.map((h) => [norm(h.name), h.id]));

  // Build a map of parsed elder legacyId -> DB id (via parsed name).
  const parsedElderIdToDb = new Map<string, string>();
  for (const e of parsed.elders) {
    const id = eldersByName.get(norm(e.name));
    if (id) parsedElderIdToDb.set(e.legacyId, id);
  }
  const parsedHouseholdIdToDb = new Map<string, string>();
  for (const h of parsed.households) {
    const id = householdsByName.get(norm(h.name));
    if (id) parsedHouseholdIdToDb.set(h.legacyId, id);
  }

  // 4) Insert companionships into the 2-column grid of their district.
  //    Layout order: row-major (col 0 row 0, col 1 row 0, col 0 row 1, …).
  const ordinalInDistrict = new Map<string, number>();
  const compRows = parsed.companionships.map((c) => {
    const districtDbId = c.districtLegacyId ? districtsByLegacy.get(c.districtLegacyId) : null;
    const districtIdx = c.districtLegacyId
      ? Math.max(
          0,
          parsed.districts.findIndex((d) => d.legacyId === c.districtLegacyId),
        )
      : 0;
    const ord = ordinalInDistrict.get(c.districtLegacyId ?? 'none') ?? 0;
    ordinalInDistrict.set(c.districtLegacyId ?? 'none', ord + 1);
    const districtPos = {
      position_x: DISTRICT_X0 + districtIdx * (DISTRICT_WIDTH + DISTRICT_GAP_X),
      position_y: DISTRICT_Y0,
    };
    const col = ord % COLS;
    const row = Math.floor(ord / COLS);
    const tl = cellTopLeft(districtPos, col, row);
    return {
      ward_id: existing.wardId,
      district_id: districtDbId ?? null,
      position_x: tl.x,
      position_y: tl.y,
    };
  });

  let companionshipsCreated = 0;
  let elderLinksCreated = 0;
  let householdLinksCreated = 0;

  if (compRows.length) {
    const { data: insertedComps, error } = await supabase
      .from('companionships')
      .insert(compRows)
      .select();
    if (error) throw error;
    companionshipsCreated = insertedComps!.length;

    // 5) Build link rows.
    const elderLinks: { companionship_id: string; elder_id: string }[] = [];
    const householdLinks: { companionship_id: string; household_id: string }[] = [];
    insertedComps!.forEach((row, i) => {
      const parsedComp = parsed.companionships[i];
      for (const elderLegacy of parsedComp.elderLegacyIds) {
        const eId = parsedElderIdToDb.get(elderLegacy);
        if (eId) elderLinks.push({ companionship_id: row.id, elder_id: eId });
      }
      for (const hhLegacy of parsedComp.householdLegacyIds) {
        const hId = parsedHouseholdIdToDb.get(hhLegacy);
        if (hId) householdLinks.push({ companionship_id: row.id, household_id: hId });
      }
    });

    // 6) Insert links in chunks to keep payloads sane.
    if (elderLinks.length) {
      const { error: e } = await supabase.from('companionship_elders').insert(elderLinks);
      if (e) throw e;
      elderLinksCreated = elderLinks.length;
    }
    if (householdLinks.length) {
      const { error: e } = await supabase.from('companionship_households').insert(householdLinks);
      if (e) throw e;
      householdLinksCreated = householdLinks.length;
    }
  }

  return {
    districtsCreated,
    companionshipsCreated,
    elderLinksCreated,
    householdLinksCreated,
    notes,
  };
}
