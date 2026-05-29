/**
 * Global store for the "Download & cache all mail" background job.
 *
 * Only one job can run at a time.  The job is driven from
 * `lib/indexAllMail.ts`; this store is just the shared progress/cancel state.
 */
import { create } from "zustand";

export type FullSyncPhase = "idle" | "headers" | "bodies" | "attachments" | "done" | "cancelled";

export interface FullSyncProgress {
  phase: FullSyncPhase;
  /** Folders done / total during the headers phase */
  foldersDone: number;
  foldersTotal: number;
  /** Messages indexed / total during the bodies phase */
  bodiesDone: number;
  bodiesTotal: number;
  /** Messages that failed to fetch/index (will be retried on next run) */
  bodiesFailed: number;
  /** Attachment extraction progress */
  attachmentsDone: number;
  attachmentsTotal: number;
  attachmentsCurrentFile: string | null;
  /** Error string if something went badly wrong */
  error: string | null;
}

interface FullSyncState extends FullSyncProgress {
  /** Flip to true to signal the running job to abort at the next checkpoint */
  cancelRequested: boolean;
  start: () => void;
  cancel: () => void;
  _update: (patch: Partial<FullSyncProgress>) => void;
  _finish: (phase: "done" | "cancelled", error?: string) => void;
}

export const useFullSyncStore = create<FullSyncState>()((set) => ({
  phase: "idle",
  foldersDone: 0,
  foldersTotal: 0,
  bodiesDone: 0,
  bodiesTotal: 0,
  bodiesFailed: 0,
  attachmentsDone: 0,
  attachmentsTotal: 0,
  attachmentsCurrentFile: null,
  error: null,
  cancelRequested: false,

  start: () =>
    set({
      phase: "headers",
      foldersDone: 0,
      foldersTotal: 0,
      bodiesDone: 0,
      bodiesTotal: 0,
      bodiesFailed: 0,
      attachmentsDone: 0,
      attachmentsTotal: 0,
      attachmentsCurrentFile: null,
      error: null,
      cancelRequested: false,
    }),

  cancel: () => set({ cancelRequested: true }),

  _update: (patch) => set((s) => ({ ...s, ...patch })),

  _finish: (phase, error) =>
    set({ phase, error: error ?? null, cancelRequested: false }),
}));
