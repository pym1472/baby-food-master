'use strict';
/* 내장 데이터 — 일반 참고용 가이드. 담당 소아과 지침이 항상 우선합니다.
   수치(도입 월령, 위험도)는 개발 단계에서 공신력 있는 자료로 교차 검증 예정. */

const CATS = { grain: '곡류', veg: '채소', fruit: '과일', protein: '단백질', other: '기타' };

// min: 도입 권장 월령(개월), risk: 0 낮음 / 1 보통 / 2 알레르기 주의
const INGREDIENTS = [
  { id: 'rice',        name: '쌀',          emoji: '🍚', cat: 'grain',   min: 5, risk: 0, tip: '곱게 갈아 10배죽(미음)부터 시작하세요. 모든 이유식의 기본 재료입니다.' },
  { id: 'oat',         name: '오트밀',      emoji: '🌾', cat: 'grain',   min: 6, risk: 1, tip: '곡류 다양화용. 소량부터 시작하고 반응을 확인하세요.' },
  { id: 'pumpkin',     name: '단호박',      emoji: '🎃', cat: 'veg',     min: 5, risk: 0, tip: '껍질·씨 제거 후 쪄서 으깨 넣으세요. 단맛이 있어 잘 먹는 편입니다.' },
  { id: 'zucchini',    name: '애호박',      emoji: '🥒', cat: 'veg',     min: 5, risk: 0, tip: '껍질과 씨를 제거하고 푹 익혀 곱게 갈아주세요.' },
  { id: 'sweetpotato', name: '고구마',      emoji: '🍠', cat: 'veg',     min: 5, risk: 0, tip: '섬유질이 많아 배변 변화를 함께 확인하세요.' },
  { id: 'potato',      name: '감자',        emoji: '🥔', cat: 'veg',     min: 5, risk: 0, tip: '싹과 초록빛 부분은 완전히 제거하고 푹 익히세요.' },
  { id: 'broccoli',    name: '브로콜리',    emoji: '🥦', cat: 'veg',     min: 5, risk: 0, tip: '꽃송이 부분 위주로 푹 익혀 곱게 갈아주세요.' },
  { id: 'carrot',      name: '당근',        emoji: '🥕', cat: 'veg',     min: 5, risk: 0, tip: '푹 익혀 곱게 갈아주세요. 껍질은 벗기세요.' },
  { id: 'cabbage',     name: '양배추',      emoji: '🥬', cat: 'veg',     min: 5, risk: 0, tip: '심지를 제거하고 부드러운 잎을 푹 익혀 갈아주세요.' },
  { id: 'spinach',     name: '시금치',      emoji: '🌿', cat: 'veg',     min: 6, risk: 0, tip: '잎 부분만 데쳐 곱게 갈아주세요.' },
  { id: 'radish',      name: '무',          emoji: '⚪', cat: 'veg',     min: 6, risk: 0, tip: '푹 익혀 부드럽게 사용하세요.' },
  { id: 'apple',       name: '사과',        emoji: '🍎', cat: 'fruit',   min: 5, risk: 0, tip: '껍질·씨를 제거하고 찌거나 갈아서 사용하세요.' },
  { id: 'pear',        name: '배',          emoji: '🍐', cat: 'fruit',   min: 5, risk: 0, tip: '껍질을 제거하고 갈거나 쪄서 사용하세요.' },
  { id: 'banana',      name: '바나나',      emoji: '🍌', cat: 'fruit',   min: 5, risk: 0, tip: '잘 익은 것을 으깨 사용하세요. 변비가 있다면 양을 조절하세요.' },
  { id: 'beef',        name: '소고기',      emoji: '🥩', cat: 'protein', min: 6, risk: 1, tip: '핏물을 빼고 안심·우둔 부위를 곱게 다져 사용하세요. 철분 공급원입니다.' },
  { id: 'chicken',     name: '닭가슴살',    emoji: '🍗', cat: 'protein', min: 7, risk: 0, tip: '삶아서 결대로 찢은 뒤 곱게 다져 사용하세요.' },
  { id: 'tofu',        name: '두부',        emoji: '🧈', cat: 'protein', min: 7, risk: 1, tip: '대두 알레르기 가능성이 있어 소량부터, 끓는 물에 데쳐 사용하세요.' },
  { id: 'eggyolk',     name: '달걀노른자',  emoji: '🥚', cat: 'protein', min: 7, risk: 2, tip: '완숙으로 익혀 소량부터. 알레르기 주의 재료이므로 가족력이 있으면 소아과와 먼저 상의하세요.' },
  { id: 'whitefish',   name: '흰살생선',    emoji: '🐟', cat: 'protein', min: 8, risk: 2, tip: '가시를 완전히 제거하고 푹 익히세요. 알레르기 주의 재료입니다.' },
  { id: 'yogurt',      name: '플레인요거트', emoji: '🥛', cat: 'other',   min: 8, risk: 1, tip: '무가당 플레인으로 소량부터. 우유 알레르기 반응을 확인하세요.' }
];
const ING = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

// 신규 재료 도입 순서(자동 생성용)
const POOL = ['pumpkin', 'zucchini', 'sweetpotato', 'potato', 'broccoli', 'carrot', 'cabbage',
  'apple', 'pear', 'banana', 'beef', 'spinach', 'radish', 'chicken', 'tofu', 'oat', 'eggyolk', 'whitefish', 'yogurt'];

const SLOTS = ['am', 'noon', 'pm'];
const SLOT_EMOJI = { am: '🌅', noon: '☀️', pm: '🌙' };
const SLOT_SET = { 1: ['am'], 2: ['am', 'pm'], 3: ['am', 'noon', 'pm'] };

const PREP = {
  cube:  { label: '대량 큐브', emoji: '🧊' },
  daily: { label: '당일 조리', emoji: '🍳' },
  kit:   { label: '밀키트',   emoji: '📦' },
  ready: { label: '완제품',   emoji: '🥣' }
};
const BASIS = { guide: '표준 가이드', self: '직접 구성', hospital: '병원 지침' };
const METHOD = { mix: '혼합', trad: '전통(죽·미음)', blw: '아기주도(BLW)' };
const SRC = {
  guide: { label: '가이드', color: '#7c6cf0' },
  book:  { label: '전문서적', color: '#e0869a' },
  insta: { label: '인스타', color: '#d96ac4' },
  blog:  { label: '블로그', color: '#4caf8e' },
  inst:  { label: '전문기관', color: '#4c94d8' },
  self:  { label: '직접 작성', color: '#e0a23c' },
  etc:   { label: '기타', color: '#8a84a0' }
};

const REACT = {
  good:   { label: '잘 먹음', emoji: '😋' },
  some:   { label: '조금 먹음', emoji: '😐' },
  refuse: { label: '거부', emoji: '🙅' }
};
const SYMPTOMS = ['발진·두드러기', '얼굴·입술 부기', '구토', '설사', '변비', '복통·가스', '심한 보챔', '기침·콧물', '기타'];
const STOOL = ['정상', '묽음', '단단함', '점액·혈변 의심'];
const STATUS = {
  none:     { label: '미시도',     cls: 's-none' },
  observing:{ label: '관찰 중',    cls: 's-obs' },
  review:   { label: '확인 필요',  cls: 's-review' },
  pass:     { label: '통과',       cls: 's-pass' },
  caution:  { label: '주의',       cls: 's-caution' },
  excluded: { label: '제외',       cls: 's-ex' }
};

/* ===== 기본 레시피 (일반 조리 방법 참고용, 직접 수정 가능) ===== */
const KDCA_URL = 'https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=5470';
// 기본 레시피별 유튜브 영상: 2026-10-08 유튜브 검색(조회수순)에서 레시피 재료 키워드가 제목에 있는 '이유식' 영상 중 조회수 최고 영상
const YT_CHECKED = '2026-10-08';
const SEED_VIDEOS = {
  1: { id: 'iZVxQ4LwegI', title: '초기 이유식 만들기X도빈맘🥣 l 토핑이유식 13종 재료 레시피모음👩‍🍳 (쌀미음 오트밀 소고기 애호박 브로콜리 단호박 양배추 당근 시금치 닭고기 계란테스트 청경채 두부 큐브)', ch: '에너지니 energyNee', len: '17:44', views: 175952 },
  2: { id: 'iZVxQ4LwegI', title: '초기 이유식 만들기X도빈맘🥣 l 토핑이유식 13종 재료 레시피모음👩‍🍳 (쌀미음 오트밀 소고기 애호박 브로콜리 단호박 양배추 당근 시금치 닭고기 계란테스트 청경채 두부 큐브)', ch: '에너지니 energyNee', len: '17:44', views: 175952 },
  3: { id: 'dpqkErDHqxQ', title: '육아브이로그ㅣ초기 이유식 1단계 준비물🥣, 토핑 이유식, 큐브 이유식, 쌀오트밀죽 소고기큐브 애호박큐브 단호박큐브 사과퓨레 달걀노른자큐브 👶🏻', ch: '잉느지', len: '17:30', views: 261724 },
  4: { id: 'KayAWYxKI6Y', title: '[초기 이유식 1단계] 고구마와 쌀가루로 고구마미음 만들기', ch: '행복한으남매네', len: '3:55', views: 10990, note: '고구마 키워드 영상 중 초기 이유식 단계에 맞는 최고 조회수 영상' },
  5: { id: 'D0Wp1zE1BEQ', title: '쉽게 만드는 이유식 꿀팁 대방출🍚 준비물 & 초기, 중기 이유식ㅣ소고기 육수ㅣ육아 브이로그', ch: '종지부부', len: '15:53', views: 672578 },
  6: { id: 'D0Wp1zE1BEQ', title: '쉽게 만드는 이유식 꿀팁 대방출🍚 준비물 & 초기, 중기 이유식ㅣ소고기 육수ㅣ육아 브이로그', ch: '종지부부', len: '15:53', views: 672578 }
};
function seedRecipes() {
  const src = { type: 'guide', detail: '일반 조리 방법 참고용 · 보관 기준은 질병관리청 안내', url: KDCA_URL };
  const st = (t, min) => ({ t, min: min || 0 });
  const base = [
    st('쌀을 깨끗이 씻어 물에 30분 정도 불립니다.', 30),
    st('불린 쌀을 물과 함께 믹서에 곱게 갈거나 절구로 으깹니다.'),
    st('냄비에 쌀 1 : 물 10 비율로 넣고 센 불에서 끓입니다.'),
    st('끓어오르면 약한 불로 줄여 바닥에 눌어붙지 않게 저어가며 끓입니다.', 20)
  ];
  const fin = [st('체에 한 번 걸러 곱게 만들고 숟가락에서 흘러내리는 농도인지 확인합니다.'), st('한 번 먹일 양씩 소분해 식힌 뒤 큐브 트레이에 담아 냉동합니다.')];
  const storage = '소분해 냉동하고 먹기 전 충분히 가열해 해동하세요. 질병관리청 안내: 냉장 24시간 · 냉동 1주일 이내 보관 권장.';
  const mk = (n, title, stage, ing, amount, steps, note) => ({ id: 'seed-' + n, title, stage, ing, extra: '', amount, steps, storage, src, note: note || '', createdAt: '2026-10-08', video: { ...SEED_VIDEOS[n], checked: YT_CHECKED } });
  return [
    mk(1, '쌀미음 (10배죽)', 'early', ['rice'], '쌀 1 : 물 10 (부피 기준) · 조리 시간은 불 세기에 맞게 조절', [...base, ...fin], '이유식 첫 재료. 처음엔 묽게 시작해요.'),
    mk(2, '단호박 미음', 'early', ['rice', 'pumpkin'], '쌀미음 + 단호박 으깬 것 약간', [
      st('단호박은 껍질과 씨를 제거하고 작게 썰어요.'), st('찜기에서 젓가락이 쉽게 들어갈 때까지 찝니다.', 15), st('찐 단호박을 곱게 으깨거나 갈아요.'),
      ...base, st('완성된 쌀미음에 으깬 단호박을 섞어 한소끔 저어줍니다.'), ...fin], '신규 재료 단호박 — 관찰 기간에는 다른 새 재료를 섞지 마세요.'),
    mk(3, '애호박 미음', 'early', ['rice', 'zucchini'], '쌀미음 + 애호박 간 것 약간', [
      st('애호박은 껍질과 씨 부분을 제거하고 잘게 썰어요.'), st('찜기나 끓는 물에서 푹 익혀요.', 10), st('곱게 갈아 준비합니다.'),
      ...base, st('쌀미음에 간 애호박을 섞어 한소끔 저어줍니다.'), ...fin]),
    mk(4, '고구마 미음', 'early', ['rice', 'sweetpotato'], '쌀미음 + 고구마 으깬 것 약간', [
      st('고구마는 껍질을 벗기고 작게 썰어 물에 잠시 담가요.'), st('찜기에서 부드럽게 찝니다.', 15), st('곱게 으깨요.'),
      ...base, st('쌀미음에 으깬 고구마를 섞어 저어줍니다.'), ...fin], '배변 상태를 함께 확인하세요.'),
    mk(5, '소고기 미음', 'early', ['rice', 'beef'], '쌀미음 + 다진 소고기 약간', [
      st('지방이 적은 소고기를 찬물에 담가 핏물을 뺍니다.', 30), st('끓는 물에 완전히 익을 때까지 삶아요.', 15), st('익힌 고기를 곱게 갈거나 다집니다.'),
      ...base, st('쌀미음에 간 고기를 넣고 잘 풀어 한소끔 끓여요.'), ...fin], '철분 공급원. 질병관리청은 초기부터 철분 공급을 안내해요.'),
    mk(6, '소고기 브로콜리 죽', 'mid', ['rice', 'beef', 'broccoli', 'carrot'], '쌀 1 : 물 5 (5배죽)', [
      st('쌀을 씻어 30분 불린 뒤 물기를 빼고 알갱이가 남게 으깨요.', 30), st('소고기는 핏물을 빼고 삶아 곱게 다져요.', 15),
      st('브로콜리 꽃송이와 당근은 푹 쪄서 잘게 다져요.', 10), st('냄비에 쌀 1 : 물 5 비율로 넣고 끓이다 약불로 줄여 저어가며 끓여요.', 20),
      st('쌀이 퍼지면 고기와 채소를 넣고 한소끔 더 끓입니다.', 5), ...fin], '중기 질감 예시. 새 재료는 한 번에 하나씩 추가하세요.')
  ];
}
