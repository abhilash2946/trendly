import { useEffect, useRef, useState, useCallback } from 'react';
import { ICONS } from '../types';
import { useWardrobe } from '../hooks/useWardrobe';
import { getCurrentUser, saveGeneratedLook } from '../lib/supabaseData';
import type { WardrobeItemRecord } from '../types';

type AppMode = 'live' | 'tryon';

interface PreviewLook {
  dataUrl: string;
  label: string;
}

const TRYON_SERVER = 'http://127.0.0.1:8001';

export default function ARMirror() {
  const { items, loading: wardrobeLoading } = useWardrobe();

  const [mode, setMode] = useState<AppMode>('live');
  const [selectedItem, setSelectedItem] = useState<WardrobeItemRecord | null>(null);

  // Live AR state
  const [cameraActive, setCameraActive] = useState(false);
  const [poseLoaded, setPoseLoaded] = useState(false);

  // AI Try-On state
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [generatedResult, setGeneratedResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [tryOnMethod, setTryOnMethod] = useState<string | null>(null);

  // Preview modal
  const [previewLook, setPreviewLook] = useState<PreviewLook | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [serverBackend, setServerBackend] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const poseRef = useRef<any>(null);
  const cameraUtilRef = useRef<any>(null);
  const landmarksRef = useRef<any>(null);
  const dressImgRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef<number>(0);

  // Auto-select first item
  useEffect(() => {
    if (!wardrobeLoading && items.length > 0 && !selectedItem) {
      setSelectedItem(items[0]);
    }
  }, [items, wardrobeLoading]);

  // Check server backend on mount
  useEffect(() => {
    fetch(`${TRYON_SERVER}/health`)
      .then(r => r.json())
      .then(d => setServerBackend(d.active_backend ?? null))
      .catch(() => setServerBackend(null));
  }, []);

  // Pre-load dress image when item changes
  useEffect(() => {
    if (selectedItem?.image_url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedItem.image_url;
      img.onload = () => { dressImgRef.current = img; };
    } else {
      dressImgRef.current = null;
    }
  }, [selectedItem]);

  // Load MediaPipe via CDN on mount
  useEffect(() => {
    const loadScript = (src: string): Promise<void> =>
      new Promise((res) => {
        if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => res();
        s.onerror = () => res();
        document.head.appendChild(s);
      });

    (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
      setPoseLoaded(true);
    })();

    return () => stopCamera();
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !video.videoWidth) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const dress = dressImgRef.current;
    if (!dress) return;

    const landmarks = landmarksRef.current;
    const w = canvas.width;
    const h = canvas.height;

    let dx: number, dy: number, dressW: number, dressH: number;

    if (landmarks) {
      const ls = landmarks[11];
      const rs = landmarks[12];
      const lh = landmarks[23];
      const rh = landmarks[24];

      if (ls && rs && lh && rh &&
          ls.visibility > 0.3 && rs.visibility > 0.3) {
        const shoulderCx = ((ls.x + rs.x) / 2) * w;
        const shoulderY = ((ls.y + rs.y) / 2) * h;
        const hipY = ((lh.y + rh.y) / 2) * h;
        const shoulderSpan = Math.abs(rs.x - ls.x) * w;
        const torsoH = Math.max(50, hipY - shoulderY);

        dressW = Math.max(80, shoulderSpan * 1.85);
        dressH = Math.max(100, torsoH * 1.7);
        dx = shoulderCx - dressW / 2;
        dy = shoulderY - dressH * 0.13;
      } else {
        // Partial landmarks — fallback
        dressW = w * 0.54; dressH = h * 0.60;
        dx = (w - dressW) / 2; dy = h * 0.13;
      }
    } else {
      dressW = w * 0.54; dressH = h * 0.60;
      dx = (w - dressW) / 2; dy = h * 0.13;
    }

    // ── Draw with soft feathered ellipse mask ──────────────────────────────
    // 1. Draw dress onto an offscreen canvas
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const offCtx = off.getContext('2d')!;
    offCtx.drawImage(dress, dx, dy, dressW, dressH);

    // 2. Use destination-in with a radial gradient ellipse → soft edges
    offCtx.globalCompositeOperation = 'destination-in';
    const cx = dx + dressW / 2;
    const cy = dy + dressH / 2;
    const rx = dressW * 0.46;
    const ry = dressH * 0.47;

    // Elliptical gradient: save/restore + scale trick
    offCtx.save();
    offCtx.translate(cx, cy);
    offCtx.scale(1, ry / rx);  // squash to circle
    const grad = offCtx.createRadialGradient(0, 0, rx * 0.55, 0, 0, rx);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    offCtx.fillStyle = grad;
    offCtx.beginPath();
    offCtx.arc(0, 0, rx, 0, Math.PI * 2);
    offCtx.fill();
    offCtx.restore();
    offCtx.globalCompositeOperation = 'source-over';

    // 3. Composite onto main canvas with slight multiply blend for realism
    ctx.globalAlpha = 0.90;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(off, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // 4. Add a second pass at lower opacity to restore brightness
    ctx.globalAlpha = 0.55;
    ctx.drawImage(off, 0, 0);
    ctx.globalAlpha = 1;
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const win = window as any;
      if (win.Pose && win.Camera) {
        const pose = new win.Pose({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
        });
        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        pose.onResults((results: any) => {
          landmarksRef.current = results.poseLandmarks ?? null;
          drawOverlay();
        });
        poseRef.current = pose;

        const cam = new win.Camera(videoRef.current, {
          onFrame: async () => {
            if (poseRef.current && videoRef.current) {
              await poseRef.current.send({ image: videoRef.current });
            }
          },
          width: 1280,
          height: 720,
        });
        cam.start();
        cameraUtilRef.current = cam;
      } else {
        // No pose available — run simple overlay loop
        const loop = () => {
          drawOverlay();
          animFrameRef.current = requestAnimationFrame(loop);
        };
        animFrameRef.current = requestAnimationFrame(loop);
      }

      setCameraActive(true);
    } catch {
      setError('Camera access failed. Please allow camera permissions and try again.');
    }
  };

  const stopCamera = () => {
    cancelAnimationFrame(animFrameRef.current);
    cameraUtilRef.current?.stop();
    cameraUtilRef.current = null;
    poseRef.current = null;
    landmarksRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mirror the captured frame to match display
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.restore();

    if (overlay) ctx.drawImage(overlay, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    setPreviewLook({ dataUrl, label: selectedItem?.name || 'AR Look' });
    setSaveMsg(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFile(file);
    setUploadedPhotoUrl(URL.createObjectURL(file));
    setGeneratedResult(null);
    setError(null);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

  const generateTryOn = async () => {
    if (!uploadedFile || !selectedItem) {
      setError('Please upload your photo and select a garment from your closet.');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const personBase64 = await fileToBase64(uploadedFile);

      const clothResp = await fetch(selectedItem.image_url);
      const clothBlob = await clothResp.blob();
      const clothBase64 = await fileToBase64(
        new File([clothBlob], 'cloth.png', { type: clothBlob.type })
      );

      const resp = await fetch(`${TRYON_SERVER}/tryon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_image: personBase64, cloth_image: clothBase64 }),
      });

      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(detail || `Server returned ${resp.status}`);
      }

      const data = await resp.json();
      const resultUrl = String(data.result_image).startsWith('data:')
        ? data.result_image
        : `data:image/png;base64,${data.result_image}`;

      setGeneratedResult(resultUrl);
      setTryOnMethod(data.method ?? null);
      setPreviewLook({ dataUrl: resultUrl, label: selectedItem.name });
      setSaveMsg(null);
    } catch (err: any) {
      const msg = err.message || '';
      setError(
        msg.includes('fetch') || msg.includes('Failed')
          ? 'Try-on server is offline. Start the ar-tryon-server on port 8001 ✨'
          : `Generation failed: ${msg}`
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (type: 'wardrobe' | 'download') => {
    if (!previewLook) return;

    if (type === 'download') {
      const a = document.createElement('a');
      a.href = previewLook.dataUrl;
      a.download = `trendly-look-${Date.now()}.png`;
      a.click();
      return;
    }

    setIsSaving(true);
    setSaveMsg(null);
    try {
      const user = await getCurrentUser();
      if (!user) throw new Error('Please sign in to save looks.');
      await saveGeneratedLook({
        userId: user.id,
        dataUrl: previewLook.dataUrl,
        prompt: previewLook.label,
        source: 'ar-mirror',
      });
      setSaveMsg('Saved to your profile! ✨');
    } catch (err: any) {
      setSaveMsg(err.message || 'Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const switchMode = (next: AppMode) => {
    stopCamera();
    setGeneratedResult(null);
    setUploadedPhotoUrl(null);
    setUploadedFile(null);
    setError(null);
    setTryOnMethod(null);
    setMode(next);
  };

  return (
    <div className="flex flex-col gap-8 h-full">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">AR Mirror</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">
            See yourself in any outfit — live or AI-generated ✨
          </p>
        </div>

        <div className="flex gap-2 glass p-2 rounded-2xl">
          <button
            onClick={() => switchMode('live')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              mode === 'live'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ICONS.Camera size={14} /> Live AR
          </button>
          <button
            onClick={() => switchMode('tryon')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
              mode === 'tryon'
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ICONS.Sparkles size={14} /> AI Try-On
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-xs text-rose-200 font-medium">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Viewport */}
        <div className="lg:col-span-3 relative rounded-[40px] overflow-hidden bg-black border border-white/10 min-h-[520px]">

          {/* LIVE AR */}
          {mode === 'live' && (
            <>
              {!cameraActive ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center">
                  <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center text-primary mb-6 animate-pulse">
                    <ICONS.Camera size={48} />
                  </div>
                  <h2 className="text-3xl font-black mb-3 uppercase tracking-tighter">Live AR Mirror</h2>
                  <p className="text-slate-400 max-w-sm mb-2 text-sm leading-relaxed">
                    Real-time body tracking overlays selected outfits on your live camera feed.
                  </p>
                  <p className="text-xs mb-8 text-slate-600">
                    {poseLoaded ? '✅ Body tracking ready' : '⏳ Loading body tracking...'}
                  </p>
                  <button
                    onClick={startCamera}
                    disabled={!poseLoaded}
                    className="bg-primary text-white px-12 py-5 rounded-2xl font-black uppercase tracking-widest text-lg neon-glow-primary hover:scale-105 transition-all disabled:opacity-50"
                  >
                    Start AR Mirror
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                    playsInline
                    muted
                  />
                  <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ transform: 'scaleX(-1)' }}
                  />

                  {!selectedItem && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 glass px-5 py-2 rounded-2xl border border-white/10 text-xs font-bold text-slate-300 whitespace-nowrap">
                      👉 Select a garment from My Closet
                    </div>
                  )}

                  {selectedItem && (
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 glass px-5 py-2 rounded-2xl border border-white/10 text-xs font-bold text-white whitespace-nowrap flex items-center gap-2">
                      <div
                        className="size-3 rounded-full border border-white/20"
                        style={{ backgroundColor: selectedItem.color?.toLowerCase() || '#888' }}
                      />
                      {selectedItem.name}
                    </div>
                  )}

                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
                    <button
                      onClick={captureFrame}
                      className="bg-white text-black px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-all flex items-center gap-2 shadow-2xl"
                    >
                      <ICONS.Camera size={18} /> Capture
                    </button>
                  </div>

                  <button
                    onClick={stopCamera}
                    className="absolute top-6 right-6 size-12 glass rounded-2xl flex items-center justify-center text-white hover:bg-white/10 transition-all border border-white/10"
                  >
                    <ICONS.X size={18} />
                  </button>
                </>
              )}
            </>
          )}

          {/* AI TRY-ON */}
          {mode === 'tryon' && (
            <div className="absolute inset-0 p-8 flex flex-col gap-5">
              <div className="flex gap-4">
                <label className="flex-1 glass border border-white/10 hover:bg-white/10 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer transition-all text-center flex items-center justify-center gap-2">
                  {uploadedPhotoUrl ? (
                    <><ICONS.Check size={14} className="text-primary" /> Photo Loaded</>
                  ) : (
                    <><ICONS.Image size={14} /> Upload Your Photo</>
                  )}
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>

                <button
                  onClick={generateTryOn}
                  disabled={isGenerating || !uploadedFile || !selectedItem}
                  className="flex-1 bg-primary text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-40 neon-glow-primary transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <><ICONS.Sparkles size={14} /> Generate Try-On</>
                  )}
                </button>
              </div>

              {(!uploadedFile || !selectedItem) && (
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest">
                  {!uploadedFile && <span className="text-rose-400/60">① Upload a photo of yourself</span>}
                  {!selectedItem && <span className="text-rose-400/60">② Select a garment from closet →</span>}
                </div>
              )}

              <div className="flex-1 rounded-3xl overflow-hidden border border-white/10 bg-slate-900/50 flex items-center justify-center relative">
                {isGenerating ? (
                  <div className="flex flex-col items-center gap-5">
                    <div className="size-14 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <div className="text-center">
                      <p className="text-sm font-black uppercase tracking-widest text-primary animate-pulse">
                        Fitting your outfit...
                      </p>
                      <p className="text-xs text-slate-500 mt-2">Detecting body & placing garment 🔥</p>
                    </div>
                  </div>
                ) : generatedResult ? (
                  <>
                    <img src={generatedResult} className="w-full h-full object-contain" alt="Try-on result" />
                    {tryOnMethod && (
                      <div className="absolute top-4 left-4 glass px-3 py-1.5 rounded-xl border border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-300 flex items-center gap-1.5">
                        {tryOnMethod === 'replicate-idm-vton' && <><span className="size-2 rounded-full bg-green-400 inline-block"/>AI · IDM-VTON</>}
                        {tryOnMethod === 'local-idm-vton'    && <><span className="size-2 rounded-full bg-blue-400 inline-block"/>Local IDM-VTON</>}
                        {tryOnMethod === 'opencv-fallback'   && <><span className="size-2 rounded-full bg-yellow-400 inline-block"/>OpenCV · Upgrade for AI</>}
                      </div>
                    )}
                    <button
                      onClick={() => { setSaveMsg(null); setPreviewLook({ dataUrl: generatedResult, label: selectedItem?.name || 'Try-On Look' }); }}
                      className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white text-black px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-2xl flex items-center gap-2"
                    >
                      <ICONS.Zap size={13} /> Save / Download
                    </button>
                  </>
                ) : uploadedPhotoUrl ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img src={uploadedPhotoUrl} className="w-full h-full object-contain opacity-40" alt="Your photo" />
                    <div className="absolute text-center pointer-events-none">
                      <p className="text-white font-black text-sm">
                        {selectedItem ? '✨ Ready! Hit Generate Try-On' : 'Select a dress from closet →'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-10">
                    <ICONS.Image size={52} className="mx-auto mb-4 text-slate-700" />
                    <p className="text-slate-500 text-sm font-medium">Upload your photo & select a dress</p>
                    <p className="text-slate-700 text-xs mt-2">The AI will dress you in your chosen outfit</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">
          <div className="glass-morphism p-6 rounded-[32px] border border-white/5 flex-1 flex flex-col min-h-0">
            <h3 className="text-sm font-black uppercase tracking-widest mb-5 text-primary flex items-center gap-2">
              <ICONS.Shirt size={16} /> My Closet
            </h3>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              {wardrobeLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary" />
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">No items yet</p>
                  <p className="text-xs text-slate-600 mt-2">Add clothes to your wardrobe first 👗</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`group relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                        selectedItem?.id === item.id
                          ? 'border-primary scale-95 shadow-lg shadow-primary/25'
                          : 'border-transparent opacity-60 hover:opacity-100 hover:border-white/20'
                      }`}
                    >
                      <img src={item.image_url} className="w-full h-full object-cover" alt={item.name} />
                      {selectedItem?.id === item.id && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <div className="size-8 rounded-full bg-primary flex items-center justify-center">
                            <ICONS.Check className="text-white" size={16} />
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedItem && (
              <div className="mt-4 pt-4 border-t border-white/5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Wearing</p>
                <p className="text-sm font-bold text-white truncate">{selectedItem.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {[selectedItem.color, selectedItem.category].filter(Boolean).join(' • ')}
                </p>
              </div>
            )}
          </div>

          <div className="glass p-5 rounded-3xl border border-white/5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">
              {mode === 'live' ? '🎥 Live AR Mode' : '✨ AI Try-On Mode'}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              {mode === 'live'
                ? 'Uses MediaPipe body tracking to overlay your wardrobe clothes on your live camera feed in real time.'
                : 'Upload your photo, select a garment, and the AI server will realistically dress you in it.'}
            </p>
            {mode === 'tryon' && (
              <>
                {serverBackend ? (
                  <p className="text-[9px] mt-2 leading-relaxed font-medium flex items-center gap-1.5">
                    <span className={`size-2 rounded-full inline-block ${
                      serverBackend === 'replicate' ? 'bg-green-400' :
                      serverBackend === 'local-idm-vton' ? 'bg-blue-400' : 'bg-yellow-400'
                    }`}/>
                    <span className={
                      serverBackend === 'opencv-fallback' ? 'text-yellow-400/80' : 'text-primary/70'
                    }>
                      {serverBackend === 'replicate' && 'AI mode: Replicate IDM-VTON'}
                      {serverBackend === 'local-idm-vton' && 'AI mode: Local IDM-VTON'}
                      {serverBackend === 'opencv-fallback' && 'Fallback mode — set REPLICATE_API_TOKEN for AI quality'}
                    </span>
                  </p>
                ) : (
                  <p className="text-[9px] text-rose-400/70 mt-2 font-medium">⚠️ Server offline — start ar-tryon-server first</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview / Save Modal */}
      {previewLook && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          onClick={(e) => { if (e.target === e.currentTarget) { setPreviewLook(null); setSaveMsg(null); } }}
        >
          <div className="glass-morphism rounded-[40px] p-8 max-w-md w-full border border-white/10 flex flex-col gap-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter">Your Look ✨</h3>
                <p className="text-slate-400 text-xs mt-1 truncate">{previewLook.label}</p>
              </div>
              <button
                onClick={() => { setPreviewLook(null); setSaveMsg(null); }}
                className="size-10 glass rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all border border-white/10"
              >
                <ICONS.X size={15} />
              </button>
            </div>

            <div className="rounded-3xl overflow-hidden bg-black/40 aspect-[3/4]">
              <img src={previewLook.dataUrl} className="w-full h-full object-contain" alt="Captured look" />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleSave('wardrobe')}
                disabled={isSaving}
                className="flex-1 py-4 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <ICONS.Heart size={13} />
                )}
                {isSaving ? 'Saving...' : 'Save to Profile'}
              </button>
              <button
                onClick={() => handleSave('download')}
                className="flex-1 py-4 glass border border-white/10 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
              >
                <ICONS.ArrowRight size={13} className="-rotate-90" />
                Download
              </button>
            </div>

            {saveMsg && (
              <p className={`text-center text-xs font-bold ${saveMsg.includes('aved') ? 'text-primary' : 'text-rose-400'}`}>
                {saveMsg}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
