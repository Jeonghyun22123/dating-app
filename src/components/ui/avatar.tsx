import { Image } from 'expo-image';
import { Text, View } from 'react-native';

type Props = { url?: string | null; name: string; size?: number };

/** 원형 프로필 이미지. 사진이 없으면 이름 첫 글자를 보여줍니다. */
export function Avatar({ url, name, size = 56 }: Props) {
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className="items-center justify-center overflow-hidden bg-brand-100">
      {url ? (
        <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Text style={{ fontSize: size * 0.4 }} className="font-semibold text-brand-600">
          {name.slice(0, 1)}
        </Text>
      )}
    </View>
  );
}
