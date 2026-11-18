/**
 * Living stories state (plan v5, Phase 29): the resident story running now, the arcs told, lasting outcomes and
 * the mood a story leaves. Plain data in its own module (no imports) so `City` can hold it; saved (v24), hashed.
 */

export type StoryStatus = 'between' | 'choosing' | 'waiting';

export interface StoryRun {
  id: number;
  arc: string;
  /** The resident: full name, first name, family name, and their home (building serial) and its place name. */
  name: string;
  first: string;
  family: string;
  home: number;
  place: string;
  /** The beat on now and when it began (or, `between`, when the last one ended). */
  beat: string;
  beatTick: number;
  status: StoryStatus;
  /** The choice taken in this beat (`waiting`), its deadline and the count its goal must beat. */
  choice?: number;
  until?: number;
  baseline?: number;
  /** What happened so far, a line per beat ("Enacted a Fishing quota"). */
  told: string[];
}

export interface StoryRecord {
  id: number;
  arc: string;
  name: string;
  outcome: 'happy' | 'let down' | 'moved away' | 'faded';
  tick: number;
}

export interface StoryState {
  /** Off in tests and the trailer (like happenings); on in play. */
  auto: boolean;
  current: StoryRun | null;
  nextTick: number;
  nextId: number;
  /** Arcs told in this city (a new one is preferred until all have been). */
  arcs: string[];
  /** Lasting outcomes in force (ids from `LASTING` in `stories.ts`). */
  lasting: string[];
  /** Harmony points a story's turn leaves for a while. */
  mood: number;
  moodUntil: number;
  history: StoryRecord[];
}

export const createStoryState = (): StoryState => ({
  auto: true,
  current: null,
  nextTick: 0,
  nextId: 1,
  arcs: [],
  lasting: [],
  mood: 0,
  moodUntil: 0,
  history: [],
});
