import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

type AuthState = {
  session: Session | null;
  /** 저장된 세션을 처음 읽어오기 전까지 false */
  isReady: boolean;
  setSession: (session: Session | null) => void;
  /** 비밀번호 재설정 메일의 링크로 들어온 상태. 새 비밀번호를 정할 때까지 다른 화면을 막습니다. */
  recovering: boolean;
  setRecovering: (recovering: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isReady: false,
  setSession: (session) => set({ session, isReady: true }),
  recovering: false,
  setRecovering: (recovering) => set({ recovering }),
}));
