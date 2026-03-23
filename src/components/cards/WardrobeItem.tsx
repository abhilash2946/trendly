import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../../types';
import type { WardrobeItemRecord, WardrobeCategory, WardrobeSubCategory } from '../../types';
import { SUBCATEGORIES } from '../../types';

const CATEGORIES: WardrobeCategory[] = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 'Accessories'];

const COLOR_DOTS: Record<string, string> = {
  black: '#111',
  white: '#f5f5f5',
  gray: '#9ca3af',
  blue: '#3b82f6',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  brown: '#92400e',
  beige: '#d2b48c',
  pink: '#ec4899',
  orange: '#f97316',
  purple: '#a855f7',
  navy: '#1e3a5f',
  cream: '#fffdd0',
};

interface WardrobeItemProps {
  item: WardrobeItemRecord;
  onDelete?: (id: string) => Promise<void>;
  onUpdate?: (id: string, updates: Partial<Pick<WardrobeItemRecord, 'name' | 'category' | 'sub_category' | 'color' | 'tags'>>) => Promise<WardrobeItemRecord | undefined>;
}

export const WardrobeItem: React.FC<WardrobeItemProps> = ({ item, onDelete, onUpdate }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editName, setEditName] = useState(item.name);
  const [editCategory, setEditCategory] = useState<WardrobeCategory>(item.category);
  const [editSubCategory, setEditSubCategory] = useState<WardrobeSubCategory | null>(item.sub_category || null);
  const [editColor, setEditColor] = useState(item.color || '');
  const [editTags, setEditTags] = useState((item.tags || []).join(', '));

  const openModal = () => {
    setEditName(item.name);
    setEditCategory(item.category);
    setEditSubCategory(item.sub_category || null);
    setEditColor(item.color || '');
    setEditTags((item.tags || []).join(', '));
    setEditing(false);
    setModalOpen(true);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(item.id);
      setModalOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(item.id, {
        name: editName.trim() || item.name,
        category: editCategory,
        sub_category: editSubCategory,
        color: editColor.trim() || null,
        tags: editTags.split(',').map(t => t.trim()).filter(Boolean),
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const dotColor = COLOR_DOTS[(editColor || item.color || '').toLowerCase()] || '#6b7280';

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        whileHover={{ y: -5 }}
        className="group cursor-pointer"
        onClick={openModal}
      >
        <div className="relative aspect-[3/4] rounded-3xl overflow-hidden mb-3 glass border-white/5 transition-all group-hover:border-primary/30">
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-80 group-hover:opacity-100"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-bg-dark/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="absolute bottom-4 left-3 right-3 flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
            {(item.tags || []).slice(0, 3).map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-lg bg-primary/90 text-white text-[8px] font-black uppercase tracking-widest">{tag}</span>
            ))}
          </div>

          <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-all">
            <button
              onClick={(e) => { e.stopPropagation(); openModal(); }}
              className="size-9 glass rounded-xl flex items-center justify-center text-white hover:bg-primary/30 transition-colors"
              title="View details"
            >
              <ICONS.Edit3 size={14} />
            </button>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                className="size-9 glass rounded-xl flex items-center justify-center text-rose-400 hover:bg-rose-500/20 transition-colors"
                title="Delete"
              >
                <ICONS.Trash2 size={14} />
              </button>
            )}
          </div>

          {item.color && (
            <div className="absolute top-3 left-3">
              <div
                className="size-4 rounded-full border-2 border-white/30 shadow-lg"
                style={{ backgroundColor: dotColor }}
                title={item.color}
              />
            </div>
          )}
        </div>
        <h3 className="font-bold text-sm tracking-tight truncate">{item.name}</h3>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{item.sub_category || item.category}</p>
      </motion.div>

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setModalOpen(false)}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 24 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="relative w-full max-w-2xl glass-morphism rounded-[36px] overflow-hidden border-white/10 flex flex-col md:flex-row"
              onClick={e => e.stopPropagation()}
            >
              {/* Image panel */}
              <div className="relative w-full md:w-2/5 aspect-[3/4] md:aspect-auto flex-shrink-0 overflow-hidden">
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 flex flex-col gap-1">
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-primary/80 text-white w-fit">
                    {item.sub_category || item.category}
                  </span>
                  {item.sub_category && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-secondary/70 text-white w-fit">
                      {item.sub_category}
                    </span>
                  )}
                </div>
              </div>

              {/* Info / Edit panel */}
              <div className="flex-1 flex flex-col p-7 gap-5 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {editing ? (
                      <input
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xl font-black tracking-tight text-white focus:outline-none focus:border-primary/60 transition-colors"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        maxLength={60}
                      />
                    ) : (
                      <h2 className="text-2xl font-black tracking-tight truncate">{item.name}</h2>
                    )}
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                      Added {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="size-9 rounded-xl glass flex items-center justify-center text-slate-400 hover:text-white flex-shrink-0 transition-colors"
                  >
                    <ICONS.X size={18} />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Category</label>
                  {editing ? (
                    <div className="flex flex-wrap gap-2">
                      {CATEGORIES.map(cat => (
                        <button
                          key={cat}
                          onClick={() => { setEditCategory(cat); setEditSubCategory(null); }}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${editCategory === cat ? 'bg-primary text-white' : 'glass text-slate-400 hover:text-white'}`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-3 py-1.5 rounded-lg glass text-xs font-black uppercase tracking-widest text-slate-300">
                        {item.category}
                      </span>
                      {item.sub_category && (
                        <span className="px-3 py-1.5 rounded-lg bg-secondary/20 border border-secondary/30 text-xs font-black uppercase tracking-widest text-secondary">
                          {item.sub_category}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {editing && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Subcategory</label>
                    <div className="flex flex-wrap gap-2">
                      {SUBCATEGORIES[editCategory].map(sub => (
                        <button
                          key={sub}
                          onClick={() => setEditSubCategory(sub)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${editSubCategory === sub ? 'bg-secondary/80 text-white' : 'glass text-slate-400 hover:text-white'}`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Color</label>
                  {editing ? (
                    <div className="flex items-center gap-3">
                      <div className="size-7 rounded-full border-2 border-white/20 flex-shrink-0 transition-colors" style={{ backgroundColor: COLOR_DOTS[editColor?.toLowerCase()] || '#6b7280' }} />
                      <input
                        className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60 transition-colors"
                        value={editColor}
                        onChange={e => setEditColor(e.target.value)}
                        placeholder="e.g. black, navy, beige..."
                        maxLength={30}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {item.color && (
                        <div className="size-5 rounded-full border-2 border-white/20" style={{ backgroundColor: dotColor }} />
                      )}
                      <span className="text-sm font-bold text-slate-300 capitalize">{item.color || '—'}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Tags</label>
                  {editing ? (
                    <input
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/60 transition-colors"
                      value={editTags}
                      onChange={e => setEditTags(e.target.value)}
                      placeholder="casual, summer, formal... (comma separated)"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {(item.tags || []).length > 0
                        ? item.tags.map(tag => (
                            <span key={tag} className="px-2.5 py-1 rounded-lg bg-primary/15 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                              {tag}
                            </span>
                          ))
                        : <span className="text-slate-600 text-xs">No tags</span>
                      }
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-2 flex items-center gap-3 flex-wrap">
                  {editing ? (
                    <>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-primary rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <ICONS.Check size={15} />
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                      <button
                        onClick={() => setEditing(false)}
                        className="px-5 py-3 glass rounded-2xl text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {onUpdate && (
                        <button
                          onClick={() => setEditing(true)}
                          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 glass rounded-2xl text-white text-xs font-black uppercase tracking-widest hover:border-primary/40 hover:text-primary transition-colors border border-white/10"
                        >
                          <ICONS.Edit3 size={14} />
                          Edit Details
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-black uppercase tracking-widest hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                        >
                          <ICONS.Trash2 size={14} />
                          {deleting ? 'Removing...' : 'Delete'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
