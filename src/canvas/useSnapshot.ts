// Ward-scoped snapshot of companionship membership (elder/household links).
//
// The snapshot is persisted to the `snapshots` table so all members of the same
// ward share a common baseline. The in-memory `snapshot` ref is the source of
// truth for rendering — it is populated on app load and kept in sync with the DB.
//
// One "baseline" row per ward (name = 'baseline'). Save replaces it; clear deletes it.

import { computed, readonly, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';

export interface SnapshotState {
  elderLinks: { companionship_id: string; elder_id: string }[];
  householdLinks: { companionship_id: string; household_id: string }[];
}

// DB storage shape (snake_case keys in the jsonb state column).
interface SnapshotDbState {
  elder_links: { companionship_id: string; elder_id: string }[];
  household_links: { companionship_id: string; household_id: string }[];
}

const SNAPSHOT_NAME = 'baseline';

const snapshot = ref<SnapshotState | null>(null);

export function useSnapshot() {
  /** Fetch the ward's baseline snapshot from DB and populate the in-memory ref. */
  async function loadSnapshot(wardId: string) {
    const { data, error } = await supabase
      .from('snapshots')
      .select('state')
      .eq('ward_id', wardId)
      .eq('name', SNAPSHOT_NAME)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      snapshot.value = null;
      return;
    }
    const state = data.state as unknown as SnapshotDbState;
    snapshot.value = {
      elderLinks: state.elder_links ?? [],
      householdLinks: state.household_links ?? [],
    };
  }

  /** Save the current assignment state as the ward baseline (replaces any prior one). */
  async function saveSnapshot(
    wardId: string,
    elderLinks: { companionship_id: string; elder_id: string }[],
    householdLinks: { companionship_id: string; household_id: string }[],
  ) {
    const state: SnapshotDbState = {
      elder_links: elderLinks.map((l) => ({ ...l })),
      household_links: householdLinks.map((l) => ({ ...l })),
    };
    // Delete the existing baseline (if any) then insert fresh, so we don't
    // need a unique constraint on (ward_id, name).
    const { error: delErr } = await supabase
      .from('snapshots')
      .delete()
      .eq('ward_id', wardId)
      .eq('name', SNAPSHOT_NAME);
    if (delErr) throw delErr;

    const { error: insErr } = await supabase
      .from('snapshots')
      .insert({ ward_id: wardId, name: SNAPSHOT_NAME, state: state as unknown as Json });
    if (insErr) throw insErr;

    snapshot.value = {
      elderLinks: state.elder_links,
      householdLinks: state.household_links,
    };
  }

  /** Remove the ward baseline snapshot from DB and clear the in-memory ref. */
  async function clearSnapshot(wardId: string) {
    const { error } = await supabase
      .from('snapshots')
      .delete()
      .eq('ward_id', wardId)
      .eq('name', SNAPSHOT_NAME);
    if (error) throw error;
    snapshot.value = null;
  }

  return {
    snapshot: readonly(snapshot),
    hasSnapshot: computed(() => snapshot.value !== null),
    loadSnapshot,
    saveSnapshot,
    clearSnapshot,
  };
}
