import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { TrendingUp, Lock, Mail, User, ArrowRight, CheckCircle2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { register, isLoading, error } = useAuthStore();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register({ email, username, password });
      navigate('/');
    } catch {
      // Error handled by store
    }
  };

  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-30 pointer-events-none" />

      <div className="w-full max-w-md bg-card border border-card-border rounded-2xl shadow-2xl overflow-hidden relative z-10">
        <div className="bg-[#0A0E1A] border-b border-card-border p-6 text-center">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 mb-3">
            <TrendingUp className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold font-mono tracking-wider text-white">
            JOIN TRADE<span className="text-cyan-400">GRID</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Create Virtual Trader Account • Receive $100,000 Starting Cash
          </p>
        </div>

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
              placeholder="trader@university.edu"
              leftIcon={<Mail className="w-4 h-4" />}
              required
            />

            <Input
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="quantum_trader"
              leftIcon={<User className="w-4 h-4" />}
              helperText="3-30 characters (letters, numbers, underscores)"
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

            {/* Live Password Strength Criteria */}
            <div className="p-3 rounded-lg bg-[#0A0E1A] border border-card-border/60 text-xs space-y-1.5">
              <span className="text-[11px] font-medium text-slate-400 block mb-1">
                Security Requirements:
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div
                  className={`flex items-center gap-1.5 ${
                    hasLength ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>8+ characters</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasUpper ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Uppercase letter</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasLower ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Lowercase letter</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 ${
                    hasNumber ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>At least 1 number</span>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Create Account
            </Button>
          </form>

          <div className="text-center pt-2">
            <span className="text-xs text-slate-400">Already registered? </span>
            <Link
              to="/login"
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline underline-offset-4"
            >
              Sign In here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
