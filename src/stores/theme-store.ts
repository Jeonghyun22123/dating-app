import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_THEME, type ThemeId } from '@/theme/themes';

type ThemeState = {
  themeId: ThemeId;
  /** 기기에 저장된 테마를 읽어 왔는지 (읽기 전에 화면을 그리면 잠깐 다른 테마가 보입니다) */
  hydrated: boolean;
  setTheme: (themeId: ThemeId) => void;
};

/** 화면 테마는 계정이 아니라 이 기기에 저장합니다 (로그인 전 화면에도 적용되도록). */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME,
      hydrated: false,
      setTheme: (themeId) => set({ themeId }),
    }),
    {
      name: 'display-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ themeId: state.themeId }),
      // 웹 정적 빌드(서버 렌더링) 중에는 저장소가 없으므로 건너뜁니다.
      skipHydration: typeof window === 'undefined',
      onRehydrateStorage: () => () => useThemeStore.setState({ hydrated: true }),
    },
  ),
);
