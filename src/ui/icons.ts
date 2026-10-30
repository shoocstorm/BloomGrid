/**
 * The HUD's line icons: one stroke family (24-unit grid, currentColor, round joins) instead of Unicode glyphs,
 * which render differently on every platform and mix emoji with text symbols. Content and sim data keep their
 * glyph strings (they also appear inline in toasts and labels); the HUD turns them into icons where an icon
 * stands alone, via `icon(key, glyph)`: a known key or glyph gets its SVG, anything else stays text.
 */

const NS = 'http://www.w3.org/2000/svg';

/** Inner SVG markup per icon. Filled shapes carry `class="f"` (see `.ico .f` in ui/theme.css). */
const ICONS: Record<string, string> = {
  // ── Explore and view modes ──
  city: '<path d="M3 21h18M5 21V11l4-2M9 21V5l6-2v18M15 9l4 2v10"/><path d="M12 8v.01M12 12v.01M12 16v.01"/>',
  walk: '<circle cx="13" cy="4.5" r="2"/><path d="m10.5 21 2-6 3 2.5V21M8 12l2-4.5h3.5l2.5 4 2.5 1M12.5 8l-2 7"/>',
  board: '<path d="M3 14h18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 14z"/><path d="M7 19.5h2M15 19.5h2M4 10h6M2 6.5h5"/>',
  drone: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 9.5 7 7M14.5 9.5 17 7M9.5 14.5 7 17M14.5 14.5 17 17"/><circle cx="5.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  balloon: '<path d="M12 2.5a7 7 0 0 0-7 7c0 4 4 6.5 5 8.5h4c1-2 5-4.5 5-8.5a7 7 0 0 0-7-7z"/><path d="M12 2.5c-2 2-2.8 4.5-2.8 7s.8 5.5.8 8.5M12 2.5c2 2 2.8 4.5 2.8 7s-.8 5.5-.8 8.5"/><rect x="10" y="19.5" width="4" height="2.5" rx=".6"/>',
  roof: '<path d="M3 21h18M6 21V10h12v11M10 21v-4h4v4M12 10V3l4.5 1.75L12 6.5"/>',
  pod: '<rect x="3.5" y="7.5" width="17" height="8" rx="4"/><path d="M8 11.5h8M2 20.5c6-2.5 14-2.5 20 0"/>',
  train: '<path d="M6 17V8a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v9z"/><path d="M6 11h12M9 14h.01M15 14h.01M3 21h18M8.5 17l-1.5 4M15.5 17l1.5 4"/>',
  photo: '<path d="M3.5 8.5h3.5l2-3h6l2 3h3.5v11h-17z"/><circle cx="12" cy="13.5" r="3.5"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  up: '<path d="m5.5 15.5 6.5-7 6.5 7"/>',
  down: '<path d="m5.5 8.5 6.5 7 6.5-7"/>',
  next: '<path d="M3 12h13M11 6l6 6-6 6M21 5v14"/>',
  caret: '<path d="m7 10 5 5 5-5"/>',
  // ── Top bar ──
  pause: '<path d="M9 5v14M15 5v14" stroke-width="2.6"/>',
  play: '<path class="f" d="M7.5 5v14l11-7z"/>',
  fast: '<path class="f" d="M3 6v12l8.5-6zM12 6v12l8.5-6z"/>',
  fastest: '<path class="f" d="M1.5 7v10l6.5-5zM8.5 7v10l6.5-5zM15.5 7v10l6.5-5z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="5" rx="1.5"/><rect x="13.5" y="11.5" width="7" height="9" rx="1.5"/><rect x="3.5" y="15.5" width="7" height="5" rx="1.5"/>',
  overview: '<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><path d="M7 15.5 12 8l5 7.5z"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3.5V9h-5.5"/>',
  maximize: '<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
  restore: '<path d="M4 14h6v6M20 10h-6V4M10 14l-6.5 6.5M14 10l6.5-6.5"/>',
  // ── Stats and building tags ──
  credits: '<circle cx="12" cy="12" r="9"/><path d="m12 7 4 5-4 5-4-5z"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 4.8a3.2 3.2 0 0 1 0 6.2M18 14.4c1.9.8 3 2.8 3 5.6"/>',
  energy: '<path d="M13 2.5 4.5 13.5h7l-1 8 8.5-11h-7z"/>',
  water: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  eco: '<path d="M12 21v-8M12 13c0-4-3-7-8-7 0 4 3 7 8 7zM12 11c0-3.8 3-6 8-6 0 4-3 6-8 6z"/>',
  happy: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1.8 2 5.2 2 7 0M9 9.5h.01M15 9.5h.01"/>',
  jobs: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18"/>',
  pollution: '<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.6 4.5 4.5 0 0 0 7 18.5z"/>',
  // ── Tools ──
  select: '<path d="M5 3.5 11 20l2.6-6.9L20.5 10.5z"/>',
  road: '<path d="M8 3 5 21M16 3l3 18M12 4v2.5M12 10.5v3M12 17.5V20"/>',
  channel: '<path d="M3 7.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0M3 12.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0M3 17.5c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/>',
  bulldoze: '<path d="M20.5 3.5 12 12M18 2l4 4M9.5 9.5l5 5L10 19c-1.5 1.5-4 2-7 2 0-3 .5-5.5 2-7z"/>',
  retrofit: '<path d="M3 21h18M5 21V9l6-4v16M11 21V11h7v10M14.5 14.5h.01M14.5 17.5h.01"/><path d="M18 2.5c0 2-1 3-3 3 2 0 3 1 3 3 0-2 1-3 3-3-2 0-3-1-3-3z"/>',
  mist: '<path d="M7 13.5h10a3.5 3.5 0 0 0 .5-7A5 5 0 0 0 8 5.6 4 4 0 0 0 7 13.5z"/><path d="m8.5 17-1 2M12.5 17l-1 2M16.5 17l-1 2M10.5 20.5l-.5 1M14.5 20.5l-.5 1"/>',
  weave: '<path d="M2.5 19c3-7 16-7 19 0M2.5 19h19M7.5 14.5V19M12 13v6M16.5 14.5V19"/>',
  reclaim: '<path d="m2.5 19.5 6.5-11 4 6.5 2.5-3.5 6 8z"/><path d="M2 22h20"/>',
  build: '<rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2"/><rect x="13" y="13" width="7.5" height="7.5" rx="1.2"/><rect x="8.25" y="3.5" width="7.5" height="7.5" rx="1.2"/>',
  // ── Building categories ──
  house: '<path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  tech: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  industry: '<path d="M3 21V10.5l5 3v-3l5 3v-3l5 3V3h3v18z"/><path d="M7 17.5h2M12 17.5h2"/>',
  sports: '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.8 2.8-1.5 4.5H9.7l-1.5-4.5zM12 3v4.5M15.8 10.3l4.8-1.5M14.3 14.8l2.9 4M9.7 14.8l-2.9 4M8.2 10.3 3.4 8.8"/>',
  nature: '<path d="M12 22v-6M12 16c-4 0-7-2.5-7-6a7 7 0 0 1 14 0c0 3.5-3 6-7 6zM12 16l-3-3M12 13.5l2.5-2.5"/>',
  food: '<path d="M12 7.5c-2-1.5-7.5-1.5-7.5 4.5 0 4 3 9 5.5 9 1 0 1.5-.5 2-.5s1 .5 2 .5c2.5 0 5.5-5 5.5-9 0-6-5.5-6-7.5-4.5zM12 7.5c0-2 1-3.5 3-4.5"/>',
  flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C10 6 10.5 3 12 3s2 3 0 6.5M14.5 12c3.5-2 6.5-1.5 6.5 0s-3 2-6.5 0M12 14.5c2 3.5 1.5 6.5 0 6.5s-2-3 0-6.5M9.5 12C6 14 3 13.5 3 12s3-2 6.5 0"/>',
  // ── HUD tabs and panels ──
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  lens: '<circle cx="12" cy="12" r="9"/><path class="f" d="M12 3a9 9 0 0 1 0 18z"/>',
  leaf: '<path d="M5 19C5 10 11 4 20.5 4 20.5 13.5 14.5 19 5 19z"/><path d="M5 19 14 10M3 21l2-2"/>',
  console: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9.5 3 2.5-3 2.5M12 15h5"/>',
  profile: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16c.6-1.5 1.8-2.3 3.2-2.3s2.6.8 3.2 2.3M14.5 10h4M14.5 13.5h3"/>',
  wrench: '<path d="M14.5 6.5a4.5 4.5 0 0 0 5.8 5.8L13.5 19a2.1 2.1 0 0 1-3-3l-.1.1 6.8-6.8a4.5 4.5 0 0 1-2.7-2.8zM20.3 12.3 17 9l-.2-2 2-2.3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5"/>',
  sparkle: '<path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7zM19 16c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>',
  // ── Inventory kinds, lenses ──
  network: '<circle cx="5.5" cy="6" r="2.5"/><circle cx="18.5" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 6h8M7 8.2l3.8 7.6M17 8.2l-3.8 7.6"/>',
  bridge: '<path d="M2.5 16c2.5-6 16.5-6 19 0M2 16h20M6 13v3M12 11.5V16M18 13v3"/><path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/>',
  skybridge: '<path d="M3 21V5h5v16M16 21V3h5v18M8 10h8M8 13h8"/>',
  district: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 12h17M12 3.5v17"/>',
  gem: '<path d="M12 3 20 12 12 21 4 12z"/><path d="M4 12h16"/>',
  traffic: '<path d="M3 7h11M3 12h15M3 17h9M15 4l3 3-3 3M18 9l3 3-3 3"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  drops: '<path d="M8 3s4 4.5 4 7.5a4 4 0 0 1-8 0C4 7.5 8 3 8 3zM16.5 11s3.5 3.8 3.5 6.5a3.5 3.5 0 0 1-7 0c0-2.7 3.5-6.5 3.5-6.5z"/>',
  wave: '<path d="M2 15c2.5 0 3.5-7 9-7 3 0 4 2 4 4-2 0-3 1-3 3 0 1.5 1 2.5 3 2.5 3 0 4-2.5 7-2.5M2 20h20"/>',
  access: '<circle cx="12" cy="12" r="2.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/><circle cx="12" cy="12" r="7"/>',
  // ── Crises and hazards ──
  haze: '<path d="M3 8h13M6 12h15M3 16h12M8 20h10"/><circle cx="19" cy="6" r="2.5"/>',
  rain: '<path d="M7 13.5h10a3.5 3.5 0 0 0 .5-7A5 5 0 0 0 8 5.6 4 4 0 0 0 7 13.5zM8 17v3M12 16.5v4.5M16 17v3"/>',
  storm: '<path d="M7 13.5h10a3.5 3.5 0 0 0 .5-7A5 5 0 0 0 8 5.6 4 4 0 0 0 7 13.5z"/><path d="m12.5 15-2.5 3.5h3.5L11 22"/>',
  microbe: '<circle cx="12" cy="12" r="5.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8M10.5 10.5h.01M13.5 13h.01"/>',
  fallLeaf: '<path d="M6 18C6 10 11 5 19 5c0 8-5 13-13 13z"/><path d="m6 18 7-7M3 21l3-3M17 19.5l1 1.5M20 16l1.5.5"/>',
  fire: '<path d="M12 21.5c-4 0-7-2.8-7-6.5 0-4 3.5-6 4-10.5 2.5 1.5 4.5 4 4.5 6.5 1-1 1.5-2.5 1.5-3.5 2 2 4 4.5 4 7.5 0 3.7-3 6.5-7 6.5z"/><path d="M12 21.5c-1.7 0-3-1.2-3-3 0-2 2-3 2.5-5 1.5 1 3.5 3 3.5 5 0 1.8-1.3 3-3 3z"/>',
  quake: '<path d="M2 12h4l2-5 3 10 3-13 3 11 2-3h3"/>',
  ruin: '<path d="M3 21h18M5 21V9l4-3v15M9 11l3 2 2-3 5 2v9"/><path d="M14 16h.01M17 16h.01"/>',
};

/** Glyphs from content and sim data (tools, categories, lenses, inventory kinds, crises) → icon names. */
const GLYPHS: Record<string, string> = {
  '◇': 'city',
  '❚❚': 'pause',
  '▶': 'play',
  '▶▶': 'fast',
  '▶▶▶': 'fastest',
  '◈': 'credits',
  '👥': 'people',
  '⚡': 'energy',
  '💧': 'water',
  '🌿': 'eco',
  '☺': 'happy',
  '⚒': 'wrench',
  '☁': 'pollution',
  '◎': 'select',
  '✿': 'flower',
  '≋': 'road',
  '⌫': 'bulldoze',
  '≈': 'channel',
  '✾': 'retrofit',
  '☂': 'mist',
  '⛰': 'reclaim',
  '❦': 'leaf',
  '⌂': 'house',
  '☀': 'sun',
  '◍': 'water',
  '⚗': 'tech',
  '❖': 'jobs',
  '⚙': 'industry',
  '✪': 'sports',
  '❀': 'nature',
  '⌖': 'locate',
  '⌕': 'search',
  '⌗': 'map',
  '∑': 'layers',
  '✧': 'sparkle',
  '⛙': 'network',
  '⌒': 'bridge',
  '▦': 'district',
  '◆': 'gem',
  '🌸': 'flower',
  '✨': 'moon',
  '⇶': 'traffic',
  '🌊': 'wave',
  '🌧': 'rain',
  '🌫': 'haze',
  '🍊': 'food',
  '🦠': 'microbe',
  '🍂': 'fallLeaf',
  '🔥': 'fire',
  '🌋': 'quake',
  '⛈': 'storm',
  '▨': 'ruin',
  '◐': 'lens',
  '◉': 'pulse',
  '✚': 'build',
  '✕': 'close',
};

/** Context-specific names where one glyph means different things (`≋` is roads, sky-bridges and access). */
const KEYED: Record<string, string> = {
  'kind:skybridge': 'skybridge',
  'kind:channel': 'channel',
  'lens:access': 'access',
  'lens:hydration': 'drops',
  'cat:commercial': 'jobs',
  'cat:food': 'food',
  'cat:utility': 'water',
  'tool:weave': 'weave',
  'tool:build': 'build',
};

/**
 * An icon for `key` (an icon name, a context key such as `lens:power`, or a glyph), falling back to `glyph`'s
 * icon, then to `glyph` (or `key`) as plain text.
 */
export function icon(key: string, glyph?: string): Node {
  const name = [key, glyph].map((k) => k && (ICONS[k] ? k : KEYED[k] ?? GLYPHS[k])).find(Boolean);
  if (!name) return document.createTextNode(glyph ?? key);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `ico ico-${name}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name]!;
  return svg;
}
