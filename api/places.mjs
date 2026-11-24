import { places } from '../lib/places.mjs';
import { redis, scopedKey, storageConfigured } from '../lib/redis.mjs';

function records(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    result.set(values[index], JSON.parse(values[index + 1]));
  }
  return result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'GET 요청만 지원합니다.' });
  }
  if (!storageConfigured()) return res.status(200).json(places);
  try {
    const [locations, reports] = await Promise.all([
      redis(['HGETALL', scopedKey('locations')]),
      redis(['HGETALL', scopedKey('reports')])
    ]);
    const byId = records(reports || []);
    const joined = [...places, ...records(locations || []).values()];
    return res.status(200).json(joined.map(place => ({ ...place, ...byId.get(place.id) })));
  } catch {
    return res.status(503).json({ message: '공유 위치와 제보를 불러오지 못했습니다.' });
  }
}
