import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICONS } from '../types';
import { supabase } from '../lib/supabaseClient';
import { User } from '@supabase/supabase-js';
import { getCurrentCoordinates, reverseGeocode } from '../lib/location';
import { loadUserProfile, saveUserProfile } from '../lib/supabaseData';
import type { ProfileRecord } from '../types';

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState({ items: 0, outfits: 0 });
  const [insights, setInsights] = useState({ palette: 'No wardrobe data', stylePreference: 'Build your wardrobe', matchAccuracy: '0% consistency' });
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    date_of_birth: '',
    gender: '',
    location: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const [items, outfits] = await Promise.all([
          supabase.from('wardrobe_items').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('outfits').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        ]);
        setStats({ items: items.count || 0, outfits: outfits.count || 0 });

        const { data: wardrobeInsightRows } = await supabase
          .from('wardrobe_items')
          .select('color, category')
          .eq('user_id', user.id);

        const profileData = await loadUserProfile(user.id);

        const colors = (wardrobeInsightRows || []).map((row: any) => row.color).filter(Boolean);
        const categories = (wardrobeInsightRows || []).map((row: any) => row.category).filter(Boolean);
        const palette = summarizeMostCommon(colors, 'No wardrobe data');
        const stylePreference = summarizeMostCommon(categories, 'Build your wardrobe');
        const accuracy = items.count ? Math.min(99, Math.max(35, Math.round(((outfits.count || 0) / Math.max(items.count, 1)) * 100))) : 0;
        setInsights({
          palette,
          stylePreference,
          matchAccuracy: `${accuracy}% consistency`
        });

        setProfile({
          username: profileData?.username || user.email?.split('@')[0] || '',
          email: user.email || '',
          date_of_birth: profileData?.date_of_birth || '',
          gender: profileData?.gender || '',
          location: profileData?.location || ''
        });
      }
    }
    getProfile();
  }, []);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setMessage('');

    const payload: ProfileRecord = {
      id: user.id,
      username: profile.username,
      email: profile.email,
      date_of_birth: profile.date_of_birth || null,
      gender: profile.gender || null,
      location: profile.location || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      if (profile.email && profile.email !== user.email) {
        const { error: authError } = await supabase.auth.updateUser({ email: profile.email });
        if (authError) {
          throw authError;
        }
      }

      await saveUserProfile(payload);
      setMessage('Profile saved successfully');
    } catch (saveError: any) {
      setMessage(saveError.message || 'Unable to save profile');
    }
    setSaving(false);
  };

  const detectLocation = async () => {
    try {
      const coords = await getCurrentCoordinates();
      const location = await reverseGeocode(coords.latitude, coords.longitude);
      setProfile((prev) => ({ ...prev, location }));
    } catch (error: any) {
      setMessage(error.message || 'Could not detect location');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Profile</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">Manage your digital style identity</p>
        </div>
        <button className="bg-white/5 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-white/10 border border-white/10 transition-all flex items-center gap-3">
          <ICONS.Settings size={20} /> Settings
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* User Card */}
        <div className="lg:col-span-1 space-y-8">
          <div className="glass-morphism rounded-[40px] p-10 flex flex-col items-center text-center border-white/5">
            <div className="relative mb-8 group cursor-pointer">
              <div className="size-40 rounded-full border-4 border-primary/30 p-1.5 overflow-hidden transition-transform group-hover:scale-105 duration-500">
                <img className="w-full h-full object-cover rounded-full" src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.email || 'default'}`} alt="User" />
              </div>
              <div className="absolute bottom-2 right-2 size-10 rounded-2xl bg-primary text-white flex items-center justify-center border-4 border-bg-dark shadow-lg neon-glow-primary">
                <ICONS.Camera size={20} />
              </div>
            </div>
            <h2 className="text-3xl font-black tracking-tighter uppercase truncate max-w-full">
              {profile.username || user?.email?.split('@')[0] || 'Trendsetter'}
            </h2>
            <p className="text-primary text-xs font-black uppercase tracking-[0.2em] mt-2 mb-8">Creative Director & Stylist</p>

            <div className="grid grid-cols-2 gap-4 w-full">
              <div className="p-5 rounded-3xl glass border-white/5">
                <p className="text-2xl font-black">{stats.items}</p>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Pieces</p>
              </div>
              <div className="p-5 rounded-3xl glass border-white/5">
                <p className="text-2xl font-black">{stats.outfits}</p>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Outfits</p>
              </div>
            </div>
          </div>

          <div className="glass-morphism rounded-[40px] p-8 border-white/5">
             <h3 className="text-sm font-black uppercase tracking-widest mb-6 text-primary">Fashion DNA</h3>
             <div className="space-y-4">
                {[
                  { label: 'Color Palette', val: insights.palette, icon: ICONS.Zap, color: 'text-primary' },
                  { label: 'Style Preference', val: insights.stylePreference, icon: ICONS.Shirt, color: 'text-secondary' },
                  { label: 'Match Accuracy', val: insights.matchAccuracy, icon: ICONS.Sparkles, color: 'text-amber-400' }
                ].map(dna => (
                  <div key={dna.label} className="flex items-center gap-4 p-4 glass rounded-2xl border-white/5">
                    <div className={`size-10 rounded-xl bg-white/5 flex items-center justify-center ${dna.color}`}>
                      <dna.icon size={20} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{dna.label}</p>
                      <p className="text-xs font-bold">{dna.val}</p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>

        {/* Details / Settings */}
        <div className="lg:col-span-2 space-y-8">
           <div className="glass-morphism rounded-[40px] p-10 border-white/5">
              <h3 className="text-xl font-black uppercase tracking-tighter mb-8">Profile Preferences</h3>
              <div className="space-y-4">
                 <div className="w-full flex items-center justify-between p-6 rounded-3xl hover:bg-white/5 transition-all group border border-transparent hover:border-white/10">
                    <div className="flex items-center gap-6">
                      <div className="size-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ICONS.User size={24} />
                      </div>
                      <div className="text-left">
                         <p className="font-black uppercase tracking-widest text-sm text-white">Email Address</p>
                         <input
                          value={profile.email}
                          onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
                          className="mt-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs"
                         />
                      </div>
                    </div>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 glass rounded-3xl">
                    <label className="text-xs uppercase tracking-widest text-slate-500 font-black">
                      Username
                      <input value={profile.username} onChange={(event) => setProfile((prev) => ({ ...prev, username: event.target.value }))} className="mt-2 block w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                    </label>
                    <label className="text-xs uppercase tracking-widest text-slate-500 font-black">
                      Date of Birth
                      <input type="date" value={profile.date_of_birth} onChange={(event) => setProfile((prev) => ({ ...prev, date_of_birth: event.target.value }))} className="mt-2 block w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                    </label>
                    <label className="text-xs uppercase tracking-widest text-slate-500 font-black">
                      Gender
                      <input value={profile.gender} onChange={(event) => setProfile((prev) => ({ ...prev, gender: event.target.value }))} className="mt-2 block w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                    </label>
                    <label className="text-xs uppercase tracking-widest text-slate-500 font-black">
                      Location
                      <div className="mt-2 flex gap-2">
                        <input value={profile.location} onChange={(event) => setProfile((prev) => ({ ...prev, location: event.target.value }))} className="block w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10" />
                        <button type="button" onClick={detectLocation} className="px-3 rounded-xl glass text-xs">Auto</button>
                      </div>
                    </label>
                 </div>
                 <button onClick={saveProfile} disabled={saving} className="w-full px-4 py-4 bg-primary rounded-2xl font-black uppercase tracking-widest text-xs disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Profile'}
                 </button>
                 {message && <p className="text-xs text-slate-400">{message}</p>}
                 <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-between p-6 rounded-3xl hover:bg-rose-500/5 transition-all group border border-transparent hover:border-rose-500/10"
                 >
                    <div className="flex items-center gap-6">
                      <div className="size-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ICONS.LogOut size={24} />
                      </div>
                      <div className="text-left">
                         <p className="font-black uppercase tracking-widest text-sm text-rose-500">Log Out</p>
                         <p className="text-xs text-slate-500 mt-1 font-medium">Securely sign out of your session</p>
                      </div>
                    </div>
                    <ICONS.ChevronRight className="text-slate-700 group-hover:text-rose-500 transition-colors" size={24} />
                 </button>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="glass p-8 rounded-[40px] border-white/5 relative overflow-hidden group cursor-pointer">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ICONS.Sparkles size={120} />
                 </div>
                 <h4 className="text-lg font-black uppercase tracking-widest mb-2">Trendly Pro</h4>
                 <p className="text-xs text-slate-400 mb-6 font-medium">Unlock hyper-realistic AR previews and unlimited AI stylings.</p>
                 <button className="px-6 py-3 bg-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest neon-glow-primary">Upgrade Now</button>
              </div>
              <div className="glass p-8 rounded-[40px] border-white/5 relative overflow-hidden group cursor-pointer">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <ICONS.Share2 size={120} />
                 </div>
                 <h4 className="text-lg font-black uppercase tracking-widest mb-2">Invite Friends</h4>
                 <p className="text-xs text-slate-400 mb-6 font-medium">Earn style points for every successful referral.</p>
                 <button className="px-6 py-3 glass rounded-xl text-[10px] font-black uppercase tracking-widest">Generate Link</button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function summarizeMostCommon(values: string[], fallback: string) {
  if (!values.length) {
    return fallback;
  }

  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    const key = String(value).trim();
    if (!key) {
      return accumulator;
    }
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});

  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 2)
    .map(([label]) => label)
    .join(', ');
}
