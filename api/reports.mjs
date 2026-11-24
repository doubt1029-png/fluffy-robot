import { fields, validateReport } from '../lib/places.mjs';
import { redis, scopedKey, storageConfigured } from '../lib/redis.mjs';

const save = `
local report = cjson.decode(ARGV[2])
local previous = redis.call('HGET', KEYS[1], ARGV[1])
local conflicts = {}
if previous then
  previous = cjson.decode(previous)
  for i = 3, #ARGV do
    local field = ARGV[i]
    if previous[field] and previous[field] ~= 'unknown' and report[field] ~= 'unknown'
       and previous[field] ~= report[field] then
      table.insert(conflicts, field)
    end
  end
end
local encoded = cjson.encode(report)
local conflictsJson = #conflicts > 0 and cjson.encode(conflicts) or '[]'
encoded = string.sub(encoded, 1, -2) .. ',"conflicts":' .. conflictsJson .. '}'
redis.call('HSET', KEYS[1], ARGV[1], encoded)
return encoded
`;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'POST 요청만 지원합니다.' });
  }
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ message: '입력 내용을 확인해주세요.' });
  }
  let locationExists = false;
  if (typeof body?.id === 'string' && /^user-[0-9a-f-]{36}$/.test(body.id) && storageConfigured()) {
    try {
      locationExists = Boolean(await redis(['HEXISTS', scopedKey('locations'), body.id]));
    } catch {
      return res.status(503).json({ message: '제보를 저장하지 못했습니다. 다시 시도해주세요.' });
    }
  }
  const input = validateReport(body, locationExists);
  if (input.status) return res.status(input.status).json({ message: input.message });
  if (!storageConfigured()) {
    return res.status(503).json({ message: '제보 저장소를 연결한 뒤 제보할 수 있습니다.' });
  }
  try {
    const record = await redis(['EVAL', save, 1, scopedKey('reports'), input.id,
      JSON.stringify({ ...input.values, note: input.note, verifiedAt: new Date().toISOString() }), ...Object.keys(fields)]);
    return res.status(201).json(JSON.parse(record));
  } catch {
    return res.status(503).json({ message: '제보를 저장하지 못했습니다. 다시 시도해주세요.' });
  }
}
