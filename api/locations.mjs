import { randomUUID } from 'node:crypto';
import { redis, scopedKey, storageConfigured } from '../lib/redis.mjs';
import { locationInput } from '../lib/locations.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'POST 요청만 지원합니다.' });
  }
  const location = locationInput(req.body);
  if (!location) return res.status(400).json({ message: '이름과 국내 지도 좌표를 확인해주세요.' });
  if (!storageConfigured()) return res.status(503).json({ localOnly: true });
  try {
    const record = { ...location, id: 'user-' + randomUUID(), source: 'community' };
    await redis(['HSET', scopedKey('locations'), record.id, JSON.stringify(record)]);
    return res.status(201).json(record);
  } catch {
    return res.status(503).json({ message: '위치를 저장하지 못했습니다. 다시 시도해주세요.' });
  }
}
