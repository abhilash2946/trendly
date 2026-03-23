import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../types';
import { AIChatBox } from '../components/ai/AIChatBox';
import type { ChatMessage } from '../components/ai/AIChatBox';
import {
  getAIStylistResponse,
  saveConversationMessage,
  loadConversationHistory,
  createQAState,
  type ConversationMessage,
  type QAState,
} from '../ai/fashionChat';
import { Button3D } from '../components/ui/Button3D';
import { supabase } from '../lib/supabaseClient';
import { useWardrobe } from '../hooks/useWardrobe';
import { searchShoppingPlatforms } from '../lib/shoppingSearch';
import type { WardrobeItemRecord } from '../types';
import { loadUserProfile } from '../lib/supabaseData';

// ─── ID helper ────────────────────────────────────────────────────────────
let _counter = 0;
function genId() {
  return `msg-${Date.now()}-${++_counter}`;
}
function withId(msg: Omit<ChatMessage, 'id'>): ChatMessage {
  return { ...msg, id: genId() };
}

// ─── Session types ────────────────────────────────────────────────────────
interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  history: ConversationMessage[];
  qa: QAState;
  createdAt: number;
}

const SESSIONS_KEY = 'trendly:ai-stylist-sessions';
const ACTIVE_KEY   = 'trendly:ai-stylist-active';

function saveSessions(sessions: ChatSession[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); } catch { /* noop */ }
}
function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch { return []; }
}

function greetMessage(): ChatMessage {
  return withId({
    role: 'bot',
    text: "Hey bestie 👋✨\nI'm your personal AI Stylist — I'll put together a complete fire outfit just for you 🔥\n\nWhat event are we styling for today? 👀",
  });
}

function buildTitle(qa: QAState): string {
  if (qa.occasion) return `${qa.occasion} Outfit`;
  return 'New Style Session';
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function AIStylist() {
  const navigate = useNavigate();
  const { items: wardrobeItems, loading: wardrobeLoading } = useWardrobe();

  const [sessions, setSessions]     = useState<ChatSession[]>([]);
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [isLoading, setIsLoading]   = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const [userGender, setUserGender] = useState('');
  const [loginPrompt, setLoginPrompt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus]   = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  // ── Init ────────────────────────────────────────────────────────────────
    useEffect(() => {
      const init = async () => {
        const stored = loadSessions();
        console.log('[AIStylist] Loaded sessions from localStorage:', stored);

        try {
          const { data: { user } } = await supabase.auth.getUser();
          console.log('[AIStylist] Supabase user:', user);
          if (!user) {
            setLoginPrompt('Sign in to save your outfit history.');
            if (stored.length > 0) {
              setSessions(stored);
              setActiveId(localStorage.getItem(ACTIVE_KEY) || stored[0].id);
              console.log('[AIStylist] Using localStorage sessions for not-logged-in user');
            } else {
              createNewSession([], null, '');
              console.log('[AIStylist] No sessions found, created new session for not-logged-in user');
            }
            return;
          }
          setUserId(user.id);
          setLoginPrompt(null);

          const profile = await loadUserProfile(user.id).catch(() => null);
          const gender = String(profile?.gender || '').toLowerCase();
          setUserGender(gender);

          // Load all sessions from Supabase
          const dbHistory = await loadConversationHistory(user.id).catch(() => ({}));
          console.log('[AIStylist] Loaded conversation history from Supabase:', dbHistory);
          const restoredSessions: ChatSession[] = Object.entries(dbHistory).map(([sessionId, messages]) => {
            // Use metadata from the last message to restore session state
            const lastMsg = messages[messages.length - 1]?.metadata || {};
            // Sort messages by createdAt ascending
            const sortedMessages = messages.slice().sort((a, b) => {
              const aTime = a.metadata?.createdAt || 0;
              const bTime = b.metadata?.createdAt || 0;
              return aTime - bTime;
            });
            const restored: ChatMessage[] = sortedMessages.map((m) => ({
              id: genId(),
              role: m.role === 'assistant' ? ('bot' as const) : ('user' as const),
              text: m.content,
              qaResponse: m.metadata?.qaResponse,
              shoppingResults: m.metadata?.shoppingResults,
              wardrobeCards: m.metadata?.wardrobeCards,
              occasionContext: m.metadata?.occasionContext,
              whenContext: m.metadata?.whenContext,
            }));
            // Restore QA state, title, createdAt from metadata
            const qa = lastMsg.qa || createQAState();
            const title = lastMsg.title || buildTitle(qa) || 'Previous Session';
            const createdAt = lastMsg.createdAt || Date.now();
            const session = makeSession(restored, sortedMessages, gender);
            session.qa = qa;
            session.title = title;
            session.createdAt = createdAt;
            session.id = sessionId;
            return session;
          });
          if (restoredSessions.length > 0) {
            setSessions(restoredSessions);
            setActiveId(restoredSessions[0].id);
            console.log('[AIStylist] Restored multiple sessions from Supabase:', restoredSessions);
          } else {
            createNewSession([], null, gender);
            console.log('[AIStylist] No Supabase history found, created new session for logged-in user');
          }
        } catch (err) {
          console.error('[AIStylist] Error during init:', err);
          setLoginPrompt('Unable to verify session. Please sign in again.');
          createNewSession([], null, '');
        }
      };
      init();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

  // Persist sessions on change
  useEffect(() => {
    saveSessions(sessions);
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
    console.log('[AIStylist] Saved sessions to localStorage:', sessions);
    console.log('[AIStylist] Active session ID:', activeId);
  }, [sessions, activeId]);

  // ── Session helpers ──────────────────────────────────────────────────────
  function makeSession(
    messages: ChatMessage[],
    history: ConversationMessage[],
    _gender: string
  ): ChatSession {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: 'New Style Session',
      messages,
      history,
      qa: createQAState(),
      createdAt: Date.now(),
    };
  }

  const createNewSession = useCallback(
    (existingSessions: ChatSession[], _currentUserId: string | null, _gender: string) => {
      const session = makeSession([greetMessage()], [], _gender);
      const updated = [session, ...existingSessions];
      setSessions(updated);
      setActiveId(session.id);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  const handleNewChat = () => {
    createNewSession(sessions, userId, userGender);
  };

  // ── Delete a single message within the active session ───────────────────
  const handleDeleteMessage = useCallback(async (msgId: string) => {
    const msgToDelete = activeSession?.messages.find(m => m.id === msgId);

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId
          ? { ...s, messages: s.messages.filter((m) => m.id !== msgId) }
          : s
      )
    );

    // Also delete from Supabase if we have a way to match it (usually by message text and user_id)
    if (userId && msgToDelete) {
      await supabase
        .from('ai_conversations')
        .delete()
        .eq('user_id', userId)
        .eq('message', msgToDelete.text)
        .eq('role', msgToDelete.role === 'bot' ? 'assistant' : 'user');
    }
  }, [activeId, activeSession, userId]);

  // ── Delete an entire session from the sidebar ────────────────────────────
  const handleDeleteSession = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const updated = prev.filter((s) => s.id !== sessionId);
      if (activeId === sessionId) {
        setActiveId(updated.length > 0 ? updated[0].id : null);
        if (updated.length === 0) {
          // Create a fresh session right away
          const fresh = makeSession([greetMessage()], [], userGender);
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return updated;
    });
    // Delete all messages for this session from Supabase
    if (userId) {
      supabase.from('ai_conversations').delete().eq('user_id', userId).eq('session_id', sessionId).then(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, userGender, userId]);

  // ── Clear all messages in the active session ─────────────────────────────
  const handleClearAll = useCallback(() => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId
          ? { ...s, messages: [greetMessage()], history: [], qa: createQAState() }
          : s
      )
    );
    // Optionally clear from Supabase
    if (userId) {
      supabase.from('ai_conversations').delete().eq('user_id', userId).then(() => {});
    }
  }, [activeId, userId]);

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSendMessage = async (text: string) => {
    if (!activeSession || isLoading) return;

    const userMsg = withId({ role: 'user' as const, text });
    const updatedMessages = [...activeSession.messages, userMsg];

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId ? { ...s, messages: updatedMessages } : s
      )
    );

    setIsLoading(true);
    setSaveStatus(null);

    try {
      const { response, nextQA } = await getAIStylistResponse(
        text,
        activeSession.history,
        activeSession.qa,
        userGender
      );

      let shoppingResults = undefined;
      let wardrobeCards   = undefined;

      if (response.outfit && response.items.length > 0) {
        const query = buildShoppingQuery(response.items.join(' ') || response.suggestion, userGender);
        try {
          shoppingResults = await searchShoppingPlatforms(query);
        } catch { /* noop */ }

        if (!wardrobeLoading) {
          wardrobeCards = findWardrobeMatches(response.items, wardrobeItems);
        }
      }

      const botMsg = withId({
        role: 'bot' as const,
        text: response.message,
        qaResponse: response,
        shoppingResults,
        wardrobeCards,
        occasionContext: nextQA.occasion ?? undefined,
        whenContext: nextQA.when ?? undefined,
      });

      const newHistory: ConversationMessage[] = [
        ...activeSession.history,
        { role: 'user', content: text },
        { role: 'assistant', content: response.message },
      ];

      const newTitle = buildTitle(nextQA);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? {
                ...s,
                messages: [...updatedMessages, botMsg],
                history: newHistory,
                qa: nextQA,
                title: newTitle,
              }
            : s
        )
      );

      if (userId && activeSession) {
        const now = Date.now();
        // Save user message with session_id and full metadata, including ms timestamp
        saveConversationMessage(userId, text, 'user', {
          session_id: activeSession.id,
          qa: activeSession.qa,
          title: activeSession.title,
          createdAt: now,
        }).catch(console.warn);
        // Save bot message with session_id and full metadata, including ms timestamp
        saveConversationMessage(userId, response.message, 'assistant', {
          session_id: activeSession.id,
          qaResponse: response,
          shoppingResults,
          wardrobeCards,
          occasionContext: nextQA.occasion,
          whenContext: nextQA.when,
          qa: nextQA,
          title: buildTitle(nextQA),
          createdAt: now + 1, // ensure assistant message is after user
        }).catch(console.warn);
      }
    } catch (err) {
      const errMsg = withId({
        role: 'bot' as const,
        text: `Oops, something went wrong 😅 Try again! (${err instanceof Error ? err.message : 'Unknown error'})`,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, messages: [...updatedMessages, errMsg] }
            : s
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ── Save outfit ───────────────────────────────────────────────────────────
  const handleSaveOutfit = async () => {
    const lastOutfit = [...(activeSession?.messages || [])]
      .reverse()
      .find((m) => m.qaResponse?.outfit);

    if (!lastOutfit?.qaResponse) return;
    setSaveStatus(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to save outfits.');

      const { error } = await supabase.from('outfits').insert([{
        user_id: user.id,
        name: `AI Stylist — ${activeSession?.qa.occasion || 'Outfit'}`,
        items: lastOutfit.qaResponse.items,
        combo_type: 'AI Stylist',
        image_url: null,
        score: 90,
      }]);

      if (error) throw error;
      setSaveStatus('✅ Outfit saved to your profile!');
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : 'Failed to save outfit.');
    }
  };

  // ── AR Mirror ─────────────────────────────────────────────────────────────
  const handleARMirror = () => {
    const lastOutfit = [...(activeSession?.messages || [])]
      .reverse()
      .find((m) => m.qaResponse?.outfit);
    if (!lastOutfit?.qaResponse) return;
    navigate(
      `/ar-mirror?suggestion=${encodeURIComponent(lastOutfit.qaResponse.suggestion)}&items=${encodeURIComponent(lastOutfit.qaResponse.items.join(','))}`
    );
  };

  // ── Shopping ──────────────────────────────────────────────────────────────
  const handleShop = () => {
    const lastOutfit = [...(activeSession?.messages || [])]
      .reverse()
      .find((m) => m.qaResponse?.outfit);
    if (!lastOutfit?.qaResponse) return;
    const q = buildShoppingQuery(lastOutfit.qaResponse.items.join(' ') || lastOutfit.qaResponse.suggestion, userGender);
    navigate(`/shopping?q=${encodeURIComponent(q)}`);
  };

  const hasOutfit = (activeSession?.messages || []).some((m) => m.qaResponse?.outfit);

  // ── Today/earlier grouping ────────────────────────────────────────────────
  const todaySessions  = sessions.filter((s) => Date.now() - s.createdAt < 86_400_000);
  const olderSessions  = sessions.filter((s) => Date.now() - s.createdAt >= 86_400_000);

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-0 -mx-6 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex flex-col overflow-hidden border-r border-white/8 bg-white/2 shrink-0"
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-white/8">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">Chat History</p>
            </div>

            {/* New chat */}
            <div className="px-3 py-2 border-b border-white/8">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-xs font-black uppercase tracking-wider hover:bg-primary/25 transition-all"
              >
                <ICONS.Plus size={14} /> New Chat
              </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto py-2 no-scrollbar">
              {[
                { label: 'Today', items: todaySessions },
                { label: 'Earlier', items: olderSessions },
              ].map(({ label, items }) =>
                items.length === 0 ? null : (
                  <div key={label} className="mb-1">
                    <p className="px-4 py-1.5 text-[9px] uppercase tracking-widest text-slate-600 font-black">{label}</p>
                    {items.map((s) => (
                      <div
                        key={s.id}
                        className={`group/item flex items-center gap-1 pr-2 transition-all ${
                          s.id === activeId
                            ? 'bg-primary/15 border-l-2 border-primary'
                            : 'border-l-2 border-transparent hover:bg-white/5'
                        }`}
                      >
                        <button
                          onClick={() => setActiveId(s.id)}
                          className={`flex-1 text-left px-3 py-2.5 text-xs flex items-center gap-2 min-w-0 ${
                            s.id === activeId ? 'text-primary' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <ICONS.MessageSquare size={12} className="shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </button>
                        {/* ── Delete session button ── */}
                        <button
                          onClick={(e) => handleDeleteSession(s.id, e)}
                          className="opacity-0 group-hover/item:opacity-100 size-6 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-300 hover:bg-red-500/15 transition-all shrink-0"
                          title="Delete this chat"
                        >
                          <ICONS.Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
              {sessions.length === 0 && (
                <p className="text-center text-xs text-slate-600 py-6">No chats yet</p>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Chat Area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden px-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 pt-0.5 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="p-2 rounded-xl glass border-white/10 text-slate-400 hover:text-white transition-all"
            >
              <ICONS.Menu size={16} />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase text-gradient leading-none">AI Stylist</h1>
              <p className="text-slate-400 text-xs">Chat with your Gen-Z fashion bestie ✨</p>
            </div>
          </div>
          <div className="size-10 rounded-2xl glass-morphism border-primary/20 flex items-center justify-center text-primary animate-pulse-glow">
            <ICONS.Sparkles size={20} />
          </div>
        </div>

        {/* Login prompt */}
        {loginPrompt && (
          <div className="mb-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200 shrink-0">
            {loginPrompt}
          </div>
        )}

        {/* Chat box */}
        <div className="flex-1 glass-morphism rounded-[28px] p-5 flex flex-col overflow-hidden">
          {activeSession ? (
            <AIChatBox
              messages={activeSession.messages}
              onSendMessage={handleSendMessage}
              onDeleteMessage={handleDeleteMessage}
              onClearAll={handleClearAll}
              isLoading={isLoading}
              currentStep={activeSession.qa.step}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
              <div className="size-16 rounded-3xl bg-primary/20 border border-primary/30 flex items-center justify-center text-3xl">✨</div>
              <h2 className="text-xl font-black uppercase tracking-tight text-gradient">Your AI Stylist</h2>
              <p className="text-slate-400 text-sm max-w-xs">Start a new chat and get a fire outfit suggestion from top to bottom!</p>
              <Button3D onClick={handleNewChat}>
                <ICONS.Plus size={16} /> Start Styling
              </Button3D>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {hasOutfit && (
          <div className="mt-3 flex gap-2 flex-wrap justify-end shrink-0">
            <Button3D onClick={handleARMirror}>
              <ICONS.Camera size={16} /> Try in AR 🔥
            </Button3D>
            <Button3D variant="glass" onClick={handleSaveOutfit}>
              <ICONS.Heart size={16} /> Save Outfit
            </Button3D>
            <Button3D variant="glass" onClick={handleShop}>
              <ICONS.ShoppingBag size={16} /> Shop Similar
            </Button3D>
          </div>
        )}

        {saveStatus && (
          <p className="mt-2 text-xs text-slate-300 text-right shrink-0">{saveStatus}</p>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function findWardrobeMatches(suggestedItems: string[], wardrobeItems: WardrobeItemRecord[]) {
  const normalizedSuggestions = suggestedItems.map((i) => i.toLowerCase());
  return wardrobeItems
    .filter((wi) => {
      const haystack = [wi.name, wi.category, wi.color || '', ...(wi.tags || [])].join(' ').toLowerCase();
      return normalizedSuggestions.some((s) =>
        s.split(/\s+/).filter((w) => w.length > 2).some((kw) => haystack.includes(kw))
      );
    })
    .slice(0, 3)
    .map((wi) => ({
      title: wi.name,
      subtitle: [wi.category, wi.color].filter(Boolean).join(' · '),
      imageUrl: wi.image_url,
    }));
}

function buildShoppingQuery(base: string, gender?: string): string {
  const b = String(base || '').trim();
  const g = String(gender || '').toLowerCase();
  if (!b) return b;
  if (/male|man|men|boy/.test(g)) {
    return b
      .replace(/women|woman|womens|female|ladies|girls/gi, 'men')
      .replace(/dupatta|stole/gi, 'nehru jacket')
      .replace(/kurti/gi, 'kurta') + ' for men';
  }
  if (/female|woman|women|girl|lady/.test(g)) return `${b} for women`;
  return b;
}
