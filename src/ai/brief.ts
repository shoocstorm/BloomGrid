import type { City } from '@/sim/City';
import { SYSTEMS, TIERS } from '@/sim/pulseState';
import { getCrisis } from '@/sim/crises';
import { filterObjects, listObjects, summarize } from '@/sim/inventory';

/**
 * A few lines about the city for the assistant's prompts: what a steward glances at on the HUD, plus the
 * inventory's open issues. Kept short (≈800 characters) because small models lose the request in long
 * prompts, and rebuilt every step so actions show up in it.
 */
export function cityBrief(city: City): string {
  const s = city.stats;
  const p = city.pulse;
  const hh = Math.floor(city.timeOfDay * 24);
  const mm = Math.floor((city.timeOfDay * 24 - hh) * 60);
  const net = s.income - s.upkeep - s.debtService;
  const objects = listObjects(city, ['building', 'network', 'district']);
  const sum = summarize(objects);
  const worst = filterObjects(objects, {
    status: ['critical', 'warning'],
    sort: 'status',
    limit: 4,
  }).items.map((o) => `${o.id} ${o.name} in ${o.district} (${o.issues.join(', ')})`);
  const issues = sum.issues
    .filter((i) => i.severity > 0)
    .slice(0, 5)
    .map((i) => `${i.label} ×${i.count}`)
    .join(', ');
  const strained = SYSTEMS.filter((k) => p.tiers[k] >= 2).map((k) => `${k} ${TIERS[p.tiers[k]]}`);
  const crises = city.steward.crises.map((c) => `${getCrisis(c.def).name} (${c.phase})`);
  return [
    `Day ${city.day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}. Treasury ${Math.round(city.credits)} credits (${net >= 0 ? '+' : ''}${net.toFixed(1)}/s), tax ${Math.round(p.taxRate * 100)}%.`,
    `Residents ${Math.round(s.population)} of ${Math.round(s.capacity)} homes; harmony ${Math.round(s.happiness)}/100; energy ${Math.round(p.energyRatio * 100)}%, water ${Math.round(p.waterRatio * 100)}%, food ${Math.round(p.foodRatio * 100)}% of demand; ${Math.round(p.unemployment * 100)}% unemployed.`,
    `Systems in trouble: ${strained.length ? strained.join(', ') : 'none'}.${crises.length ? ` Crises: ${crises.join(', ')}.` : ''}`,
    `Objects: ${sum.status.critical} critical, ${sum.status.warning} warning${issues ? ` (${issues})` : ''}.`,
    worst.length ? `Worst: ${worst.join('; ')}.` : '',
    city.districts.length ? `Districts: ${city.districts.map((d) => d.name).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
