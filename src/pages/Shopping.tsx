import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ICONS } from '../types';
import { searchShoppingPlatforms, ShoppingResult, TierType } from '../lib/shoppingSearch';
import { getAssistantRecommendation, setAssistantRecommendation } from '../lib/trendlySession';
import { supabase } from '../lib/supabaseClient';
import { loadUserProfile } from '../lib/supabaseData';

const TIERS: TierType[] = ['Best Seller', 'Low Price', 'Premium', 'Best Discount'];

const SECTION_COPY: Record<TierType, string> = {
  'Best Seller':   'Top 10% by sales volume · high-rated trending picks.',
  'Low Price':     'Bottom 20% by price · cheapest category matches.',
  'Premium':       'Top 20% by price · luxury brands and premium quality.',
  'Best Discount': 'Mega Deals · items with 40%+ off original MRP.',
};

const TIER_ACCENT: Record<TierType, string> = {
  'Best Seller':   'text-yellow-400 border-yellow-400/20',
  'Low Price':     'text-green-400 border-green-400/20',
  'Premium':       'text-violet-400 border-violet-400/20',
  'Best Discount': 'text-rose-400 border-rose-400/20',
};

const TIER_BADGE_BG: Record<TierType, string> = {
  'Best Seller':   'bg-yellow-500/20 text-yellow-300',
  'Low Price':     'bg-green-500/20 text-green-300',
  'Premium':       'bg-violet-500/20 text-violet-300',
  'Best Discount': 'bg-rose-500/20 text-rose-300',
};

const TIER_SVG_GRADIENT: Record<string, [string, string]> = {
  'Best Seller':   ['#1a1000', '#a87800'],
  'Low Price':     ['#001a08', '#007a3d'],
  'Premium':       ['#0d001a', '#7c2be8'],
  'Best Discount': ['#1a0007', '#c0122c'],
};

// Location state passed from AI Stylist chat
interface ShoppingLocationState {
  seedQuery?: string;
  fromAI?: boolean;
  occasionContext?: string;
  whenContext?: string;
  outfitSummary?: string;
}

// ─── Outfit Planner Modal ─────────────────────────────────────────────────
interface PlannerModalProps {
  product: ShoppingResult;
  onClose: () => void;
  defaultOccasion?: string;
  defaultWhen?: string;
}

function resolveDateFromContext(when?: string): string {
  const today = new Date();
  if (!when) return today.toISOString().split('T')[0];

  const w = when.toLowerCase();
  if (w === 'today') return today.toISOString().split('T')[0];
  if (w === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  if (w.includes('weekend')) {
    const d = new Date(today);
    const day = d.getDay();
    const daysToSat = day === 6 ? 7 : (6 - day);
    d.setDate(d.getDate() + daysToSat);
    return d.toISOString().split('T')[0];
  }
  if (w.includes('next week')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }
  return today.toISOString().split('T')[0];
}

const PlannerModal: React.FC<PlannerModalProps> = ({ product, onClose, defaultOccasion, defaultWhen }) => {
  const [selectedDate, setSelectedDate] = useState(resolveDateFromContext(defaultWhen));
  const [eventTitle, setEventTitle]     = useState(defaultOccasion || '');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to save to Outfit Planner.');

      const outfit = `${product.title} (${product.price} · ${product.source})`;
      const title  = eventTitle.trim() || `Shopping Pick · ${product.tier}`;

      const { error: dbErr } = await supabase.from('events').insert([{
        user_id:             user.id,
        event_type:          title,
        recommended_outfit:  outfit,
        date:                selectedDate,
        location:            null,
        dress_code:          product.tier,
      }]);

      if (dbErr) throw dbErr;
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="relative glass-morphism rounded-[32px] border border-white/10 p-6 w-full max-w-sm z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 size-8 rounded-full bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all">
          <ICONS.X size={14} />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="size-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
            <ICONS.Calendar size={18} />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest">Add to Outfit Planner</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Plan this outfit for a specific date</p>
          </div>
        </div>

        {/* Product summary */}
        <div className="flex gap-3 mb-5 p-3 rounded-2xl bg-white/5 border border-white/8">
          <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/5">
            {product.imageUrl
              ? <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              : <div className="w-full h-full flex items-center justify-center text-2xl">🛍️</div>}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-white/90 line-clamp-2 leading-tight">{product.title}</p>
            <p className="text-[11px] text-primary font-black mt-1">{product.price}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{product.source} · {product.tier}</p>
          </div>
        </div>

        {/* Event title */}
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1.5">Event / Occasion</label>
          <input
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder={defaultOccasion || 'e.g. Wedding, Party, Office'}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-all"
          />
        </div>

        {/* Date picker */}
        <div className="mb-5">
          <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-black mb-1.5">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm focus:outline-none focus:border-primary/50 transition-all [color-scheme:dark]"
          />
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {/* Buttons */}
        {saved ? (
          <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-widest">
            <ICONS.Check size={14} />
            Added to Planner!
          </div>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest neon-glow-primary hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {saving ? 'Saving...' : <><ICONS.Calendar size={14} /> Save to Planner</>}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-3 rounded-xl glass border border-white/10 text-slate-400 text-xs font-bold hover:text-white transition-all"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

// ─── Product Card ──────────────────────────────────────────────────────────
const ProductCard: React.FC<{
  product: ShoppingResult;
  tier: TierType;
  index: number;
  onTryOn: (p: ShoppingResult) => void;
  onAddToPlanner: (p: ShoppingResult) => void;
}> = ({ product, tier, index, onTryOn, onAddToPlanner }) => {
  const [imgError, setImgError] = useState(false);

  const buildProductArt = (p: ShoppingResult) => {
    const [g1, g2] = TIER_SVG_GRADIENT[p.tier] ?? ['#081225', '#2447a6'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${g1}" /><stop offset="100%" stop-color="${g2}" />
      </linearGradient></defs>
      <rect width="800" height="1000" fill="url(#bg)" />
      <rect x="48" y="48" width="704" height="904" rx="40" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.15)" />
      <text x="80" y="140" fill="#7dd3fc" font-size="34" font-family="Arial, sans-serif">${p.source}</text>
      <text x="80" y="220" fill="#ffffff" font-size="56" font-family="Arial, sans-serif">${p.tier}</text>
      <text x="80" y="320" fill="#dbeafe" font-size="28" font-family="Arial, sans-serif">${escapeXml(p.title.slice(0, 48))}</text>
      <text x="80" y="380" fill="#f8fafc" font-size="64" font-family="Arial, sans-serif">${escapeXml(p.price)}</text>
      ${p.discount ? `<text x="80" y="460" fill="#fca5a5" font-size="36" font-family="Arial, sans-serif">${escapeXml(p.discount)}</text>` : ''}
      <text x="80" y="910" fill="#cbd5e1" font-size="22" font-family="Arial, sans-serif">Trendly shopping match</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  };

  const imgSrc = !imgError && product.imageUrl ? product.imageUrl : buildProductArt(product);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="glass-morphism rounded-[40px] overflow-hidden border-white/5 group card-3d flex flex-col"
    >
      {/* ── Product image — prominent above everything ── */}
      <div className="relative aspect-[4/5] overflow-hidden">
        <img
          src={imgSrc}
          alt={product.title}
          className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
          onError={() => setImgError(true)}
        />

        {/* Tier / discount badges */}
        <div className="absolute bottom-6 left-6 flex flex-wrap gap-2">
          <div className={`glass px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${TIER_BADGE_BG[tier]}`}>
            {product.tier}
          </div>
          {product.rank === 1 && (
            <div className="glass px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-white/10 text-white">
              👑 Top Pick
            </div>
          )}
          {product.discountLabel && (
            <div className="glass px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-300">
              🔥 {product.discountLabel}
            </div>
          )}
        </div>

        {/* Source chip top-right */}
        <div className={`absolute top-4 right-4 glass px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${TIER_ACCENT[tier].split(' ')[0]}`}>
          {product.source}
        </div>
      </div>

      {/* ── Product info ── */}
      <div className="p-6 space-y-4 flex flex-col flex-1">
        <div className="space-y-1">
          <h3 className="text-base font-black tracking-tight leading-snug line-clamp-2 min-h-[3rem]">{product.title}</h3>

          <div className="flex items-center gap-2 flex-wrap mt-1">
            <p className="text-xl font-black text-white">{product.price}</p>
            {product.originalPrice && product.originalPrice > product.priceNumeric && (
              <p className="text-sm text-slate-500 line-through">₹{product.originalPrice.toLocaleString('en-IN')}</p>
            )}
            {product.discount && (
              <span className="bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                {product.discount}
              </span>
            )}
          </div>

          {product.rating && product.rating > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm">
                {'★'.repeat(Math.min(5, Math.round(product.rating)))}
                {'☆'.repeat(Math.max(0, 5 - Math.round(product.rating)))}
              </span>
              <span className="text-slate-300 text-xs font-bold">{product.rating.toFixed(1)}</span>
              {product.ratingCount && (
                <span className="text-slate-500 text-xs">({product.ratingCount.toLocaleString('en-IN')} reviews)</span>
              )}
            </div>
          )}
        </div>

        {/* ── Action buttons ── */}
        <div className="flex flex-col gap-2 mt-auto">
          {/* Open listing — primary CTA with link */}
          <a
            href={product.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-primary text-white rounded-2xl py-3 px-4 text-xs font-black uppercase tracking-widest neon-glow-primary hover:scale-[1.02] transition-all"
          >
            <ICONS.ArrowRight size={14} />
            Open Listing
          </a>

          {/* Second row: Try AR + Add to Planner */}
          <div className="flex gap-2">
            <button
              onClick={() => onTryOn(product)}
              className={`flex-1 glass rounded-2xl px-3 py-2.5 text-xs font-black uppercase tracking-widest border ${TIER_ACCENT[tier]} hover:scale-[1.02] transition-all`}
            >
              Try AR
            </button>
            <button
              onClick={() => onAddToPlanner(product)}
              className="flex-1 glass rounded-2xl px-3 py-2.5 text-xs font-black uppercase tracking-widest border border-emerald-400/30 text-emerald-300 hover:bg-emerald-500/15 hover:scale-[1.02] transition-all flex items-center justify-center gap-1.5"
            >
              <ICONS.Calendar size={12} />
              + Planner
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main Shopping Page ───────────────────────────────────────────────────
export default function Shopping() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const [searchParams] = useSearchParams();
  const recommendation = getAssistantRecommendation();

  const locationState = (location.state || null) as ShoppingLocationState | null;

  const [inputValue, setInputValue]     = useState(sanitizeShoppingQuery(searchParams.get('q') || recommendation?.query || ''));
  const [query, setQuery]               = useState(inputValue);
  const [products, setProducts]         = useState<ShoppingResult[]>([]);
  const [loading, setLoading]           = useState(false);
  const [userGender, setUserGender]     = useState<string>('');
  const [plannerProduct, setPlannerProduct] = useState<ShoppingResult | null>(null);

  const debounceRef       = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipNextSearchRef = useRef(false);

  const handleInput = useCallback((value: string) => {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(value), 500);
  }, []);

  useEffect(() => {
    const loadGender = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const profile = await loadUserProfile(user.id).catch(() => null);
        setUserGender(String(profile?.gender || '').toLowerCase());
      } catch { setUserGender(''); }
    };
    loadGender();
  }, []);

  useEffect(() => {
    if (locationState?.seedQuery) {
      const sanitized = sanitizeShoppingQuery(locationState.seedQuery);
      setInputValue(sanitized);
      setQuery(sanitized);
      return;
    }
    const q = searchParams.get('q');
    if (q) {
      const sanitized = sanitizeShoppingQuery(q);
      setInputValue(sanitized);
      setQuery(sanitized);
      return;
    }
    if (recommendation?.query) {
      const sanitized = sanitizeShoppingQuery(recommendation.query);
      setInputValue(sanitized);
      setQuery(sanitized);
    }
  }, [location.state, searchParams, recommendation?.query]);

  useEffect(() => {
    if (skipNextSearchRef.current) { skipNextSearchRef.current = false; return; }
    if (!query.trim()) return;
    let cancelled = false;
    const runSearch = async () => {
      setLoading(true);
      setProducts([]);
      try {
        const gaq = buildGenderAwareShoppingQuery(query, userGender);
        const results = await searchShoppingPlatforms(gaq);
        if (!cancelled) {
          setProducts(results);
          setAssistantRecommendation({ query: gaq, summary: recommendation?.summary || query, source: recommendation?.source || 'shopping', created_at: new Date().toISOString() });
        }
      } finally { if (!cancelled) setLoading(false); }
    };
    runSearch();
    return () => { cancelled = true; };
  }, [query, userGender]);

  const groupedProducts = TIERS.map((tier) => ({
    tier,
    items: products.filter((p) => p.tier === tier).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
  }));

  const handleTryOn = (product: ShoppingResult) => {
    const suggestion = `${product.title} from ${product.source} priced at ${product.price}`;
    navigate(`/ar-mirror?suggestion=${encodeURIComponent(suggestion)}&summary=${encodeURIComponent(query)}`);
  };

  // AI context passed from chat
  const aiOccasion = locationState?.occasionContext;
  const aiWhen     = locationState?.whenContext;
  const fromAI     = locationState?.fromAI;

  return (
    <div className="flex flex-col gap-10">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase">Shopping</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">Live search across Amazon, Flipkart, Myntra, and Shopsy</p>
          {fromAI && aiOccasion && (
            <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 w-fit">
              <ICONS.Sparkles size={12} className="text-primary" />
              <span className="text-xs text-primary font-bold">AI Stylist · {aiOccasion}{aiWhen ? ` · ${aiWhen}` : ''}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <div className="hidden md:flex relative items-center">
            <ICONS.Search className="absolute left-4 text-slate-500 size-4" />
            <input
              type="text"
              value={inputValue}
              onChange={(e) => handleInput(e.target.value)}
              placeholder="Search outfit..."
              className="bg-white/5 border border-white/10 rounded-full py-2 pl-11 pr-4 text-sm focus:outline-none focus:border-primary/50 w-56 transition-all"
            />
          </div>
          <button className="glass p-4 rounded-2xl text-slate-400 hover:text-primary transition-all">
            <ICONS.ShoppingBag size={20} />
          </button>
        </div>
      </div>

      {/* ── Tier filter pills ── */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
        {groupedProducts.map(({ tier, items }) => (
          <div key={tier} className="px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest whitespace-nowrap glass text-slate-300">
            {tier} · {items.length}
          </div>
        ))}
      </div>

      {/* ── States ── */}
      {loading && <p className="text-slate-400">Searching products...</p>}

      {!loading && products.length === 0 && (
        <div className="glass rounded-3xl border-white/10 p-8 text-slate-400">
          Search for an outfit to compare listings across Amazon, Flipkart, Myntra, and Shopsy.
        </div>
      )}

      {/* ── Tier sections ── */}
      {!loading && groupedProducts.map(({ tier, items }) => (
        items.length === 0 ? null : (
          <section key={tier} className="space-y-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className={`text-2xl font-black tracking-tight uppercase ${TIER_ACCENT[tier].split(' ')[0]}`}>
                  {tier === 'Low Price' ? 'Lowest Price' : tier === 'Premium' ? 'Premium Options' : tier === 'Best Discount' ? 'Mega Deals' : 'Best Sellers'}
                </h2>
                <p className="text-slate-400 text-sm">{SECTION_COPY[tier]}</p>
              </div>
              <p className={`text-[10px] uppercase tracking-widest font-black ${TIER_ACCENT[tier].split(' ')[0]}`}>{items.length} results</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {items.map((product, index) => (
                <ProductCard
                  key={`${tier}-${product.title}-${index}`}
                  product={product}
                  tier={tier}
                  index={index}
                  onTryOn={handleTryOn}
                  onAddToPlanner={setPlannerProduct}
                />
              ))}
            </div>
          </section>
        )
      ))}

      {/* ── Outfit Planner Modal ── */}
      <AnimatePresence>
        {plannerProduct && (
          <PlannerModal
            product={plannerProduct}
            onClose={() => setPlannerProduct(null)}
            defaultOccasion={aiOccasion}
            defaultWhen={aiWhen}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function sanitizeShoppingQuery(query: string) {
  return String(query).replace(/URL\s*Source\s*:\s*/gi, '').replace(/Title\s*:\s*/gi, '').replace(/https?:\/\/\S+/gi, '').replace(/[|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function buildGenderAwareShoppingQuery(baseQuery: string, gender: string) {
  const base = sanitizeShoppingQuery(baseQuery).toLowerCase();
  if (!base) return baseQuery;
  if (/male|man|men|boy/.test(gender)) {
    const normalized = base.replace(/women|woman|womens|female|ladies|girls/g, 'men').replace(/dupatta|stole/g, 'nehru jacket').replace(/kurti/g, 'kurta');
    return `${normalized} men kurta pajama set mens ethnic wedding`;
  }
  if (/female|woman|women|girl|lady/.test(gender)) {
    const normalized = base.replace(/mens|men|male|boys/g, 'women').replace(/nehru jacket/g, 'dupatta');
    return `${normalized} women ethnic suit set`;
  }
  return baseQuery;
}
