import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ICONS } from '../types';

export default function Landing() {
  return (
    <div className="relative min-h-screen flex flex-col bg-bg-dark overflow-x-hidden">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-bg-dark/70 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 group cursor-pointer">
            <div className="p-2 bg-primary rounded-lg text-white neon-glow-primary">
              <ICONS.Sparkles className="size-5" />
            </div>
            <span className="text-2xl font-black tracking-tighter text-white uppercase">Trendly</span>
          </div>
          <div className="hidden md:flex items-center gap-10">
            <a className="text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors" href="#features">Features</a>
            <a className="text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors" href="#studio">Studio</a>
            <a className="text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors" href="#community">Community</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden sm:block text-sm font-bold uppercase tracking-widest text-white hover:text-primary transition-colors">Log In</Link>
            <Link to="/auth" className="bg-primary hover:scale-105 text-white px-6 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all neon-glow-primary">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 overflow-hidden min-h-screen flex items-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(188,22,254,0.15)_0%,transparent_70%)] pointer-events-none"></div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="text-left z-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-8"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              The Future of Fashion is Here
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[0.9]"
            >
              Elevate Your <br/>Style with <br/><span className="text-gradient">AI Power</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg md:text-xl text-slate-400 mb-10 max-w-lg font-medium leading-relaxed"
            >
              Experience the evolution of style with Trendly's immersive 3D fashion avatars and hyper-personalized neural recommendations.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <Link to="/auth" className="bg-primary text-white px-10 py-5 rounded-2xl text-lg font-black uppercase tracking-widest transition-all neon-glow-primary flex items-center gap-3 hover:scale-105">
                Try Now <ICONS.ArrowRight className="size-6" />
              </Link>
              <Link to="/dashboard" className="glass hover:bg-white/10 text-white px-10 py-5 rounded-2xl text-lg font-black uppercase tracking-widest transition-all">
                Explore
              </Link>
            </motion.div>
          </div>

          {/* 3D Visual Section */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotateY: 20 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ delay: 0.4, duration: 1 }}
            className="relative perspective hidden lg:block"
          >
            <div className="relative w-full aspect-[4/5] rounded-[60px] overflow-hidden glass-morphism border-white/10 group">
              <img
                className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-1000"
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop"
                alt="AI Avatar"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-transparent to-transparent opacity-60"></div>

              <div className="absolute bottom-10 left-10 right-10">
                <div className="glass p-6 rounded-3xl border-white/10 backdrop-blur-3xl animate-float">
                  <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em] mb-2">Active Model</p>
                  <p className="text-2xl font-black text-white">CYBER-MUSE V.4</p>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex -space-x-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="size-8 rounded-full border-2 border-bg-dark overflow-hidden">
                          <img src={`https://picsum.photos/seed/user-${i}/100/100`} alt="user" />
                        </div>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-slate-400">+12k styles</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating UI Elements */}
            <div className="absolute -top-10 -right-10 glass p-5 rounded-2xl border-secondary/20 animate-pulse-glow">
              <ICONS.Sparkles className="text-secondary size-8" />
            </div>
            <div className="absolute top-1/2 -left-20 glass p-5 rounded-2xl border-primary/20 animate-float" style={{ animationDelay: '1s' }}>
              <ICONS.Brain className="text-primary size-8" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-primary font-black text-sm uppercase tracking-[0.4em] mb-4">Core Technology</h2>
            <h3 className="text-5xl md:text-6xl font-black tracking-tighter">The Future of Wardrobe</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: ICONS.Sparkles, title: "AI Stylist", color: "primary", desc: "Your personal stylist available 24/7. Deep neural analysis for your unique body type and style DNA." },
              { icon: ICONS.Shirt, title: "Smart Wardrobe", color: "secondary", desc: "Digitize your actual closet with a single scan. Automatic categorization and outfit matching." },
              { icon: ICONS.Zap, title: "AR Mirror", color: "rose-400", desc: "Try on anything instantly. Realistic cloth physics and real-time motion tracking." }
            ].map((f, i) => (
              <div key={i} className="perspective">
                <div className="glass-morphism p-10 rounded-[40px] group hover:border-white/20 transition-all card-3d">
                  <div className={`size-16 rounded-2xl bg-${f.color}/10 flex items-center justify-center text-${f.color} mb-8 group-hover:scale-110 transition-transform`}>
                    <f.icon className="size-8" />
                  </div>
                  <h4 className="text-2xl font-black mb-4">{f.title}</h4>
                  <p className="text-slate-400 leading-relaxed font-medium">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-32 pb-10 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="p-2 bg-primary rounded-lg text-white">
              <ICONS.Sparkles className="size-6" />
            </div>
            <span className="text-3xl font-black tracking-tighter text-white uppercase">Trendly</span>
          </div>
          <p className="text-slate-500 max-w-md mx-auto mb-12 font-medium">
            Redefining style for the digital era through advanced AI and immersive 3D technology.
          </p>
          <div className="flex justify-center gap-8 mb-20">
            {['Twitter', 'Instagram', 'Discord', 'LinkedIn'].map(s => (
              <a key={s} href="#" className="text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-primary transition-colors">{s}</a>
            ))}
          </div>
          <div className="pt-10 border-t border-white/5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">
            © 2024 Trendly AI Technologies Inc. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
