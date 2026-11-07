import React from 'react';
import { AlertCircle, CheckCircle2, Loader2, LockKeyhole, Pencil, Trash2 } from 'lucide-react';
import type { CredentialCheck } from './WhatsAppLineConfig.types';

export const Field = ({
  icon: Icon,
  label,
  children,
  span = false,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) => (
  <label className={`flex flex-col gap-1.5 ${span ? 'md:col-span-2' : ''}`}>
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
      <Icon size={13} />
      {label}
    </span>
    {children}
  </label>
);

export const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';

export const StatusPill = ({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
      ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
    }`}
  >
    {ready ? <CheckCircle2 size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
    {children}
  </span>
);

const credentialStateStyles: Record<CredentialCheck['state'], string> = {
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stored: 'border-blue-200 bg-blue-50 text-blue-700',
  missing: 'border-slate-200 bg-slate-50 text-slate-500',
  invalid: 'border-red-200 bg-red-50 text-red-700',
};

const credentialStateLabels: Record<CredentialCheck['state'], string> = {
  valid: 'Válido',
  verified: 'Confirmado',
  stored: 'Salvo no cofre',
  missing: 'Não configurado',
  invalid: 'Inválido',
};

export const CredentialField = ({
  id,
  icon: Icon,
  label,
  configured,
  check,
  value,
  onChange,
  onRemove,
  isRemoving,
  placeholder,
  span = false,
  managedByLogin = false,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  configured: boolean;
  check?: CredentialCheck;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  isRemoving: boolean;
  placeholder: string;
  span?: boolean;
  managedByLogin?: boolean;
}) => {
  const state = check?.state ?? (configured ? 'stored' : 'missing');
  const description = check?.message ?? (managedByLogin
    ? configured
      ? 'Token obtido pelo login da Meta e protegido no cofre.'
      : 'Será criado automaticamente ao concluir o login com Facebook.'
    : configured
    ? 'A credencial está protegida no cofre. O valor não é exibido por segurança.'
    : 'Nenhuma credencial foi salva para esta linha.');

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 ${span ? 'md:col-span-2' : ''}`}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Icon size={13} />
            {label}
          </span>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-400">{description}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${credentialStateStyles[state]}`}>
          {state === 'invalid' ? <AlertCircle size={11} /> : state === 'missing' ? <LockKeyhole size={11} /> : <CheckCircle2 size={11} />}
          {credentialStateLabels[state]}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {managedByLogin ? (
          <div className="flex h-11 flex-1 items-center rounded-lg border border-dashed border-slate-200 bg-white px-3.5 text-xs text-slate-500">
            {configured ? '••••••••  Gerenciado pelo login da Meta' : 'Conclua “Entrar com Facebook” para gerar'}
          </div>
        ) : (
          <input
            id={id}
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
            placeholder={configured ? 'Digite uma nova credencial para substituir' : placeholder}
            autoComplete="new-password"
            aria-label={configured ? `Nova credencial para ${label}` : label}
          />
        )}
        {configured ? (
          <div className="flex shrink-0 gap-2">
            {!managedByLogin ? (
              <button
                type="button"
                onClick={() => document.getElementById(id)?.focus()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700"
              >
                <Pencil size={13} />
                Alterar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Remover
            </button>
          </div>
        ) : null}
      </div>
      {value && !managedByLogin ? (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          Nova credencial pronta para salvar. O valor atual só será substituído ao clicar em Salvar.
        </p>
      ) : null}
    </div>
  );
};

