import React from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  color?: string;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ icon: Icon, title, description, color = 'primary' }) => {
  return (
    <div className="perspective">
      <motion.div
        whileHover={{
          y: -10,
          rotateX: 8,
          rotateY: 8,
          transition: { duration: 0.4, ease: "easeOut" }
        }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-8 group cursor-pointer border-white/5 hover:border-primary/30 transition-all card-3d"
      >
        <div className={`size-16 rounded-2xl bg-${color}/10 flex items-center justify-center text-${color} mb-6 group-hover:scale-110 transition-transform`}>
          <Icon size={32} />
        </div>
        <h3 className="text-2xl font-black mb-3">{title}</h3>
        <p className="text-slate-400 font-medium leading-relaxed">{description}</p>
      </motion.div>
    </div>
  );
};
