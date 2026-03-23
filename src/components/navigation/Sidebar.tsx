import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ICONS } from '../../types';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabaseClient';

const sidebarItems = [
  { group: 'Main', items: [
    { label: 'Dashboard', path: '/dashboard', icon: ICONS.LayoutDashboard },
    { label: 'AI Stylist', path: '/ai-stylist', icon: ICONS.Sparkles },
    { label: 'Outfit Generator', path: '/outfit-generator', icon: ICONS.Brain },
  ]},
  { group: 'Studio', items: [
    { label: 'Smart Wardrobe', path: '/wardrobe', icon: ICONS.Shirt },
    { label: 'AR Mirror', path: '/ar-mirror', icon: ICONS.Zap },
    { label: 'Hairstyle Studio', path: '/hairstyle-studio', icon: ICONS.Scissors },
  ]},
  { group: 'Discovery', items: [
    { label: 'Event Scanner', path: '/event-scanner', icon: ICONS.Scan },
    { label: 'Outfit Planner', path: '/planner', icon: ICONS.Calendar },
    { label: 'Shopping', path: '/shopping', icon: ICONS.ShoppingBag },
  ]},
];

export const Sidebar = () => {
  const location = useLocation();
  const [displayName, setDisplayName] = useState('Trendly User');
  const [avatarSeed, setAvatarSeed] = useState('trendly-user');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const fallbackName = user.email?.split('@')[0] || 'Trendly User';
      setDisplayName(fallbackName);
      setAvatarSeed(user.email || fallbackName);

      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      if (data?.username) {
        setDisplayName(data.username);
      }
    };

    load();
  }, []);

  return (
    <aside className="hidden lg:flex w-72 flex-col border-r border-white/5 bg-bg-dark/40 backdrop-blur-3xl p-6 gap-8">
      <Link to="/dashboard" className="flex items-center gap-3 px-2">
        <div className="size-10 bg-primary rounded-xl flex items-center justify-center neon-glow-primary">
          <ICONS.Sparkles className="text-white size-6" />
        </div>
        <span className="text-2xl font-black tracking-tighter uppercase text-gradient">Trendly</span>
      </Link>

      <nav className="flex-1 flex flex-col gap-8 overflow-y-auto no-scrollbar">
        {sidebarItems.map((group) => (
          <div key={group.group} className="flex flex-col gap-2">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-4">
              {group.group}
            </h3>
            {group.items.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all group",
                  location.pathname === item.path
                    ? "glass-morphism text-primary border-primary/20"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("size-5", location.pathname === item.path ? "text-primary" : "group-hover:text-primary transition-colors")} />
                <span className="font-bold text-sm">{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="pt-6 border-t border-white/5">
        <Link
          to="/profile"
          className="flex items-center gap-3 p-3 rounded-2xl glass hover:bg-white/10 transition-all"
        >
          <div className="size-10 rounded-full border-2 border-primary/30 p-0.5 overflow-hidden">
            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}`} alt="Avatar" className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{displayName}</p>
            <p className="text-[10px] text-primary font-bold uppercase">Stylist</p>
          </div>
          <ICONS.LogOut className="text-slate-500 size-4 hover:text-rose-500 transition-colors" />
        </Link>
      </div>
    </aside>
  );
};
