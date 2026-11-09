import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
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
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-[#070A12] relative overflow-hidden select-none">
      {/* Background Glow Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Grid Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:28px_28px] opacity-25 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md bg-[#0D1424] border border-card-border/80 rounded-2xl shadow-2xl overflow-hidden relative z-10 glass-panel"
      >
        {/* Terminal Header */}
        <div className="bg-[#090D18] border-b border-card-border p-6 text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-3 shadow-glow-cyan">
            <TrendingUp className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold font-mono tracking-wider text-white">
            TRADE<span className="text-cyan-400">GRID</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">
            Virtual Exchange Terminal • Institutional Simulation
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-mono">
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
              leftIcon={<Mail className="w-4 h-4 text-cyan-400" />}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4 text-cyan-400" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 font-mono uppercase font-bold py-2.5 shadow-lg shadow-cyan-600/30"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Terminal
            </Button>
          </form>

          {/* Quick Login Helpers */}
          <div className="pt-4 border-t border-card-border/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono block mb-2 text-center">
              Quick Fill Credentials
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('saravana')}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-[#090D18] hover:bg-cyan-950/40 border border-cyan-800/40 text-xs font-mono text-cyan-300 transition-colors"
                title="Login with SaravanaTrader account"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="truncate">Saravana</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('trader')}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-[#090D18] hover:bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300 transition-colors"
                title="Login with Demo Trader account"
              >
                <User className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="truncate">Trader</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin')}
                className="flex items-center justify-center gap-1 py-2 px-2 rounded-xl bg-[#090D18] hover:bg-slate-800 border border-slate-700/60 text-xs font-mono text-slate-300 transition-colors"
                title="Login with Admin account"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="truncate">Admin</span>
              </button>
            </div>
          </div>

          {/* Registration Link */}
          <div className="text-center pt-1 font-mono">
            <span className="text-xs text-slate-400">Need a virtual trader account? </span>
            <Link
              to="/register"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-bold underline underline-offset-4"
            >
              Create Account
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
