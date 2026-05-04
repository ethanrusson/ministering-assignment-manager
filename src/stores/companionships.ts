import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import type { Database } from '@/types/database';

export type Companionship = Database['public']['Tables']['companionships']['Row'];

interface CompanionshipElderLink {
  companionship_id: string;
  elder_id: string;
}
interface CompanionshipHouseholdLink {
  companionship_id: string;
  household_id: string;
}

export const useCompanionshipsStore = defineStore('companionships', () => {
  const items = ref<Companionship[]>([]);
  const elderLinks = ref<CompanionshipElderLink[]>([]);
  const householdLinks = ref<CompanionshipHouseholdLink[]>([]);
  const loaded = ref(false);

  const byId = computed(() => new Map(items.value.map((c) => [c.id, c])));

  /** elder_id -> companionship_id */
  const companionshipForElder = computed(
    () => new Map(elderLinks.value.map((l) => [l.elder_id, l.companionship_id])),
  );
  /** household_id -> companionship_id */
  const companionshipForHousehold = computed(
    () => new Map(householdLinks.value.map((l) => [l.household_id, l.companionship_id])),
  );
  /** companionship_id -> elder_id[] */
  const eldersInCompanionship = computed(() => {
    const m = new Map<string, string[]>();
    for (const link of elderLinks.value) {
      const arr = m.get(link.companionship_id) ?? [];
      arr.push(link.elder_id);
      m.set(link.companionship_id, arr);
    }
    return m;
  });
  /** companionship_id -> household_id[] */
  const householdsInCompanionship = computed(() => {
    const m = new Map<string, string[]>();
    for (const link of householdLinks.value) {
      const arr = m.get(link.companionship_id) ?? [];
      arr.push(link.household_id);
      m.set(link.companionship_id, arr);
    }
    return m;
  });

  async function fetch() {
    const [{ data: comps, error: e1 }, { data: el, error: e2 }, { data: hl, error: e3 }] =
      await Promise.all([
        supabase.from('companionships').select('*').order('created_at'),
        supabase.from('companionship_elders').select('*'),
        supabase.from('companionship_households').select('*'),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    items.value = comps ?? [];
    elderLinks.value = el ?? [];
    householdLinks.value = hl ?? [];
    loaded.value = true;
  }

  async function create(input: {
    elderIds: string[];
    districtId?: string | null;
    position_x?: number;
    position_y?: number;
  }) {
    const auth = useAuthStore();
    if (!auth.wardId) throw new Error('No ward.');
    // 1) Detach those elders from any prior companionship
    if (input.elderIds.length) {
      await supabase
        .from('companionship_elders')
        .delete()
        .in('elder_id', input.elderIds);
      elderLinks.value = elderLinks.value.filter((l) => !input.elderIds.includes(l.elder_id));
    }
    // 2) Create the companionship row
    const { data: comp, error } = await supabase
      .from('companionships')
      .insert({
        ward_id: auth.wardId,
        district_id: input.districtId ?? null,
        position_x: input.position_x ?? 0,
        position_y: input.position_y ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    items.value.push(comp);
    // 3) Link elders
    if (input.elderIds.length) {
      const links = input.elderIds.map((elder_id) => ({ companionship_id: comp.id, elder_id }));
      const { error: e } = await supabase.from('companionship_elders').insert(links);
      if (e) throw e;
      elderLinks.value.push(...links);
    }
    // Auto-dissolve any prior companionships left with <2 elders
    await dissolveSingletonCompanionships();
    return comp;
  }

  async function update(
    id: string,
    patch: Partial<Pick<Companionship, 'district_id' | 'position_x' | 'position_y'>>,
  ) {
    const { data, error } = await supabase
      .from('companionships')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    const idx = items.value.findIndex((c) => c.id === id);
    if (idx >= 0) items.value[idx] = data;
  }

  async function remove(id: string) {
    // Cascade rules in DB drop the link rows; reflect locally too.
    const { error } = await supabase.from('companionships').delete().eq('id', id);
    if (error) throw error;
    items.value = items.value.filter((c) => c.id !== id);
    elderLinks.value = elderLinks.value.filter((l) => l.companionship_id !== id);
    householdLinks.value = householdLinks.value.filter((l) => l.companionship_id !== id);
  }

  /** Move an elder into a companionship (removes from any prior one). */
  async function assignElder(elderId: string, companionshipId: string) {
    const { error: e1 } = await supabase
      .from('companionship_elders')
      .delete()
      .eq('elder_id', elderId);
    if (e1) throw e1;
    elderLinks.value = elderLinks.value.filter((l) => l.elder_id !== elderId);

    const { error: e2 } = await supabase
      .from('companionship_elders')
      .insert({ companionship_id: companionshipId, elder_id: elderId });
    if (e2) throw e2;
    elderLinks.value.push({ companionship_id: companionshipId, elder_id: elderId });
    await dissolveSingletonCompanionships();
  }

  /** Remove an elder from any companionship. */
  async function unassignElder(elderId: string) {
    const { error } = await supabase
      .from('companionship_elders')
      .delete()
      .eq('elder_id', elderId);
    if (error) throw error;
    elderLinks.value = elderLinks.value.filter((l) => l.elder_id !== elderId);
    await dissolveSingletonCompanionships();
  }

  async function assignHousehold(householdId: string, companionshipId: string) {
    const { error: e1 } = await supabase
      .from('companionship_households')
      .delete()
      .eq('household_id', householdId);
    if (e1) throw e1;
    householdLinks.value = householdLinks.value.filter((l) => l.household_id !== householdId);

    const { error: e2 } = await supabase
      .from('companionship_households')
      .insert({ companionship_id: companionshipId, household_id: householdId });
    if (e2) throw e2;
    householdLinks.value.push({ companionship_id: companionshipId, household_id: householdId });
  }

  async function unassignHousehold(householdId: string) {
    const { error } = await supabase
      .from('companionship_households')
      .delete()
      .eq('household_id', householdId);
    if (error) throw error;
    householdLinks.value = householdLinks.value.filter((l) => l.household_id !== householdId);
  }

  /** Any companionship with 0 or 1 elder is dissolved.
   *  A surviving 1-elder companionship would be ambiguous — we let the lone
   *  elder become "stranded" on the canvas instead (handled at render time:
   *  a non-companionship elder card with a position).
   *  v1 simplification: we just delete the empty/singleton row; the elder
   *  returns to the unassigned sidebar. UX-stranded behavior arrives later.
   */
  async function dissolveSingletonCompanionships() {
    const counts = new Map<string, number>();
    for (const l of elderLinks.value) {
      counts.set(l.companionship_id, (counts.get(l.companionship_id) ?? 0) + 1);
    }
    const toDissolve = items.value
      .map((c) => c.id)
      .filter((id) => (counts.get(id) ?? 0) < 2);
    if (!toDissolve.length) return;
    const { error } = await supabase.from('companionships').delete().in('id', toDissolve);
    if (error) throw error;
    items.value = items.value.filter((c) => !toDissolve.includes(c.id));
    elderLinks.value = elderLinks.value.filter(
      (l) => !toDissolve.includes(l.companionship_id),
    );
    householdLinks.value = householdLinks.value.filter(
      (l) => !toDissolve.includes(l.companionship_id),
    );
  }

  return {
    items,
    elderLinks,
    householdLinks,
    byId,
    companionshipForElder,
    companionshipForHousehold,
    eldersInCompanionship,
    householdsInCompanionship,
    loaded,
    fetch,
    create,
    update,
    remove,
    assignElder,
    unassignElder,
    assignHousehold,
    unassignHousehold,
  };
});
