'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Building2,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Info,
  ArrowRight,
} from 'lucide-react';

export default function LoginForm() {
  const { login } = useAuth();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUser = username.trim();
    if (!cleanUser) {
      setErrorMessage('Please enter your enterprise username (e.g., RahVIEMP2).');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await login(cleanUser, password);

      if (!res.success) {
        setErrorMessage(res.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred during sign in.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      
      {/* Subtle Background Glow Orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-400 text-slate-950 shadow-xl shadow-amber-400/20 mb-2 border-2 border-amber-300">
            <Building2 className="w-9 h-9" />
          </div>
          
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
            {process.env.NEXT_PUBLIC_APP_NAME || 'Enterprise ERP'}
          </h1>
          
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-amber-400/50" />
            <p className="text-xs sm:text-sm font-semibold tracking-wider text-amber-400 uppercase">
              Inventory & Ledger Portal
            </p>
            <span className="h-px w-8 bg-amber-400/50" />
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
          
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              Staff Authentication
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your enterprise username and password to access stock operations.
            </p>
          </div>

          {/* Error Message Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-200 font-medium leading-relaxed">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Username Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Enterprise Username
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. RahVIEMP2"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 outline-hidden transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Password
              </label>
              <div className="relative rounded-xl shadow-xs">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-11 py-2.5 bg-slate-950/60 border border-slate-700 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-xl text-sm font-medium text-white placeholder:text-slate-500 outline-hidden transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-amber-400 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-slate-950 font-black rounded-xl text-sm tracking-wider uppercase transition-all shadow-lg shadow-amber-400/20 hover:shadow-amber-400/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Onboarding Credential Info Card */}
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <Info className="w-4 h-4" />
              <span>Enterprise Credential Formula</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Your username is the first 3 letters of your first name + alphanumeric Employee ID (e.g., for Rahul with ID <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">VI/EMP/2</code>: <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">Rah</code> + <code className="text-amber-300 font-mono bg-slate-900 px-1 py-0.5 rounded">VIEMP2</code> = <strong className="text-white font-mono">RahVIEMP2</strong>). Initial password defaults to the same value as your username.
            </p>
          </div>

        </div>

        {/* Security Footer */}
        <div className="text-center text-[11px] text-slate-500 flex items-center justify-center gap-2">
          <span>Protected Enterprise Session</span>
          <span>•</span>
          <span>Automatic Audit Stamping</span>
        </div>

      </div>
    </div>
  );
}
