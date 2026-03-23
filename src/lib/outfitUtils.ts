import type { WardrobeItemRecord } from '../types';
import {
  type EventType,
  type WeatherCondition,
  type TimeOfDay,
  filterItemsForContext,
  contextBonus,
  isStyleCompatible,
} from './outfitFilters';

export interface GeneratedCombo {
  name: string;
  comboType: string;
  itemIds: string[];
  imageUrl: string;
  score: number;
  items?: WardrobeItemRecord[];
  event?: string;
  weather?: string;
}

const NEUTRALS = new Set([
  'black', 'white', 'grey', 'gray', 'beige', 'nude',
  'cream', 'navy', 'tan', 'brown', 'charcoal', 'silver', 'khaki',
]);

function scoreColorHarmony(colors: string[]): number {
  const filtered = colors.map(c => (c || '').toLowerCase().trim()).filter(Boolean);
  const unique = new Set(filtered);
  const neutralCount = filtered.filter(c => NEUTRALS.has(c)).length;
  const nonNeutralCount = filtered.length - neutralCount;
  if (nonNeutralCount === 0) return 96;
  if (nonNeutralCount === 1) return 93;
  if (unique.size === 2)     return 88;
  if (unique.size === 3)     return 82;
  return 74;
}

function bestShoe(shoes: WardrobeItemRecord[], ...itemColors: (string | null)[]): WardrobeItemRecord | null {
  if (!shoes.length) return null;
  return shoes.reduce((best, shoe) => {
    const s1 = scoreColorHarmony([...itemColors.map(c => c ?? ''), shoe.color ?? '']);
    const s2 = scoreColorHarmony([...itemColors.map(c => c ?? ''), best.color ?? '']);
    return s1 >= s2 ? shoe : best;
  });
}

function bestAccessory(accessories: WardrobeItemRecord[], ...itemColors: (string | null)[]): WardrobeItemRecord | null {
  if (!accessories.length) return null;
  return accessories.reduce((best, acc) => {
    const s1 = scoreColorHarmony([...itemColors.map(c => c ?? ''), acc.color ?? '']);
    const s2 = scoreColorHarmony([...itemColors.map(c => c ?? ''), best.color ?? '']);
    return s1 >= s2 ? acc : best;
  });
}

const EVENT_NAME_WORDS: Record<string, string[]> = {
  Office:    ['Power', 'Sharp', 'Executive', 'Clean', 'Boardroom'],
  Party:     ['Night Out', 'Statement', 'After Dark', 'Glam', 'Bold'],
  Gym:       ['Active', 'Sport', 'Training', 'Performance', 'Athletic'],
  Date:      ['Charm', 'Evening', 'Romantic', 'Effortless', 'Sleek'],
  Wedding:   ['Elegant', 'Refined', 'Graceful', 'Classic', 'Polished'],
  College:   ['Campus', 'Streetwise', 'Relaxed', 'Fresh', 'Everyday'],
  Interview: ['Sharp', 'Professional', 'Confident', 'Crisp', 'Polished'],
  Festival:  ['Vibe', 'Expression', 'Bold', 'Free Spirit', 'Creative'],
  Travel:    ['Wanderer', 'Comfort', 'Explorer', 'Easy', 'On-the-Go'],
  Casual:    ['Laid-Back', 'Easy', 'Weekend', 'Minimal', 'Everyday'],
};

const COMBO_SUFFIX: Record<string, string[]> = {
  'Top + Bottom + Shoes':                         ['Look', 'Fit', 'Edit'],
  'Top + Bottom + Shoes + Accessory':             ['Look', 'Styled Edit', 'Full Fit'],
  'Dress + Shoes':                                ['Moment', 'Edit', 'Look'],
  'Dress + Shoes + Accessory':                    ['Statement', 'Full Look', 'Edit'],
  'Top + Bottom + Outerwear + Shoes':             ['Layer', 'Outfit', 'Edit'],
  'Top + Bottom + Outerwear + Shoes + Accessory': ['Look', 'Full Layer', 'Styled Fit'],
};

function outfitName(comboType: string, primaryColor: string | null, event: string = 'Casual'): string {
  const eventWords = EVENT_NAME_WORDS[event] ?? EVENT_NAME_WORDS['Casual'];
  const suffixes   = COMBO_SUFFIX[comboType] ?? ['Look'];
  const word   = eventWords[Math.floor(Math.random() * eventWords.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const color  = primaryColor
    ? `${primaryColor.charAt(0).toUpperCase()}${primaryColor.slice(1)} `
    : '';
  return `${color}${word} ${suffix}`;
}

export function buildOutfitCombinations(
  rawItems: WardrobeItemRecord[],
  options?: {
    event?: EventType;
    weather?: WeatherCondition;
    time?: TimeOfDay;
    pageIndex?: number;
    countOnly?: boolean;
    seed?: number;
  }
): GeneratedCombo[] {
  const event     = options?.event     ?? 'Casual';
  const weather   = options?.weather   ?? 'Warm';
  const time      = options?.time      ?? 'Afternoon';
  const pageIndex = options?.pageIndex ?? 0;
  const countOnly = options?.countOnly ?? false;
  const seed      = options?.seed      ?? 0;
  const PAGE_SIZE = 20;
  const MAX_APPEARANCES = 4;

  const items = filterItemsForContext(rawItems, event, weather);
  const tops        = items.filter(i => i.category === 'Tops');
  const bottoms     = items.filter(i => i.category === 'Bottoms');
  const dresses     = items.filter(i => i.category === 'Dresses');
  const outerwear   = items.filter(i => i.category === 'Outerwear');
  const shoes       = items.filter(i => i.category === 'Shoes');
  const accessories = items.filter(i => i.category === 'Accessories');

  const generated: GeneratedCombo[] = [];

  const makeCombo = (
    comboItems: WardrobeItemRecord[],
    comboType: string,
    heroItem: WardrobeItemRecord,
  ): GeneratedCombo | null => {
    if (!isStyleCompatible(comboItems)) return null;
    const colors = comboItems.map(i => i.color ?? '');
    const colorScore = scoreColorHarmony(colors);
    const ctx = contextBonus(comboItems, event, weather, time);
    const score = Math.min(100, colorScore + ctx);
    return {
      name: outfitName(comboType, heroItem.color, event),
      comboType,
      itemIds: comboItems.map(i => i.id),
      imageUrl: heroItem.image_url,
      score,
      items: comboItems,
      event,
      weather,
    };
  };

  // 1. Top + Bottom + Shoes (+Accessory)
  for (const top of tops) {
    for (const bottom of bottoms) {
      const shoe = bestShoe(shoes, top.color, bottom.color);
      const baseItems = shoe ? [top, bottom, shoe] : [top, bottom];
      const combo = makeCombo(baseItems, 'Top + Bottom + Shoes', top);
      if (combo) generated.push(combo);

      const acc = bestAccessory(accessories, top.color, bottom.color, shoe?.color);
      if (acc) {
        const withAcc = makeCombo([...baseItems, acc], 'Top + Bottom + Shoes + Accessory', top);
        if (withAcc) generated.push(withAcc);
      }
    }
  }

  // 2. Dress + Shoes (+Accessory) — one card per dress
  for (const dress of dresses) {
    const shoe = bestShoe(shoes, dress.color);
    const baseItems = shoe ? [dress, shoe] : [dress];
    const combo = makeCombo(baseItems, 'Dress + Shoes', dress);
    if (combo) generated.push(combo);

    const acc = bestAccessory(accessories, dress.color, shoe?.color);
    if (acc) {
      const withAcc = makeCombo([...baseItems, acc], 'Dress + Shoes + Accessory', dress);
      if (withAcc) generated.push(withAcc);
    }
  }

  // 3. Top + Bottom + Outerwear + Shoes (+Accessory)
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const jacket of outerwear) {
        const shoe = bestShoe(shoes, top.color, bottom.color, jacket.color);
        const baseItems = shoe ? [top, bottom, jacket, shoe] : [top, bottom, jacket];
        const combo = makeCombo(baseItems, 'Top + Bottom + Outerwear + Shoes', jacket);
        if (combo) generated.push(combo);

        const acc = bestAccessory(accessories, top.color, bottom.color, jacket.color, shoe?.color);
        if (acc) {
          const withAcc = makeCombo([...baseItems, acc], 'Top + Bottom + Outerwear + Shoes + Accessory', jacket);
          if (withAcc) generated.push(withAcc);
        }
      }
    }
  }

  // Seeded pseudo-random shuffle — same seed = same order, new seed = fresh order.
  // We still bias toward high-score combos by splitting into score tiers first,
  // then shuffling within each tier so top-quality outfits stay prominent.
  const seededRng = (n: number) => {
    let s = (seed * 2654435761 + n * 40503) >>> 0;
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    return (s ^ (s >>> 16)) / 0x100000000;
  };

  const shuffleWithSeed = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(seededRng(i) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Split into score tiers: excellent (≥90), good (75-89), rest
  const excellent = generated.filter(c => c.score >= 90);
  const good      = generated.filter(c => c.score >= 75 && c.score < 90);
  const rest      = generated.filter(c => c.score < 75);

  // Shuffle within each tier so each regenerate surfaces different combos,
  // but excellent outfits always come before good ones etc.
  const shuffled = [
    ...shuffleWithSeed(excellent),
    ...shuffleWithSeed(good),
    ...shuffleWithSeed(rest),
  ];

  const validCombos = shuffled.filter(
    (combo): combo is GeneratedCombo => Array.isArray(combo?.itemIds) && combo.itemIds.length > 0,
  );

  // Diversity limit: max MAX_APPEARANCES per hero item
  const appearanceCount: Record<string, number> = {};
  const diverse = validCombos.filter(combo => {
    const heroId = combo.itemIds[0];
    const count = appearanceCount[heroId] ?? 0;
    if (count >= MAX_APPEARANCES) return false;
    appearanceCount[heroId] = count + 1;
    return true;
  });

  // Dedup: no same Top+Bottom+Shoes core, accessories are minor
  const seenCores = new Set<string>();
  const deduped = diverse.filter(combo => {
    const core = combo.itemIds.slice(0, 3).join('|');
    if (seenCores.has(core)) return false;
    seenCores.add(core);
    return true;
  });

  if (countOnly) return deduped;

  const start = pageIndex * PAGE_SIZE;
  return deduped.slice(start, start + PAGE_SIZE);
}

export function countTotalPages(
  rawItems: WardrobeItemRecord[],
  options?: { event?: EventType; weather?: WeatherCondition; time?: TimeOfDay; seed?: number }
): number {
  const allCombos = buildOutfitCombinations(rawItems, {
    event:     options?.event,
    weather:   options?.weather,
    time:      options?.time,
    seed:      options?.seed ?? 0,
    pageIndex: 0,
    countOnly: true,
  });
  return Math.max(1, Math.ceil(allCombos.length / 20));
}
