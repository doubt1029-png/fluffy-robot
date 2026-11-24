import { fields, validateReport } from '../lib/places.mjs';
import { redis, reportKey, storageConfigured } from '../lib/redis.mjs';

const save = `
local report = cjson.decode(ARGV[1])
local previous = redis.call('GET', KEYS[1])
local conflicts = {}
if previous then
  previous = cjson.decode(previous)
  for i = 2, #ARGV do
    local field = ARGV[i]
    if previous[field] and previous[field] ~= 'unknown' and report[field] ~= 'unknown'
       and previous[field] ~= report[field] then
      table.insert(conflicts, field)
    end
  end
end
local clock = redis.call('TIME')
local stamp = tostring(clock[1] * 1000 + math.floor(clock[2] / 1000))
local encoded = cjson.encode(report)
local conflictsJson = #conflicts > 0 and cjson.encode(conflicts) or '[]'
encoded = string.sub(encoded, 1, -2) .. ',"verifiedAt":' .. stamp .. ',"conflicts":' .. conflictsJson .. '}'
redis.call('SET', KEYS[1], encoded)
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
  const input = validateReport(body);
  if (input.status) return res.status(input.status).json({ message: input.message });
  if (!storageConfigured()) {
    return res.status(503).json({ message: '제보 저장소를 연결한 뒤 제보할 수 있습니다.' });
  }
  try {
    const record = await redis(['EVAL', save, 1, reportKey(input.id),
      JSON.stringify({ ...input.values, note: input.note }), ...Object.keys(fields)]);
    return res.status(201).json(JSON.parse(record));
  } catch {
    return res.status(503).json({ message: '제보를 저장하지 못했습니다. 다시 시도해주세요.' });
  }
}
