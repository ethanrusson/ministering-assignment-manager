// Full-ward backup: export everything to a JSON file, import to replace live state.
//
// Tables (in import-safe dependency order):
//   location_groups                  (no FK to other ward data)
//   elders, households, labels       (elders.home_household_id and
//                                     households.district_id are written in a
//                                     second pass, once their targets exist)
//   districts                        (no FK to other ward data)
//   companionships                   (FK -> districts)
//   companionship_elders             (FK -> companionships, elders)
//   companionship_households         (FK -> companionships, households)
//   household_labels                 (FK -> households, labels)
//   location_reviews                 (FK -> households)
//   streets, homes                   (no FK to other ward data)
//   flag_acknowledgements            (FK -> households, companionships)
//
// Delete order is the reverse. Rows keep their original ids so positions and
// joins survive the round-trip; only ward_id is rewritten to the current ward.
//
// Version 1 files predate the map tables, version 2 files predate homes, and
// version 3 files predate flag acknowledgements; they restore with those
// tables empty.

import { supabase } from './supabase';
import type { Database, Json } from '@/types/database';

export const BACKUP_VERSION = 4;
const SUPPORTED_VERSIONS = [1, 2, 3, 4];

interface ElderRow {
  id: string;
  ward_id: string;
  name: string;
  age: number | null;
  hidden: boolean;
  created_at: string;
  lcr_uuid?: string | null;
  not_generally_assigned?: boolean;
  home_household_id?: string | null;
}
interface HouseholdRow {
  id: string;
  ward_id: string;
  name: string;
  hidden: boolean;
  created_at: string;
  lcr_uuid?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_source?: 'lcr' | 'manual' | null;
  location_updated_at?: string | null;
  district_id?: string | null;
  location_group_id?: string | null;
}
type LocationGroupRow = Database['public']['Tables']['location_groups']['Row'];
type LocationReviewRow = Database['public']['Tables']['location_reviews']['Row'];
type StreetRow = Database['public']['Tables']['streets']['Row'];
type HomeRow = Database['public']['Tables']['homes']['Row'];
type FlagAckRow = Database['public']['Tables']['flag_acknowledgements']['Row'];
interface LabelRow {
  id: string;
  ward_id: string;
  name: string;
  color: string;
  created_at: string;
}
interface DistrictRow {
  id: string;
  ward_id: string;
  name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
}
interface CompanionshipRow {
  id: string;
  ward_id: string;
  district_id: string | null;
  position_x: number;
  position_y: number;
  created_at: string;
}
interface CompanionshipElderLink {
  companionship_id: string;
  elder_id: string;
}
interface CompanionshipHouseholdLink {
  companionship_id: string;
  household_id: string;
}
interface HouseholdLabelLink {
  household_id: string;
  label_id: string;
}

export interface WardBackup {
  version: number;
  exported_at: string;
  ward: { name: string | null; boundary?: Json | null };
  elders: ElderRow[];
  households: HouseholdRow[];
  labels: LabelRow[];
  districts: DistrictRow[];
  companionships: CompanionshipRow[];
  companionship_elders: CompanionshipElderLink[];
  companionship_households: CompanionshipHouseholdLink[];
  household_labels: HouseholdLabelLink[];
  /** Added in version 2. */
  location_groups?: LocationGroupRow[];
  location_reviews?: LocationReviewRow[];
  streets?: StreetRow[];
  /** Added in version 3. */
  homes?: HomeRow[];
  /** Added in version 4. */
  flag_acknowledgements?: FlagAckRow[];
}

export async function exportWardBackup(wardId: string): Promise<WardBackup> {
  const [
    wardRes,
    eldersRes,
    householdsRes,
    labelsRes,
    districtsRes,
    compsRes,
    compEldersRes,
    compHouseholdsRes,
    hhLabelsRes,
    groupsRes,
    reviewsRes,
    streetsRes,
    homesRes,
    acksRes,
  ] = await Promise.all([
    supabase.from('wards').select('name, boundary').eq('id', wardId).maybeSingle(),
    supabase.from('elders').select('*').eq('ward_id', wardId),
    supabase.from('households').select('*').eq('ward_id', wardId),
    supabase.from('labels').select('*').eq('ward_id', wardId),
    supabase.from('districts').select('*').eq('ward_id', wardId),
    supabase.from('companionships').select('*').eq('ward_id', wardId),
    supabase.from('companionship_elders').select('*'),
    supabase.from('companionship_households').select('*'),
    supabase.from('household_labels').select('*'),
    supabase.from('location_groups').select('*').eq('ward_id', wardId),
    supabase.from('location_reviews').select('*').eq('ward_id', wardId),
    supabase.from('streets').select('*').eq('ward_id', wardId),
    supabase.from('homes').select('*').eq('ward_id', wardId),
    supabase.from('flag_acknowledgements').select('*').eq('ward_id', wardId),
  ]);

  for (const r of [
    wardRes,
    eldersRes,
    householdsRes,
    labelsRes,
    districtsRes,
    compsRes,
    compEldersRes,
    compHouseholdsRes,
    hhLabelsRes,
    groupsRes,
    reviewsRes,
    streetsRes,
    homesRes,
    acksRes,
  ]) {
    if (r.error) throw r.error;
  }

  return {
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    ward: { name: wardRes.data?.name ?? null, boundary: wardRes.data?.boundary ?? null },
    elders: (eldersRes.data ?? []) as ElderRow[],
    households: (householdsRes.data ?? []) as HouseholdRow[],
    labels: (labelsRes.data ?? []) as LabelRow[],
    districts: (districtsRes.data ?? []) as DistrictRow[],
    companionships: (compsRes.data ?? []) as CompanionshipRow[],
    companionship_elders: (compEldersRes.data ?? []) as CompanionshipElderLink[],
    companionship_households: (compHouseholdsRes.data ?? []) as CompanionshipHouseholdLink[],
    household_labels: (hhLabelsRes.data ?? []) as HouseholdLabelLink[],
    location_groups: groupsRes.data ?? [],
    location_reviews: reviewsRes.data ?? [],
    streets: streetsRes.data ?? [],
    homes: homesRes.data ?? [],
    flag_acknowledgements: acksRes.data ?? [],
  };
}

export function validateWardBackup(raw: unknown): WardBackup {
  if (!raw || typeof raw !== 'object') throw new Error('Backup file is not a JSON object.');
  const o = raw as Partial<WardBackup>;
  if (!SUPPORTED_VERSIONS.includes(o.version as number)) {
    throw new Error(
      `Backup version ${o.version ?? '(missing)'} not supported. Expected ${SUPPORTED_VERSIONS.join(' or ')}.`,
    );
  }
  const arr = (v: unknown, name: string): unknown[] => {
    if (!Array.isArray(v)) throw new Error(`Backup field "${name}" must be an array.`);
    return v;
  };
  arr(o.elders, 'elders');
  arr(o.households, 'households');
  arr(o.labels, 'labels');
  arr(o.districts, 'districts');
  arr(o.companionships, 'companionships');
  arr(o.companionship_elders, 'companionship_elders');
  arr(o.companionship_households, 'companionship_households');
  arr(o.household_labels, 'household_labels');
  for (const key of [
    'location_groups',
    'location_reviews',
    'streets',
    'homes',
    'flag_acknowledgements',
  ] as const) {
    if (o[key] !== undefined) arr(o[key], key);
  }
  return o as WardBackup;
}

/**
 * Replace the ward's live data with the backup. Deletes existing rows in
 * dependency-safe order, then inserts the backup contents (rewriting ward_id).
 */
export async function importWardBackup(wardId: string, backup: WardBackup): Promise<void> {
  // 1) Delete in reverse-dependency order. Join tables don't have ward_id, so
  //    we delete them by joining through the ward's companionships/households.
  const { data: existingComps, error: ecErr } = await supabase
    .from('companionships')
    .select('id')
    .eq('ward_id', wardId);
  if (ecErr) throw ecErr;
  const { data: existingHouseholds, error: ehErr } = await supabase
    .from('households')
    .select('id')
    .eq('ward_id', wardId);
  if (ehErr) throw ehErr;

  const compIds = (existingComps ?? []).map((r) => r.id);
  const householdIds = (existingHouseholds ?? []).map((r) => r.id);

  if (compIds.length) {
    const r1 = await supabase.from('companionship_elders').delete().in('companionship_id', compIds);
    if (r1.error) throw r1.error;
    const r2 = await supabase
      .from('companionship_households')
      .delete()
      .in('companionship_id', compIds);
    if (r2.error) throw r2.error;
  }
  if (householdIds.length) {
    const r3 = await supabase.from('household_labels').delete().in('household_id', householdIds);
    if (r3.error) throw r3.error;
  }

  for (const table of [
    'flag_acknowledgements',
    'homes',
    'streets',
    'location_reviews',
    'companionships',
    'districts',
    'labels',
    'households',
    'elders',
    'location_groups',
  ] as const) {
    const { error } = await supabase.from(table).delete().eq('ward_id', wardId);
    if (error) throw error;
  }
  // Drop the baseline snapshot too — it's tied to the old data.
  await supabase.from('snapshots').delete().eq('ward_id', wardId);

  // 2) Snapshot delete may have completed before the realtime echo arrives.
  //    Insert in dependency order. Re-stamp ward_id for safety.
  const stamp = <T extends { ward_id?: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, ward_id: wardId }));

  const groups = backup.location_groups ?? [];
  if (groups.length) {
    const { error } = await supabase.from('location_groups').insert(stamp(groups));
    if (error) throw error;
  }
  // Cross-references to rows not inserted yet are held back for a second pass.
  if (backup.elders.length) {
    const { error } = await supabase
      .from('elders')
      .insert(stamp(backup.elders).map((r) => ({ ...r, home_household_id: null })));
    if (error) throw error;
  }
  if (backup.households.length) {
    const { error } = await supabase
      .from('households')
      .insert(stamp(backup.households).map((r) => ({ ...r, district_id: null })));
    if (error) throw error;
  }
  if (backup.labels.length) {
    const { error } = await supabase.from('labels').insert(stamp(backup.labels));
    if (error) throw error;
  }
  if (backup.districts.length) {
    const { error } = await supabase.from('districts').insert(stamp(backup.districts));
    if (error) throw error;
  }
  if (backup.companionships.length) {
    const { error } = await supabase.from('companionships').insert(stamp(backup.companionships));
    if (error) throw error;
  }
  if (backup.companionship_elders.length) {
    const { error } = await supabase
      .from('companionship_elders')
      .insert(backup.companionship_elders);
    if (error) throw error;
  }
  if (backup.companionship_households.length) {
    const { error } = await supabase
      .from('companionship_households')
      .insert(backup.companionship_households);
    if (error) throw error;
  }
  if (backup.household_labels.length) {
    const { error } = await supabase.from('household_labels').insert(backup.household_labels);
    if (error) throw error;
  }

  // Second pass: cross-references now that every target row exists.
  const eldersWithHome = backup.elders.filter((r) => r.home_household_id);
  if (eldersWithHome.length) {
    const { error } = await supabase.from('elders').upsert(stamp(eldersWithHome));
    if (error) throw error;
  }
  const householdsWithDistrict = backup.households.filter((r) => r.district_id);
  if (householdsWithDistrict.length) {
    const { error } = await supabase.from('households').upsert(stamp(householdsWithDistrict));
    if (error) throw error;
  }

  const reviews = backup.location_reviews ?? [];
  if (reviews.length) {
    const { error } = await supabase.from('location_reviews').insert(stamp(reviews));
    if (error) throw error;
  }
  const streets = backup.streets ?? [];
  if (streets.length) {
    const { error } = await supabase.from('streets').insert(stamp(streets));
    if (error) throw error;
  }
  const acks = backup.flag_acknowledgements ?? [];
  if (acks.length) {
    const { error } = await supabase.from('flag_acknowledgements').insert(stamp(acks));
    if (error) throw error;
  }
  const homes = backup.homes ?? [];
  if (homes.length) {
    const { error } = await supabase.from('homes').insert(stamp(homes));
    if (error) throw error;
  }
  if (backup.ward.boundary !== undefined) {
    const { error } = await supabase
      .from('wards')
      .update({ boundary: backup.ward.boundary })
      .eq('id', wardId);
    if (error) throw error;
  }
}

export function downloadBackupAsFile(backup: WardBackup) {
  const safeName = (backup.ward.name ?? 'ward').replace(/[^a-z0-9-_]+/gi, '_');
  const date = backup.exported_at.slice(0, 10);
  const filename = `${safeName}-backup-${date}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readBackupFromFile(file: File): Promise<WardBackup> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  return validateWardBackup(parsed);
}
