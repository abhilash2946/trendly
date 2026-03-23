import { type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/utils';

interface Button3DProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'glass';
  children: ReactNode;
}

export const Button3D = ({ variant = 'primary', children, className, ...props }: Button3DProps) => {
  const variants = {
    primary: 'bg-primary text-white neon-glow-primary',
    secondary: 'bg-secondary text-white neon-glow-secondary',
    glass: 'glass-morphism text-white border-white/10 hover:bg-white/10',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05, translateY: -2 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-3',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};
