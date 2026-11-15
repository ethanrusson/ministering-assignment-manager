// The ward's current flags (src/lib/flags.ts), fed from the stores. Shared by
// the map's popover, filters, coloring and gaps panel so their counts agree.

import { computed } from 'vue';
import { computeFlags } from '@/lib/flags';
import { useCompanionshipsStore } from '@/stores/companionships';
import { useEldersStore } from '@/stores/elders';
import { useFlagAcknowledgementsStore } from '@/stores/flagAcknowledgements';
import { useHouseholdsStore } from '@/stores/households';
import { useLcrImportsStore } from '@/stores/lcrImports';
import { useLocationReviewsStore } from '@/stores/locationReviews';

export function useFlags() {
  const households = useHouseholdsStore();
  const elders = useEldersStore();
  const companionships = useCompanionshipsStore();
  const reviews = useLocationReviewsStore();
  const acks = useFlagAcknowledgementsStore();
  const imports = useLcrImportsStore();

  return computed(() =>
    computeFlags({
      households: households.visible.map((h) => ({
        id: h.id,
        lat: h.lat,
        lng: h.lng,
        lcrUuid: h.lcr_uuid,
        createdAt: h.created_at,
      })),
      elders: elders.visible.map((e) => ({
        id: e.id,
        homeHouseholdId: e.home_household_id,
        notGenerallyAssigned: e.not_generally_assigned,
        lcrUuid: e.lcr_uuid,
        createdAt: e.created_at,
      })),
      companionshipForHousehold: companionships.companionshipForHousehold,
      companionshipForElder: companionships.companionshipForElder,
      eldersInCompanionship: companionships.eldersInCompanionship,
      movedHouseholdIds: new Set(
        reviews.open.filter((r) => r.kind === 'moved').map((r) => r.household_id),
      ),
      lastImportAt: imports.lastAt,
      acknowledgements: acks.items.map((a) => ({
        householdId: a.household_id,
        flag: a.flag,
        companionshipId: a.companionship_id,
      })),
    }),
  );
}
