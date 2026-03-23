import React, { useState, useEffect } from 'react';
import { ICONS } from '../types';
import { supabase } from '../lib/supabaseClient';
import { analyzeFaceAndSkin, applyHairstyleToFace, suggestHairstyles } from '../lib/localAI';

export default function HairstyleStudio() {
  const [selectedStyle, setSelectedStyle] = useState('');
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [bodyImage, setBodyImage] = useState<File | null>(null);
  const [previewFace, setPreviewFace] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ faceShape: string; skinTone: string } | null>(null);
  const [suggestedStyles, setSuggestedStyles] = useState<string[]>([]);
  const [generatedFacePreview, setGeneratedFacePreview] = useState<string | null>(null);
  const [generatedBodyPreview, setGeneratedBodyPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedStyles, setSavedStyles] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSavedStyles();
  }, []);

  const fetchSavedStyles = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('hairstyles')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) setSavedStyles(data);
  };

  const saveStyle = async (styleName: string) => {
    setSelectedStyle(styleName);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('hairstyles').insert([{
        user_id: user.id,
        name: styleName
      }]);
      fetchSavedStyles();
    }
  };

  const runAnalysis = async () => {
    if (!faceImage || !bodyImage) return;
    setLoading(true);
    setError(null);
    try {
      const face = await analyzeFaceAndSkin(faceImage);
      setAnalysis(face);
      const styles = await suggestHairstyles(face.faceShape, face.skinTone);
      setSuggestedStyles(styles);
      if (styles[0]) {
        setSelectedStyle(styles[0]);
      }
    } catch (analysisError: any) {
      setError(analysisError.message || 'Unable to analyze the uploaded images');
    } finally {
      setLoading(false);
    }
  };

  const applyStylePreview = async (styleName: string) => {
    if (!faceImage || !bodyImage) return;
    setLoading(true);
    setError(null);
    try {
      const [faceOutput, bodyOutput] = await Promise.all([
        applyHairstyleToFace(faceImage, styleName),
        applyHairstyleToFace(bodyImage, styleName)
      ]);
      setGeneratedFacePreview(faceOutput);
      setGeneratedBodyPreview(bodyOutput);
      await saveStyle(styleName);
    } catch (previewError: any) {
      setError(previewError.message || 'Unable to generate hairstyle preview');
    } finally {
      setLoading(false);
    }
  };

  const handleFaceUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setFaceImage(file);
    setPreviewFace(file ? URL.createObjectURL(file) : null);
  };

  const handleBodyUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setBodyImage(file);
    setPreviewBody(file ? URL.createObjectURL(file) : null);
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Hairstyle Studio</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">3D Hair synthesis & face mapping</p>
        </div>
        <div className="flex gap-3">
          <button onClick={runAnalysis} disabled={loading || !faceImage || !bodyImage} className="bg-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm neon-glow-primary flex items-center gap-3 hover:scale-105 transition-all disabled:opacity-50">
            <ICONS.Scissors size={20} /> Analyze Face
          </button>
        </div>
      </div>

      <div className="glass rounded-3xl p-6 border-white/10 grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-xs uppercase tracking-widest text-slate-400 font-black">
          Full Face Image
          <input type="file" accept="image/*" onChange={handleFaceUpload} className="block mt-2 text-sm" />
        </label>
        <label className="text-xs uppercase tracking-widest text-slate-400 font-black">
          Full Body Image
          <input type="file" accept="image/*" onChange={handleBodyUpload} className="block mt-2 text-sm" />
        </label>
      </div>
      {error && <p className="text-rose-400 text-sm">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        <div className="relative aspect-square rounded-[60px] glass-morphism overflow-hidden border-white/5 group">
          <img
            src={generatedFacePreview || previewFace || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=1000&auto=format&fit=crop'}
            className="w-full h-full object-cover opacity-80"
            alt="Main Preview"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-transparent to-transparent opacity-60"></div>

          <div className="absolute top-10 left-10">
            <div className="glass px-4 py-2 rounded-full flex items-center gap-3 text-primary border-primary/20 animate-pulse-glow">
              <span className="flex h-2 w-2 rounded-full bg-primary"></span>
              <span className="text-[10px] font-black uppercase tracking-widest">Face Analysis Active</span>
            </div>
          </div>

          <div className="absolute bottom-10 left-10 right-10 flex items-end justify-between">
            <div className="glass p-6 rounded-3xl border-white/10 backdrop-blur-3xl">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Detected Shape</p>
              <p className="text-2xl font-black text-white">{analysis ? `${analysis.faceShape} / ${analysis.skinTone}` : 'Run analysis'}</p>
            </div>
            <button onClick={() => selectedStyle && applyStylePreview(selectedStyle)} className="size-16 rounded-2xl bg-primary text-white flex items-center justify-center neon-glow-primary hover:scale-110 transition-all">
              <ICONS.RotateCcw size={28} />
            </button>
          </div>
        </div>

        {/* Style Selection */}
        <div className="space-y-8">
          <div className="glass-morphism p-10 rounded-[40px] border-white/5">
            <h3 className="text-lg font-black uppercase tracking-widest mb-8 text-primary">Recommended Styles</h3>
            <div className="grid grid-cols-2 gap-6">
              {suggestedStyles.map(style => (
                <button
                  key={style}
                  onClick={() => applyStylePreview(style)}
                  className={`flex flex-col gap-4 group p-3 rounded-3xl transition-all ${selectedStyle === style ? 'glass-morphism border-primary/40' : 'hover:bg-white/5 border-transparent'}`}
                >
                  <div className="aspect-square rounded-2xl overflow-hidden glass border-white/5 relative">
                    <img src={previewBody || previewFace || `https://picsum.photos/seed/${encodeURIComponent(style)}/400/400`} alt={style} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" />
                    {selectedStyle === style && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <ICONS.Check className="text-white" size={24} />
                      </div>
                    )}
                  </div>
                  <p className={`text-xs font-black uppercase tracking-widest text-center ${selectedStyle === style ? 'text-primary' : 'text-slate-500'}`}>{style}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="glass p-8 rounded-[40px] border-white/5">
         <h3 className="text-sm font-black uppercase tracking-widest mb-6 text-primary">Body Preview</h3>
         <div className="aspect-[4/5] rounded-3xl overflow-hidden border border-white/10 mb-6">
           <img
            src={generatedBodyPreview || previewBody || previewFace || 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop'}
            className="w-full h-full object-cover"
            alt="Body Preview"
            referrerPolicy="no-referrer"
           />
         </div>
             <h3 className="text-sm font-black uppercase tracking-widest mb-6 text-slate-500">History</h3>
             <div className="flex gap-4 overflow-x-auto no-scrollbar">
                {savedStyles.map((s, i) => (
                   <div key={i} className="flex-shrink-0 px-4 py-2 glass rounded-full text-[10px] font-black uppercase tracking-widest border-white/5">
                      {s.name}
                   </div>
                ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
