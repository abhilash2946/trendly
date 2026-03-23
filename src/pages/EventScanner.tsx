import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ICONS } from '../types';
import { supabase } from '../lib/supabaseClient';
import { extractTextFromInvitation, generateEventOutfitIdeas, parseEventDetailsFromText } from '../lib/localAI';
import { useWardrobe } from '../hooks/useWardrobe';
import { searchShoppingPlatforms } from '../lib/shoppingSearch';
import { setAssistantRecommendation } from '../lib/trendlySession';

export default function EventScanner() {
  const navigate = useNavigate();
  const [isScanning, setIsScanning] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [ocrText, setOcrText] = useState('');
  const [outfitIdeas, setOutfitIdeas] = useState<string[]>([]);
  const [webIdeas, setWebIdeas] = useState<string[]>([]);
  const [source, setSource] = useState<'wardrobe' | 'web'>('web');
  const [error, setError] = useState<string | null>(null);
  const [savedEvents, setSavedEvents] = useState<any[]>([]);
  const { items } = useWardrobe();

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setSavedEvents(data);
  };

  const startScan = async () => {
    if (!uploadFile && !manualText.trim()) {
      setError('Upload an invitation image or paste invitation text first');
      return;
    }
    setError(null);
    setIsScanning(true);
    try {
      const extractedText = uploadFile ? await extractTextFromInvitation(uploadFile) : '';
      const combinedText = [manualText.trim(), extractedText].filter(Boolean).join('\n');
      setOcrText(extractedText);
      const parsed = await parseEventDetailsFromText(combinedText);
      const result = {
        event_type: parsed.event_type || 'General Event',
        location: parsed.location || 'Unknown',
        dress_code: parsed.dress_code || 'Smart Casual',
        match: 'AI Parsed',
        date: new Date().toISOString().split('T')[0],
      };

      const wardrobeSummary =
        source === 'wardrobe'
          ? items.slice(0, 12).map(i => `${i.category} ${i.color || ''} ${i.name}`).join(', ')
          : `${result.event_type} ${result.dress_code} outfit suggestions`;

      const ideas = await generateEventOutfitIdeas({
        eventType: result.event_type,
        dressCode: result.dress_code,
        wardrobeSummary,
      });
      setOutfitIdeas(ideas.slice(0, 6));
      setAssistantRecommendation({
        query: `${result.event_type} ${result.dress_code}`,
        summary: ideas[0] || `${result.event_type} ${result.dress_code}`,
        source: 'event-scanner',
        created_at: new Date().toISOString(),
      });

      if (source === 'web') {
        const shopping = await searchShoppingPlatforms(`${result.event_type} ${result.dress_code}`);
        setWebIdeas(shopping.slice(0, 3).map(p => `${p.source}: ${p.title}`));
      } else {
        setWebIdeas([]);
      }

      setScanResult(result);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('events').insert([{
          user_id: user.id,
          event_type: result.event_type,
          location: result.location,
          dress_code: result.dress_code,
          recommended_outfit: ideas[0] || 'Wardrobe suggestion available',
          date: result.date,
        }]);
        fetchEvents();
      }
    } catch (scanError: any) {
      setError(scanError.message || 'Unable to scan invitation');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Event Scanner</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">AI Context Analysis for Event Invites</p>
        </div>
        <button
          onClick={startScan}
          disabled={isScanning}
          className="bg-primary text-white px-10 py-5 rounded-[24px] font-black uppercase tracking-widest text-sm neon-glow-primary flex items-center gap-3 hover:scale-105 transition-all disabled:opacity-50"
        >
          {isScanning ? <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <ICONS.Scan size={24} />}
          Start Scanning
        </button>
      </div>

      <div className="glass rounded-3xl p-5 border-white/10 flex flex-col sm:flex-row sm:items-center gap-4">
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          className="text-sm flex-1"
        />
        <textarea
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="Or paste invitation text here"
          className="flex-1 min-h-24 rounded-2xl bg-white/5 border border-white/10 px-4 py-3 text-sm"
        />
        <div className="flex gap-2">
          <button
            onClick={() => setSource('web')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${source === 'web' ? 'bg-primary text-white' : 'glass text-slate-400'}`}
          >
            Web
          </button>
          <button
            onClick={() => setSource('wardrobe')}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${source === 'wardrobe' ? 'bg-primary text-white' : 'glass text-slate-400'}`}
          >
            My Wardrobe
          </button>
        </div>
        {error && <p className="text-rose-400 text-xs">{error}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        {/* Scanner Viewport */}
        <div className="relative aspect-video lg:aspect-square rounded-[60px] glass-morphism overflow-hidden border-white/5 bg-black">
          {isScanning ? (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-primary/5 animate-pulse"></div>
              <div className="w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_20px_rgba(188,22,254,1)] animate-[scan_2s_ease-in-out_infinite] absolute"></div>
              <ICONS.Zap className="text-primary size-20 animate-pulse-glow" />
              <p className="mt-8 text-primary font-black uppercase tracking-[0.4em] animate-pulse">Analyzing Context...</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center group">
               <div className="size-32 rounded-full glass border-2 border-dashed border-white/10 flex items-center justify-center text-slate-600 group-hover:text-primary group-hover:border-primary/40 transition-all mb-8">
                  <ICONS.Plus size={48} />
               </div>
               <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter">Upload Invitation</h3>
               <p className="text-slate-500 max-w-xs font-medium leading-relaxed">Drop your event flyer, invite or ticket here to get AI-curated outfit suggestions.</p>
            </div>
          )}

          <img src="https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=1000&auto=format&fit=crop" className="w-full h-full object-cover opacity-20" alt="Invite" />
        </div>

        {/* Results & Suggestions */}
        <div className="space-y-8">
          <AnimatePresence mode="wait">
            {scanResult ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="glass-morphism p-10 rounded-[40px] border-white/5 space-y-8"
              >
                 <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black uppercase tracking-widest text-primary">Analysis Results</h3>
                    <div className="glass px-3 py-1 rounded-lg text-[10px] font-black text-emerald-400 border-emerald-400/20 uppercase tracking-widest">Confidence {scanResult.match}</div>
                 </div>

                 <div className="grid grid-cols-2 gap-6">
                    <div>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Event Type</p>
                       <p className="text-lg font-black">{scanResult.event_type}</p>
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Location</p>
                       <p className="text-lg font-black">{scanResult.location}</p>
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Theme</p>
                        <p className="text-lg font-black text-primary">{scanResult.dress_code}</p>
                    </div>
                    <div>
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Dress Code</p>
                        <p className="text-lg font-black">{scanResult.dress_code}</p>
                    </div>
                 </div>

                 <div className="pt-8 border-t border-white/5">
                    <h4 className="text-sm font-black uppercase tracking-widest mb-6">
                      Curated Suggestions ({source === 'wardrobe' ? 'From Wardrobe' : 'From Web'})
                    </h4>
                    <div className="space-y-3">
                      {outfitIdeas.map((idea, index) => (
                        <div key={idea + index} className="glass p-4 rounded-2xl border-white/5 flex items-start justify-between gap-3">
                          <p className="text-sm flex-1">{index + 1}. {idea}</p>
                          <button
                            onClick={() => {
                              navigate(`/ar-mirror?suggestion=${encodeURIComponent(idea)}&summary=${encodeURIComponent(scanResult.event_type)}`);
                            }}
                            className="shrink-0 glass px-3 py-1 rounded-lg text-[10px] font-black text-primary border-primary/20 uppercase tracking-widest hover:bg-primary/10 transition-all"
                          >
                            Try AR
                          </button>
                        </div>
                      ))}
                      {webIdeas.map((idea, index) => (
                        <div key={idea + index} className="glass p-4 rounded-2xl border-primary/20 flex items-start justify-between gap-3">
                          <p className="text-xs text-primary flex-1">Web pick: {idea}</p>
                          <button
                            onClick={() => {
                              navigate(`/ar-mirror?suggestion=${encodeURIComponent(idea)}&summary=${encodeURIComponent(scanResult.event_type)}`);
                            }}
                            className="shrink-0 glass px-3 py-1 rounded-lg text-[10px] font-black text-primary border-primary/20 uppercase tracking-widest hover:bg-primary/10 transition-all"
                          >
                            Try AR
                          </button>
                        </div>
                      ))}
                    </div>
                 </div>
              </motion.div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="glass p-10 rounded-[40px] border-white/5 text-center flex flex-col items-center justify-center py-20">
                   <div className="size-20 rounded-2xl bg-white/5 flex items-center justify-center text-slate-600 mb-6">
                      <ICONS.Info size={32} />
                   </div>
                   <p className="text-slate-400 font-medium">Results will appear here after scanning</p>
                   {ocrText && <p className="text-slate-500 mt-4 text-xs">OCR: {ocrText.slice(0, 220)}...</p>}
                </div>

                {savedEvents.length > 0 && (
                   <div className="glass-morphism p-8 rounded-[40px] border-white/5">
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-6 text-slate-500">Recent Events</h3>
                      <div className="space-y-4">
                         {savedEvents.slice(0, 3).map((event: any) => (
                           <div key={event.id} className="flex items-center justify-between p-4 glass rounded-2xl">
                              <div>
                                 <p className="text-sm font-black uppercase">{event.event_type}</p>
                                 <p className="text-[10px] text-slate-500 font-bold">{new Date(event.date).toLocaleDateString()}</p>
                              </div>
                              <ICONS.ChevronRight className="text-slate-600" size={16} />
                           </div>
                         ))}
                      </div>
                   </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <style>{`
        @keyframes scan {
          0%, 100% { top: 10%; opacity: 0; }
          50% { opacity: 1; top: 50%; }
          90% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
