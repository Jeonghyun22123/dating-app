import { create } from 'zustand';

import type { IdentityResult } from '@/features/identity/identity-provider';

/** 프로필 행을 만들기 전까지 잠시 들고 있는 온보딩 입력값. */
type OnboardingState = {
  identity: IdentityResult | null;
  setIdentity: (identity: IdentityResult | null) => void;
  reset: () => void;
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  identity: null,
  setIdentity: (identity) => set({ identity }),
  reset: () => set({ identity: null }),
}));
