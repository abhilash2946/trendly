import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type ServiceState = 'checking' | 'healthy' | 'degraded' | 'down';

interface ServiceHealth {
  label: string;
  state: ServiceState;
  detail: string;
}

const REFRESH_INTERVAL_MS = 30000;
const REQUEST_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('Timeout')), ms);

    promise
      .then((result) => {
        window.clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

async function checkLocalAI(): Promise<ServiceHealth> {
  try {
    const healthResponse = await withTimeout(fetch('http://localhost:5000/health'), REQUEST_TIMEOUT_MS);
    if (healthResponse.ok) {
      return { label: 'Local AI (Ollama)', state: 'healthy', detail: 'Connected' };
    }
  } catch {
    // Fallback to stylist endpoint probe.
  }

  try {
    const response = await withTimeout(
      fetch('http://localhost:5000/ai-stylist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Health check ping' }),
      }),
      REQUEST_TIMEOUT_MS
    );

    if (!response.ok) {
      return { label: 'Local AI (Ollama)', state: 'degraded', detail: `Responded with ${response.status}` };
    }

    return { label: 'Local AI (Ollama)', state: 'healthy', detail: 'Connected' };
  } catch {
    return { label: 'Local AI (Ollama)', state: 'down', detail: 'Server not reachable on localhost:5000' };
  }
}

async function checkStableDiffusion(): Promise<ServiceHealth> {
  try {
    const response = await withTimeout(fetch('http://127.0.0.1:7860/sdapi/v1/options'), REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      return { label: 'Stable Diffusion', state: 'degraded', detail: `Responded with ${response.status}` };
    }

    return { label: 'Stable Diffusion', state: 'healthy', detail: 'API responding on 127.0.0.1:7860' };
  } catch {
    return { label: 'Stable Diffusion', state: 'down', detail: 'Server not reachable on 127.0.0.1:7860' };
  }
}

async function checkSupabase(): Promise<ServiceHealth> {
  try {
    const { error } = await withTimeout(supabase.auth.getSession(), REQUEST_TIMEOUT_MS);
    if (error) {
      return { label: 'Supabase', state: 'degraded', detail: error.message || 'Auth endpoint error' };
    }

    return { label: 'Supabase', state: 'healthy', detail: 'Connected' };
  } catch {
    return { label: 'Supabase', state: 'down', detail: 'Connection failed or timed out' };
  }
}

export function SystemStatusPanel() {
  const [services, setServices] = useState<ServiceHealth[]>([
    { label: 'Local AI (Ollama)', state: 'checking', detail: 'Checking service...' },
    { label: 'Stable Diffusion', state: 'checking', detail: 'Checking service...' },
    { label: 'Supabase', state: 'checking', detail: 'Checking service...' },
  ]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStatuses = useCallback(async () => {
    setIsRefreshing(true);
    const [ai, sd, db] = await Promise.all([checkLocalAI(), checkStableDiffusion(), checkSupabase()]);
    setServices([ai, sd, db]);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    refreshStatuses();
    const timer = window.setInterval(refreshStatuses, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refreshStatuses]);

  const overall = useMemo<ServiceState>(() => {
    if (services.some((service) => service.state === 'down')) {
      return 'down';
    }
    if (services.some((service) => service.state === 'degraded')) {
      return 'degraded';
    }
    if (services.some((service) => service.state === 'checking')) {
      return 'checking';
    }
    return 'healthy';
  }, [services]);

  return (
    <section className="glass-morphism p-6 rounded-3xl border-white/10 mb-8">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-black">System Health</p>
          <h2 className="text-xl font-black tracking-tight">Runtime Services</h2>
        </div>
        <div className="flex items-center gap-3">
          <StatePill state={overall} label={overall === 'healthy' ? 'All systems nominal' : overall === 'checking' ? 'Checking services' : 'Attention needed'} />
          <button
            onClick={refreshStatuses}
            disabled={isRefreshing}
            className="px-4 py-2 rounded-xl bg-white/10 text-xs font-black uppercase tracking-widest hover:bg-white/20 transition-all disabled:opacity-60"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {services.map((service) => (
          <div key={service.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-bold">{service.label}</p>
              <StateDot state={service.state} />
            </div>
            <p className="text-xs text-slate-400">{service.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function StateDot({ state }: { state: ServiceState }) {
  const className =
    state === 'healthy'
      ? 'bg-emerald-400'
      : state === 'degraded'
        ? 'bg-amber-400'
        : state === 'down'
          ? 'bg-rose-400'
          : 'bg-slate-400';

  return <span className={`size-2.5 rounded-full ${className}`} />;
}

function StatePill({ state, label }: { state: ServiceState; label: string }) {
  const className =
    state === 'healthy'
      ? 'text-emerald-300 border-emerald-400/40 bg-emerald-500/10'
      : state === 'degraded'
        ? 'text-amber-300 border-amber-400/40 bg-amber-500/10'
        : state === 'down'
          ? 'text-rose-300 border-rose-400/40 bg-rose-500/10'
          : 'text-slate-300 border-slate-400/40 bg-slate-500/10';

  return <span className={`px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest ${className}`}>{label}</span>;
}
