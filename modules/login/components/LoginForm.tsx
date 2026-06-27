import React, { useState } from 'react';
import { IdCard, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { LoginCredentials } from '../login.types';
import GoogleLogo from '../../shared/auth/GoogleLogo';

interface LoginFormProps {
  onSubmit: (credentials: LoginCredentials) => void;
  onGoogleLogin?: () => void;
  isLoading?: boolean;
  onBack: () => void;
  forgotPasswordHref?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({
  onSubmit,
  onGoogleLogin,
  isLoading = false,
  forgotPasswordHref = '/recuperar-senha',
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ email: identifier, password });
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      
      {/* Campo CPF ou E-mail */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider ml-1">
          CPF ou E-mail
        </label>
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4169E1] transition-colors">
            <IdCard size={20} />
          </div>
          <input 
            type="text" 
            inputMode="email"
            placeholder="CPF ou seu@email.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-[#4169E1] focus:bg-white focus:ring-4 focus:ring-[#4169E1]/10 transition-all font-semibold text-sm shadow-sm"
            required
          />
        </div>
      </div>

      {/* Campo Senha */}
      <div className="space-y-2">
        <div className="flex justify-between items-center ml-1">
          <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider">
            Senha
          </label>
          <a href={forgotPasswordHref} className="text-xs font-bold text-[#4169E1] hover:text-[#001a33] transition-colors">
            Esqueceu a senha?
          </a>
        </div>
        <div className="relative group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#4169E1] transition-colors">
            <Lock size={20} />
          </div>
          <input 
            type={showPassword ? "text" : "password"} 
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-12 pr-12 py-4 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 outline-none focus:border-[#4169E1] focus:bg-white focus:ring-4 focus:ring-[#4169E1]/10 transition-all font-semibold text-sm shadow-sm"
            required
          />
          <button 
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#001a33] transition-colors p-1"
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </div>

      {/* Checkbox Lembrar-me */}
      <div className="flex items-center ml-1">
        <label className="flex items-center cursor-pointer group select-none">
          <div className="relative">
            <input 
              type="checkbox" 
              className="peer sr-only"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <div className="w-5 h-5 border-2 border-slate-300 rounded peer-checked:bg-[#4169E1] peer-checked:border-[#4169E1] transition-all"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100 transition-opacity">
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <span className="ml-3 text-sm font-medium text-slate-500 group-hover:text-[#001a33] transition-colors">
            Manter conectado
          </span>
        </label>
      </div>

      {/* Botão de Ação */}
      <button 
        disabled={isLoading}
        className="w-full bg-[#001a33] hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-900/20 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-3 group transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <span>{isLoading ? 'Autenticando...' : 'Acessar Plataforma'}</span>
        {!isLoading && (
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        )}
      </button>

      {onGoogleLogin ? (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ou</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3.5 text-xs font-black uppercase tracking-widest text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <GoogleLogo className="h-5 w-5" />
            Entrar com Google
          </button>
        </>
      ) : null}

      {/* Texto de suporte */}
      <p className="text-center text-slate-400 text-xs font-medium pt-4">
        Não tem acesso? <a href="/#/contato" className="text-[#4169E1] hover:underline font-bold">Fale com a secretaria</a>
      </p>
    </form>
  );
};

export default LoginForm;
