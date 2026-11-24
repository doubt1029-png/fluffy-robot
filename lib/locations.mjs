export function locationInput(input) {
  if (!input || typeof input.name !== 'string' || typeof input.address !== 'string') return null;
  const name = input.name.trim();
  const address = input.address.trim();
  const { lat, lng } = input;
  if (!name || name.length > 80 || address.length > 160 ||
      !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < 32.9 || lat > 38.7 || lng < 124.5 || lng > 132) return null;
  return { name, address, area: address, lat, lng,
    entry: 'unknown', code: 'unknown', type: 'unknown', public: 'unknown' };
}
