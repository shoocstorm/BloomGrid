import type { GameContext, GameModule } from '@/game/context';
import { evaluateAdvisor, type Advisory, type Severity } from '@/sim/advisor';
import { TIERS } from '@/sim/pulseState';
import { buildings } from '@/content';
import { h, setText } from '@/ui/dom';
import { SYSTEM_LABELS } from '@/modules/pulse/PulsePanel';
import './advisor.css';

interface LogEntry {
  stamp: string;
  text: string;
  severity: Severity;
}

const LOG_LIMIT = 120;
const SEVERITY_CLASS = ['info', 'warn', 'crit'] as const;

function stamp(ctx: GameContext): string {
  const m = Math.floor(ctx.city.timeOfDay * 1440);
  return `D${ctx.city.day} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Flora-Net advisor: evaluates advisor rules every couple of seconds and lists what needs
 * attention, with "show me" camera jumps and one-click remedies. A log records tier changes and
 * newly raised advisories.
 */
export const advisorModule: GameModule = {
  id: 'advisor',
  deps: ['hud', 'pulse', 'construction'],
  init(ctx) {
    const log: LogEntry[] = [];
    let advisories: Advisory[] = [];
    let known = new Set<string>();
    let tab: 'now' | 'log' = 'now';

    const list = h('div', { class: 'adv-list' });
    const badge = h('span', { class: 'adv-badge' });
    const tabNow = h('button', { class: 'adv-tab on', onClick: () => setTab('now') }, 'Now');
    const tabLog = h('button', { class: 'adv-tab', onClick: () => setTab('log') }, 'Log');
    const panel = h(
      'section',
      { class: 'advisor panel' },
      h(
        'div',
        { class: 'adv-head' },
        h('button', { class: 'adv-title', onClick: () => panel.classList.toggle('collapsed'), title: 'Toggle (F)' }, h('span', { class: 'adv-leaf' }, '❦'), 'Flora-Net', badge),
        h('div', { class: 'adv-tabs' }, tabNow, tabLog),
      ),
      list,
    );
    ctx.services.get('hud').right.prepend(panel);

    const addLog = (text: string, severity: Severity) => {
      log.unshift({ stamp: stamp(ctx), text, severity });
      if (log.length > LOG_LIMIT) log.pop();
      if (tab === 'log') render();
    };

    const show = (a: Advisory) => {
      if (a.focus) {
        ctx.cameraCtl.flyTo(a.focus.x, a.focus.z, Math.min(ctx.cameraCtl.distance, 70));
        if (a.focus.eid !== undefined) ctx.bus.emit('selection:changed', { eid: a.focus.eid });
      }
    };

    const render = () => {
      if (tab === 'log') {
        list.replaceChildren(
          ...(log.length
            ? log.map((l) => h('div', { class: `adv-log ${SEVERITY_CLASS[l.severity]}` }, h('span', { class: 'adv-stamp' }, l.stamp), l.text))
            : [h('div', { class: 'adv-empty' }, 'Nothing logged yet.')]),
        );
        return;
      }
      if (!advisories.length) {
        list.replaceChildren(h('div', { class: 'adv-empty' }, '✓ All systems in harmony. Flora-Net is watching.'));
        return;
      }
      list.replaceChildren(
        ...advisories.map((a) =>
          h(
            'div',
            { class: `adv-card ${SEVERITY_CLASS[a.severity]}` },
            h('div', { class: 'adv-card-title' }, a.title),
            h('div', { class: 'adv-detail' }, a.detail),
            h('div', { class: 'adv-fix' }, `→ ${a.fix}`),
            h(
              'div',
              { class: 'adv-actions' },
              a.focus ? h('button', { onClick: () => show(a) }, '⌖ Show me') : null,
              a.build
                ? h(
                    'button',
                    {
                      onClick: () => {
                        if (a.focus) show(a);
                        ctx.services.get('construction').startBuilding(a.build!);
                      },
                    },
                    `✚ ${buildings.get(a.build).name}`,
                  )
                : null,
            ),
          ),
        ),
      );
    };

    const setTab = (t: 'now' | 'log') => {
      tab = t;
      tabNow.classList.toggle('on', t === 'now');
      tabLog.classList.toggle('on', t === 'log');
      render();
    };

    const evaluate = () => {
      advisories = evaluateAdvisor(ctx.city);
      const ids = new Set(advisories.map((a) => a.id));
      for (const a of advisories) if (!known.has(a.id) && a.severity > 0) addLog(a.title, a.severity);
      known = ids;
      const urgent = advisories.filter((a) => a.severity > 0).length;
      setText(badge, urgent ? String(urgent) : '');
      badge.className = `adv-badge ${advisories.some((a) => a.severity === 2) ? 'crit' : urgent ? 'warn' : ''}`;
      if (tab === 'now') render();
    };

    let timer = 0;
    ctx.systems.add({
      id: 'advisor',
      phase: 'render',
      order: 120,
      update(_c, f) {
        timer += f.dt;
        if (timer < 2) return;
        timer = 0;
        evaluate();
      },
    });
    ctx.bus.on('pulse:tier', ({ system, tier, prev }) =>
      addLog(`${SYSTEM_LABELS[system]}: ${TIERS[prev]} → ${TIERS[tier]}`, tier > prev ? (tier >= 3 ? 2 : 1) : 0),
    );
    ctx.bus.on('save:done', ({ slot }) => addLog(`City saved (${slot})`, 0));
    ctx.bus.on('load:done', ({ slot }) => addLog(`City restored (${slot})`, 0));
    ctx.input.onKey((e) => {
      if (e.code !== 'KeyF' || e.metaKey || e.ctrlKey) return false;
      panel.classList.toggle('collapsed');
      return true;
    });
    evaluate();
  },
};
