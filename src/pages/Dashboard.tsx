import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Sparkles,
  Scan, 
  TrendingUp,
  Shirt,
  BarChart3
} from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { SystemStatusPanel } from '../components/ui/SystemStatusPanel';

// Section 7: Simplified Feature Cards
const features = [
  { 
    title: 'AI Stylist',
    desc: 'Chat with your Gen-Z fashion bestie for fire outfit advice ✨',
    icon: Sparkles,
    color: 'text-primary',
    bg: 'bg-primary/20',
    path: '/ai-stylist'
  },
  { 
    title: 'Virtual Try-On',
    desc: 'See how you look in any outfit instantly with AR Mirror 🔥',
    icon: Scan, 
    color: 'text-blue-400', 
    bg: 'bg-blue-400/20',
    path: '/ar-mirror'
  },
  { 
    title: 'My Wardrobe', 
    desc: 'Digitize and organize your actual closet in seconds 👗',
    icon: Shirt, 
    color: 'text-purple-400', 
    bg: 'bg-purple-400/20',
    path: '/wardrobe'
  },
];

export default function Dashboard() {
  const [stats, setStats] = useState({
    itemsCount: 0,
    outfitsCount: 0,
    eventsCount: 0,
    loading: true
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setStats({ itemsCount: 0, outfitsCount: 0, eventsCount: 0, loading: false });
          return;
        }

        const [items, outfits, events] = await Promise.all([
          supabase.from('wardrobe_items').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('outfits').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('events').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        ]);

        setStats({
          itemsCount: items.count || 0,
          outfitsCount: outfits.count || 0,
          eventsCount: events.count || 0,
          loading: false
        });
      } catch {
        setStats({ itemsCount: 0, outfitsCount: 0, eventsCount: 0, loading: false });
      }
    }

    fetchStats();
  }, []);

  return (
    <div className="relative min-h-full flex flex-col">
      <SystemStatusPanel />

      {/* 3D Interactive Space */}
      <div className="flex-1 relative flex items-center justify-center min-h-[600px]">
        {/* Decorative background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10"></div>
        
        {/* Center Avatar Container */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 group"
        >
          <div className="w-64 md:w-80 h-[400px] md:h-[500px] relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-primary/20 rounded-full blur-2xl opacity-50"></div>
            <img 
              className="w-full h-full object-contain relative z-10 drop-shadow-[0_0_30px_rgba(188,22,254,0.4)] transition-transform duration-500 group-hover:scale-105" 
              src="https://picsum.photos/seed/avatar-3d/800/1200" 
              alt="3D Avatar"
              referrerPolicy="no-referrer"
            />
            {/* Base Platform */}
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-64 h-12 bg-primary/20 rounded-[100%] blur-xl holographic-glow"></div>
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-48 h-4 border border-primary/40 rounded-[100%]"></div>
          </div>
        </motion.div>

        {/* Floating Feature Cards */}
        <div className="absolute inset-0 pointer-events-none">
          {features.map((feature, i) => {
            const angle = (i * (360 / features.length)) * (Math.PI / 180);
            const radius = 320;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: 0, y: 0 }}
                animate={{ opacity: 1, x, y }}
                transition={{ delay: i * 0.1 + 0.5, type: 'spring' }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
              >
                <Link 
                  to={feature.path}
                  className="glass p-5 rounded-2xl w-56 holographic-glow block hover:scale-105 transition-transform group"
                >
                  <div className={`size-12 rounded-xl ${feature.bg} flex items-center justify-center mb-4 ${feature.color}`}>
                    <feature.icon className="size-6" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">{feature.title}</h3>
                  <p className="text-xs text-slate-400">{feature.desc}</p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Footer Stats Area */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="flex items-center gap-4 p-6 rounded-2xl bg-primary/5 border border-primary/10 glass-card">
          <div className="p-3 rounded-lg bg-primary/20 text-primary">
            <TrendingUp className="size-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Style Score</p>
            <p className="text-2xl font-bold">{stats.loading ? '...' : (stats.outfitsCount * 12 + 400)} <span className="text-xs text-emerald-400 font-normal">+12%</span></p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-6 rounded-2xl bg-primary/5 border border-primary/10 glass-card">
          <div className="p-3 rounded-lg bg-blue-400/20 text-blue-400">
            <Shirt className="size-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Items Logged</p>
            <p className="text-2xl font-bold">{stats.loading ? '...' : stats.itemsCount} <span className="text-xs text-emerald-400 font-normal">Total</span></p>
          </div>
        </div>
        <div className="flex items-center gap-4 p-6 rounded-2xl bg-primary/5 border border-primary/10 glass-card">
          <div className="p-3 rounded-lg bg-purple-400/20 text-purple-400">
            <BarChart3 className="size-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Planned Events</p>
            <div className="flex items-center gap-3">
              <p className="text-2xl font-bold">{stats.loading ? '...' : stats.eventsCount}</p>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary shadow-[0_0_8px_rgba(188,22,254,0.6)] transition-all duration-1000"
                  style={{ width: `${Math.min(stats.eventsCount * 20, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
