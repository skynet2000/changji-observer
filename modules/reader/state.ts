export interface Star {
  id: string; title: string; summary: string | null; sourceName: string; savedAt: string;
  publishedAt: string | null; score: number | null; aiSelected: boolean;
}
export interface ReadingState { starred: Star[]; read: string[] }
export const emptyState = (): ReadingState => ({ starred: [], read: [] });

/** Local edits since the last cloud snapshot win; untouched entries follow the cloud, including removals. */
export function mergeReading(base: ReadingState, local: ReadingState, remote: ReadingState): ReadingState {
  const result = new Map(remote.starred.map(s => [s.id, s]));
  const before = new Map(base.starred.map(s => [s.id, s]));
  const here = new Map(local.starred.map(s => [s.id, s]));
  const beforeRead = new Set(base.read);
  for (const [id, item] of here) if (!before.has(id)) result.set(id, item);
  for (const id of before.keys()) if (!here.has(id)) result.delete(id);
  return {
    starred: [...result.values()].sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt)).slice(0, 500),
    read: [...new Set([...local.read.filter(id => !beforeRead.has(id)), ...remote.read, ...local.read])].slice(0, 5000),
  };
}

export const sameReading = (a: ReadingState, b: ReadingState) => JSON.stringify(a) === JSON.stringify(b);
