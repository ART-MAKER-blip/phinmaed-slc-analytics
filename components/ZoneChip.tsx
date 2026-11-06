import { ZONE_LABEL, type Zone } from '@/lib/zones';

const STYLE: Record<Zone, string> = {
  green: 'bg-zone-green-bg text-zone-green-fg',
  yellow: 'bg-zone-yellow-bg text-zone-yellow-fg',
  red: 'bg-zone-red-bg text-zone-red-fg',
};

/** Zone is always written out as text so it never depends on color alone. */
export function ZoneChip({ zone }: { zone: Zone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLE[zone]}`}>
      {ZONE_LABEL[zone]}
    </span>
  );
}

export const ZONE_SOLID: Record<Zone, string> = {
  green: 'bg-zone-green text-white',
  yellow: 'bg-zone-yellow text-[#3D2E00]',
  red: 'bg-zone-red text-white',
};
