import { create } from "zustand";
import type { Attachment } from "@/lib/ipc";

export interface ImageGallerySession {
  accountId: number;
  folderPath: string;
  uid: number;
  attachments: Attachment[];
  index: number;
}

interface ImageGalleryState {
  session: ImageGallerySession | null;
  sessionId: number;
  open: (params: Omit<ImageGallerySession, "index"> & { index?: number }) => void;
  close: () => void;
  setIndex: (i: number) => void;
}

export const useImageGalleryStore = create<ImageGalleryState>()((set) => ({
  session: null,
  sessionId: 0,
  open: (params) => set((s) => ({ session: { ...params, index: params.index ?? 0 }, sessionId: s.sessionId + 1 })),
  close: () => set((s) => ({ session: null, sessionId: s.sessionId + 1 })),
  setIndex: (i) =>
    set((s) =>
      s.session ? { session: { ...s.session, index: i } } : s,
    ),
}));
