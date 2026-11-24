import { places } from '../lib/places.mjs';
import { redis, reportKey, storageConfigured } from '../lib/redis.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'GET 요청만 지원합니다.' });
  }
  if (!storageConfigured()) return res.status(200).json(places);
  try {
    const records = await redis(['MGET', ...places.map(place => reportKey(place.id))]);
    return res.status(200).json(places.map((place, index) => ({
      ...place, ...(records[index] ? JSON.parse(records[index]) : {})
    })));
  } catch {
    return res.status(503).json({ message: '화장실 정보를 불러오지 못했습니다.' });
  }
}
