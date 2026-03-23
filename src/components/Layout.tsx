import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ICONS } from '../types';
import { Navbar } from './navigation/Navbar';
import { Sidebar } from './navigation/Sidebar';

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const isPublicPage = ['/', '/auth', '/login'].includes(location.pathname);

  if (isPublicPage) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg-dark text-slate-100">
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-20 flex items-center justify-between px-6 lg:px-10 border-b border-white/5 bg-bg-dark/20 backdrop-blur-md z-40">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 text-slate-400 hover:text-primary"
              onClick={() => setIsSidebarOpen(true)}
            >
              <ICONS.Menu className="size-6" />
            </button>
            <h1 className="text-xl font-bold tracking-tight capitalize hidden sm:block">
              {location.pathname.split('/')[1]?.replace('-', ' ') || 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex relative items-center">
              <ICONS.Search className="absolute left-4 text-slate-500 size-4" />
              <input
                type="text"
                placeholder="Search styles..."
                className="bg-white/5 border border-white/10 rounded-full py-2 pl-11 pr-4 text-sm focus:outline-none focus:border-primary/50 w-64 transition-all"
              />
            </div>
            <button className="p-2.5 rounded-xl glass hover:bg-white/10 transition-all relative">
              <ICONS.Bell size={20} className="text-slate-300" />
              <span className="absolute top-2.5 right-2.5 size-2 bg-primary rounded-full neon-glow-primary"></span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto p-6 lg:p-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <Navbar />
      </main>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] lg:hidden"
            />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className="fixed top-0 left-0 bottom-0 w-72 bg-bg-dark border-r border-white/5 z-[70] p-6 flex flex-col gap-8 lg:hidden"
            >
              <Sidebar />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
