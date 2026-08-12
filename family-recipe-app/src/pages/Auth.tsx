import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChefHat, Mail, Lock, Eye } from 'lucide-react';
import { Toast } from '../components/Toast';
import { useAuth } from '../lib/AuthContext';
import { useT } from '../lib/i18n';

export function Auth() {
  const { enterGuestMode } = useAuth();
  const t = useT();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Upon successful login, redirect to the vault
        navigate('/recipes');
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setToast(t('auth.checkEmail'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <ChefHat className="w-12 h-12 text-orange-600 mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">
            {isLogin ? t('auth.welcomeBack') : t('auth.joinVault')}
          </h2>
          <p className="text-slate-500 text-sm mt-2 text-center">
            {isLogin 
              ? t('auth.signInBlurb')
              : t('auth.signUpBlurb')}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 mb-1">{t('auth.email')}</label>
            <div className="relative">
              <Mail className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="auth-email"
                autoComplete="email"
                type="email"
                required
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 mb-1">{t('auth.password')}</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              {/* autoComplete lets a password manager offer to save a new
                  password on sign-up and fill the existing one on sign-in. */}
              <input
                id="auth-password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                type="password"
                required
                minLength={6}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 text-white font-semibold py-2 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50"
          >
            {loading ? t('auth.processing') : isLogin ? t('common.signIn') : t('common.signUp')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-orange-600 hover:underline"
          >
            {isLogin ? t('auth.needAccount') : t('auth.haveAccount')}
          </button>
        </div>

        {/* Guests stay signed out on purpose -- see the note in AuthContext.
            Saying "nothing you do is saved" up front is more honest than
            letting someone favorite a recipe and lose it. */}
        <div className="mt-6 pt-6 border-t border-slate-100">
          <button
            type="button"
            onClick={() => {
              enterGuestMode();
              navigate('/');
            }}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 active:scale-[0.99] transition-all"
          >
            <Eye className="w-5 h-5 text-slate-400" />
            {t('guest.explore')}
          </button>
          <p className="text-xs text-slate-400 mt-3 text-center">
            {t('guest.exploreHint')}
          </p>
        </div>
      </div>
      <Toast message={toast} />
    </div>
  );
}