import type { Purpose } from '@/types/db';

export const PURPOSES: { value: Purpose; label: string; description: string }[] = [
  { value: 'friend', label: '동네 친구', description: '가까이 사는 편한 친구를 찾아요' },
  { value: 'hobby', label: '취미 메이트', description: '같은 취미를 함께할 사람을 찾아요' },
  { value: 'serious', label: '진지한 연애', description: '오래 만날 인연을 찾아요' },
];

export const HOBBY_TAGS = [
  '러닝', '헬스', '등산', '클라이밍', '요가', '수영', '테니스', '골프',
  '자전거', '캠핑', '여행', '맛집 탐방', '카페', '요리', '베이킹', '와인',
  '영화', '드라마', '독서', '전시', '공연', '음악 감상', '악기 연주', '노래',
  '사진', '그림', '게임', '보드게임', '반려동물', '봉사활동', '재테크', '외국어',
] as const;

export const LIMITS = {
  nicknameMin: 2,
  nicknameMax: 20,
  bioMax: 500,
  hobbiesMax: 10,
  neighborhoodMax: 20,
} as const;
