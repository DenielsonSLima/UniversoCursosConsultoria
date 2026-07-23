import React from 'react';
import { BaneseSyncSummary, formatApiSyncDateTime } from './conciliacao-bancaria.utils';

interface ConciliacaoResumoProps {
  totalPendentes: number;
  valorPendentes: number | null;
  totalPagoHoje: number;
  totalComErro: number;
  apiSync: BaneseSyncSummary;
  cnab240Sync: BaneseSyncSummary;
}

interface ConciliacaoResumoCard {
  title: string;
  getValue: (summary: ConciliacaoResumoProps) => string | number;
  valueClass: string;
  detail: string;
}

const toCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);

const buildSyncCards = (summary: ConciliacaoResumoProps): ConciliacaoResumoCard[] => [
  {
    title: 'Última consulta API',
    getValue: () => formatApiSyncDateTime(summary.apiSync.lastConsultaAt),
    valueClass: 'text-[#001a33] text-sm',
    detail: 'Último retorno registrado via endpoint',
  },
  {
    title: 'Última sincronização API',
    getValue: () => formatApiSyncDateTime(summary.apiSync.lastSincronizacaoAt),
    valueClass: 'text-[#001a33] text-sm',
    detail: 'Último registro com atualização persistida',
  },
  {
    title: 'Sincronizações API hoje',
    getValue: () => summary.apiSync.syncsToday,
    valueClass: 'text-blue-700 text-3xl',
    detail: 'Registros conciliados por retorno da API hoje',
  },
  {
    title: 'Sincronizações API semana',
    getValue: () => summary.apiSync.syncsThisWeek,
    valueClass: 'text-blue-700 text-3xl',
    detail: 'Registros conciliados por retorno da API',
  },
  {
    title: 'Sincronizações API mês',
    getValue: () => summary.apiSync.syncsThisMonth,
    valueClass: 'text-blue-700 text-3xl',
    detail: 'Registros conciliados por retorno da API',
  },
  {
    title: 'Última consulta CNAB240',
    getValue: () => formatApiSyncDateTime(summary.cnab240Sync.lastConsultaAt),
    valueClass: 'text-[#001a33] text-sm',
    detail: 'Último arquivo de retorno registrado',
  },
  {
    title: 'Última sincronização CNAB240',
    getValue: () => formatApiSyncDateTime(summary.cnab240Sync.lastSincronizacaoAt),
    valueClass: 'text-[#001a33] text-sm',
    detail: 'Última atualização de arquivo de retorno',
  },
  {
    title: 'Arquivos CNAB240 hoje',
    getValue: () => summary.cnab240Sync.syncsToday,
    valueClass: 'text-indigo-700 text-3xl',
    detail: 'Arquivos de retorno registrados hoje',
  },
  {
    title: 'Arquivos CNAB240 semana',
    getValue: () => summary.cnab240Sync.syncsThisWeek,
    valueClass: 'text-indigo-700 text-3xl',
    detail: 'Arquivos de retorno registrados nesta semana',
  },
  {
    title: 'Arquivos CNAB240 mês',
    getValue: () => summary.cnab240Sync.syncsThisMonth,
    valueClass: 'text-indigo-700 text-3xl',
    detail: 'Arquivos de retorno registrados neste mês',
  },
];

const cards: ConciliacaoResumoCard[] = [
  {
    title: 'Pendentes',
    getValue: (summary) => summary.totalPendentes,
    valueClass: 'text-[#001a33] text-3xl',
    detail: 'Cobranças Banese ainda não baixadas',
  },
  {
    title: 'Valor pendente exato',
    getValue: (summary) => summary.valorPendentes === null
      ? 'Indisponível'
      : toCurrency(summary.valorPendentes),
    valueClass: 'text-emerald-700 text-sm',
    detail: 'Não estimado pela lista paginada; exige agregação segura específica',
  },
  {
    title: 'Boletos pagos hoje',
    getValue: (summary) => summary.totalPagoHoje,
    valueClass: 'text-emerald-700 text-3xl',
    detail: 'Cobranças Banese com pagamento no dia civil de Maceió',
  },
  {
    title: 'Erros de conciliação',
    getValue: (summary) => summary.totalComErro,
    valueClass: 'text-rose-700 text-3xl',
    detail: 'Itens com last_error persistido',
  },
];

const ConciliacaoBancariaResumo: React.FC<ConciliacaoResumoProps> = ({
  totalPendentes,
  valorPendentes,
  totalPagoHoje,
  totalComErro,
  apiSync,
  cnab240Sync,
}) => {
  const summary: ConciliacaoResumoProps = {
    totalPendentes,
    valorPendentes,
    totalPagoHoje,
    totalComErro,
    apiSync,
    cnab240Sync,
  };
  const syncCards = buildSyncCards(summary);
  const hasSyncError = summary.apiSync.hasApiSyncError || summary.cnab240Sync.hasApiSyncError;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.title} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{card.title}</p>
            <p className={`mt-2 font-black ${card.valueClass}`}>{String(card.getValue(summary))}</p>
            <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {syncCards.map((card) => (
          <div key={card.title} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{card.title}</p>
            <p className={`mt-2 font-black ${card.valueClass}`}>{String(card.getValue(summary))}</p>
            <p className="mt-2 text-xs text-slate-500">{card.detail}</p>
          </div>
        ))}
      </div>

      {hasSyncError || summary.totalComErro > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <p className="font-black uppercase tracking-wide">Atenção</p>
          <p className="mt-1 leading-relaxed">
            Há inconsistências de conciliação detectadas. Se os erros persistirem no retorno da API, rode a importação do CNAB 240 para consolidar os acertos em lote.
          </p>
        </div>
      ) : null}
    </>
  );
};

export default ConciliacaoBancariaResumo;
