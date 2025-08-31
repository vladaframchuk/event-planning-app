import { create } from 'zustand';

interface AppState {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
}

export const useAppStore = create<AppState>()(() => ({}));