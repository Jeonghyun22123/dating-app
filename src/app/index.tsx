import { Text, View } from 'react-native';

import { isPostHogConfigured, isSupabaseConfigured } from '@/lib/env';
import { useAuthStore } from '@/stores/auth-store';

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <View className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3">
      <Text className="text-base font-medium text-neutral-900">{label}</Text>
      <Text className={ok ? 'text-sm text-emerald-600' : 'text-sm text-neutral-400'}>{detail}</Text>
    </View>
  );
}

/** Phase 1 확인용 임시 화면. Phase 2에서 로그인/온보딩 흐름으로 교체합니다. */
export default function HomeScreen() {
  const { session, isReady } = useAuthStore();

  return (
    <View className="flex-1 items-center justify-center bg-brand-50 px-6">
      <View className="w-full max-w-md gap-3">
        <Text className="text-3xl font-bold text-brand-600">Dating App</Text>
        <Text className="mb-4 text-base text-neutral-600">Phase 1 · 기본 인프라 세팅 완료</Text>

        <StatusRow
          label="Supabase"
          ok={isSupabaseConfigured}
          detail={isSupabaseConfigured ? '연결 설정됨' : '.env.local 필요'}
        />
        <StatusRow
          label="PostHog"
          ok={isPostHogConfigured}
          detail={isPostHogConfigured ? '연결 설정됨' : '꺼짐 (키 없음)'}
        />
        <StatusRow
          label="로그인 상태"
          ok={!!session}
          detail={!isReady ? '확인 중…' : session ? '로그인됨' : '로그아웃 상태'}
        />
      </View>
    </View>
  );
}
