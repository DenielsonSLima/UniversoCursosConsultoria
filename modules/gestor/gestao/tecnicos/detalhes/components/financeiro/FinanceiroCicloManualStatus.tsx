import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Landmark,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
} from 'lucide-react';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';
import type { MatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.types';

type GeneratedCycle = NonNullable<MatriculaTecnicaCicloManual['cicloGerado']>;

interface FinanceiroCicloManualStatusProps {
  cicloManual: MatriculaTecnicaCicloManual;
  disabled: boolean;
  onGenerate: () => void;
  onResume: () => void;
}

const cycleLabel = (cycle: number | null | undefined) => (
  Number.isInteger(cycle) && Number(cycle) > 0 ? `${cycle}º ciclo` : 'Ciclo'
);

const isFullyIssued = (generated: GeneratedCycle) => (
  generated.quantidadeItens > 0
  && generated.emitidosBanese === generated.quantidadeItens
  && generated.pendentesEmissao === 0
  && generated.emRevisao === 0
);

export const getFinanceiroSituationLabel = (row: MatriculaTecnicaFinanceiroRow) => {
  if (row.cicloManual.habilitado && row.cicloManual.modo === 'MANUAL') {
    const generated = row.cicloManual.cicloGerado;
    const generatedCycle = generated?.numero;
    const fullyIssued = generated ? isFullyIssued(generated) : false;
    if (row.cicloManual.estado === 'PROTEGIDO_EXISTENTE') {
      return `${generatedCycle || 2}º ciclo gerado e emitido`;
    }
    if (row.cicloManual.estado === 'JA_GERADO') {
      return `${generatedCycle || row.cicloManual.cicloMaximo || 2}º ciclo ${
        fullyIssued ? 'gerado e emitido' : 'com emissão incompleta'
      }`;
    }
    if (row.cicloManual.estado === 'ELEGIVEL') {
      return `Elegível para gerar e emitir ${row.cicloManual.proximoCicloNumero}º ciclo`;
    }
    if (row.cicloManual.estado === 'BLOQUEADO') {
      return `${row.cicloManual.proximoCicloNumero || ''}º ciclo bloqueado`.trim();
    }
    if (row.cicloManual.estado === 'CICLOS_CONCLUIDOS') return 'Ciclos concluídos';
    return 'Geração manual indisponível';
  }
  if (row.financeiro.status === 'NAO_CONFIGURADO') return 'Não configurado';
  if (row.financeiro.status === 'PENDENTE') return 'Pendente';
  if (row.financeiro.status === 'AGENDADA') return 'Agendada';
  if (row.financeiro.status === 'ATIVADA') return 'Ativada';
  return row.situacaoFinanceira === 'INADIMPLENTE'
    ? 'Gerada · Inadimplente'
    : 'Gerada';
};

const GeneratedCycleStatus: React.FC<{
  generated: GeneratedCycle;
  disabled: boolean;
  onResume: () => void;
}> = ({ generated, disabled, onResume }) => {
  const fullyIssued = isFullyIssued(generated);
  return (
    <div className="space-y-2" role="status">
      <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[9px] font-black uppercase ${
        fullyIssued ? 'bg-emerald-100 text-emerald-800' : 'bg-cyan-100 text-cyan-800'
      }`}>
        {fullyIssued ? <CheckCircle2 size={12} /> : <ReceiptText size={12} />}
        {cycleLabel(generated.numero)} {fullyIssued ? 'já gerado e emitido' : 'com emissão incompleta'}
      </span>
      <p className="text-[9px] font-bold text-slate-500">
        {generated.emitidosBanese}/{generated.quantidadeItens} emitidos
        {generated.pendentesEmissao > 0 ? ` · ${generated.pendentesEmissao} pendentes` : ''}
        {generated.emRevisao > 0 ? ` · ${generated.emRevisao} em revisão` : ''}
      </p>
      {generated.emRevisao > 0 ? (
        <p className="flex items-center gap-1 text-[9px] font-bold text-amber-700">
          <AlertTriangle size={12} />
          Revisão manual necessária; emissão automática bloqueada para evitar duplicidade.
        </p>
      ) : null}
      {generated.pendentesEmissao > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onResume}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2 text-[9px] font-black uppercase text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
        >
          <Landmark size={12} /> Retomar emissão
        </button>
      ) : null}
    </div>
  );
};

export const MatriculaAcademicaBadge: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.trim().toUpperCase();
  const blocked = ['TRANCADO', 'CANCELADO', 'TRANSFERIDO', 'CONCLUIDO'].includes(normalized);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${
      blocked ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
    }`}>
      {blocked ? <LockKeyhole size={11} /> : <ShieldCheck size={11} />}
      Matrícula {normalized || 'NÃO INFORMADA'}
    </span>
  );
};

const FinanceiroCicloManualStatus: React.FC<FinanceiroCicloManualStatusProps> = ({
  cicloManual,
  disabled,
  onGenerate,
  onResume,
}) => {
  const generated = cicloManual.cicloGerado;
  const generatedLabel = cycleLabel(generated?.numero);

  if (!cicloManual.habilitado || cicloManual.modo !== 'MANUAL') return null;

  if (cicloManual.estado === 'PROTEGIDO_EXISTENTE') {
    return (
      <div className="space-y-1.5" role="status">
        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">
          <ShieldCheck size={12} /> {generatedLabel} já gerado e emitido
        </span>
        <p className="text-[9px] font-bold text-slate-500">Protegido contra novas cobranças.</p>
      </div>
    );
  }

  if (generated && !isFullyIssued(generated)) {
    return <GeneratedCycleStatus generated={generated} disabled={disabled} onResume={onResume} />;
  }

  if (cicloManual.estado === 'JA_GERADO' && generated) {
    return (
      <GeneratedCycleStatus
        generated={generated}
        disabled={disabled}
        onResume={onResume}
      />
    );
  }

  if (cicloManual.estado === 'ELEGIVEL' && cicloManual.podeGerar) {
    return (
      <div className="space-y-3">
        {generated ? <GeneratedCycleStatus generated={generated} disabled={disabled} onResume={onResume} /> : null}
        <div className={generated ? 'border-t border-slate-100 pt-2' : ''}>
          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-800">
            <CheckCircle2 size={12} /> {cycleLabel(cicloManual.proximoCicloNumero)} elegível
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={onGenerate}
            className="mt-1.5 block rounded-lg bg-emerald-600 px-3 py-2 text-[9px] font-black uppercase text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            Gerar e emitir {cycleLabel(cicloManual.proximoCicloNumero)}
          </button>
        </div>
      </div>
    );
  }

  if (cicloManual.estado === 'BLOQUEADO') {
    return (
      <div className="max-w-56 space-y-3" role="status">
        {generated ? <GeneratedCycleStatus generated={generated} disabled={disabled} onResume={onResume} /> : null}
        <div className={generated ? 'border-t border-slate-100 pt-2' : ''}>
          <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-1 text-[9px] font-black uppercase text-rose-800">
            <LockKeyhole size={12} /> {cycleLabel(cicloManual.proximoCicloNumero)} bloqueado
          </span>
          <p className="mt-1.5 text-[9px] font-semibold leading-relaxed text-rose-700">
            {cicloManual.bloqueio?.mensagem || 'O servidor não liberou a geração deste ciclo.'}
          </p>
        </div>
      </div>
    );
  }

  if (cicloManual.estado === 'CICLOS_CONCLUIDOS') {
    return (
      <div className="space-y-2" role="status">
        {generated ? <GeneratedCycleStatus generated={generated} disabled={disabled} onResume={onResume} /> : null}
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-[9px] font-black uppercase text-slate-600">
          <CheckCircle2 size={12} /> Ciclos concluídos
        </span>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-1 text-[9px] font-black uppercase text-amber-800" role="status">
      <AlertTriangle size={12} /> Geração manual indisponível
    </span>
  );
};

export default FinanceiroCicloManualStatus;
