import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ICONS } from '../types';
import { supabase } from '../lib/supabaseClient';

export default function Auth() {
  const navigate = useNavigate();

  // Redirect to dashboard after successful Google login
  React.useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        navigate('/dashboard');
      }
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [navigate]);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        alert('Check your email for the confirmation link!');
      }
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
     try {
       const { error } = await supabase.auth.signInWithOAuth({
         provider: 'google',
       });
       if (error) throw error;
     } catch (err: any) {
       setError(err.message);
     }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-bg-dark overflow-hidden">
      {/* Background Image Layer */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-bg-dark via-bg-dark/80 to-primary/20 z-10"></div>
        <img
          className="w-full h-full object-cover opacity-40"
          src="https://images.unsplash.com/photo-1539109136881-3be0616acf4b?q=80&w=1000&auto=format&fit=crop"
          alt="Auth Background"
        />
      </div>

      {/* Main Container */}
      <div className="relative z-20 w-full max-w-6xl px-6 flex flex-col lg:flex-row items-center justify-center gap-16">
        {/* Left Side: Branding */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="hidden lg:flex flex-col gap-8 max-w-lg"
        >
          <div className="flex items-center gap-3">
            <div className="size-12 bg-primary rounded-2xl flex items-center justify-center neon-glow-primary">
              <ICONS.Sparkles className="text-white size-7" />
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-white uppercase">Trendly</h1>
          </div>
          <h2 className="text-6xl font-black leading-[0.9] text-white tracking-tighter">
            THE FUTURE OF <br/><span className="text-gradient">FASHION</span> IS HERE.
          </h2>
          <p className="text-slate-400 text-xl font-medium leading-relaxed">
            Access exclusive 3D collections, neural AI stylists, and a global community of trendsetters.
          </p>
          <div className="flex gap-8 items-center mt-4">
            <div className="flex -space-x-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="size-12 rounded-full border-4 border-bg-dark overflow-hidden">
                  <img src={`https://picsum.photos/seed/auth-user-${i}/100/100`} alt="user" />
                </div>
              ))}
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">+50k Joined</p>
          </div>
        </motion.div>

        {/* Right Side: Auth Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-[500px]"
        >
          <div className="glass-morphism rounded-[40px] p-10 shadow-2xl border-white/10">
            <div className="flex flex-col gap-3 mb-10">
              <h3 className="text-3xl font-black tracking-tighter uppercase text-white">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h3>
              <p className="text-slate-500 font-medium">
                {isLogin ? 'Enter your credentials to access your studio' : 'Join the evolution of digital fashion today'}
              </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="flex items-center justify-center gap-3 glass hover:bg-white/10 rounded-2xl py-4 transition-all"
                >
                  <ICONS.Zap className="size-5 text-primary" />
                  <span className="text-xs font-black uppercase tracking-widest text-white">Google</span>
                </button>
                <button type="button" className="flex items-center justify-center gap-3 glass hover:bg-white/10 rounded-2xl py-4 transition-all">
                  <ICONS.Check className="size-5 text-secondary" />
                  <span className="text-xs font-black uppercase tracking-widest text-white">Apple</span>
                </button>
              </div>

              <div className="relative flex py-4 items-center">
                <div className="flex-grow border-t border-white/5"></div>
                <span className="flex-shrink mx-4 text-slate-600 text-[10px] font-black uppercase tracking-[0.3em]">or</span>
                <div className="flex-grow border-t border-white/5"></div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                  <div className="relative">
                    <ICONS.MessageSquare className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      required
                      className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all font-medium"
                      placeholder="alex@trendly.ai"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center ml-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                    {isLogin && <button type="button" className="text-[10px] text-primary font-black uppercase tracking-widest hover:underline">Forgot?</button>}
                  </div>
                  <div className="relative">
                    <ICONS.Zap className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                      required
                      className="w-full pl-14 pr-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder:text-slate-700 focus:outline-none focus:border-primary/50 transition-all font-medium"
                      placeholder="••••••••"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl neon-glow-primary transition-all flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Get Started')} <ICONS.ArrowRight size={20} />
              </button>

              <div className="text-center mt-8">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                  {isLogin ? "Don't have an account?" : "Already have an account?"}
                  <button
                    type="button"
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-primary ml-2 hover:underline"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </form>
          </div>
        </motion.div>
      </div>

      {/* Decorative Blur */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] -z-10 translate-x-1/2 -translate-y-1/2"></div>
      <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-[150px] -z-10 -translate-x-1/4 translate-y-1/4"></div>
    </div>
  );
}
