import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { motion } from 'motion/react';
import { TrendingUp, Lock, Mail, ArrowRight, Shield, User, Sparkles } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login({ email, password });
      navigate('/');
    } catch {
      // Error handled by store
    }
  };

  const handleQuickFill = (type: 'trader' | 'admin' | 'saravana') => {
    clearError();
    if (type === 'admin') {
      setEmail('admin@tradegrid.internal');
      setPassword('Admin@12345');
    } else if (type === 'saravana') {
      setEmail('saravanasrinivas422@gmail.com');
      setPassword('Saravana@123');
    } else {
      setEmail('trader@tradegrid.internal');
      setPassword('Trader@12345');
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-[#080C15] relative overflow-hidden select-none transition-colors duration-200">
      {/* Top Bar Theme Switcher */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Subtle Background Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 dark:bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 dark:bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-md bg-white dark:bg-[#0F1626] border border-slate-200 dark:border-card-border rounded-3xl shadow-xl dark:shadow-2xl overflow-hidden relative z-10"
      >
        {/* Terminal Header */}
        <div className="border-b border-slate-100 dark:border-card-border/80 p-6 text-center bg-slate-50/50 dark:bg-[#0B101D]">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 mb-3 shadow-sm">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-slate-900 dark:text-white">
            TRADE<span className="text-cyan-600 dark:text-cyan-400">GRID</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-sans">
            Virtual Exchange Terminal • Institutional Simulation
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 font-sans font-medium">
              <span className="font-bold">Error:</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              leftIcon={<Mail className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 font-sans font-semibold py-2.5 shadow-md shadow-cyan-600/20"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Terminal
            </Button>
          </form>

          {/* Quick Login Helpers */}
          <div className="pt-4 border-t border-slate-100 dark:border-card-border/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-sans font-bold block mb-2 text-center">
              Quick Fill Credentials
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('saravana')}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-50 dark:bg-[#0B101D] hover:bg-cyan-50 dark:hover:bg-cyan-950/40 border border-slate-200 dark:border-cyan-800/40 text-xs font-sans font-medium text-cyan-700 dark:text-cyan-300 transition-colors shadow-sm"
                title="Login with SaravanaTrader account"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 flex-shrink-0" />
                <span className="truncate">Saravana</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('trader')}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-50 dark:bg-[#0B101D] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-xs font-sans font-medium text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
                title="Login with Demo Trader account"
              >
                <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <span className="truncate">Trader</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin')}
                className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-50 dark:bg-[#0B101D] hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/60 text-xs font-sans font-medium text-slate-700 dark:text-slate-300 transition-colors shadow-sm"
                title="Login with Admin account"
              >
                <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="truncate">Admin</span>
              </button>
            </div>
          </div>

          {/* Registration Link */}
          <div className="text-center pt-1 font-sans">
            <span className="text-xs text-slate-500 dark:text-slate-400">Need a virtual trader account? </span>
            <Link
              to="/register"
              className="text-xs text-cyan-600 dark:text-cyan-400 hover:text-cyan-500 font-bold underline underline-offset-4"
            >
              Create Account
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
