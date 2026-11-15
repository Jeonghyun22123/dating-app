import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorText, Screen } from '@/components/ui/screen';
import {
  activateSpotlight,
  formatDate,
  formatRemaining,
  NotEnoughHeartsError,
  TRANSACTION_LABEL,
  useWallet,
} from '@/features/wallet/api';
import { formatTime } from '@/features/chat/api';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeColors } from '@/theme/theme-view';

/** 하트 · 스포트라이트 · 프리미엄 상태 · 사용 내역 */
export default function WalletScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const userId = useAuthStore((s) => s.session?.user.id);
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, tick] = useState(0);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  // 스포트라이트 남은 시간을 1분마다 다시 그립니다.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!wallet.data || !userId) {
    return (
      <Screen title="하트" onBack={back}>
        {wallet.isError ? (
          <Text className="text-base text-muted">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</Text>
        ) : (
          <ActivityIndicator color={colors.brand} />
        )}
      </Screen>
    );
  }

  const w = wallet.data;
  const spotlightOn = !!w.spotlight_until && new Date(w.spotlight_until).getTime() > Date.now();
  const canSpotlight = w.balance >= w.prices.spotlight;

  async function handleSpotlight() {
    setError(null);
    setBusy(true);
    try {
      await activateSpotlight(userId!);
    } catch (e) {
      setError(
        e instanceof NotEnoughHeartsError
          ? '하트가 부족해요.'
          : '스포트라이트를 켜지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="하트" onBack={back}>
      <View className="items-center gap-1 rounded-3xl bg-card p-6">
        <View className="flex-row items-center gap-2">
          <Ionicons name="heart" size={28} color={colors.brand} />
          <Text accessibilityLabel={`보유 하트 ${w.balance}개`} className="text-4xl font-bold text-fg">
            {w.balance}
          </Text>
        </View>
        <Text className="text-sm text-muted">보유 하트</Text>
        <Text className="mt-2 text-sm text-subtle">남은 무료 시그널 {w.signal_credits}회</Text>
        {w.premium ? (
          <View className="mt-2 rounded-full bg-brand-50 px-3 py-1">
            <Text className="text-sm font-semibold text-brand-600">
              프리미엄 {w.premium_expires_at ? `· ${formatDate(w.premium_expires_at)}까지` : ''}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="gap-3 rounded-3xl bg-card p-5">
        <View className="flex-row items-center gap-2">
          <Ionicons name="flash" size={20} color={colors.brand} />
          <Text className="text-lg font-bold text-fg">스포트라이트</Text>
        </View>
        <Text className="text-base leading-6 text-muted">
          {w.prices.spotlight_minutes}분 동안 내 프로필이 근처 사람들의 둘러보기 앞쪽에 보여요. 사용 중에 다시
          켜면 시간이 이어서 늘어나요.
        </Text>
        {spotlightOn ? (
          <Text className="text-base font-semibold text-brand-600">
            사용 중 · {formatRemaining(w.spotlight_until)} 남음
          </Text>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Button
          title={`하트 ${w.prices.spotlight}개로 ${spotlightOn ? '시간 늘리기' : '켜기'}`}
          onPress={handleSpotlight}
          loading={busy}
          disabled={!canSpotlight}
        />
        {!canSpotlight ? (
          <Text className="text-sm text-subtle">하트가 {w.prices.spotlight - w.balance}개 더 필요해요.</Text>
        ) : null}
      </View>

      <View className="gap-2 rounded-3xl bg-card p-5">
        <Text className="text-lg font-bold text-fg">하트 충전</Text>
        <Text className="text-base leading-6 text-muted">
          결제는 준비 중이에요. 곧 하트를 구매할 수 있어요.
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted">사용 내역</Text>
        {w.transactions.length === 0 ? (
          <Text className="text-base text-subtle">아직 내역이 없어요.</Text>
        ) : (
          <View className="overflow-hidden rounded-2xl border border-line bg-card">
            {w.transactions.map((t, i) => (
              <View
                key={`${t.created_at}-${i}`}
                className="flex-row items-center justify-between border-b border-line px-4 py-3 last:border-b-0">
                <View>
                  <Text className="text-base text-fg">{TRANSACTION_LABEL[t.type] ?? t.type}</Text>
                  <Text className="text-xs text-subtle">
                    {formatDate(t.created_at)} {formatTime(t.created_at)}
                  </Text>
                </View>
                <Text className={`text-base font-semibold ${t.amount > 0 ? 'text-emerald-600' : 'text-fg'}`}>
                  {t.amount > 0 ? `+${t.amount}` : t.amount}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
