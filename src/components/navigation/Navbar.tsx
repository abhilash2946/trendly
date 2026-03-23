import { Link, useLocation } from 'react-router-dom';
import { ICONS } from '../../types';
import { cn } from '../../lib/utils';

export const Navbar = () => {
  const location = useLocation();

  const navItems = [
    { id: 'dashboard', label: 'Home', path: '/dashboard', icon: ICONS.LayoutDashboard },
    { id: 'wardrobe', label: 'Closet', path: '/wardrobe', icon: ICONS.Shirt },
    { id: 'ai-stylist', label: 'Stylist', path: '/ai-stylist', icon: ICONS.MessageSquare, center: true },
    { id: 'planner', label: 'Planner', path: '/planner', icon: ICONS.Calendar },
    { id: 'profile', label: 'Profile', path: '/profile', icon: ICONS.User },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-dark/80 backdrop-blur-2xl border-t border-white/5 pb-8 pt-3 px-6">
      <div className="flex justify-between items-center max-w-md mx-auto">
        {navItems.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={cn(
              "flex flex-col items-center gap-1 transition-all relative",
              item.center
                ? "bg-primary text-white p-4 rounded-2xl -mt-14 neon-glow-primary"
                : location.pathname === item.path ? "text-primary" : "text-slate-500"
            )}
          >
            <item.icon size={24} />
            {!item.center && <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>}
          </Link>
        ))}
      </div>
    </nav>
  );
};
