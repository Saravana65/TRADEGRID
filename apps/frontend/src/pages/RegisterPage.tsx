import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { motion } from 'motion/react';
import financesDark from '../assets/illustrations/finances-illustration-dark.svg';
import financesLight from '../assets/illustrations/finances-illustration-light.svg';
import { TrendingUp, Lock, Mail, User, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen w-screen flex items-center justify-center p-3 sm:p-6 lg:p-10 bg-neutral-100 dark:bg-black relative overflow-x-hidden select-none transition-colors duration-200">
      {/* Top Bar Theme Switcher */}
      <div className="absolute top-4 right-4 z-30">
        <ThemeToggle />
      </div>

      {/* Subtle Neutral Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#d4d4d4_1px,transparent_1px)] dark:bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:24px_24px] opacity-35 pointer-events-none" />

      {/* Main Landing / Auth Card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-5xl bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-3xl shadow-2xl dark:shadow-[0_10px_40px_rgba(0,0,0,0.95)] overflow-hidden relative z-10 grid grid-cols-1 lg:grid-cols-12"
      >
        {/* Left Side: Modern Register Terminal Interface */}
        <div className="lg:col-span-6 p-6 sm:p-10 flex flex-col justify-between space-y-6">
          {/* Brand Header */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-black flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-extrabold tracking-tight font-sans text-neutral-900 dark:text-white">
                    TRADE<span className="text-neutral-400 font-semibold">GRID</span>
                  </span>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] text-[10px] font-mono font-bold text-neutral-700 dark:text-neutral-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>₹10,00,000 DEMO CASH</span>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1.5 pt-2">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 dark:text-white font-sans uppercase">
                CREATE VIRTUAL <br />
                <span className="text-emerald-600 dark:text-emerald-400">TRADER ACCOUNT</span>
              </h1>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 font-sans leading-relaxed">
                Join thousands of traders simulating real-world execution, backtesting technical strategies, and building quant discipline.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-2 font-sans font-medium">
                <span className="font-bold">Error:</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                leftIcon={<Mail className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />}
                required
              />

              <Input
                label="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="TraderPro"
                leftIcon={<User className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />}
                helperText="3-30 characters (letters, numbers, underscores)"
                required
              />

              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                leftIcon={<Lock className="w-4 h-4 text-neutral-400 dark:text-neutral-500" />}
                required
              />

              {/* Password Strength Checklist */}
              <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#222222] text-xs space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 block uppercase tracking-wider">
                  Security Requirements
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 font-medium transition-colors ${
                      hasLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>8+ characters</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-medium transition-colors ${
                      hasUpper ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Uppercase letter</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-medium transition-colors ${
                      hasLower ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Lowercase letter</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-medium transition-colors ${
                      hasNumber ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'
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
                className="w-full mt-2 font-sans font-bold py-3 text-sm rounded-xl shadow-md"
                isLoading={isLoading}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Create Account
              </Button>
            </form>
          </div>

          {/* Sign In Link */}
          <div className="text-center pt-2 border-t border-neutral-100 dark:border-[#1F1F1F] font-sans">
            <span className="text-xs text-neutral-500 dark:text-neutral-400">Already registered on TradeGrid? </span>
            <Link
              to="/login"
              className="text-xs text-neutral-900 dark:text-white hover:text-neutral-400 font-bold underline underline-offset-4 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>

        {/* Right Side: Neutral Business Finances & Market Analytics Illustration */}
        <div className="lg:col-span-6 bg-neutral-100 dark:bg-[#111111] border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-[#1F1F1F] flex flex-col justify-between p-6 sm:p-8 relative overflow-hidden transition-colors duration-200">
          {/* Top Value Pill */}
          <div className="flex items-center justify-between z-10">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 dark:bg-[#1C1C1C]/80 backdrop-blur-md border border-neutral-200/80 dark:border-[#282828] text-[11px] font-sans font-semibold text-neutral-800 dark:text-neutral-200 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span>Institutional Market Analytics</span>
            </div>
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider font-bold">
              NSE • BSE
            </span>
          </div>

          {/* Neutral Illustration (Theme Responsive) */}
          <div className="my-auto py-4 flex items-center justify-center">
            {/* Dark Theme Illustration */}
            <img
              src={financesDark}
              alt="TRADEGRID Market Analytics & Growth"
              className="hidden dark:block w-full max-w-[440px] h-auto object-contain filter drop-shadow-md select-none pointer-events-none"
            />
            {/* Light Theme Illustration */}
            <img
              src={financesLight}
              alt="TRADEGRID Market Analytics & Growth"
              className="block dark:hidden w-full max-w-[440px] h-auto object-contain filter drop-shadow-sm select-none pointer-events-none"
            />
          </div>

          {/* Bottom Live Micro-Metrics */}
          <div className="z-10 pt-3 border-t border-neutral-200/70 dark:border-[#222222] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-3">
              <span>NIFTY 50 <strong className="text-emerald-500">24,148.20</strong></span>
              <span>•</span>
              <span>SENSEX <strong className="text-emerald-500">79,486.30</strong></span>
            </div>
            <span className="text-[10px] font-sans text-neutral-400">Atomic Execution • ₹0 Brokerage</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
