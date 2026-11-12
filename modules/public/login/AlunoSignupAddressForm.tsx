import React from 'react';
import { ArrowRight, ChevronLeft, CheckCircle2, Loader2, MapPin } from 'lucide-react';
import AdaptiveTurnstileWidget, { type TurnstileStatus } from '../../shared/auth/AdaptiveTurnstileWidget';
import type { AlunoLoginAuthCardProps } from './AlunoLoginAuthCard';

type Props = Pick<AlunoLoginAuthCardProps,
  'loading' | 'cep' | 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cepStatus' | 'onCepChange' | 'onEnderecoChange' | 'onNumeroChange' | 'onComplementoChange' | 'onBairroChange' | 'onCidadeChange' | 'onUfChange' | 'onSignupBack'
> & {
  onSubmit: React.FormEventHandler;
  turnstileToken: string;
  turnstileResetSignal: number;
  turnstileStatus: TurnstileStatus;
  setTurnstileToken: (token: string) => void;
  setTurnstileStatus: (status: TurnstileStatus) => void;
};
const inputClassName = 'aluno-auth-input h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-medium text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100';

export default function AlunoSignupAddressForm({
  loading, cep, endereco, numero, complemento, bairro, cidade, uf, cepStatus, onCepChange, onEnderecoChange, onNumeroChange, onComplementoChange, onBairroChange, onCidadeChange, onUfChange, onSignupBack, turnstileToken, turnstileResetSignal, turnstileStatus, setTurnstileToken, setTurnstileStatus, onSubmit,
}: Props) {
  return (
      <form
        onSubmit={onSubmit}
        className="grid gap-4 sm:grid-cols-6"
      >
        <div className="flex items-center gap-3 sm:col-span-6" aria-label="Etapa 2 de 2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 size={14} />
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-full rounded-full bg-blue-600" />
          </div>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-[10px] font-black text-white">2</span>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900 sm:col-span-6">
          <MapPin className="mr-1.5 inline-block text-blue-600" size={16} />
          Comece pelo CEP. Logradouro, bairro, cidade e UF serão preenchidos automaticamente. Informe o número e, se houver, o complemento.
        </div>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">CEP</span>
          <div className="relative">
            <input
              type="text"
              name="postal-code"
              autoComplete="postal-code"
              inputMode="numeric"
              maxLength={9}
              required
              value={cep}
              onChange={(event) => onCepChange(event.target.value)}
              placeholder="00000-000"
              className={`${inputClassName} pr-11`}
              autoFocus
            />
            {cepStatus === 'loading' && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-500" size={18} />}
          </div>
        </label>

        <label className="block sm:col-span-4">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Endereço</span>
          <input type="text" name="street-address" autoComplete="street-address" required value={endereco} onChange={(event) => onEnderecoChange(event.target.value)} placeholder="Rua, avenida..." className={inputClassName} />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Número</span>
          <input type="text" name="address-number" autoComplete="address-line2" maxLength={60} value={numero} onChange={(event) => onNumeroChange(event.target.value)} placeholder="S/N quando não informado" className={inputClassName} />
        </label>

        <label className="block sm:col-span-4">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Complemento <span className="normal-case tracking-normal text-slate-300">(opcional)</span></span>
          <input type="text" name="address-complement" value={complemento} onChange={(event) => onComplementoChange(event.target.value)} placeholder="Apto, bloco, referência..." className={inputClassName} />
        </label>

        <label className="block sm:col-span-3">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Bairro</span>
          <input type="text" name="address-level3" autoComplete="address-level3" required value={bairro} onChange={(event) => onBairroChange(event.target.value)} placeholder="Bairro" className={inputClassName} />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Cidade</span>
          <input type="text" name="address-level2" autoComplete="address-level2" required value={cidade} onChange={(event) => onCidadeChange(event.target.value)} placeholder="Cidade" className={inputClassName} />
        </label>

        <label className="block sm:col-span-1">
          <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">UF</span>
          <input type="text" name="address-level1" autoComplete="address-level1" maxLength={2} required value={uf} onChange={(event) => onUfChange(event.target.value)} placeholder="SE" className={`${inputClassName} text-center`} />
        </label>

        {cepStatus !== 'idle' && (
          <p className={`text-[10px] font-bold sm:col-span-6 ${
            cepStatus === 'resolved'
              ? 'text-emerald-600'
              : cepStatus === 'loading'
                ? 'text-blue-600'
                : 'text-amber-600'
          }`}>
            {cepStatus === 'resolved' && 'CEP localizado. Confira o endereço e informe o número.'}
            {cepStatus === 'loading' && 'Consultando CEP...'}
            {cepStatus === 'not-found' && 'CEP não encontrado. Confira o CEP ou preencha o endereço manualmente.'}
            {cepStatus === 'error' && 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.'}
          </p>
        )}

        <div className="sm:col-span-6">
          <AdaptiveTurnstileWidget
            action="signup"
            resetSignal={turnstileResetSignal}
            onTokenChange={setTurnstileToken}
            onStatusChange={setTurnstileStatus}
            onError={() => setTurnstileToken('')}
          />
        </div>

        <button type="button" onClick={onSignupBack} disabled={loading} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 disabled:opacity-60 sm:col-span-2">
          <ChevronLeft size={16} />
          Voltar
        </button>
        <button
          type="submit"
          disabled={
            loading
            || !turnstileToken
            || turnstileStatus !== 'verified'
          }
          className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-emerald-600 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-4"
        >
          {loading ? <Loader2 className="animate-spin" size={16} /> : <ArrowRight size={16} />}
          {loading
            ? 'Criando cadastro…'
            : turnstileStatus === 'verified'
              ? 'Criar cadastro e continuar'
              : 'Aguardando verificação'}
        </button>
      </form>
  );
}
