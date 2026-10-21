// Live list of assignment changes since the ward's baseline snapshot.
// Shared by the Changes modal and the header's change-count badge.

import { computed } from 'vue';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useEldersStore } from '@/stores/elders';
import { useHouseholdsStore } from '@/stores/households';
import { useDistrictsStore } from '@/stores/districts';
import { useSnapshot } from './useSnapshot';
import { generateChangeList } from '@/lib/changeList';

export function useChangeList() {
  const companionships = useCompanionshipsStore();
  const elders = useEldersStore();
  const households = useHouseholdsStore();
  const districts = useDistrictsStore();
  const snap = useSnapshot();

  const groups = computed(() => {
    if (!snap.snapshot.value) return [];
    return generateChangeList(
      snap.snapshot.value,
      companionships.elderLinks,
      companionships.householdLinks,
      elders.byId,
      households.byId,
      companionships.items,
      companionships.eldersInCompanionship,
      districts.items,
    );
  });

  const count = computed(() => groups.value.reduce((n, g) => n + g.entries.length, 0));

  return { groups, count };
}
