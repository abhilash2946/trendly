import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ICONS } from '../types';
import { useWardrobe } from '../hooks/useWardrobe';
import { buildOutfitCombinations, countTotalPages, type GeneratedCombo } from '../lib/outfitUtils';
import { OutfitCard } from '../components/cards/OutfitCard';
import { Button3D } from '../components/ui/Button3D';
import { supabase } from '../lib/supabaseClient';
import { setAssistantRecommendation } from '../lib/trendlySession';
import {
  type EventType,
  type WeatherCondition,
  type TimeOfDay,
  getCurrentTimeOfDay,
  fetchWeather,
  type WeatherData,
} from '../lib/outfitFilters';
import { getCurrentCoordinates } from '../lib/location';
import type { WardrobeItemRecord } from '../types';

const EVENTS: EventType[] = ['Casual', 'College', 'Office', 'Party', 'Gym', 'Date', 'Wedding', 'Travel', 'Interview', 'Festival'];
const WEATHERS: WeatherCondition[] = ['Hot', 'Warm', 'Cool', 'Cold', 'Rainy'];
const TIMES: TimeOfDay[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

const EVENT_ICONS: Record<EventType, string> = {
  Casual: '👕', College: '🎓', Office: '💼', Party: '🎉', Gym: '🏋️',
  Date: '💑', Wedding: '💍', Travel: '✈️', Interview: '🤝', Festival: '🎪',
};
const WEATHER_ICONS: Record<WeatherCondition, string> = {
  Hot: '☀️', Warm: '🌤️', Cool: '🌥️', Cold: '❄️', Rainy: '🌧️',
};
const TIME_ICONS: Record<TimeOfDay, string> = {
  Morning: '🌅', Afternoon: '🌞', Evening: '🌆', Night: '🌙',
};

function OutfitDetailModal({
  combo, onClose, onSave, onARMirror, isSaved,
}: {
  combo: GeneratedCombo;
  onClose: () => void;
  onSave: () => void;
  onARMirror: () => void;
  isSaved: boolean;
}) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loadingExpl, setLoadingExpl] = useState(false);

  const generateExplanation = useCallback(async () => {
    if (explanation || loadingExpl) return;
    setLoadingExpl(true);
    try {
      const itemsList = (combo.items || [])
        .map(i => `${i.color || ''} ${i.sub_category || i.category} (${i.name})`)
        .join(', ');
      const res = await fetch('http://localhost:5000/outfit-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comboName: combo.name,
          comboType: combo.comboType,
          itemsList,
          event: combo.event ?? 'Casual',
          weather: combo.weather ?? 'Warm',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setExplanation(data.explanation?.trim() || null);
      } else {
        throw new Error('Local AI server error');
      }
    } catch {
      // Pure heuristic fallback — works with zero servers running
      const typeNote = combo.comboType.includes('Accessory')
        ? 'The accessory ties the whole look together.'
        : combo.comboType.includes('Outerwear')
        ? 'The outerwear layer elevates the outfit.'
        : '';
      setExplanation(`This ${combo.name} pairs complementary colors and textures for a balanced, polished look. ${typeNote}`.trim());
    } finally {
      setLoadingExpl(false);
    }
  }, [combo, explanation, loadingExpl]);

  useEffect(() => { generateExplanation(); }, [generateExplanation]);

  // Sub-categories that are accessories regardless of stored category
  const ACCESSORY_SUBS = new Set([
    'Necklace', 'Ring', 'Bracelet', 'Earrings', 'Watch', 'Belt',
    'Hat', 'Scarf', 'Sunglasses', 'Bag', 'Jewel', 'Jewelry',
  ]);

  const getItemDisplay = (item: WardrobeItemRecord): { icon: string; label: string } => {
    const sub = item.sub_category ?? '';
    // Override category display if sub_category reveals it's an accessory
    if (ACCESSORY_SUBS.has(sub) || item.category === 'Accessories') {
      const accIcons: Record<string, string> = {
        Necklace: '📿', Ring: '💍', Bracelet: '📿', Earrings: '💎',
        Watch: '⌚', Belt: '🪢', Hat: '🧢', Scarf: '🧣',
        Sunglasses: '🕶️', Bag: '👜',
      };
      return { icon: accIcons[sub] ?? '💍', label: 'Accessories' };
    }
    const icons: Record<string, string> = {
      Tops: '👕', Bottoms: '👖', Dresses: '👗', Outerwear: '🧥', Shoes: '👟',
    };
    return { icon: icons[item.category] ?? '👔', label: item.category };
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-morphism rounded-[32px] border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto p-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tighter">{combo.name}</h2>
            <p className="text-sm text-primary font-bold uppercase tracking-widest mt-1">{combo.comboType}</p>
          </div>
          <button onClick={onClose} className="size-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <ICONS.X size={18} />
          </button>
        </div>

        <div className="inline-flex items-center gap-2 glass px-4 py-2 rounded-xl border-primary/20 mb-6">
          <ICONS.Sparkles className="text-primary size-4" />
          <span className="text-sm font-black text-primary">Match Score {combo.score}%</span>
        </div>

        <div className="glass rounded-2xl p-5 border-white/5 mb-6">
          <p className="text-[10px] font-black uppercase tracking-widest text-secondary mb-2">✨ Stylist Note</p>
          {loadingExpl ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Analyzing outfit...
            </div>
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed">{explanation ?? '—'}</p>
          )}
        </div>

        <div className="space-y-3 mb-8">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Outfit Pieces</p>
          {(combo.items || []).map((item: WardrobeItemRecord) => (
            <div key={item.id} className="flex items-center gap-4 glass rounded-2xl p-4 border-white/5">
              <div className="size-14 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">{getItemDisplay(item).icon}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{getItemDisplay(item).label}</span>
                </div>
                <p className="text-sm font-bold text-white truncate">{item.name}</p>
                {item.color && (
                  <p className="text-xs text-slate-400 capitalize mt-0.5">{item.color}{item.sub_category ? ` · ${item.sub_category}` : ''}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button3D onClick={onSave} variant={isSaved ? 'glass' : 'primary'} className="text-xs py-3">
            <ICONS.Heart size={16} className={isSaved ? 'text-rose-500' : ''} />
            {isSaved ? 'Saved ✓' : 'Save Outfit'}
          </Button3D>
          <Button3D onClick={onARMirror} variant="secondary" className="text-xs py-3">
            <ICONS.Scan size={16} />
            Try in AR
          </Button3D>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FilterPill<T extends string>({
  label, value, options, icons, onChange,
}: {
  label: string;
  value: T;
  options: T[];
  icons: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative ${open ? 'z-[120]' : 'z-20'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 glass rounded-xl px-4 py-2.5 text-sm font-bold text-slate-100 border-white/15 hover:border-primary/40 hover:bg-white/[0.06] transition-all"
      >
        <span>{icons[value]}</span>
        <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.22)]">{value}</span>
        <ICONS.ChevronRight size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute top-full mt-2 left-0 z-[130] rounded-2xl border border-primary/35 bg-[#0e0a18]/95 backdrop-blur-2xl p-2 min-w-[170px] shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
          >
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300/80 px-3 py-1">{label}</p>
            {options.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-colors border ${opt === value ? 'bg-primary/35 text-white border-primary/70 shadow-[0_0_0_1px_rgba(188,22,254,0.4)_inset]' : 'text-slate-100 border-transparent hover:bg-white/10 hover:text-white'}`}
              >
                <span>{icons[opt]}</span>
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function OutfitGenerator() {
  const navigate = useNavigate();
  const { items, loading: wardrobeLoading } = useWardrobe();

  const [event, setEvent] = useState<EventType>('Casual');
  const [weather, setWeather] = useState<WeatherCondition>('Warm');
  const [time, setTime] = useState<TimeOfDay>(getCurrentTimeOfDay());
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const [combos, setCombos] = useState<GeneratedCombo[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [selectedCombo, setSelectedCombo] = useState<GeneratedCombo | null>(null);

  useEffect(() => {
    (async () => {
      setWeatherLoading(true);
      try {
        const coords = await getCurrentCoordinates();
        const wd = await fetchWeather(coords.latitude, coords.longitude);
        setWeatherData(wd);
        setWeather(wd.condition);
      } catch { /* use default */ }
      finally { setWeatherLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!wardrobeLoading && items.length > 0) {
      setCombos(buildOutfitCombinations(items, { event, weather, time, pageIndex }));
      setTotalPages(countTotalPages(items, { event, weather, time }));
    } else if (!wardrobeLoading) {
      setCombos([]);
    }
  }, [items, wardrobeLoading, event, weather, time, pageIndex]);

  useEffect(() => { setPageIndex(0); }, [event, weather, time]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('favorite_outfits').select('outfits(items)').eq('user_id', user.id);
      const keys = (data || []).reduce((acc: Set<string>, row: any) => {
        const oi = row.outfits?.items;
        if (Array.isArray(oi) && oi.length > 0) acc.add(oi.join('-'));
        return acc;
      }, new Set<string>());
      setSavedKeys(keys);
    })();
  }, []);

  const saveFavorite = async (combo: GeneratedCombo) => {
    const key = combo.itemIds.join('-');
    if (savedKeys.has(key) || savingKey) return;
    setSavingKey(key);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: outfit, error } = await supabase
        .from('outfits')
        .insert([{ user_id: user.id, name: combo.name, items: combo.itemIds, combo_type: combo.comboType, image_url: combo.imageUrl, score: combo.score }])
        .select().single();
      if (error) throw error;
      await supabase.from('favorite_outfits').insert([{ user_id: user.id, outfit_id: outfit.id }]);
      setSavedKeys(prev => new Set([...prev, key]));
    } catch (err) { console.error(err); }
    finally { setSavingKey(null); }
  };

  const sendToARMirror = (combo: GeneratedCombo) => {
    const description = `${combo.name} — ${combo.comboType}`;
    setAssistantRecommendation({ query: description, summary: description, source: 'outfit-generator', created_at: new Date().toISOString(), imageUrl: combo.imageUrl, wardrobeItemIds: combo.itemIds });
    navigate(`/ar-mirror?suggestion=${encodeURIComponent(description)}&items=${encodeURIComponent(combo.itemIds.join(','))}`);
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Outfit Generator</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide mt-1">
            {combos.length > 0
              ? <>Batch {pageIndex + 1} / {totalPages} · <span className="text-primary">{combos.length} looks</span></>
              : 'Add wardrobe items to generate outfits'
            }
          </p>
        </div>
        <Button3D onClick={() => setPageIndex(p => (p + 1) % Math.max(1, totalPages))} disabled={wardrobeLoading || items.length === 0} className="px-8 py-4 text-sm flex-shrink-0">
          {wardrobeLoading ? <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ICONS.Brain size={20} />}
          {pageIndex > 0 ? `Next Batch` : 'Regenerate'}
        </Button3D>
      </div>

      {/* Context Bar */}
      <div className="relative z-30 overflow-visible glass rounded-2xl border-white/5 p-4">
        <div className="relative z-30 overflow-visible flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mr-2">
            {weatherLoading
              ? <div className="size-3 border border-primary border-t-transparent rounded-full animate-spin" />
              : <ICONS.MapPin size={12} className="text-primary" />
            }
            <span className="uppercase tracking-widest">{weatherLoading ? 'Detecting…' : (weatherData?.label ?? 'Weather')}</span>
          </div>
          <FilterPill label="Event" value={event} options={EVENTS} icons={EVENT_ICONS} onChange={setEvent} />
          <FilterPill label="Weather" value={weather} options={WEATHERS} icons={WEATHER_ICONS} onChange={setWeather} />
          <FilterPill label="Time" value={time} options={TIMES} icons={TIME_ICONS} onChange={setTime} />
        </div>
      </div>

      {/* Grid */}
      {wardrobeLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
        </div>
      ) : combos.length === 0 ? (
        <div className="text-center py-20 glass-morphism rounded-[40px] border-white/5">
          <ICONS.Sparkles className="size-12 text-slate-700 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-500 uppercase">No outfits generated</h3>
          <p className="text-slate-600 mt-2 max-w-xs mx-auto">
            {items.length === 0
              ? 'Add tops, bottoms, dresses, shoes or outerwear to your wardrobe first'
              : 'Try changing the event or weather — some items may be filtered out for this context'}
          </p>
          {items.length === 0 && (
            <Button3D className="mt-6" onClick={() => navigate('/wardrobe')}>
              <ICONS.Plus size={18} /> Go to Wardrobe
            </Button3D>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <AnimatePresence mode="popLayout">
            {combos.map((combo, i) => {
              const key = combo.itemIds.join('-');
              return (
                <OutfitCard
                  key={key + pageIndex}
                  image={combo.imageUrl}
                  name={combo.name}
                  comboType={combo.comboType}
                  score={combo.score}
                  isSaved={savedKeys.has(key)}
                  index={i}
                  onLike={() => saveFavorite(combo)}
                  onRefresh={() => sendToARMirror(combo)}
                  onClick={() => setSelectedCombo(combo)}
                />
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && combos.length > 0 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <button disabled={pageIndex === 0} onClick={() => setPageIndex(p => Math.max(0, p - 1))}
            className="size-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 transition-all">
            <ICONS.ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-slate-400">Batch <span className="text-white">{pageIndex + 1}</span> / {totalPages}</span>
          <button disabled={pageIndex >= totalPages - 1} onClick={() => setPageIndex(p => Math.min(totalPages - 1, p + 1))}
            className="size-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-30 transition-all">
            <ICONS.ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Favorites counter */}
      {savedKeys.size > 0 && (
        <div className="glass rounded-3xl p-5 border-white/10 flex items-center gap-3">
          <ICONS.Heart className="text-rose-500 size-5" />
          <p className="text-sm font-black text-white">{savedKeys.size} outfit{savedKeys.size !== 1 ? 's' : ''} saved to favorites</p>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCombo && (
          <OutfitDetailModal
            combo={selectedCombo}
            isSaved={savedKeys.has(selectedCombo.itemIds.join('-'))}
            onClose={() => setSelectedCombo(null)}
            onSave={() => { saveFavorite(selectedCombo); setSelectedCombo(null); }}
            onARMirror={() => { sendToARMirror(selectedCombo); setSelectedCombo(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
