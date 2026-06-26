import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginService } from './login.service';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, CheckCircle, Eye, EyeOff, LoaderCircle, Lock, Mail } from 'lucide-react';

type RecoveryMode = 'request' | 'reset';

const PasswordRecoveryPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<RecoveryMode>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [showConfirmation, setShowConfirmation] = useState(false);

  const hasPasswordStrength = useMemo(() => {
    const hasMinLength = password.length >= 6;
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    return hasMinLength && hasUppercase && hasLowercase && hasNumber;
  }, [password]);

  useEffect(() => {
    const detectRecoverySession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token && data.session.user?.email) {
        setMode('reset');
      }

      if (data.session?.user?.email) {
        setEmail(data.session.user.email);
      }
    };

    void detectRecoverySession();
  }, []);

  const requestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setIsLoading(true);

    try {
      const error = await loginService.requestPasswordRecovery(email);
      if (error) {
        setMessage({ tone: 'error', text: error });
        return;
      }
      setMessage({
        tone: 'success',
        text: 'Enviamos um link de redefinição para seu e-mail. Verifique a caixa de entrada.',
      });
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de recuperação.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const confirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!hasPasswordStrength) {
      setMessage({
        tone: 'error',
        text: 'A nova senha precisa ter no mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
      });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setIsLoading(true);

    try {
      const error = await loginService.updatePassword(password);
      if (error) {
        setMessage({ tone: 'error', text: error });
        return;
      }

      setMessage({
        tone: 'success',
        text: 'Senha alterada com sucesso. Você já pode entrar com a nova senha.',
      });

      setTimeout(() => {
        navigate('/login');
      }, 1000);
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível alterar a senha.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-slate-50 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-3xl border border-slate-200 bg-white px-6 py-8 shadow-lg sm:px-8">
        <div>
          <button
            type="button"
            onClick={() => navigate(mode === 'reset' ? '/login' : '/')}
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-[#001a33]"
          >
            <ArrowLeft size={16} />
            Voltar
          </button>

          <h1 className="mt-5 text-2xl font-black uppercase tracking-tight text-[#001a33]">
            {mode === 'reset' ? 'Nova senha' : 'Recuperar senha'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'reset'
              ? 'Defina uma nova senha para continuar acessando sua conta.'
              : 'Informe seu e-mail para receber o link de recuperação.'}
          </p>
        </div>

        {message && (
          <div
            className={`rounded-2xl border px-4 py-3 text-xs font-bold leading-relaxed ${
              message.tone === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {mode === 'request' ? (
          <form onSubmit={requestReset} className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail</span>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 text-base font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  disabled={isLoading}
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60"
            >
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail size={16} />}
              {isLoading ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmReset} className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nova senha</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 text-base font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#001a33]"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Confirmar nova senha</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type={showConfirmation ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repita a senha"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 text-base font-semibold text-slate-800 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmation((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#001a33]"
                >
                  {showConfirmation ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className={`rounded-2xl px-3 py-2 text-[10px] font-semibold ${
              hasPasswordStrength
                ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border border-slate-200 bg-slate-50 text-slate-600'
            }`}
            >
              Sua senha precisa ter 6+ caracteres, 1 maiúscula, 1 minúscula e 1 número.
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle size={16} />}
              {isLoading ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-500">
          <Link to="/login" className="font-black text-[#001a33] hover:underline">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default PasswordRecoveryPage;
