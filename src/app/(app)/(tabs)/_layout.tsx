import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMatches } from '@/features/chat/api';
import { useThemeColors } from '@/theme/theme-view';

type IconName = keyof typeof Ionicons.glyphMap;

const icon =
  (active: IconName, inactive: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} color={color as string} size={size} />
  );

export default function TabsLayout() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { data: matches } = useMatches();
  const unread = (matches ?? []).reduce((sum, match) => sum + match.unread_count, 0);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.subtle,
        tabBarLabelStyle: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
        // 아이콘과 글자가 잘리지 않도록 높이를 직접 지정합니다 (홈 인디케이터 영역 포함).
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom,
          backgroundColor: colors.card,
          borderTopColor: colors.line,
        },
        tabBarBadgeStyle: { backgroundColor: colors.brand, color: '#ffffff' },
      }}>
      <Tabs.Screen name="index" options={{ title: '둘러보기', tabBarIcon: icon('compass', 'compass-outline') }} />
      <Tabs.Screen
        name="matches"
        options={{
          title: '채팅',
          tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: '내 프로필', tabBarIcon: icon('person', 'person-outline') }} />
    </Tabs>
  );
}
