import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ICONS } from '../../types';
import type { AIStylistStructuredResponse, QAStep } from '../../ai/fashionChat';
import type { ShoppingResult } from '../../lib/shoppingSearch';

// ─── Types ────────────────────────────────────────────────────────────────
export interface ChatWardrobeCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
}

export interface ChatMessage {
  id?: string;
  role: 'bot' | 'user';
  text: string;
  qaResponse?: AIStylistStructuredResponse;
  shoppingResults?: ShoppingResult[];
  wardrobeCards?: ChatWardrobeCard[];
  quickReplies?: QuickReply[];
  // AI-supplied context for routing
  occasionContext?: string;   // e.g. "Wedding"
  whenContext?: string;       // e.g. "This Weekend"
}

export interface QuickReply {
  label: string;
  value: string;
}

interface AIChatBoxProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onDeleteMessage?: (id: string) => void;
  onClearAll?: () => void;
  isLoading: boolean;
  currentStep: QAStep;
}

// ─── Quick reply sets ─────────────────────────────────────────────────────
const QA_REPLIES: Record<QAStep, QuickReply[]> = {
  occasion: [
    { label: '1️⃣ Wedding',        value: 'Wedding' },
    { label: '2️⃣ Birthday Party', value: 'Birthday Party' },
    { label: '3️⃣ Party',          value: 'Party' },
    { label: '4️⃣ Date Night',     value: 'Date Night' },
    { label: '5️⃣ Casual Hangout', value: 'Casual Hangout' },
    { label: '6️⃣ Office',         value: 'Office' },
    { label: '7️⃣ Vacation',       value: 'Vacation' },
    { label: '8️⃣ Festival',       value: 'Festival' },
  ],
  when: [
    { label: '1️⃣ Today',         value: 'Today' },
    { label: '2️⃣ Tomorrow',      value: 'Tomorrow' },
    { label: '3️⃣ This Weekend',  value: 'This Weekend' },
    { label: '4️⃣ Next Week',     value: 'Next Week' },
    { label: '5️⃣ Specific Date', value: 'Specific Date' },
  ],
  style: [
    { label: '1️⃣ Streetwear',     value: 'Streetwear' },
    { label: '2️⃣ Casual',         value: 'Casual' },
    { label: '3️⃣ Classy',         value: 'Classy' },
    { label: '4️⃣ Minimal',        value: 'Minimal' },
    { label: '5️⃣ Sporty',         value: 'Sporty' },
    { label: '6️⃣ Trendy',         value: 'Trendy' },
    { label: '7️⃣ Surprise me ✨', value: 'Surprise me' },
  ],
  color: [
    { label: '1️⃣ All Black 🖤',     value: 'All Black' },
    { label: '2️⃣ Neutral Tones 🤍', value: 'Neutral Tones' },
    { label: '3️⃣ Bright Colors 🌈', value: 'Bright Colors' },
    { label: '4️⃣ Earth Tones 🍂',   value: 'Earth Tones' },
    { label: '5️⃣ No Preference',    value: 'No Preference' },
  ],
  done: [
    { label: '💎 Classy Version', value: 'Show me a classy version' },
    { label: '🔁 Another Outfit', value: 'Give me another outfit' },
    { label: '💸 Budget Version', value: 'Show me a budget version' },
    { label: '👑 Premium Version', value: 'Show me a premium version' },
  ],
};

// ─── Outfit Pieces Card ────────────────────────────────────────────────────
const OutfitPiecesCard: React.FC<{ response: AIStylistStructuredResponse }> = ({ response }) => {
  const outfit = response.outfit;
  if (!outfit) return null;

  const pieces = [
    { icon: '👕', label: 'Top',         value: outfit.top },
    { icon: '👖', label: 'Bottom',      value: outfit.bottom },
    { icon: '👟', label: 'Shoes',       value: outfit.shoes },
    { icon: '🧢', label: 'Accessories', value: outfit.accessories },
    ...(outfit.outerwear ? [{ icon: '🧥', label: 'Outerwear', value: outfit.outerwear }] : []),
  ];

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] max-w-md">
      <div className="px-4 py-2.5 bg-gradient-to-r from-primary/20 to-secondary/10 border-b border-white/10 flex items-center gap-2">
        <span className="text-sm">🔥</span>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/80">Full Body Outfit</span>
        {response.weather && (
          <span className="ml-auto text-[10px] text-slate-500">🌤 {response.weather}</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {pieces.map((p) => (
          <div key={p.label} className="flex items-start gap-3">
            <span className="text-xl w-7 shrink-0 mt-0.5">{p.icon}</span>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 font-semibold">{p.label}</p>
              <p className="text-sm font-medium text-white/90">{p.value}</p>
            </div>
          </div>
        ))}
      </div>

      {response.why && (
        <div className="mx-4 mb-3 p-3 rounded-xl bg-sky-500/[0.06] border border-sky-500/20">
          <p className="text-[10px] uppercase tracking-wider text-sky-400 mb-1 font-black">✨ Why This Works</p>
          <p className="text-xs text-slate-300 leading-relaxed">{response.why}</p>
        </div>
      )}

      {response.tip && (
        <div className="mx-4 mb-4 p-3 rounded-xl bg-primary/[0.06] border border-primary/20">
          <p className="text-[10px] uppercase tracking-wider text-primary mb-1 font-black">💡 Style Tip</p>
          <p className="text-xs text-slate-300 leading-relaxed">{response.tip}</p>
        </div>
      )}
    </div>
  );
};

// ─── Wardrobe Section ─────────────────────────────────────────────────────
const WardrobeSection: React.FC<{ cards: ChatWardrobeCard[] }> = ({ cards }) => {
  const navigate = useNavigate();

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] max-w-md">
      <div className="px-4 py-2.5 bg-gradient-to-r from-primary/15 to-secondary/10 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ICONS.Shirt size={13} className="text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-white/70">
            You Already Own This 👀
          </span>
        </div>
        <span className="text-[10px] text-slate-500">{cards.length} match{cards.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="p-3 space-y-2">
        {cards.map((card, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/8">
            <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-white/8">
              {card.imageUrl
                ? <img src={card.imageUrl} alt={card.title} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xl">👕</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/90 truncate">{card.title}</p>
              {card.subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{card.subtitle}</p>}
            </div>
            <div className="size-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
              <ICONS.Check size={11} className="text-primary" />
            </div>
          </div>
        ))}
      </div>

      <div className="px-3 pb-3">
        <button
          onClick={() => navigate('/wardrobe')}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/20 border border-primary/40 text-primary text-xs font-black uppercase tracking-wider hover:bg-primary/30 transition-all active:scale-[0.98]"
        >
          <ICONS.Shirt size={13} />
          View in My Wardrobe
          <ICONS.ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
};

// ─── Shopping CTA — redirects to in-app /shopping ─────────────────────────
// One button per outfit piece → navigates to /shopping?q=<piece text>
// Also carries occasion + when context so Shopping page can show "Add to Planner"
const ShoppingCTA: React.FC<{
  outfit: NonNullable<AIStylistStructuredResponse['outfit']>;
  items: string[];
  occasionContext?: string;
  whenContext?: string;
}> = ({ outfit, items, occasionContext, whenContext }) => {
  const navigate = useNavigate();
  const [activePiece, setActivePiece] = useState<string>('top');

  const pieces = [
    { key: 'top',         icon: '👕', label: 'Top',         text: outfit.top },
    { key: 'bottom',      icon: '👖', label: 'Bottom',      text: outfit.bottom },
    { key: 'shoes',       icon: '👟', label: 'Shoes',       text: outfit.shoes },
    { key: 'accessories', icon: '🧢', label: 'Accessories', text: outfit.accessories },
    ...(outfit.outerwear ? [{ key: 'outerwear', icon: '🧥', label: 'Outerwear', text: outfit.outerwear }] : []),
  ];

  const active = pieces.find((p) => p.key === activePiece) || pieces[0];

  const handleShopPiece = () => {
    const q = active.text;
    navigate(`/shopping?q=${encodeURIComponent(q)}`, {
      state: {
        seedQuery: q,
        fromAI: true,
        occasionContext,
        whenContext,
        outfitSummary: items.join(', '),
      },
    });
  };

  const handleShopAll = () => {
    const q = items.join(' ');
    navigate(`/shopping?q=${encodeURIComponent(q)}`, {
      state: {
        seedQuery: q,
        fromAI: true,
        occasionContext,
        whenContext,
        outfitSummary: items.join(', '),
      },
    });
  };

  return (
    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.02] max-w-md">
      {/* Header */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-secondary/15 to-primary/10 border-b border-white/10 flex items-center gap-2">
        <ICONS.ShoppingBag size={13} className="text-secondary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Shop This Look</span>
      </div>

      {/* Piece tabs */}
      <div className="flex gap-1 p-2 border-b border-white/8 overflow-x-auto no-scrollbar">
        {pieces.map((p) => (
          <button
            key={p.key}
            onClick={() => setActivePiece(p.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all shrink-0 ${
              activePiece === p.key
                ? 'bg-primary/25 border border-primary/50 text-white'
                : 'bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10'
            }`}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Active piece preview */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          <span className="text-white/60 font-semibold">{active.icon} {active.label}: </span>
          {active.text}
        </p>

        {/* Shop this piece button */}
        <button
          onClick={handleShopPiece}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-secondary/20 border border-secondary/30 text-secondary text-xs font-black uppercase tracking-wider hover:bg-secondary/30 hover:scale-[1.01] transition-all active:scale-[0.98]"
        >
          <ICONS.ShoppingBag size={13} />
          Shop {active.label} in App
          <ICONS.ArrowRight size={13} />
        </button>

        {/* Shop full look button */}
        <button
          onClick={handleShopAll}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-[11px] font-bold uppercase tracking-wider hover:text-white hover:border-white/20 transition-all active:scale-[0.98]"
        >
          <ICONS.Share2 size={12} />
          Shop Full Look
        </button>
      </div>

      {/* Context hint if occasion/when is known */}
      {(occasionContext || whenContext) && (
        <div className="px-4 pb-3">
          <p className="text-[10px] text-slate-600 text-center">
            {[occasionContext, whenContext].filter(Boolean).join(' · ')} · You can add items to Outfit Planner on the Shopping page
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Quick Replies ─────────────────────────────────────────────────────────
const QuickReplies: React.FC<{
  replies: QuickReply[];
  onPick: (val: string) => void;
  disabled: boolean;
}> = ({ replies, onPick, disabled }) => (
  <div className="flex flex-wrap gap-2 mt-3">
    {replies.map((r) => (
      <button
        key={r.value}
        onClick={() => !disabled && onPick(r.value)}
        disabled={disabled}
        className="px-3 py-2 rounded-full text-xs font-semibold bg-white/8 border border-white/15 text-slate-200 hover:border-primary/60 hover:bg-primary/15 hover:text-white transition-all disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap"
      >
        {r.label}
      </button>
    ))}
  </div>
);

// ─── Main AIChatBox ────────────────────────────────────────────────────────
export const AIChatBox: React.FC<AIChatBoxProps> = ({
  messages,
  onSendMessage,
  onDeleteMessage,
  onClearAll,
  isLoading,
  currentStep,
}) => {
  const [input, setInput]                       = useState('');
  const [hoveredId, setHoveredId]               = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = () => {
    const val = input.trim();
    if (!val || isLoading) return;
    setInput('');
    onSendMessage(val);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const lastBotIdx    = [...messages].reverse().findIndex((m) => m.role === 'bot');
  const lastBotAbsIdx = lastBotIdx >= 0 ? messages.length - 1 - lastBotIdx : -1;

  return (
    <div className="flex flex-col h-full">

      {/* ── Clear All bar ── */}
      {messages.length > 1 && onClearAll && (
        <div className="flex justify-end mb-2 shrink-0">
          {showClearConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Clear all messages?</span>
              <button
                onClick={() => { setShowClearConfirm(false); onClearAll(); }}
                className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[11px] font-bold uppercase tracking-wider hover:bg-red-500/30 transition-all"
              >
                Yes, clear
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 rounded-lg glass border-white/10 text-slate-400 text-[11px] font-bold uppercase tracking-wider hover:text-white transition-all"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass border border-white/10 text-[11px] text-slate-400 hover:text-red-300 hover:border-red-400/30 transition-all uppercase tracking-widest font-bold"
            >
              <ICONS.Trash2 size={12} />
              Clear Chat
            </button>
          )}
        </div>
      )}

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-2 space-y-5 no-scrollbar pb-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const msgId     = msg.id || `msg-${i}`;
            const isLastBot = i === lastBotAbsIdx && msg.role === 'bot';
            const replies   = isLastBot ? (msg.quickReplies ?? QA_REPLIES[currentStep] ?? []) : [];
            const canDelete = i > 0 && !!onDeleteMessage;

            return (
              <motion.div
                key={msgId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                className={`flex ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-3 group`}
                onMouseEnter={() => setHoveredId(msgId)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Avatar */}
                <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                  msg.role === 'bot' ? 'bg-primary text-white neon-glow-primary' : 'bg-white/10 text-slate-400'
                }`}>
                  {msg.role === 'bot' ? <ICONS.Sparkles size={18} /> : <ICONS.User size={18} />}
                </div>

                {/* Content */}
                <div className={`relative flex flex-col max-w-[82%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                  {/* Per-message delete ✕ */}
                  <AnimatePresence>
                    {canDelete && hoveredId === msgId && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        onClick={() => onDeleteMessage!(msgId)}
                        className={`absolute -top-2 ${msg.role === 'user' ? '-left-2' : '-right-2'} z-20 size-6 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center text-red-300 hover:bg-red-500/40 transition-all`}
                        title="Delete this message"
                      >
                        <ICONS.X size={10} />
                      </motion.button>
                    )}
                  </AnimatePresence>

                  {/* Text bubble */}
                  <div className={`px-4 py-3 rounded-3xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'bot'
                      ? 'glass border-primary/10 rounded-tl-none text-slate-200'
                      : 'bg-primary text-white rounded-tr-none shadow-lg shadow-primary/15'
                  }`}>
                    {msg.text}
                  </div>

                  {/* Outfit pieces card */}
                  {msg.qaResponse?.outfit && <OutfitPiecesCard response={msg.qaResponse} />}

                  {/* Wardrobe matches */}
                  {msg.wardrobeCards && msg.wardrobeCards.length > 0 && (
                    <WardrobeSection cards={msg.wardrobeCards} />
                  )}

                  {/* Shopping CTA — redirects to /shopping in-app */}
                  {msg.qaResponse?.outfit && (
                    <ShoppingCTA
                      outfit={msg.qaResponse.outfit}
                      items={msg.qaResponse.items}
                      occasionContext={msg.occasionContext}
                      whenContext={msg.whenContext}
                    />
                  )}

                  {/* Quick replies */}
                  {replies.length > 0 && (
                    <QuickReplies replies={replies} onPick={onSendMessage} disabled={isLoading} />
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex items-center gap-3 px-14">
            <div className="flex gap-1">
              {[0, 0.2, 0.4].map((d, idx) => (
                <span key={idx} className="size-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
            <span className="text-xs text-primary/60 font-bold uppercase tracking-widest animate-pulse">
              Stylist is thinking...
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="relative mt-4 shrink-0">
        <textarea
          ref={inputRef}
          rows={1}
          className="w-full glass-morphism rounded-2xl py-4 pl-5 pr-16 text-sm focus:outline-none focus:border-primary/50 transition-all border-white/10 resize-none no-scrollbar leading-relaxed"
          placeholder="Type or pick an option above..."
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onKeyDown={handleKey}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
          className="absolute right-3 top-1/2 -translate-y-1/2 bg-primary text-white p-2.5 rounded-xl neon-glow-primary hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100"
        >
          <ICONS.ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
};
