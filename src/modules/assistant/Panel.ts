import type { GameContext } from '@/game/context';
import { h, setText } from '@/ui/dom';
import { stripThink, type StepRecord, type ToolCall } from '@/ai/agent';
import type { EngineState, LlmEngine } from '@/ai/llm/engine';
import { availableModels, memoryFit, recommendedModel, type ModelDef } from '@/ai/llm/models';

const ID_SPLIT = /(\b(?:LIV|NRG|UTL|TEC|WRK|NAT|FOD|HWY|BRG|SKY|CHN|DST|LMK)-[0-9A-Z][0-9A-Z.-]*[0-9A-Z]\b)/g;
const gb = (bytes: number) =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
const PHASES: Record<string, string> = {
  deciding: 'Thinking…',
  filling: 'Preparing the call…',
  running: 'Working…',
  answering: 'Writing…',
};
const TOOL_ICON: Record<string, string> = { read: '⌕', view: '⌖', mutate: '⚒' };

export interface PanelActions {
  send(text: string): void;
  stop(): void;
  setAutoApprove(on: boolean): void;
  autoApprove(): boolean;
}

/** One assistant reply as it happens: tool chips, then the streamed answer. */
export interface Bubble {
  phase(p: string): void;
  call(c: ToolCall): void;
  result(r: StepRecord): void;
  delta(text: string): void;
  finish(text: string, error?: boolean): void;
  /** Places an element (an approval card) under the reply's tool chips. */
  attach(el: HTMLElement): void;
}

/**
 * The assistant's chat panel (U): model picker and download progress, the conversation with tool chips,
 * approval cards for actions, city notices, quick prompts and the input. Object ids in replies are links
 * that fly the camera to the object. Text updates only on events, never per frame.
 */
export class AssistantPanel {
  readonly el: HTMLElement;
  private log = h('div', { class: 'ai-log', role: 'log', 'aria-live': 'polite' });
  private input: HTMLTextAreaElement;
  private sendBtn: HTMLButtonElement;
  private status = h('span', { class: 'ai-status' });
  private models = h('div', { class: 'ai-models hidden' });
  private badge = h('span', { class: 'ai-badge hidden' });
  private launcher: HTMLButtonElement;
  private open = false;
  private busy = false;
  private unread = 0;
  private lastStatus: EngineState['status'] = 'idle';

  constructor(
    private ctx: GameContext,
    private engine: LlmEngine,
    private actions: PanelActions,
  ) {
    this.input = h('textarea', {
      class: 'ai-input',
      rows: 2,
      placeholder: 'Ask Flora… e.g. "what needs fixing?", "build a water works in Westbrook", or /help',
      'aria-label': 'Message the city assistant',
      onKeydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.submit();
        } else if (e.key === 'Escape') this.input.blur();
      },
    }) as HTMLTextAreaElement;
    this.sendBtn = h(
      'button',
      { class: 'btn ghost ai-send', onClick: () => (this.busy ? this.actions.stop() : this.submit()) },
      'Send',
    ) as HTMLButtonElement;
    const auto = h('input', {
      type: 'checkbox',
      onChange: (e: Event) => this.actions.setAutoApprove((e.target as HTMLInputElement).checked),
    }) as HTMLInputElement;
    auto.checked = this.actions.autoApprove();
    const quick = (label: string, text: string) =>
      h('button', { class: 'ai-chip', onClick: () => this.actions.send(text) }, label);

    this.el = h(
      'section',
      { class: 'ai panel hidden', role: 'dialog', 'aria-label': 'City assistant' },
      h(
        'header',
        { class: 'ai-head' },
        h('b', {}, '✿ Flora'),
        h('span', { class: 'ai-sub' }, 'city assistant'),
        this.status,
        h(
          'button',
          { class: 'icon-btn', title: 'Models', onClick: () => this.models.classList.toggle('hidden') },
          '⚙',
        ),
        h('button', { class: 'icon-btn', title: 'Close (U)', onClick: () => this.toggle(false) }, '✕'),
      ),
      this.models,
      this.log,
      h(
        'div',
        { class: 'ai-quick' },
        quick('Status report', 'Give me a short status report of the city.'),
        quick('What needs fixing?', 'What are the most urgent problems, and where?'),
        quick('Fix the worst', 'Find the most critical problem and fix it.'),
      ),
      h('div', { class: 'ai-compose' }, this.input, this.sendBtn),
      h('label', { class: 'ai-auto' }, auto, ' Let Flora act without asking (actions stay undoable with ⌘Z)'),
    );
    this.launcher = h(
      'button',
      { class: 'icon-btn ai-launch', title: 'City assistant (U)', onClick: () => this.toggle() },
      '✿',
      this.badge,
    ) as HTMLButtonElement;
    ctx.services.get('hud').actions.prepend(this.launcher);
    ctx.hud.append(this.el);
    engine.onChange((s) => this.sync(s));
    this.sync(engine.state);
    this.system(
      'Hi, I’m Flora. I watch the city with you and can look things up, build, demolish, connect highways and more: I ask before changing anything. I run on a local model on this computer: pick one under ⚙ to start, or type /help for direct commands.',
    );
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.launcher.classList.toggle('on', open);
    if (open) {
      this.renderModels(this.engine.state);
      this.unread = 0;
      this.badge.classList.add('hidden');
      this.log.scrollTop = this.log.scrollHeight;
      if (this.engine.state.status !== 'ready' && this.engine.state.status !== 'loading')
        this.models.classList.remove('hidden');
      setTimeout(() => this.input.focus());
      // wllama and the model listing load on first open, never at boot; then the last model comes back.
      void this.engine.refresh().then(() => {
        const last = this.engine.lastUsed();
        if (last && this.engine.state.status === 'idle') void this.engine.load(last.id);
      });
    }
  }

  setBusy(on: boolean): void {
    this.busy = on;
    setText(this.sendBtn, on ? 'Stop' : 'Send');
  }

  private submit(): void {
    const text = this.input.value;
    if (!text.trim()) return;
    this.input.value = '';
    this.actions.send(text);
  }

  private push(el: HTMLElement): void {
    this.log.append(el);
    while (this.log.children.length > 120) this.log.firstElementChild!.remove();
    // Reading scrollHeight forces layout: only while visible (the welcome message is pushed at boot).
    if (this.open) this.log.scrollTop = this.log.scrollHeight;
    else if (this.log.children.length > 1) {
      this.unread++;
      setText(this.badge, String(this.unread));
      this.badge.classList.remove('hidden');
    }
  }

  /** Text with object ids turned into links that show the object. */
  private rich(text: string): HTMLElement {
    const out = h('div', { class: 'ai-text' });
    for (const part of text.split(ID_SPLIT)) {
      if (!part) continue;
      if (ID_SPLIT.test(part))
        out.append(
          h(
            'button',
            {
              class: 'ai-id',
              title: 'Show it',
              onClick: () => this.ctx.services.get('inventory').select(part),
            },
            part,
          ),
        );
      else out.append(part);
      ID_SPLIT.lastIndex = 0;
    }
    return out;
  }

  user(text: string): void {
    this.push(h('div', { class: 'ai-msg user' }, text));
  }

  system(text: string): void {
    this.push(h('div', { class: 'ai-msg sys' }, this.rich(text)));
  }

  /** A city notice from the monitor, with a button to ask about it. */
  notice(text: string, ask?: string): void {
    this.push(
      h(
        'div',
        { class: 'ai-msg notice' },
        h('span', {}, '⚠ ', text),
        ask ? h('button', { class: 'ai-chip', onClick: () => this.actions.send(ask) }, 'Ask Flora') : null,
      ),
    );
  }

  assistant(): Bubble {
    const steps = h('div', { class: 'ai-steps' });
    const phase = h('div', { class: 'ai-phase' });
    const body = h('div', { class: 'ai-body' });
    this.push(h('div', { class: 'ai-msg bot' }, steps, body, phase));
    let text = '';
    let pending = 0;
    const chips = new Map<number, HTMLElement>();
    return {
      phase: (p) => setText(phase, PHASES[p] ?? ''),
      call: (c) => {
        const chip = h(
          'div',
          { class: `ai-tool ${c.effect}` },
          `${TOOL_ICON[c.effect] ?? '·'} ${c.tool} `,
          h('code', {}, JSON.stringify(c.args)),
        );
        chips.set(c.step, chip);
        steps.append(chip);
      },
      result: (r) => {
        const chip =
          chips.get(r.call.step) ??
          h(
            'div',
            { class: `ai-tool ${r.call.effect}` },
            `${TOOL_ICON[r.call.effect] ?? '·'} ${r.call.tool}`,
          );
        if (!chip.isConnected) steps.append(chip);
        chip.classList.add(r.ok ? 'ok' : 'bad');
        chip.title = r.ok ? r.observation.slice(0, 600) : (r.error ?? '');
        if (!r.ok) chip.append(h('span', { class: 'ai-err' }, ` ✗ ${r.error}`));
        this.log.scrollTop = this.log.scrollHeight;
      },
      delta: (t) => {
        text += t;
        // Coalesce streamed pieces: at most one DOM write per frame-ish batch.
        if (pending) return;
        pending = window.setTimeout(() => {
          pending = 0;
          setText(body, stripThink(text));
          this.log.scrollTop = this.log.scrollHeight;
        }, 60);
      },
      attach: (el) => {
        steps.append(el);
        this.log.scrollTop = this.log.scrollHeight;
      },
      finish: (final, error = false) => {
        if (pending) clearTimeout(pending);
        body.replaceChildren(this.rich(final));
        body.classList.toggle('bad', error);
        setText(phase, '');
        this.log.scrollTop = this.log.scrollHeight;
      },
    };
  }

  /** An approval card (in `into`, the reply asking for it); resolves when the steward decides. */
  approval(call: ToolCall, into?: Bubble): Promise<boolean> {
    if (!this.open) this.toggle(true);
    return new Promise((resolve) => {
      const done = (ok: boolean) => {
        card.classList.add(ok ? 'ok' : 'bad');
        buttons.replaceChildren(h('span', {}, ok ? 'Approved' : 'Declined'));
        resolve(ok);
      };
      const buttons = h(
        'div',
        { class: 'ai-approve-btns' },
        h('button', { class: 'btn ghost', onClick: () => done(true) }, '✓ Approve'),
        h('button', { class: 'btn ghost', onClick: () => done(false) }, '✗ Decline'),
      );
      const card = h(
        'div',
        { class: 'ai-msg approve' },
        h('div', {}, '⚒ Flora wants to run ', h('b', {}, call.tool)),
        h('code', {}, JSON.stringify(call.args, null, 1)),
        buttons,
      );
      if (into) into.attach(card);
      else this.push(card);
    });
  }

  private sync(s: EngineState): void {
    // A model just became ready: fold the model list away so the conversation has the room.
    if (s.status === 'ready' && this.lastStatus !== 'ready') this.models.classList.add('hidden');
    this.lastStatus = s.status;
    const def = this.engine.loaded;
    setText(
      this.status,
      s.status === 'ready' && def
        ? `${def.name} · ${s.info?.backend ?? ''}${s.tokPerSec ? ` · ${Math.round(s.tokPerSec)} tok/s` : ''}`
        : s.status === 'loading' && s.progress
          ? `${s.progress.phase} ${s.progress.total ? Math.round((s.progress.loaded / s.progress.total) * 100) : 0}%`
          : s.status === 'error'
            ? 'Model failed'
            : 'No model',
    );
    this.status.classList.toggle('ready', s.status === 'ready');
    if (this.open) this.renderModels(s);
  }

  private renderModels(s: EngineState): void {
    const mlx = s.native.supported;
    const rec = recommendedModel(mlx);
    const row = (m: ModelDef) => {
      const cached = s.cached.has(m.id);
      const loaded = s.loadedId === m.id;
      const loading = s.loadingId === m.id;
      const fit = m.engine === 'mlx' ? memoryFit(m.bytes, s.native.memory) : null;
      const btn = loaded
        ? h('button', { class: 'btn ghost', onClick: () => void this.engine.unload() }, 'Unload')
        : h(
            'button',
            {
              class: 'btn ghost',
              disabled: s.status === 'loading' || undefined,
              onClick: () => void this.engine.load(m.id),
            },
            cached ? 'Load' : `Download ${m.size}`,
          );
      const remove =
        cached && !loading
          ? h(
              'button',
              {
                class: 'btn ghost',
                title: 'Delete the downloaded model',
                onClick: () =>
                  confirm(`Delete the downloaded ${m.name} (${m.size})?`) && void this.engine.remove(m.id),
              },
              '🗑',
            )
          : null;
      return h(
        'div',
        { class: `ai-model${loaded ? ' on' : ''}` },
        h(
          'div',
          { class: 'ai-model-h' },
          h('b', {}, m.name),
          m.id === rec.id ? h('span', { class: 'ai-rec' }, 'recommended') : null,
          cached ? h('span', { class: 'ai-cached' }, '✓ downloaded') : null,
        ),
        h(
          'div',
          { class: 'ai-model-n' },
          `${m.family} · ${m.note}${fit?.fits === false ? ` Needs ≈${fit.needGb} GB: likely too big for this Mac.` : ''}`,
        ),
        loading && s.progress
          ? h(
              'div',
              { class: 'ai-progress' },
              h('i', {
                style: `width:${s.progress.total ? (s.progress.loaded / s.progress.total) * 100 : 0}%`,
              }),
              h(
                'span',
                {},
                `${s.progress.phase} ${gb(s.progress.loaded)} / ${gb(s.progress.total)}${s.progress.speed ? ` · ${gb(s.progress.speed)}/s` : ''}`,
              ),
            )
          : h('div', { class: 'ai-model-a' }, btn, remove),
      );
    };
    this.models.replaceChildren(
      h(
        'div',
        { class: 'ai-models-h' },
        mlx
          ? 'Runs natively on this Mac’s GPU (MLX) or in the page (wllama).'
          : `Runs in this page with wllama${s.isolated ? '' : ' (single-threaded here: slower)'}. On the macOS app it runs natively.`,
      ),
      ...availableModels(mlx).map(row),
      ...(s.error ? [h('div', { class: 'ai-model-err' }, s.error)] : []),
      h(
        'div',
        { class: 'ai-models-f' },
        'Models download once from Hugging Face (pinned, checksum-verified) and run entirely on this computer: nothing you type leaves it.',
      ),
    );
  }
}
