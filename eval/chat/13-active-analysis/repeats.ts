import { sha256, type RunManifest } from '../12-verified-claims/artifactWriter';

/**
 * The scored core's reproducibility record, added to experiment 12's manifest rather than
 * replacing it: the seed, the repeat count, and the exact per-repeat order that seed produced,
 * so the run's sequence is checkable from the manifest without rerunning the shuffle.
 */
export interface Checkpoint5Manifest extends RunManifest {
  checkpoint5?: {
    seed: string;
    repeats: number;
    order: Array<{ repeat: number; questionIds: string[] }>;
  };
}

/**
 * § Checkpoint 5: "order randomized by a persisted seed". The order must be reproducible from
 * the manifest alone, so it is derived rather than drawn from a PRNG whose state is not written
 * down: each question gets a keyed digest and the repeat's order is that digest's sort order.
 * Same seed and repeat count in, same eighty (repeat, question) pairs out, in the same sequence.
 */
export function seededOrder<T extends { id: string }>(questions: readonly T[], seed: string, repeat: number): T[] {
  return [...questions]
    .map((question) => ({ question, key: sha256(`${seed}|repeat:${repeat}|${question.id}`) }))
    .sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map((entry) => entry.question);
}

export interface RepeatPlan<T> {
  repeat: number;
  questions: T[];
}

export function repeatPlan<T extends { id: string }>(
  questions: readonly T[],
  seed: string,
  repeats: number,
): RepeatPlan<T>[] {
  return Array.from({ length: repeats }, (_, index) => ({
    repeat: index + 1,
    questions: seededOrder(questions, seed, index + 1),
  }));
}

/** `--repeats=` / `--seed=`; both default to the Checkpoint 1-4 single-repeat behaviour. */
export function parseRepeatArgs(argv: readonly string[]): { repeats: number; seed: string } {
  const value = (flag: string): string | undefined =>
    argv.find((entry) => entry.startsWith(`${flag}=`))?.slice(flag.length + 1);
  const repeatsRaw = value('--repeats');
  const repeats = repeatsRaw === undefined ? 1 : Number(repeatsRaw);
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error(`--repeats must be a positive integer: ${repeatsRaw}`);
  const seed = value('--seed') ?? 'checkpoint-1-4-single-repeat';
  if (seed.length === 0) throw new Error('--seed must not be empty');
  return { repeats, seed };
}

/** Artifact and cache namespace for one repeat. Absent when the run is a single repeat. */
export function repeatId(repeat: number, repeats: number): string | undefined {
  return repeats === 1 ? undefined : String(repeat);
}

/** Artifact filename prefix, so five repeats of one question cannot collide in one run directory. */
export function artifactStem(questionId: string, repeat: string | undefined): string {
  return repeat === undefined ? questionId : `rep${repeat}-${questionId}`;
}
