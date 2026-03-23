import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { WardrobeCategory, WardrobeItemRecord } from '../types';

export const useWardrobe = () => {
  const [items, setItems] = useState<WardrobeItemRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);

  const normalize = (record: Partial<WardrobeItemRecord>): WardrobeItemRecord => ({
    id: record.id || '',
    user_id: record.user_id || '',
    image_url: record.image_url || '',
    category: (record.category || 'Tops') as WardrobeCategory,
    color: record.color || '',
    name: record.name || 'Untitled Item',
    tags: Array.isArray(record.tags) ? record.tags : [],
    created_at: record.created_at || new Date().toISOString()
  });

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems([]);
        setRequiresAuth(true);
        setError('Please sign in to access your wardrobe.');
        return;
      }

      setRequiresAuth(false);

      const { data, error } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data || []).map((row) => normalize(row as Partial<WardrobeItemRecord>)));
    } catch (error) {
      console.error('Error fetching wardrobe items:', error);
      setError('Unable to load wardrobe items. Please check your Supabase connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addClothing = useCallback(async (item: Omit<WardrobeItemRecord, 'id' | 'created_at' | 'user_id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRequiresAuth(true);
        throw new Error('Please sign in to manage wardrobe items.');
      }
      setRequiresAuth(false);

      let { data, error } = await supabase
        .from('wardrobe_items')
        .insert([{ ...item, user_id: user.id }])
        .select()
        .single();

      // Backward compatibility for databases that were created before the tags column existed.
      if (
        error &&
        error.code === 'PGRST204' &&
        typeof error.message === 'string' &&
        error.message.includes("'tags' column")
      ) {
        const fallbackInsert = await supabase
          .from('wardrobe_items')
          .insert([
            {
              image_url: item.image_url,
              category: item.category,
              color: item.color,
              name: item.name,
              user_id: user.id,
            },
          ])
          .select()
          .single();
        data = fallbackInsert.data;
        error = fallbackInsert.error;
      }

      if (error) throw error;
      const normalized = normalize(data as Partial<WardrobeItemRecord>);
      setItems((prev) => [normalized, ...prev]);
      return normalized;
    } catch (error) {
      console.error('Error adding wardrobe item:', error);
      setError('Unable to add this item to wardrobe.');
      throw error;
    }
  }, []);

  const removeClothing = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from('wardrobe_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error removing wardrobe item:', error);
      setError('Unable to remove this wardrobe item.');
      throw error;
    }
  }, []);

  const updateClothing = useCallback(async (id: string, updates: Partial<Pick<WardrobeItemRecord, 'name' | 'category' | 'color' | 'tags'>>) => {
    try {
      const { data, error } = await supabase
        .from('wardrobe_items')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      const normalized = normalize(data as Partial<WardrobeItemRecord>);
      setItems((prev) => prev.map((item) => item.id === id ? normalized : item));
      return normalized;
    } catch (error) {
      console.error('Error updating wardrobe item:', error);
      setError('Unable to update this wardrobe item.');
      throw error;
    }
  }, []);

  const getItemsByCategory = useCallback((category: WardrobeCategory | 'All') => {
    return category === 'All' ? items : items.filter((item) => item.category.toLowerCase() === category.toLowerCase());
  }, [items]);

  const searchItems = useCallback((query: string, sourceItems?: WardrobeItemRecord[]) => {
    const target = (sourceItems || items);
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return target;
    }

    return target.filter((item) => {
      const haystack = [
        item.name,
        item.category,
        item.color || '',
        ...(item.tags || [])
      ].join(' ').toLowerCase();

      return haystack.includes(normalized);
    });
  }, [items]);

  return {
    items,
    loading,
    error,
    requiresAuth,
    addClothing,
    removeClothing,
    updateClothing,
    getItemsByCategory,
    searchItems,
    refreshItems: fetchItems
  };
};
