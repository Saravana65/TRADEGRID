import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { motion } from 'motion/react';
import { TrendingUp, Lock, Mail, ArrowRight, Shield, User } from 'lucide-react';

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

  const handleQuickFill = (type: 'trader' | 'admin') => {
    clearError();
    if (type === 'admin') {
      setEmail('admin@tradegrid.internal');
      setPassword('Admin@12345');
    } else {
      setEmail('trader@tradegrid.internal');
      setPassword('Trader@12345');
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-black relative overflow-hidden select-none transition-colors duration-200">
      {/* Top Bar Theme Switcher */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] dark:bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-md bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-3xl shadow-xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.9)] overflow-hidden relative z-10"
      >
        {/* Terminal Header */}
        <div className="border-b border-slate-100 dark:border-[#1F1F1F] p-6 text-center bg-slate-50/50 dark:bg-[#0D0D0D]">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-slate-100 dark:bg-[#171717] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626] mb-3 shadow-sm">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-slate-900 dark:text-white">
            TRADE<span className="text-slate-500 dark:text-neutral-400 font-semibold">GRID</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 font-sans">
            Virtual Exchange Terminal • Institutional Simulation
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 font-sans font-medium">
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
              leftIcon={<Mail className="w-4 h-4 text-slate-400 dark:text-neutral-500" />}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4 text-slate-400 dark:text-neutral-500" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 font-sans font-semibold py-2.5"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Terminal
            </Button>
          </form>

          {/* Quick Login Helpers */}
          <div className="pt-4 border-t border-slate-100 dark:border-[#1F1F1F]">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-neutral-500 font-sans font-bold block mb-2 text-center">
              Quick Fill Credentials
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleQuickFill('trader')}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#141414] hover:bg-slate-100 dark:hover:bg-[#1F1F1F] border border-slate-200 dark:border-[#262626] text-xs font-sans font-medium text-slate-700 dark:text-neutral-200 transition-colors shadow-sm"
                title="Login with Demo Trader account"
              >
                <User className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="font-semibold">Trader</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin')}
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#141414] hover:bg-slate-100 dark:hover:bg-[#1F1F1F] border border-slate-200 dark:border-[#262626] text-xs font-sans font-medium text-slate-700 dark:text-neutral-200 transition-colors shadow-sm"
                title="Login with Admin account"
              >
                <Shield className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                <span className="font-semibold">Admin</span>
              </button>
            </div>
          </div>

          {/* Registration Link */}
          <div className="text-center pt-1 font-sans">
            <span className="text-xs text-slate-500 dark:text-neutral-400">Need a virtual trader account? </span>
            <Link
              to="/register"
              className="text-xs text-slate-900 dark:text-white hover:text-neutral-300 font-bold underline underline-offset-4"
            >
              Create Account
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
