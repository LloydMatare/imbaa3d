import { create } from "zustand";

interface CreditsStore {
  credits: number;
  setCredits: (credits: number) => void;
  decrementCredits: (amount: number) => void;
}

export const useCreditsStore = create<CreditsStore>((set) => ({
  credits: 0,
  setCredits: (credits) => set({ credits }),
  decrementCredits: (amount) =>
    set((state) => ({ credits: Math.max(0, state.credits - amount) })),
}));
