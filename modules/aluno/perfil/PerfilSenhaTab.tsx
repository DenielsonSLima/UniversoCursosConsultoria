import React, { useMemo, useState } from 'react';
import { CheckCircle, Eye, EyeOff, LoaderCircle, Lock } from 'lucide-react';
import { loginService } from '../../login/login.service';

const hasStrongPassword = (value: string) => (
  value.length >= 6 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
);

const PerfilSenhaTab: React.FC = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const canSubmit = useMemo(() => (
    hasStrongPassword(newPassword) && newPassword === confirmPassword
  ), [newPassword, confirmPassword]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!newPassword || !confirmPassword) {
      setMessage({ tone: 'error', text: 'Preencha nova senha e confirmação.' });
      return;
    }

    if (!hasStrongPassword(newPassword)) {
      setMessage({
        tone: 'error',
        text: 'A nova senha precisa ter no mínimo 6 caracteres, 1 letra maiúscula, 1 minúscula e 1 número.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return;
    }

    setIsLoading(true);
    try {
      const error = await loginService.updatePassword(newPassword);
      if (error) {
        setMessage({ tone: 'error', text: error });
        return;
      }

      setMessage({
        tone: 'success',
        text: 'Senha atualizada com sucesso. Use a nova senha no próximo login.',
      });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível atualizar a senha.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-[2.5rem] border border-slate-100 bg-white p-6 shadow-sm md:p-8">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Lock size={16} />
        </div>
        <h3 className="text-base font-bold uppercase tracking-tight text-[#001a33]">Alterar senha</h3>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Esta troca é para quem já possui acesso por e-mail e senha no portal do aluno.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5 text-xs">
        <label className="block space-y-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Nova senha</span>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              required
            />
            <button
              type="button"
              onClick={() => setShowNew((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <label className="block space-y-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Confirmar nova senha</span>
          <div className="relative">
            <input
              type={showConfirmation ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repita a nova senha"
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmation((prev) => !prev)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500"
            >
              {showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <p className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${
          hasStrongPassword(newPassword)
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
        >
          Sua nova senha precisa ter 6+ caracteres, 1 letra maiúscula, 1 minúscula e 1 número.
        </p>

        {message && (
          <div
            className={`rounded-2xl border px-4 py-3 text-[11px] font-bold leading-relaxed ${
              message.tone === 'success'
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-red-100 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || !canSubmit}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#001a33] text-xs font-black uppercase tracking-widest text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {isLoading ? <LoaderCircle size={16} className="h-4 w-4 animate-spin" /> : <CheckCircle size={16} />}
          {isLoading ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
};

export default PerfilSenhaTab;
