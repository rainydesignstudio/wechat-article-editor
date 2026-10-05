import { DEFAULT_FORMAT_BUNDLE, compileFormatBundle, canonicalFormatJson, freezeFormatBundle, formatFingerprint, type FormatBundle, type RawFormatBundle } from './config';

export type FormatSnapshot = {
  bundle: FormatBundle; id: string; generation: number; library: string | null;
  source: 'built-in' | 'library' | 'invalid'; error: string | null; officialDefault: boolean;
};
const seed = freezeFormatBundle(compileFormatBundle(DEFAULT_FORMAT_BUNDLE));
const seedHash = formatFingerprint(seed);
let generation = 0;
const initial: FormatSnapshot = Object.freeze({ bundle: seed, id: `boot:${seedHash}`, generation: 0, library: null, source: 'built-in', error: null, officialDefault: true });
let current = initial;
const listeners = new Set<() => void>();
export function getFormatSnapshot(): FormatSnapshot { return current; }
export function getInitialFormatSnapshot(): FormatSnapshot { return initial; }
export function subscribeFormatSnapshot(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener); }
export function activateFormatBundle(bundle: RawFormatBundle, library: string | null, source: 'built-in' | 'library' = 'library'): FormatSnapshot {
  const frozen = freezeFormatBundle(compileFormatBundle(bundle)); const hash = formatFingerprint(frozen);
  current = Object.freeze({ bundle: frozen, id: `${++generation}:${hash}`, generation, library, source, error: null, officialDefault: canonicalFormatJson(bundle) === canonicalFormatJson(DEFAULT_FORMAT_BUNDLE) });
  listeners.forEach(listener => listener()); return current;
}
export function invalidateFormatBundle(library: string | null, error: string): FormatSnapshot {
  // The known product schema keeps original assets readable; no standards are evaluated as passed.
  current = Object.freeze({ bundle: seed, id: `${++generation}:invalid`, generation, library, source: 'invalid', error, officialDefault: false });
  listeners.forEach(listener => listener()); return current;
}
export function assertFormatReady(snapshot = current): void { if (snapshot.error) throw new Error(snapshot.error); }
export function assertCurrentFormat(snapshot: FormatSnapshot): void { if (snapshot.id !== current.id) throw new Error('资料库格式配置已变化，旧任务已取消。'); }
export function formatRule(id: string) { return current.bundle.validator.rules.find(rule => rule.id === id && rule.enabled); }
export function formatSupportRule(id: string) { return current.bundle.support.rules.find(rule => rule.id === id); }
