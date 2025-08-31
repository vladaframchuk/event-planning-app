import { create } from 'zustand';

interface AppState {
  _initialized: boolean;
}

export const useAppStore = create<AppState>()(() => ({_initialized: true}));