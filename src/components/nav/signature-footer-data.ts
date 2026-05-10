// Pure helpers for <SignatureFooter>. Extracted for testability per
// repo convention (vitest configured with environment: 'node', no DOM).

export type Coords = {
  readonly lat: number;
  readonly lon: number;
  readonly city: string;
};

// Boston fallback per locked R.1 decision (2026-05-09): coords source
// upgraded from R.6 deferral to R.1 inclusion; lookup resolves to a
// curated IANA zone table client-side, falling back here when the zone
// isn't in the table or Intl.DateTimeFormat throws.
export const FALLBACK_COORDS: Coords = {
  lat: 42.3601,
  lon: -71.0589,
  city: 'Boston',
};

// Curated IANA timezone → city-center coords. Covers the major metros
// across all populated continents. Easy to grow — single source of
// truth. Coords are city-center approximations, NOT GPS — fidelity is
// intentionally low (~kilometer-scale) since this surfaces in a
// decorative footer cluster, not for any operational purpose.
const IANA_COORDS: Readonly<Record<string, Coords>> = {
  // Americas
  'America/New_York': { lat: 40.7128, lon: -74.006, city: 'New York' },
  'America/Detroit': { lat: 42.3314, lon: -83.0458, city: 'Detroit' },
  'America/Chicago': { lat: 41.8781, lon: -87.6298, city: 'Chicago' },
  'America/Denver': { lat: 39.7392, lon: -104.9903, city: 'Denver' },
  'America/Los_Angeles': { lat: 34.0522, lon: -118.2437, city: 'Los Angeles' },
  'America/Phoenix': { lat: 33.4484, lon: -112.074, city: 'Phoenix' },
  'America/Anchorage': { lat: 61.2181, lon: -149.9003, city: 'Anchorage' },
  'America/Honolulu': { lat: 21.3099, lon: -157.8581, city: 'Honolulu' },
  'America/Toronto': { lat: 43.6532, lon: -79.3832, city: 'Toronto' },
  'America/Vancouver': { lat: 49.2827, lon: -123.1207, city: 'Vancouver' },
  'America/Montreal': { lat: 45.5017, lon: -73.5673, city: 'Montreal' },
  'America/Mexico_City': { lat: 19.4326, lon: -99.1332, city: 'Mexico City' },
  'America/Sao_Paulo': { lat: -23.5505, lon: -46.6333, city: 'Sao Paulo' },
  'America/Argentina/Buenos_Aires': { lat: -34.6118, lon: -58.396, city: 'Buenos Aires' },
  // Europe
  'Europe/London': { lat: 51.5074, lon: -0.1278, city: 'London' },
  'Europe/Dublin': { lat: 53.3498, lon: -6.2603, city: 'Dublin' },
  'Europe/Paris': { lat: 48.8566, lon: 2.3522, city: 'Paris' },
  'Europe/Berlin': { lat: 52.52, lon: 13.405, city: 'Berlin' },
  'Europe/Madrid': { lat: 40.4168, lon: -3.7038, city: 'Madrid' },
  'Europe/Lisbon': { lat: 38.7223, lon: -9.1393, city: 'Lisbon' },
  'Europe/Rome': { lat: 41.9028, lon: 12.4964, city: 'Rome' },
  'Europe/Amsterdam': { lat: 52.3676, lon: 4.9041, city: 'Amsterdam' },
  'Europe/Brussels': { lat: 50.8503, lon: 4.3517, city: 'Brussels' },
  'Europe/Vienna': { lat: 48.2082, lon: 16.3738, city: 'Vienna' },
  'Europe/Zurich': { lat: 47.3769, lon: 8.5417, city: 'Zurich' },
  'Europe/Stockholm': { lat: 59.3293, lon: 18.0686, city: 'Stockholm' },
  'Europe/Copenhagen': { lat: 55.6761, lon: 12.5683, city: 'Copenhagen' },
  'Europe/Oslo': { lat: 59.9139, lon: 10.7522, city: 'Oslo' },
  'Europe/Helsinki': { lat: 60.1699, lon: 24.9384, city: 'Helsinki' },
  'Europe/Athens': { lat: 37.9838, lon: 23.7275, city: 'Athens' },
  'Europe/Warsaw': { lat: 52.2297, lon: 21.0122, city: 'Warsaw' },
  'Europe/Prague': { lat: 50.0755, lon: 14.4378, city: 'Prague' },
  'Europe/Budapest': { lat: 47.4979, lon: 19.0402, city: 'Budapest' },
  'Europe/Istanbul': { lat: 41.0082, lon: 28.9784, city: 'Istanbul' },
  // Asia / Oceania
  'Asia/Tokyo': { lat: 35.6762, lon: 139.6503, city: 'Tokyo' },
  'Asia/Shanghai': { lat: 31.2304, lon: 121.4737, city: 'Shanghai' },
  'Asia/Hong_Kong': { lat: 22.3193, lon: 114.1694, city: 'Hong Kong' },
  'Asia/Taipei': { lat: 25.033, lon: 121.5654, city: 'Taipei' },
  'Asia/Singapore': { lat: 1.3521, lon: 103.8198, city: 'Singapore' },
  'Asia/Bangkok': { lat: 13.7563, lon: 100.5018, city: 'Bangkok' },
  'Asia/Seoul': { lat: 37.5665, lon: 126.978, city: 'Seoul' },
  'Asia/Manila': { lat: 14.5995, lon: 120.9842, city: 'Manila' },
  'Asia/Jakarta': { lat: -6.2088, lon: 106.8456, city: 'Jakarta' },
  'Asia/Kolkata': { lat: 22.5726, lon: 88.3639, city: 'Kolkata' },
  'Asia/Dubai': { lat: 25.2048, lon: 55.2708, city: 'Dubai' },
  'Australia/Sydney': { lat: -33.8688, lon: 151.2093, city: 'Sydney' },
  'Australia/Melbourne': { lat: -37.8136, lon: 144.9631, city: 'Melbourne' },
  'Australia/Perth': { lat: -31.9505, lon: 115.8605, city: 'Perth' },
  'Pacific/Auckland': { lat: -36.8485, lon: 174.7633, city: 'Auckland' },
  // Africa
  'Africa/Cairo': { lat: 30.0444, lon: 31.2357, city: 'Cairo' },
  'Africa/Lagos': { lat: 6.5244, lon: 3.3792, city: 'Lagos' },
  'Africa/Johannesburg': { lat: -26.2041, lon: 28.0473, city: 'Johannesburg' },
};

export function resolveCoordsForZone(zone: string): Coords {
  return IANA_COORDS[zone] ?? FALLBACK_COORDS;
}

// Format coords in the bundle prototype's exact style:
//   42.3601° N · 71.0589° W
// Four decimal places (~11m precision at the equator), bullet separator.
export function formatCoords(coords: Coords): string {
  const lat = `${Math.abs(coords.lat).toFixed(4)}° ${coords.lat >= 0 ? 'N' : 'S'}`;
  const lon = `${Math.abs(coords.lon).toFixed(4)}° ${coords.lon >= 0 ? 'E' : 'W'}`;
  return `${lat} · ${lon}`;
}

// Format the supplied time as `HH:MM TZ` in the runtime's local
// timezone (e.g., `21:34 EDT`). Hour and minute zero-padded to two
// digits. If Intl can't resolve a timezone short-name, the zone
// segment is dropped and only `HH:MM` is returned — degrades gracefully.
export function formatTimeWithZone(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  let zone = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZoneName: 'short',
      hour: 'numeric',
    }).formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (tzPart) zone = tzPart.value;
  } catch {
    // Intl unavailable or threw — return time without zone label.
  }
  return zone ? `${hh}:${mm} ${zone}` : `${hh}:${mm}`;
}

// Resolve the runtime's IANA zone, or empty string if Intl throws.
// Pulled out for explicit fallback handling in the component.
export function getRuntimeTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}
