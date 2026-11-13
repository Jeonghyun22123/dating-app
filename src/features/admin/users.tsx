import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { formatDateTime, GENDER_LABEL, setBanned, useAdminUsers, type AdminUser } from './api';
import { ActionButton, Badge, Card, ListState, useActionError } from './parts';

const VERIFICATION: Record<AdminUser['verification_status'], { label: string; tone: 'amber' | 'green' | 'red' }> = {
  pending: { label: '인증 전', tone: 'amber' },
  approved: { label: '인증 완료', tone: 'green' },
  rejected: { label: '인증 반려', tone: 'red' },
};

function UserCard({ user }: { user: AdminUser }) {
  const { error, run } = useActionError();
  const verification = VERIFICATION[user.verification_status];
  const fail = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-base font-semibold text-neutral-900">
          {user.nickname} · {user.age}세 · {GENDER_LABEL[user.gender]}
        </Text>
        {user.role === 'admin' ? <Badge label="관리자" tone="neutral" /> : null}
        <Badge label={verification.label} tone={verification.tone} />
        {user.is_banned ? <Badge label="정지됨" tone="red" /> : null}
        {user.report_count > 0 ? (
          <Badge label={`신고 ${user.report_count}건`} tone={user.report_count >= 3 ? 'red' : 'neutral'} />
        ) : null}
      </View>
      <Text className="text-sm text-neutral-600">{user.email}</Text>
      <Text className="text-xs text-neutral-500">
        {user.neighborhood_name ?? '동네 미설정'} · 가입 {formatDateTime(user.created_at)} · 최근 활동{' '}
        {formatDateTime(user.last_active_at)}
      </Text>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
      {user.role !== 'admin' ? (
        <View className="flex-row justify-end">
          {user.is_banned ? (
            <ActionButton title="정지 해제" onPress={() => run(() => setBanned(user.id, false), fail)} />
          ) : (
            <ActionButton
              title="계정 정지"
              tone="danger"
              confirm
              onPress={() => run(() => setBanned(user.id, true, '관리자 직접 정지'), fail)}
            />
          )}
        </View>
      ) : null}
    </Card>
  );
}

export function Users() {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const users = useAdminUsers(search);
  const items = users.data ?? [];

  // 입력이 멈춘 뒤 0.4초 후에 검색합니다.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), 400);
    return () => clearTimeout(timer);
  }, [input]);

  return (
    <View className="gap-3">
      <TextInput
        accessibilityLabel="회원 검색"
        className="h-12 rounded-2xl border border-neutral-300 bg-white px-4 text-base text-neutral-900"
        placeholder="닉네임 또는 이메일로 검색"
        placeholderTextColor="#a3a3a3"
        autoCapitalize="none"
        value={input}
        onChangeText={setInput}
      />
      <ListState
        loading={users.isPending}
        error={users.isError}
        empty={items.length === 0}
        emptyText="해당하는 회원이 없어요."
        onRetry={() => users.refetch()}
      />
      {items.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </View>
  );
}
