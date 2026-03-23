import React from 'react';
import { motion } from 'framer-motion';
import { ICONS } from '../../types';

interface OutfitCardProps {
  image: string;
  name: string;
  comboType: string;
  score: number;
  isSaved?: boolean;
  index?: number;
  onLike?: () => void;
  onRefresh?: () => void;
  onClick?: () => void;
}

export const OutfitCard: React.FC<OutfitCardProps> = ({
  image, name, comboType, score, isSaved = false, index = 0, onLike, onRefresh, onClick,
}) => {
  return (
    <div className="perspective">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04 }}
        whileHover={{ y: -8, rotateX: 4, rotateY: 4 }}
        className="glass-card overflow-hidden border-white/5 group card-3d cursor-pointer"
        onClick={onClick}
      >
        <div className="relative aspect-[4/5] overflow-hidden">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700 group-hover:opacity-100"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          {/* Like button */}
          <div className="absolute top-4 right-4">
            <button
              onClick={e => { e.stopPropagation(); onLike?.(); }}
              className={`size-10 glass rounded-xl flex items-center justify-center transition-all hover:scale-110 ${isSaved ? 'bg-rose-500/20 border-rose-500/40' : 'hover:bg-rose-500/10'}`}
            >
              <ICONS.Heart size={18} className={isSaved ? 'text-rose-500 fill-rose-500' : 'text-white'} />
            </button>
          </div>

          {/* Score badge */}
          <div className="absolute bottom-4 left-4">
            <div className="glass px-3 py-1 rounded-lg text-[10px] font-black text-primary uppercase border-primary/20 tracking-widest">
              {score}% match
            </div>
          </div>

          {/* Click hint */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="glass px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white border-white/20">
              View Details
            </div>
          </div>
        </div>

        <div className="p-5 flex justify-between items-end">
          <div className="space-y-0.5 flex-1 min-w-0 pr-3">
            <h3 className="text-base font-black tracking-tight truncate">{name}</h3>
            <p className="text-xs font-bold text-slate-400 truncate">{comboType}</p>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onRefresh?.(); }}
            className="size-11 bg-primary text-white rounded-xl flex items-center justify-center neon-glow-primary hover:scale-110 transition-all flex-shrink-0"
          >
            <ICONS.Scan size={18} />
          </button>
        </div>
      </motion.div>
    </div>
  );
};
