import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { motion } from 'motion/react';
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
        <div className="border-b border-slate-100 dark:border-[#1F1F1F] p-6 text-center bg-slate-50/50 dark:bg-[#0D0D0D]">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-slate-100 dark:bg-[#171717] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626] mb-3 shadow-sm">
            <TrendingUp className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-slate-900 dark:text-white">
            JOIN TRADE<span className="text-slate-500 dark:text-neutral-400 font-semibold">GRID</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-1 font-sans">
            Create Virtual Account • Receive $100,000 Starting Cash
          </p>
        </div>

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
              placeholder="trader@university.edu"
              leftIcon={<Mail className="w-4 h-4 text-slate-400 dark:text-neutral-500" />}
              required
            />

            <Input
              label="Username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="TraderPro"
              leftIcon={<User className="w-4 h-4 text-slate-400 dark:text-neutral-500" />}
              helperText="3-30 characters (letters, numbers, underscores)"
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

            {/* Live Password Strength Criteria */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#222222] text-xs space-y-2 font-sans">
              <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 block uppercase tracking-wider">
                Security Requirements:
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div
                  className={`flex items-center gap-1.5 font-medium transition-colors ${
                    hasLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-neutral-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>8+ characters</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 font-medium transition-colors ${
                    hasUpper ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-neutral-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Uppercase letter</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 font-medium transition-colors ${
                    hasLower ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-neutral-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Lowercase letter</span>
                </div>
                <div
                  className={`flex items-center gap-1.5 font-medium transition-colors ${
                    hasNumber ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-neutral-500'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>At least 1 number</span>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full mt-2 font-sans font-semibold py-2.5"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Create Trader Account
            </Button>
          </form>

          <div className="text-center pt-1 font-sans">
            <span className="text-xs text-slate-500 dark:text-neutral-400">Already registered? </span>
            <Link
              to="/login"
              className="text-xs text-slate-900 dark:text-white hover:text-neutral-300 font-bold underline underline-offset-4"
            >
              Sign In here
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
