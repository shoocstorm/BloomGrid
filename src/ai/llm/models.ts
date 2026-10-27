/**
 * Local model catalog for the city assistant (ported from Andai's, same pinned commits and hashes). Two
 * engines:
 * - `wllama`: a GGUF file run by llama.cpp compiled to WebAssembly, in the browser or webview, everywhere.
 *   wllama loads single files up to 2 GB.
 * - `mlx`: an MLX checkpoint run natively by Rust on the Mac's GPU (`src-tauri/src/llm/`, Apple Silicon
 *   desktop builds only). Its files, sizes and sha256 live in the Rust catalog, which verifies every download.
 */

interface Common {
  id: string;
  name: string;
  family: string;
  size: string;
  bytes: number;
  note: string;
  /** Qwen3-style `<think>` support, toggled by `enable_thinking`. */
  thinking: boolean;
  n_ctx: number;
}

export interface WllamaDef extends Common {
  engine: 'wllama';
  /** Pinned to an immutable commit: `resolve/<40-hex sha>/…`. */
  url: string;
  /** The file's sha256 (Hugging Face's LFS oid); checked after every download. */
  sha256: string;
}

export interface MlxDef extends Common {
  engine: 'mlx';
  /** The checkpoint id in the Rust catalog (`src-tauri/src/llm/catalog.rs`). */
  native: string;
}

export type ModelDef = WllamaDef | MlxDef;

// A commit URL always serves the same bytes; `main` can be moved under us.
const HF = (repo: string, commit: string, file: string) =>
  `https://huggingface.co/${repo}/resolve/${commit}/${file}`;

export const MODELS: ModelDef[] = [
  {
    id: 'qwen3-1.7b-mlx',
    engine: 'mlx',
    native: 'qwen3-1.7b-mlx',
    name: 'Qwen3 1.7B · MLX',
    family: '4-bit · 1.7B params',
    size: '980 MB',
    bytes: 979_513_507,
    note: 'Recommended on a Mac: runs natively on the GPU, about 350 tok/s on an M5 Max.',
    thinking: true,
    n_ctx: 8192,
  },
  {
    id: 'qwen3-4b-mlx',
    engine: 'mlx',
    native: 'qwen3-4b-mlx',
    name: 'Qwen3 4B · MLX',
    family: '4-bit · 4.0B params',
    size: '2.1 GB',
    bytes: 2_148_759_741,
    note: 'Noticeably better at planning multi-step actions; about 185 tok/s on an M5 Max. Needs about 3 GB of memory.',
    thinking: true,
    n_ctx: 8192,
  },
  {
    id: 'qwen3-8b-mlx',
    engine: 'mlx',
    native: 'qwen3-8b-mlx',
    name: 'Qwen3 8B · MLX',
    family: '4-bit · 8.2B params',
    size: '4.4 GB',
    bytes: 4_363_317_501,
    note: 'The strongest steward partner, about 115 tok/s on an M5 Max. Needs about 5 GB of memory.',
    thinking: true,
    n_ctx: 8192,
  },
  {
    id: 'qwen3-0.6b-mlx',
    engine: 'mlx',
    native: 'qwen3-0.6b-mlx',
    name: 'Qwen3 0.6B · MLX',
    family: '8-bit · 596M params',
    size: '645 MB',
    bytes: 644_876_804,
    note: 'Fastest and smallest; fine for lookups, weak at multi-step plans.',
    thinking: true,
    n_ctx: 8192,
  },
  {
    id: 'qwen3-1.7b',
    engine: 'wllama',
    name: 'Qwen3 1.7B',
    family: 'Q4_K_M · 1.7B params',
    size: '1.1 GB',
    bytes: 1_107_409_472,
    url: HF('unsloth/Qwen3-1.7B-GGUF', 'd7f544eead698dbd1f15126ef60b45a1e1933222', 'Qwen3-1.7B-Q4_K_M.gguf'),
    sha256: 'b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897',
    note: 'Recommended in the browser: smart enough to plan actions; WebGPU makes it usable.',
    thinking: true,
    n_ctx: 4096,
  },
  {
    id: 'qwen3-0.6b',
    engine: 'wllama',
    name: 'Qwen3 0.6B',
    family: 'Q8_0 · 596M params',
    size: '639 MB',
    bytes: 639_446_688,
    url: HF('Qwen/Qwen3-0.6B-GGUF', '23749fefcc72300e3a2ad315e1317431b06b590a', 'Qwen3-0.6B-Q8_0.gguf'),
    sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
    note: 'Fast and small; good for lookups and status reports.',
    thinking: true,
    n_ctx: 4096,
  },
  {
    id: 'stories-260k',
    engine: 'wllama',
    name: 'TinyStories 260K',
    family: 'F32 · 260K params',
    size: '1.2 MB',
    bytes: 1_185_376,
    url: HF(
      'ggml-org/models-moved',
      '499bc8821c6b12b4e53c5bffcb21ec206f212d81',
      'tinyllamas/stories260K.gguf',
    ),
    sha256: '270cba1bd5109f42d03350f60406024560464db173c0e387d91f0426d3bd256d',
    note: 'Smoke test only: downloads in a second, talks nonsense.',
    thinking: false,
    n_ctx: 1024,
  },
];

export const modelById = (id: string | null | undefined) => MODELS.find((m) => m.id === id);
export const isMlx = (def: ModelDef | undefined): def is MlxDef => def?.engine === 'mlx';
/** The models this computer can run: MLX ones only where Rust reports MLX (Apple Silicon desktop). */
export const availableModels = (mlx: boolean) =>
  MODELS.filter((m) => (mlx || m.engine !== 'mlx') && m.id !== 'stories-260k');
/** What to suggest first: natively on MLX where it runs (much faster), else the browser default. */
export const recommendedModel = (mlx: boolean): ModelDef => modelById(mlx ? 'qwen3-1.7b-mlx' : 'qwen3-1.7b')!;

/**
 * Whether a native model likely fits this Mac: its weights plus about 20% for the KV cache and 1 GB,
 * against about 75% of memory (roughly what macOS lets the GPU use). A guide, not a limit.
 */
export function memoryFit(bytes: number, memory: number | null): { needGb: number; fits: boolean | null } {
  const need = bytes * 1.2 + 1e9;
  return { needGb: Math.ceil(need / 1e9), fits: memory ? need <= memory * 0.75 : null };
}

/** A checkpoint file at its pinned commit: the only URLs an MLX download fetches. */
export function pinnedFileUrl(repo: string, commit: string, path: string): string {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repo) ||
    !/^[0-9a-f]{40}$/.test(commit) ||
    !/^[\w.-]+(\/[\w.-]+)*$/.test(path) ||
    path.split('/').includes('..')
  ) {
    throw new Error(`Not a pinned checkpoint file: ${repo}@${commit}/${path}`);
  }
  return HF(repo, commit, path);
}
