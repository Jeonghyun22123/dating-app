import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { REPORT_REASONS } from '@/features/safety/api';

import { formatDateTime, resolveReport, setBanned, useAdminReports, type AdminReport, type ReportStatus } from './api';
import { ActionButton, Badge, Card, ListState, useActionError } from './parts';

const FILTERS: { value: ReportStatus | 'all'; label: string }[] = [
  { value: 'pending', label: '대기' },
  { value: 'reviewed', label: '검토 완료' },
  { value: 'resolved', label: '조치 완료' },
  { value: 'all', label: '전체' },
];

const STATUS_BADGE: Record<ReportStatus, { label: string; tone: 'amber' | 'neutral' | 'green' }> = {
  pending: { label: '대기', tone: 'amber' },
  reviewed: { label: '검토 완료', tone: 'neutral' },
  resolved: { label: '조치 완료', tone: 'green' },
};

const reasonLabel = (reason: string) => REPORT_REASONS.find((item) => item.value === reason)?.label ?? reason;

function Snapshot({ report }: { report: AdminReport }) {
  const messages = report.chat_snapshot ?? [];
  if (messages.length === 0) {
    return <Text className="text-sm text-neutral-500">첨부된 대화가 없어요 (프로필에서 접수된 신고).</Text>;
  }
  return (
    <View className="gap-2 rounded-xl bg-neutral-50 p-3">
      {messages.map((message) => {
        const fromReported = message.sender_id === report.reported_user_id;
        return (
          <View key={message.id} className="gap-0.5">
            <Text className={`text-xs font-semibold ${fromReported ? 'text-red-600' : 'text-neutral-500'}`}>
              {fromReported ? `${report.reported_nickname} (피신고자)` : `${report.reporter_nickname ?? '탈퇴한 사용자'} (신고자)`}
              {' · '}
              {formatDateTime(message.created_at)}
            </Text>
            <Text className="text-sm leading-5 text-neutral-900">{message.content}</Text>
          </View>
        );
      })}
    </View>
  );
}

function ReportCard({ report }: { report: AdminReport }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(report.admin_note ?? '');
  const { error, run } = useActionError();
  const badge = STATUS_BADGE[report.status];
  const count = report.chat_snapshot?.length ?? 0;
  const fail = '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';

  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={badge.label} tone={badge.tone} />
        <Text className="text-base font-semibold text-neutral-900">{reasonLabel(report.reason)}</Text>
        <Text className="text-xs text-neutral-500">{formatDateTime(report.created_at)}</Text>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="text-sm text-neutral-700">
          {report.reporter_nickname ?? '탈퇴한 사용자'} → <Text className="font-semibold">{report.reported_nickname}</Text>
        </Text>
        <Badge label={`누적 신고 ${report.reported_report_count}건`} tone={report.reported_report_count >= 3 ? 'red' : 'neutral'} />
        {report.reported_is_banned ? <Badge label="정지됨" tone="red" /> : null}
      </View>

      {report.description ? <Text className="text-sm leading-5 text-neutral-800">“{report.description}”</Text> : null}

      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)}>
        <Text className="text-sm font-semibold text-brand-600">
          {open ? '증거 대화 접기' : `증거 대화 보기 (${count}개 메시지)`}
        </Text>
      </Pressable>
      {open ? <Snapshot report={report} /> : null}

      <TextInput
        accessibilityLabel="처리 메모"
        className="min-h-10 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900"
        placeholder="처리 메모 (선택)"
        placeholderTextColor="#a3a3a3"
        value={note}
        onChangeText={setNote}
        maxLength={500}
      />
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

      <View className="flex-row flex-wrap justify-end gap-2">
        <ActionButton
          title="조치 없이 검토 완료"
          onPress={() => run(() => resolveReport(report.id, 'reviewed', note), fail)}
        />
        {report.reported_is_banned ? (
          <ActionButton
            title="조치 완료 처리"
            tone="primary"
            onPress={() => run(() => resolveReport(report.id, 'resolved', note), fail)}
          />
        ) : (
          <ActionButton
            title="계정 정지 후 조치 완료"
            tone="danger"
            confirm
            onPress={() =>
              run(async () => {
                await setBanned(report.reported_user_id, true, `신고 처리: ${reasonLabel(report.reason)}`);
                await resolveReport(report.id, 'resolved', note);
              }, fail)
            }
          />
        )}
      </View>
    </Card>
  );
}

export function Reports() {
  const [filter, setFilter] = useState<ReportStatus | 'all'>('pending');
  const reports = useAdminReports(filter);
  const items = reports.data ?? [];

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Chip key={item.value} label={item.label} selected={filter === item.value} onPress={() => setFilter(item.value)} />
        ))}
      </View>
      <ListState
        loading={reports.isPending}
        error={reports.isError}
        empty={items.length === 0}
        emptyText="해당하는 신고가 없어요."
        onRetry={() => reports.refetch()}
      />
      {items.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </View>
  );
}
