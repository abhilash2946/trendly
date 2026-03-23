import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ICONS } from '../types';
import { supabase } from '../lib/supabaseClient';
import { fetchPublicHolidays, getCurrentCoordinates, getLocationDetails } from '../lib/location';
import { generateLocalEventsFromLocation } from '../lib/localAI';
import type { EventRecord } from '../types';

export default function OutfitPlanner() {
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(today.getDate());
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [city, setCity] = useState('Detecting...');
  const [eventTitle, setEventTitle] = useState('');
  const [eventOutfit, setEventOutfit] = useState('');
  const [assignOutfit, setAssignOutfit] = useState('');
  const [loading, setLoading] = useState(true);

  const displayMonthLabel = new Date(displayYear, displayMonth, 1)
    .toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    .toUpperCase();

  const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  // Day of week the 1st falls on (0=Sun … 6=Sat)
  const firstDayOffset = new Date(displayYear, displayMonth, 1).getDay();

  const normalizeDate = (value: Date) => value.toISOString().split('T')[0];

  const prevMonth = () => {
    setDisplayMonth(m => {
      if (m === 0) { setDisplayYear(y => y - 1); return 11; }
      return m - 1;
    });
    setSelectedDate(1);
  };

  const nextMonth = () => {
    setDisplayMonth(m => {
      if (m === 11) { setDisplayYear(y => y + 1); return 0; }
      return m + 1;
    });
    setSelectedDate(1);
  };

  const detectLocationAndBootstrapEvents = async () => {
    try {
      const { latitude, longitude } = await getCurrentCoordinates();
      const location = await getLocationDetails(latitude, longitude);
      const cityName = location.displayName;
      setCity(cityName);

      const holidays = await fetchPublicHolidays(location.countryCode || 'IN', today.getFullYear());
      const monthHolidays = holidays.filter((holiday) => {
        const d = new Date(holiday.date);
        return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
      });

      const localIdeas = await generateLocalEventsFromLocation(
        `${location.city}, ${location.state}`,
        today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      );

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const inserts = [
        {
          user_id: user.id,
          event_type: `${location.city} Birthday Reminder`,
          recommended_outfit: 'Colorful semi-formal celebration look',
          date: normalizeDate(new Date(today.getFullYear(), today.getMonth(), 5)),
          location: cityName,
          dress_code: 'Birthday',
        },
        {
          user_id: user.id,
          event_type: `${location.state} Wedding Season`,
          recommended_outfit: 'Elegant festive outfit with statement footwear',
          date: normalizeDate(new Date(today.getFullYear(), today.getMonth(), 18)),
          location: cityName,
          dress_code: 'Wedding',
        },
        ...monthHolidays.slice(0, 5).map((holiday) => ({
          user_id: user.id,
          event_type: holiday.localName,
          recommended_outfit: 'Festive smart-casual look',
          date: holiday.date,
          location: cityName,
          dress_code: 'Holiday',
        })),
        ...localIdeas.map((line) => {
          const [name, date] = line.split('|').map((part) => part.trim());
          const parsedDate = date && !Number.isNaN(Date.parse(date)) ? date : normalizeDate(today);
          return {
            user_id: user.id,
            event_type: name || 'Local Event',
            recommended_outfit: 'City-ready outfit',
            date: parsedDate,
            location: cityName,
            dress_code: 'Smart Casual',
          };
        }),
      ];

      if (inserts.length) {
        await supabase.from('events').upsert(inserts, { onConflict: 'user_id,event_type,date' });
      }
    } catch {
      setCity('Location unavailable');
    }
  };

  useEffect(() => {
    const init = async () => {
      await detectLocationAndBootstrapEvents();
      await fetchEvents();
    };

    init();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (data) setEvents(data as EventRecord[]);
    setLoading(false);
  };

  const addCustomEvent = async () => {
    if (!eventTitle.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const date = new Date(displayYear, displayMonth, selectedDate);
    await supabase.from('events').insert([{
      user_id: user.id,
      event_type: eventTitle,
      recommended_outfit: eventOutfit || 'Custom look pending',
      date: normalizeDate(date),
      location: city,
      dress_code: 'Custom',
    }]);
    setEventTitle('');
    setEventOutfit('');
    await fetchEvents();
  };

  const updateEventOutfit = async () => {
    if (!activeEvent || !assignOutfit.trim()) return;
    await supabase
      .from('events')
      .update({ recommended_outfit: assignOutfit.trim() })
      .eq('id', activeEvent.id);
    setAssignOutfit('');
    await fetchEvents();
  };

  const getEventForDate = (day: number) => {
    return events.find(e => {
      const d = new Date(e.date);
      return d.getFullYear() === displayYear && d.getMonth() === displayMonth && d.getDate() === day;
    });
  };

  const activeEvent = getEventForDate(selectedDate);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase text-gradient">Outfit Planner</h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">Sync your style with your schedule in {city}</p>
        </div>
        <div className="flex gap-3">
          <input
            value={eventTitle}
            onChange={(event) => setEventTitle(event.target.value)}
            placeholder="Event title"
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm"
          />
          <input
            value={eventOutfit}
            onChange={(event) => setEventOutfit(event.target.value)}
            placeholder="Outfit"
            className="px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm"
          />
          <button onClick={addCustomEvent} className="bg-primary text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm neon-glow-primary flex items-center gap-3 hover:scale-105 transition-all">
            <ICONS.Plus size={20} /> Add Event
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Calendar Card */}
        <div className="lg:col-span-2 glass-morphism p-10 rounded-[40px] border-white/5">
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-black tracking-tighter">{displayMonthLabel}</h2>
            <div className="flex gap-4">
              <button onClick={prevMonth} className="p-3 glass rounded-xl text-slate-400 hover:text-white transition-all"><ICONS.ChevronLeft size={20} /></button>
              <button onClick={nextMonth} className="p-3 glass rounded-xl text-slate-400 hover:text-white transition-all"><ICONS.ChevronRight size={20} /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {days.map(d => (
              <div key={d} className="text-primary/50 text-[10px] font-black uppercase tracking-[0.2em] text-center py-4">{d}</div>
            ))}
            {Array.from({ length: firstDayOffset }, (_, i) => (
              <div key={`empty-${i}`} className="aspect-square" />
            ))}
            {dates.map((day) => {
              const event = getEventForDate(day);
              const isSelected = selectedDate === day;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDate(day)}
                  className={`aspect-square relative flex flex-col items-center justify-center rounded-2xl transition-all group ${isSelected ? 'bg-primary text-white font-black neon-glow-primary' : 'glass text-slate-500 hover:text-white hover:border-primary/30'}`}
                >
                  <span className="text-sm">{day}</span>
                  {event && !isSelected && (
                    <div className="absolute bottom-3 size-1.5 bg-primary rounded-full neon-glow-primary"></div>
                  )}
                  {isSelected && (
                     <motion.div layoutId="calendarActive" className="absolute inset-0 border-2 border-white/20 rounded-2xl" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Agenda Section */}
        <div className="space-y-8">
          <div className="glass-morphism p-8 rounded-[40px] border-white/5 flex-1">
             <div className="flex items-center justify-between mb-8">
                <h3 className="text-lg font-black uppercase tracking-widest">
                  {new Date(displayYear, displayMonth, selectedDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} Agenda
                </h3>
                {activeEvent && <div className="size-3 rounded-full bg-emerald-400 neon-glow-secondary"></div>}
             </div>

             {loading ? (
               <p className="text-slate-500 text-sm">Loading events...</p>
             ) : activeEvent ? (
               <div className="space-y-8">
                  <div className="relative aspect-[4/5] rounded-3xl overflow-hidden glass border-white/10 group">
                    <img
                      src={"https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?q=80&w=1000&auto=format&fit=crop"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-transparent to-transparent opacity-60"></div>
                    <div className="absolute bottom-6 left-6">
                       <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-1">Recommended Ensemble</p>
                       <p className="text-xl font-black">{activeEvent.recommended_outfit}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                     <div className="flex items-start gap-4 p-4 glass rounded-2xl border-white/5">
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                           <ICONS.MessageSquare size={18} />
                        </div>
                        <div>
                           <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Event</p>
                           <p className="text-sm font-bold">{activeEvent.event_type}</p>
                           <p className="text-[10px] text-primary font-bold mt-1">ALL DAY</p>
                        </div>
                     </div>
                     <div className="flex items-start gap-4 p-4 glass rounded-2xl border-white/5">
                        <div className="size-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                           <ICONS.MapPin size={18} />
                        </div>
                        <div>
                           <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-1">Status</p>
                        <p className="text-sm font-bold">{activeEvent.location || city}</p>
                        </div>
                     </div>
                      <div className="glass rounded-2xl border-white/5 p-4 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assign outfit</p>
                        <input
                          value={assignOutfit}
                          onChange={(event) => setAssignOutfit(event.target.value)}
                          placeholder={activeEvent.recommended_outfit || 'Add outfit plan'}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm"
                        />
                        <button onClick={updateEventOutfit} className="w-full px-4 py-3 bg-primary rounded-xl text-xs font-black uppercase tracking-widest">
                          Save Outfit Assignment
                        </button>
                      </div>
                  </div>
               </div>
             ) : (
               <div className="py-20 text-center flex flex-col items-center justify-center">
                  <div className="size-20 rounded-2xl bg-white/5 flex items-center justify-center text-slate-600 mb-6">
                    <ICONS.Calendar size={32} />
                  </div>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mb-6">No ensemble set</p>
                  <button className="bg-primary/10 text-primary px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                    Assign Outfit
                  </button>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
