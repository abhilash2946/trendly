import { useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { supabase } from './lib/supabaseClient';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import AIStylist from './pages/AIStylist';
import OutfitGenerator from './pages/OutfitGenerator';
import SmartWardrobe from './pages/SmartWardrobe';
import ARMirror from './pages/ARMirror';
import HairstyleStudio from './pages/HairstyleStudio';
import EventScanner from './pages/EventScanner';
import OutfitPlanner from './pages/OutfitPlanner';
import Shopping from './pages/Shopping';
import Profile from './pages/Profile';

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && window.location.pathname === '/') {
        navigate('/dashboard');
      }
    });
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [navigate]);

  return (
    <Layout>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/auth" element={<Auth />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/ai-stylist" element={<ProtectedRoute><AIStylist /></ProtectedRoute>} />
        <Route path="/outfit-generator" element={<ProtectedRoute><OutfitGenerator /></ProtectedRoute>} />
        <Route path="/smart-wardrobe" element={<ProtectedRoute><SmartWardrobe /></ProtectedRoute>} />
        <Route path="/wardrobe" element={<ProtectedRoute><SmartWardrobe /></ProtectedRoute>} />
        <Route path="/ar-mirror" element={<ProtectedRoute><ARMirror /></ProtectedRoute>} />
        <Route path="/hairstyle-studio" element={<ProtectedRoute><HairstyleStudio /></ProtectedRoute>} />
        <Route path="/event-scanner" element={<ProtectedRoute><EventScanner /></ProtectedRoute>} />
        <Route path="/planner" element={<ProtectedRoute><OutfitPlanner /></ProtectedRoute>} />
        <Route path="/shopping" element={<ProtectedRoute><Shopping /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
