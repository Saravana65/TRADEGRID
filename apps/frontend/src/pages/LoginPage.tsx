import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
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
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden relative z-10">
        {/* Terminal Header */}
        <div className="bg-[#0A0E1A] border-b border-card-border p-6 text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-3">
            <TrendingUp className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold font-mono tracking-wider text-white">
            TRADE<span className="text-cyan-400">GRID</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Exchange Terminal Access • Phase 1 Foundation
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8 space-y-6">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@domain.com"
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Access Terminal
            </Button>
          </form>

          {/* Quick Login Helpers for Development & Mentoring */}
          <div className="pt-4 border-t border-card-border/80">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-mono block mb-2 text-center">
              Quick Fill Demo Accounts
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickFill('trader')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 transition-colors"
              >
                <User className="w-3.5 h-3.5 text-cyan-400" />
                <span>Demo Trader</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('admin')}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-300 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Demo Admin</span>
              </button>
            </div>
          </div>

          {/* Registration Link */}
          <div className="text-center pt-2">
            <span className="text-xs text-slate-400">Don't have an exchange account? </span>
            <Link
              to="/register"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
            >
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
