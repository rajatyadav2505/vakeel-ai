import { ensureDb } from './migrate';

let initPromise: Promise<void> | null = null;

export function ensureDbReady(): Promise<void> {
  if (!initPromise) {
    initPromise = ensureDb();
  }

  return initPromise;
}
