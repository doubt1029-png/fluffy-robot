import { readFile } from 'node:fs/promises';

export const places = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));

export const fields = {
  entry: ['open', 'locked', 'unknown'],
  code: ['yes', 'no', 'unknown'],
  type: ['flush', 'squat', 'unknown'],
  public: ['yes', 'no', 'unknown']
};

export function validateReport(input) {
  if (!input || !places.some(place => place.id === input.id)) {
    return { status: 404, message: '화장실 정보를 찾을 수 없습니다.' };
  }
  const keys = Object.keys(fields);
  if (!keys.every(key => fields[key].includes(input[key]))) {
    return { status: 400, message: '필수 항목을 모두 선택해주세요.' };
  }
  if (typeof input.note !== 'string' || input.note.length > 200) {
    return { status: 400, message: '추가 설명은 200자 이하로 입력해주세요.' };
  }
  return {
    id: input.id,
    values: Object.fromEntries(keys.map(key => [key, input[key]])),
    note: input.note.trim()
  };
}
