import type { GameContext } from '@/game/context';
import { isTouchDevice } from '@/platform/device';
import { h } from '@/ui/dom';
import { icon } from '@/ui/icons';

/** Build actions in the order the Build panel shows them; their keys come from the tools themselves. */
const BUILD_TOOLS = ['road', 'channel', 'bulldoze', 'retrofit', 'mist', 'weave', 'reclaim'];
const mac = /Mac|iP(hone|ad)/.test(navigator.platform);
const MOD = mac ? '⌘' : 'Ctrl';

type Row = [label: string, ...keys: string[]];

/**
 * Settings → Controls (D-087): the basic controls and common hotkeys, grouped. Tool keys are read from the
 * registered tools, so a changed hotkey shows here without editing this list. Touch devices get the gestures.
 */
export function controlsPane(ctx: GameContext): HTMLElement[] {
  const group = (ico: string, title: string, rows: Row[]) =>
    h(
      'section',
      { class: 'set-keys' },
      h('h4', {}, icon(ico), ` ${title}`),
      ...rows.map(([label, ...keys]) =>
        h('div', { class: 'set-key' }, h('span', {}, label), h('span', { class: 'set-kbds' }, ...keys.map((k) => (k.startsWith('~') ? h('i', {}, k.slice(1)) : h('kbd', {}, k))))),
      ),
    );
  if (isTouchDevice())
    return [
      group('select', 'Camera', [
        ['Pan', '~drag'],
        ['Zoom', '~pinch'],
        ['Rotate', '~twist'],
        ['Tilt', '~two fingers up / down'],
      ]),
      group('build', 'Build', [
        ['Open build mode', '~Build button'],
        ['Place a building', '~tap, tap again'],
        ['Draw a highway or channel', '~drag'],
        ['Leave build mode', '~Done'],
      ]),
      group('eye', 'City', [
        ['Inspect', '~tap a building'],
        ['City Pulse, lenses, Flora-Net', '~chips under the top bar'],
        ['Fold every sheet', '~tap the city'],
        ['Seedvault: guides, runbooks, logs', '~book in the top bar'],
      ]),
    ];
  const key = (id: string) => ctx.tools.get(id)?.hotkey?.replace('Key', '') ?? '';
  return [
    group('select', 'Camera', [
      ['Pan', 'W A S D', '~drag'],
      ['Orbit', 'Q', 'E', '~right-drag'],
      ['Zoom', '~wheel'],
      ['Overview', 'O'],
      ['Store / recall a view', 'Alt+1–4', 'Shift+1–4'],
    ]),
    group('build', 'Build', [
      ['Build mode', 'B'],
      ['Put down · leave', 'Esc', '~right-click'],
      ['Rotate', 'R'],
      ...BUILD_TOOLS.filter((t) => ctx.tools.get(t)?.hotkey).map((t): Row => [ctx.tools.get(t)!.label, key(t)]),
      ['Select many of a kind', `${MOD}-drag`],
      ['Remove the selection', 'Delete'],
    ]),
    group('pause', 'Time', [
      ['Pause', 'Space'],
      ['Speed 1× · 3× · 8×', '1', '2', '3'],
    ]),
    group('pulse', 'Views', [
      ['City Pulse', 'P'],
      ['Data lenses', 'L'],
      ['Flora-Net', 'F'],
      ['Dashboard · inventory', 'K', 'I'],
      ['City map', 'M'],
      ['Next fire', '.'],
      ['Explore · photo', 'N', 'J'],
    ]),
    group('settings', 'General', [
      ['Undo · redo', `${MOD}Z`, `⇧${MOD}Z`],
      ['Save · load', `${MOD}S`, `${MOD}L`],
      ['Ask Flora', 'U'],
      ['Seedvault: guides, runbooks, logs', '?', 'F1'],
      ['Mute', ','],
      ['Controls (this tab)', 'H'],
      ['Performance overlay', 'F3'],
    ]),
  ];
}
