import type { WardrobeItemRecord } from '../types';

// ─── Event Types ────────────────────────────────────────────────────────────
export type EventType =
  | 'College'
  | 'Office'
  | 'Party'
  | 'Gym'
  | 'Date'
  | 'Wedding'
  | 'Travel'
  | 'Casual'
  | 'Interview'
  | 'Festival';

// ─── Weather Conditions ──────────────────────────────────────────────────────
export type WeatherCondition = 'Hot' | 'Warm' | 'Cool' | 'Cold' | 'Rainy';

// ─── Time of Day ─────────────────────────────────────────────────────────────
export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

// ─── Style Tags ──────────────────────────────────────────────────────────────
export type StyleTag = 'Casual' | 'Formal' | 'Streetwear' | 'Sporty' | 'Party' | 'Traditional' | 'Smart Casual';

// ─── Style Compatibility Map ─────────────────────────────────────────────────
const STYLE_COMPAT: Record<StyleTag, StyleTag[]> = {
  Casual:       ['Casual', 'Streetwear', 'Smart Casual'],
  Formal:       ['Formal', 'Smart Casual'],
  Streetwear:   ['Streetwear', 'Casual', 'Sporty'],
  Sporty:       ['Sporty', 'Streetwear', 'Casual'],
  Party:        ['Party', 'Formal', 'Streetwear'],
  Traditional:  ['Traditional', 'Formal'],
  'Smart Casual': ['Smart Casual', 'Casual', 'Formal'],
};

// ─── Event → allowed style tags ──────────────────────────────────────────────
const EVENT_STYLES: Record<EventType, StyleTag[]> = {
  College:   ['Casual', 'Streetwear', 'Smart Casual'],
  Office:    ['Formal', 'Smart Casual'],
  Party:     ['Party', 'Streetwear', 'Formal'],
  Gym:       ['Sporty'],
  Date:      ['Smart Casual', 'Casual', 'Party'],
  Wedding:   ['Formal', 'Traditional', 'Smart Casual'],
  Travel:    ['Casual', 'Streetwear', 'Sporty'],
  Casual:    ['Casual', 'Streetwear', 'Sporty', 'Smart Casual'],
  Interview: ['Formal', 'Smart Casual'],
  Festival:  ['Streetwear', 'Casual', 'Party'],
};

// ─── Event → sub-category blocklist ──────────────────────────────────────────
const EVENT_BLOCKLIST: Record<EventType, string[]> = {
  Office:    ['Shorts', 'Joggers', 'Leggings', 'Sneakers', 'Crop Top', 'Tank Top', 'Hoodie'],
  Gym:       ['Jeans', 'Trousers', 'Heels', 'Blazer', 'Coat'],
  Interview: ['Shorts', 'Joggers', 'Leggings', 'Sneakers', 'Crop Top', 'Tank Top', 'Hoodie'],
  Wedding:   ['Shorts', 'Joggers', 'Leggings', 'Sneakers', 'Crop Top', 'Hoodie'],
  College:   [],
  Party:     ['Joggers'],
  Date:      ['Joggers', 'Gym Shorts'],
  Travel:    [],
  Casual:    [],
  Festival:  [],
};

// ─── Weather → blocklist ──────────────────────────────────────────────────────
const WEATHER_BLOCKLIST: Record<WeatherCondition, string[]> = {
  Hot:   ['Coat', 'Parka', 'Trench Coat', 'Hoodie', 'Cardigan'],
  Warm:  ['Coat', 'Parka'],
  Cool:  ['Sandals'],
  Cold:  ['Sandals', 'Shorts', 'Crop Top', 'Tank Top'],
  Rainy: ['Sneakers', 'Flats', 'Sandals'],
};

// ─── Weather → preferred outerwear ───────────────────────────────────────────
const WEATHER_OUTERWEAR: Record<WeatherCondition, boolean> = {
  Hot:   false,
  Warm:  false,
  Cool:  true,
  Cold:  true,
  Rainy: true,
};

// ─── Detect style tag from item metadata ─────────────────────────────────────
export function detectItemStyle(item: WardrobeItemRecord): StyleTag {
  const sub = (item.sub_category || '').toLowerCase();
  const tags = (item.tags || []).map(t => t.toLowerCase());
  const name = (item.name || '').toLowerCase();
  const combined = `${sub} ${tags.join(' ')} ${name}`;

  if (/blazer|trouser|suit|formal|dress\s*pant|oxford|derby/.test(combined)) return 'Formal';
  if (/jogger|gym|sport|athletic|running|legging|track/.test(combined)) return 'Sporty';
  if (/party|cocktail|evening\s*gown|sequin/.test(combined)) return 'Party';
  if (/kurta|saree|ethnic|traditional/.test(combined)) return 'Traditional';
  if (/streetwear|hoodie|cargo|sneaker|oversized/.test(combined)) return 'Streetwear';
  if (/chino|polo|smart|button.?down/.test(combined)) return 'Smart Casual';
  return 'Casual';
}

// ─── Filter items for a given context ────────────────────────────────────────
export function filterItemsForContext(
  items: WardrobeItemRecord[],
  event: EventType,
  weather: WeatherCondition,
): WardrobeItemRecord[] {
  const eventBlock = EVENT_BLOCKLIST[event] ?? [];
  const weatherBlock = WEATHER_BLOCKLIST[weather] ?? [];
  const allBlock = new Set([...eventBlock, ...weatherBlock]);

  return items.filter(item => {
    const sub = item.sub_category || '';
    return !allBlock.has(sub);
  });
}

// ─── Score event/weather/time bonus ──────────────────────────────────────────
export function contextBonus(
  items: WardrobeItemRecord[],
  event: EventType,
  weather: WeatherCondition,
  time: TimeOfDay,
): number {
  let bonus = 0;
  const allowedStyles = EVENT_STYLES[event] ?? [];
  const needsOuterwear = WEATHER_OUTERWEAR[weather];
  const hasOuterwear = items.some(i => i.category === 'Outerwear');

  // Style match bonus
  const styleMatches = items.filter(i => allowedStyles.includes(detectItemStyle(i)));
  bonus += Math.round((styleMatches.length / items.length) * 8);

  // Weather outerwear bonus
  if (needsOuterwear && hasOuterwear) bonus += 4;
  if (!needsOuterwear && hasOuterwear) bonus -= 3;

  // Time bonus — evening/night gets bonus for stylish pieces
  const hasPartyOrFormal = items.some(i => {
    const s = detectItemStyle(i);
    return s === 'Party' || s === 'Formal';
  });
  if ((time === 'Evening' || time === 'Night') && hasPartyOrFormal) bonus += 3;
  if ((time === 'Morning' || time === 'Afternoon') && !hasPartyOrFormal) bonus += 2;

  return bonus;
}

// ─── Check style compatibility across all items ───────────────────────────────
export function isStyleCompatible(items: WardrobeItemRecord[]): boolean {
  const styles = items.map(detectItemStyle);

  // Check every pair
  for (let i = 0; i < styles.length; i++) {
    for (let j = i + 1; j < styles.length; j++) {
      const a = styles[i];
      const b = styles[j];
      if (!STYLE_COMPAT[a]?.includes(b) && !STYLE_COMPAT[b]?.includes(a)) {
        return false;
      }
    }
  }
  return true;
}

// ─── Current time of day ──────────────────────────────────────────────────────
export function getCurrentTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 21) return 'Evening';
  return 'Night';
}

// ─── Weather from temperature (°C) ───────────────────────────────────────────
export function weatherFromTemp(celsius: number, rain: boolean): WeatherCondition {
  if (rain) return 'Rainy';
  if (celsius >= 30) return 'Hot';
  if (celsius >= 22) return 'Warm';
  if (celsius >= 14) return 'Cool';
  return 'Cold';
}

// ─── Open-Meteo weather fetch (free, no API key) ─────────────────────────────
export interface WeatherData {
  condition: WeatherCondition;
  tempC: number;
  label: string;
  icon: string;
}

export async function fetchWeather(lat: number, lon: number): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Weather fetch failed');
  const data = await res.json();
  const tempC = Math.round(data.current_weather?.temperature ?? 25);
  const wmoCode = data.current_weather?.weathercode ?? 0;
  const rain = wmoCode >= 51; // WMO codes 51+ = precipitation
  const condition = weatherFromTemp(tempC, rain);

  const icons: Record<WeatherCondition, string> = {
    Hot: '☀️', Warm: '🌤️', Cool: '🌥️', Cold: '❄️', Rainy: '🌧️',
  };

  return {
    condition,
    tempC,
    label: `${condition} · ${tempC}°C`,
    icon: icons[condition],
  };
}
