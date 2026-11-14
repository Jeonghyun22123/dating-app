import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { LEGAL_DOCUMENTS, type LegalDocId } from '@/features/consent/documents';

/** 약관 전문 보기 (로그인 전후 모두 열 수 있습니다). */
export default function LegalDocumentScreen() {
  const router = useRouter();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const document = LEGAL_DOCUMENTS[doc as LegalDocId];
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (!document) {
    return <Screen title="문서를 찾을 수 없어요" onBack={back}>{null}</Screen>;
  }

  return (
    <Screen title={document.title} onBack={back}>
      {document.sections.map((section) => (
        <View key={section.heading} className="gap-2">
          <Text className="text-base font-semibold text-fg">{section.heading}</Text>
          <Text className="text-base leading-6 text-muted">{section.body}</Text>
        </View>
      ))}
    </Screen>
  );
}
