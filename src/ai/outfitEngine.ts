import type { WardrobeItemRecord } from '../types';
import { buildOutfitCombinations } from '../lib/outfitUtils';

export const generateOutfit = async (items: WardrobeItemRecord[]) => {
  return buildOutfitCombinations(items).map((combo) => ({
    id: `combo-${combo.itemIds.join('-')}`,
    name: combo.name,
    score: combo.score,
    img: combo.imageUrl
  }));
};
