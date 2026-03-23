import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS, WardrobeCategory, WardrobeSubCategory, SUBCATEGORIES } from '../types';
import { useWardrobe } from '../hooks/useWardrobe';
import { UploadBox } from '../components/ui/UploadBox';
import { WardrobeItem } from '../components/cards/WardrobeItem';
import { SearchBar } from '../components/ui/SearchBar';
import { Button3D } from '../components/ui/Button3D';
import { Modal } from '../components/ui/Modal';
import { supabase } from '../lib/supabaseClient';
import { classifyWardrobeImage } from '../lib/localAI';

export default function SmartWardrobe() {
  const [activeCategory, setActiveCategory] = useState<WardrobeCategory | 'All'>('All');
  const [activeSubCategory, setActiveSubCategory] = useState<WardrobeSubCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [reclassifying, setReclassifying] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  const {
    getItemsByCategory,
    searchItems,
    addClothing,
    removeClothing,
    updateClothing,
    refreshItems,
    loading: loadingItems,
    requiresAuth,
    error: wardrobeError,
  } = useWardrobe();

  const categories: Array<WardrobeCategory | 'All'> = ['All', 'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories'];
  const subCategories: Array<WardrobeSubCategory | 'All'> =
    activeCategory === 'All' ? ['All'] : ['All', ...SUBCATEGORIES[activeCategory]];
  const categoryFiltered = getItemsByCategory(activeCategory);
  const subCategoryFiltered = activeSubCategory === 'All'
    ? categoryFiltered
    : categoryFiltered.filter(item => item.sub_category === activeSubCategory);
  const filteredItems = searchItems(searchQuery, subCategoryFiltered);

  // Upload a single blob (file) to storage and insert wardrobe record
  const uploadBlob = async (blob: File, result: import('../lib/localAI').ClassifyResult, baseName: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');
    const fileExt = blob.name.split('.').pop() || (blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg');
    const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('wardrobe-images')
      .upload(filePath, blob, { contentType: blob.type || undefined, upsert: false });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from('wardrobe-images').getPublicUrl(filePath);
    await addClothing({
      image_url: publicUrl,
      category: activeCategory === 'All' ? result.category : activeCategory,
      sub_category: result.sub_category,
      color: result.color,
      tags: result.tags,
      name: baseName,
    });
  };

  const uploadSingleFile = async (file: File): Promise<void> => {
    const results = await classifyWardrobeImage(file);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    if (results.length === 1) {
      // Normal single-garment upload — use the original image
      await uploadBlob(file, results[0], baseName);
    } else {
      // Multi-garment split — re-crop original image and upload each piece
      const img = await createImageBitmap(file);
      const splitY = Math.floor(img.height * 0.42);
      const crops: [number, number, number, number, string][] = [
        [0, 0, img.width, splitY, baseName + ' (Top)'],
        [0, splitY, img.width, img.height - splitY, baseName + ' (Bottom)'],
      ];
      for (let i = 0; i < crops.length; i++) {
        const [sx, sy, sw, sh, name] = crops[i];
        const c = document.createElement('canvas');
        c.width = sw; c.height = sh;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const cropMime = file.type || 'image/webp';
        const cropExt  = cropMime.split('/')[1] || 'webp';
        const cropBlob = await new Promise<File>(res =>
          c.toBlob(b => res(new File([b!], `${name}.${cropExt}`, { type: cropMime })), cropMime, 0.92)
        );
        await uploadBlob(cropBlob, results[i] ?? results[0], name);
      }
    }
  };

  const handleUpload = async (files: FileList | File[] | null) => {
    if (requiresAuth) {
      setError('Please sign in to upload wardrobe items.');
      return;
    }

    if (uploading) return;
    const queuedFiles = files ? Array.from(files) : [];
    if (queuedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    const total = queuedFiles.length;
    let completed = 0;
    const errors: string[] = [];
    for (let i = 0; i < total; i++) {
      const file = queuedFiles[i];
      if (!file || typeof file.name !== 'string') {
        errors.push(`File at index ${i} is invalid or undefined.`);
        continue;
      }
      setUploadProgress(`Uploading ${i + 1} of ${total}: ${file.name}`);
      try {
        await uploadSingleFile(file);
        completed++;
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }
    setUploading(false);
    setUploadProgress('');
    await refreshItems();
    if (errors.length > 0) {
      setError(`${completed}/${total} uploaded. Errors: ${errors.join('; ')}`);
    } else {
      setIsUploadModalOpen(false);
    }
  };

  // Load an image from any URL (including Supabase WebP thumbnails) by drawing
  // it onto a canvas at full resolution, then exporting as JPEG File.
  // This bypasses the tiny-thumbnail problem — we get the actual rendered pixels.
  const loadImageAsFile = (url: string, name: string): Promise<File> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Use natural dimensions but cap at 600px to keep it fast
        const maxDim = 600;
        const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width  = Math.round(img.naturalWidth  * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no canvas context')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('canvas toBlob failed')); return; }
          resolve(new File([blob], name + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      // Add cache-bust to force fresh load and avoid stale tiny thumbnails
      img.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    });

  const handleReclassify = async () => {
    if (requiresAuth) {
      setError('Please sign in to reclassify wardrobe items.');
      return;
    }

    if (reclassifying) return;
    setReclassifying(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');
      
      const { data: items, error: fetchError } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', user.id);
        
      if (fetchError) throw fetchError;
      if (!items || items.length === 0) {
        setReclassifying(false);
        return;
      }

      let completed = 0;
      const errors: string[] = [];

      for (const item of items) {
        setUploadProgress(`Reclassifying ${item.name}... (${completed + 1}/${items.length})`);
        try {
          // Load image via HTMLImageElement — handles WebP, works cross-origin with Supabase public URLs
          const file = await loadImageAsFile(item.image_url, item.name);
          const results = await classifyWardrobeImage(file);
          const classified = results[0];

          const { error: updateError } = await supabase
            .from('wardrobe_items')
            .update({
              category: classified.category,
              sub_category: classified.sub_category,
              color: classified.color,
              tags: classified.tags
            })
            .eq('id', item.id);

          if (updateError) throw updateError;
          completed++;
        } catch (err: any) {
          console.error(`[Fix Categories] ERROR for ${item.name}:`, err);
          errors.push(`${item.name}: ${err.message}`);
        }
      }
      await refreshItems();
      if (errors.length > 0) {
        setError(`Reclassified ${completed} items. Errors: ${errors.join('; ')}`);
      } else {
        setUploadProgress(`Successfully reclassified ${completed} items.`);
        setTimeout(() => setUploadProgress(''), 3000);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReclassifying(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Smart Wardrobe</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">Manage and digitize your actual closet ✨</p>
        </div>
        <div className="flex gap-3">
          <Button3D
            variant="glass"
            className="p-4"
            onClick={() => {
              setActiveCategory('All');
              setSearchQuery('');
              setError(null);
            }}
          >
            <ICONS.Filter size={20} />
          </Button3D>
          <Button3D onClick={() => setIsUploadModalOpen(true)} disabled={requiresAuth}>
            <ICONS.Camera size={20} /> Upload Piece
          </Button3D>
        </div>
      </div>

      <section className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-primary to-secondary rounded-[40px] blur opacity-10"></div>
        <div className="relative glass-morphism p-10 rounded-[40px] flex flex-col md:flex-row items-center gap-10 overflow-hidden">
          <div className="relative z-10 flex-1 space-y-4 text-left">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
              AI Vision Scanning Active
            </div>
            <h2 className="text-4xl font-black leading-tight tracking-tighter uppercase">Digitize Your <br/>Entire Wardrobe</h2>
            <p className="text-slate-400 font-medium max-w-md">Our advanced vision AI identifies colors, fabrics, and styles instantly. Just snap and style.</p>
            {requiresAuth && <p className="text-amber-300 text-xs">Sign in to access wardrobe scanning and uploads.</p>}
            {wardrobeError && !requiresAuth && (
               <div className="text-rose-400 text-xs font-bold bg-rose-400/10 p-3 rounded-xl border border-rose-400/20">
                 {wardrobeError}
               </div>
            )}
            <div className="flex gap-4 pt-4">
              <Button3D className="px-8 py-4 text-xs" onClick={() => setIsUploadModalOpen(true)} disabled={requiresAuth}>Start Scanning</Button3D>
              <Button3D
                variant="primary"
                className="px-8 py-4 text-xs flex gap-2"
                onClick={handleReclassify}
                disabled={reclassifying || requiresAuth}
              >
                <ICONS.Wand2 size={16} />
                {reclassifying ? 'Fixing...' : 'Fix Categories'}
              </Button3D>
              <Button3D
                variant="glass"
                className="px-8 py-4 text-xs"
                onClick={() => bulkInputRef.current?.click()}
                disabled={requiresAuth}
              >
                Bulk Import
                <input
                  ref={bulkInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const selectedFiles = Array.from(e.target.files || []);
                    e.target.value = '';
                    handleUpload(selectedFiles);
                  }}
                />
              </Button3D>
            </div>
          </div>
          <div className="relative w-full md:w-1/2 aspect-video rounded-3xl overflow-hidden glass border-white/10 group card-3d">
            <img
              className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
              src="https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?q=80&w=1000&auto=format&fit=crop"
              alt="Clothing rack"
              referrerPolicy="no-referrer"
            />
            <div className="absolute bottom-6 left-6 glass-morphism p-4 rounded-2xl flex items-center gap-3 animate-float">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse"></div>
              <span className="text-xs font-black uppercase tracking-widest">Linen Blazer Detected</span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-2">
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setActiveSubCategory('All'); }}
                  className={`px-6 py-2.5 rounded-full text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeCategory === cat ? 'bg-primary text-white neon-glow-primary' : 'glass text-slate-500 hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {activeCategory !== 'All' && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {subCategories.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setActiveSubCategory(sub as WardrobeSubCategory | 'All')}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeSubCategory === sub ? 'bg-secondary/80 text-white' : 'glass text-slate-600 hover:text-slate-300 border border-white/5'}`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>
          <SearchBar placeholder="Search by color, category, or name..." onSearch={setSearchQuery} />
        </div>

        {/* Section 5: Loading state and fallback UI */}
        {loadingItems ? (
           <div className="flex flex-col items-center justify-center p-20 gap-4">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
             <p className="text-sm font-black uppercase tracking-widest text-slate-500 animate-pulse">Loading wardrobe...</p>
           </div>
        ) : filteredItems.length === 0 && searchQuery === '' && activeCategory === 'All' ? (
          <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed border-white/5 rounded-[40px] bg-white/[0.02]">
            <div className="size-20 rounded-3xl bg-white/5 flex items-center justify-center text-slate-700 mb-6">
              <ICONS.Shirt size={40} />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tighter mb-2">No wardrobe items yet</h3>
            <p className="text-slate-500 max-w-xs mb-8">Start by uploading some photos of your clothes to digitize your closet!</p>
            <Button3D onClick={() => setIsUploadModalOpen(true)}>Upload Your First Piece</Button3D>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredItems.map((item) => (
                <WardrobeItem
                  key={item.id}
                  item={item}
                  onDelete={removeClothing}
                  onUpdate={updateClothing}
                />
              ))}
            </AnimatePresence>

            <motion.button
              onClick={() => setIsUploadModalOpen(true)}
              disabled={requiresAuth}
              className="aspect-[3/4] rounded-3xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center text-slate-500 hover:text-primary hover:border-primary/40 transition-all group"
            >
              <div className="size-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ICONS.Plus size={32} />
              </div>
              <span className="text-xs font-black uppercase tracking-widest">Add Piece</span>
            </motion.button>
          </div>
        )}
      </div>

      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} title="Upload Piece">
        {requiresAuth && (
          <div className="mb-4 text-center text-amber-300 text-sm">Please sign in to upload wardrobe items.</div>
        )}
        <UploadBox onUpload={handleUpload} />
        {uploading && (
          <div className="mt-4 text-center text-primary font-bold animate-pulse text-sm">
            {uploadProgress || 'Uploading to Vault...'}
          </div>
        )}
        {error && (
          <div className="mt-4 text-center text-rose-400 text-sm font-bold bg-rose-400/10 p-3 rounded-xl">{error}</div>
        )}
        {!error && !uploading && (
          <div className="mt-4 text-center text-slate-400 text-sm">
            AI will detect the clothing category and dominant color for every uploaded image.
          </div>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button3D variant="glass" onClick={() => setIsUploadModalOpen(false)} disabled={uploading}>Cancel</Button3D>
        </div>
      </Modal>
    </div>
  );
}
