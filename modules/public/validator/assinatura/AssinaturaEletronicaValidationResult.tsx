import React from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Fingerprint,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import type { ElectronicSignatureValidationResult } from '../validator.types';

const SIGNATURE_TIME_ZONE = 'America/Maceio';

const formatSignedAt = (signedAt: string) => {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SIGNATURE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'longOffset',
  }).format(new Date(signedAt));
  return `${formatted.replace('GMT', 'UTC')} · ${SIGNATURE_TIME_ZONE}`;
};

const AssinaturaEletronicaValidationResult: React.FC<{
  result: ElectronicSignatureValidationResult;
}> = ({ result }) => {
  const revoked = result.status === 'revoked';

  return (
    <section className="mt-12 animate-fadeIn" aria-label="Prova individual da assinatura">
      <div className={`rounded-3xl border p-7 md:p-9 ${
        revoked
          ? 'border-amber-200 bg-amber-50'
          : 'border-emerald-200 bg-emerald-50'
      }`}>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <div className={`rounded-2xl p-3 ${
              revoked
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {revoked
                ? <ShieldCheck size={30} aria-hidden="true" />
                : <CheckCircle2 size={30} aria-hidden="true" />}
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                Prova individual de assinatura
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-900">
                {revoked ? 'Documento substituído' : 'Assinatura confirmada'}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Ato vinculado ao evento oficial e ao Diário de Classe finalizado.
              </p>
            </div>
          </div>
          <span className="self-start rounded-full bg-white px-4 py-2 font-mono text-xs font-bold text-slate-600 shadow-sm">
            {result.code}
          </span>
        </div>

        <dl className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
            <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <UserRound size={17} aria-hidden="true" /> Assinante
            </dt>
            <dd className="mt-3 text-lg font-black text-slate-900">
              {result.signature.signerNameMasked}
            </dd>
            <dd className="mt-1 font-mono text-sm font-bold text-slate-600">
              CPF {result.signature.signerCpfMasked}
            </dd>
            <dd className="mt-2 text-sm font-semibold text-blue-700">
              {result.signature.roleLabel}
            </dd>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm">
            <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <CalendarClock size={17} aria-hidden="true" /> Data e hora
            </dt>
            <dd className="mt-3 text-sm font-bold leading-6 text-slate-800">
              {formatSignedAt(result.signature.signedAt)}
            </dd>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white p-5 shadow-sm md:col-span-2">
            <dt className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <Fingerprint size={17} aria-hidden="true" /> Hash individual da assinatura
            </dt>
            <dd className="mt-3 break-all font-mono text-xs font-bold leading-6 text-slate-700">
              {result.signature.hash}
            </dd>
          </div>
        </dl>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 text-xs text-slate-600">
          <p><strong>Instituição:</strong> {result.institution.name}</p>
          <p className="mt-1 break-all font-mono">
            <strong>Documento:</strong> {result.document.code}
          </p>
        </div>
      </div>
    </section>
  );
};

export default AssinaturaEletronicaValidationResult;
