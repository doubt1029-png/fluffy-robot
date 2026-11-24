export function storageConfigured() {
  return Boolean(endpoint() && token());
}

function endpoint() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
}

function token() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
}

export async function redis(command) {
  const response = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5000)
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Redis command failed');
  return data.result;
}

export function scopedKey(name) {
  const environment = process.env.VERCEL_ENV === 'preview' ? 'preview' : 'production';
  return 'ilbolttae:' + environment + ':' + name;
}
