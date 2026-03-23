import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { OutfitRecord, WardrobeItemRecord } from '../types';
import { buildOutfitCombinations } from '../lib/outfitUtils';

export interface FavoriteOutfit {
  id: string;
  user_id: string;
  outfit_id: string;
  created_at: string;
}

export const useOutfitAI = () => {
  const [generatedLooks, setGeneratedLooks] = useState<OutfitRecord[]>([]);
  const [favorites, setFavorites] = useState<FavoriteOutfit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchOutfits = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('outfits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGeneratedLooks((data || []) as OutfitRecord[]);

      const { data: favData, error: favError } = await supabase
        .from('favorite_outfits')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (favError) throw favError;
      setFavorites((favData || []) as FavoriteOutfit[]);
    } catch (error) {
      console.error('Error fetching outfits:', error);
    }
  }, []);

  const saveOutfit = useCallback(async (outfit: Omit<OutfitRecord, 'id' | 'created_at' | 'user_id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('outfits')
        .insert([{ ...outfit, user_id: user.id }])
        .select()
        .single();

      if (error) throw error;
      const typed = data as OutfitRecord;
      setGeneratedLooks((prev) => [typed, ...prev]);
      return typed;
    } catch (error) {
      console.error('Error saving outfit:', error);
      throw error;
    }
  }, []);

  const saveFavorite = useCallback(async (outfitId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const existing = favorites.find((favorite) => favorite.outfit_id === outfitId);
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from('favorite_outfits')
      .insert([{ user_id: user.id, outfit_id: outfitId }])
      .select()
      .single();

    if (error) throw error;
    const typed = data as FavoriteOutfit;
    setFavorites((prev) => [typed, ...prev]);
    return typed;
  }, [favorites]);

  const generateNewLook = useCallback(async (wardrobeItems: WardrobeItemRecord[]) => {
    setIsLoading(true);
    try {
      if (wardrobeItems.length < 2) {
        throw new Error('Add more items to your wardrobe first.');
      }

      const combos = buildOutfitCombinations(wardrobeItems);
      if (!combos.length) {
        throw new Error('Not enough category variety. Add shoes, tops, bottoms, or dresses.');
      }

      const bestCombo = combos[0];
      await saveOutfit({
        name: bestCombo.name,
        items: bestCombo.itemIds,
        combo_type: bestCombo.comboType as string,
        image_url: bestCombo.imageUrl,
        score: bestCombo.score
      });
    } catch (error) {
      console.error('Error generating look:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [saveOutfit]);

  return {
    generatedLooks,
    favorites,
    isLoading,
    generateNewLook,
    saveFavorite,
    fetchOutfits
  };
};
