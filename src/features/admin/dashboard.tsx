import { Text, View } from 'react-native';

import { useAdminStats, type AdminStats } from './api';
import { ListState } from './parts';

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View className="min-w-[30%] flex-1 rounded-2xl border border-line bg-card p-4">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className={`mt-1 text-2xl font-bold ${highlight && value > 0 ? 'text-brand-600' : 'text-fg'}`}>
        {value.toLocaleString('ko-KR')}
      </Text>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-muted">{title}</Text>
      <View className="flex-row flex-wrap gap-2">{children}</View>
    </View>
  );
}

function Stats({ s }: { s: AdminStats }) {
  return (
    <View className="gap-6">
      <Group title="처리 대기">
        <Stat label="셀카 심사" value={s.selfies_pending} highlight />
        <Stat label="신고" value={s.reports_pending} highlight />
        <Stat label="사진 검수 대기" value={s.photos_pending} highlight />
      </Group>
      <Group title="회원">
        <Stat label="전체 가입" value={s.users_total} />
        <Stat label="온보딩 완료" value={s.users_onboarded} />
        <Stat label="본인 인증 완료" value={s.verified_approved} />
        <Stat label="오늘 가입" value={s.users_new_today} />
        <Stat label="최근 7일 가입" value={s.users_new_7d} />
        <Stat label="최근 24시간 활동" value={s.users_active_24h} />
        <Stat label="여성" value={s.gender_female} />
        <Stat label="남성" value={s.gender_male} />
        <Stat label="정지" value={s.users_banned} />
      </Group>
      <Group title="만남 목적">
        <Stat label="동네 친구" value={s.purpose_friend} />
        <Stat label="취미 메이트" value={s.purpose_hobby} />
        <Stat label="진지한 연애" value={s.purpose_serious} />
      </Group>
      <Group title="활동">
        <Stat label="전체 매칭" value={s.matches_total} />
        <Stat label="최근 7일 매칭" value={s.matches_7d} />
        <Stat label="최근 7일 메시지 수" value={s.messages_7d} />
      </Group>
    </View>
  );
}

export function Dashboard() {
  const stats = useAdminStats();
  if (!stats.data) {
    return (
      <ListState
        loading={stats.isPending}
        error={stats.isError}
        empty={false}
        emptyText=""
        onRetry={() => stats.refetch()}
      />
    );
  }
  return <Stats s={stats.data} />;
}
