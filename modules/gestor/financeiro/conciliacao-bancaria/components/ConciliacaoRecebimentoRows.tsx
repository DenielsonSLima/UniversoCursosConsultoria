import React from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileCheck,
  Globe,
  HelpCircle,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { BaneseReceivable } from '../conciliacao-bancaria.fetch';
import {
  conciliacaoStatusClass,
  formatConciliacaoCurrency,
  formatConciliacaoDate,
  formatConciliacaoDateTime,
} from '../conciliacao-bancaria.formatters';

export type ConciliacaoRecebimentoRow = BaneseReceivable;

interface ConciliacaoRecebimentoRowsProps {
  rows: ConciliacaoRecebimentoRow[];
  refreshingIds: string[];
  isLoading: boolean;
  isError: boolean;
  isBatchSyncing: boolean;
  onRefresh: (receivableId: string) => void;
}

const optionalCurrency = (value?: number | null) => (
  typeof value === 'number' && Number.isFinite(value)
    ? formatConciliacaoCurrency(value)
    : 'Não informado'
);

const signedOptionalCurrency = (value: number | null | undefined, sign: '+' | '−') => (
  typeof value === 'number' && Number.isFinite(value)
    ? `${sign} ${formatConciliacaoCurrency(value)}`
    : 'Não informado'
);

const paymentMethodLabel = (value?: string) => ({
  BOLETO: 'Boleto',
  PIX: 'Pix',
  CARTAO: 'Cartão',
  CREDIT_CARD: 'Cartão',
  DINHEIRO: 'Dinheiro',
}[String(value || '').toUpperCase()] || value || 'Não informada');

const safeReceiptUrl = (value?: string) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const isHistorical = (row: ConciliacaoRecebimentoRow) => (
  row.canalBaixa === 'HISTORICO_MIGRADO'
  || String(row.origemRecebimento || '').toUpperCase() === 'HISTORICO_MIGRADO'
);

const settlementDateTimeLabel = (row: ConciliacaoRecebimentoRow) => {
  if (row.baixaRegistradaEm) return formatConciliacaoDateTime(row.baixaRegistradaEm);
  return 'Registro não disponível';
};

const settlementTimeSourceLabel = (row: ConciliacaoRecebimentoRow) => {
  switch (row.baixaTempoProveniencia) {
    case 'MANUAL_CONCLUSAO': return 'Conclusão da baixa manual';
    case 'SISTEMA_REGISTRO': return 'Registro da confirmação no sistema';
    case 'HISTORICO_SEM_HORA': return 'Histórico sem horário de origem';
    default: return 'Registro da baixa no sistema';
  }
};

const settlementOriginBadge = (row: ConciliacaoRecebimentoRow) => {
  if (row.status !== 'PAGO') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">
        <HelpCircle size={12} aria-hidden="true" className="text-amber-600" />
        Aguardando baixa
      </span>
    );
  }
  if (isHistorical(row)) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-extrabold text-slate-700">
        <Archive size={12} aria-hidden="true" />
        Histórico migrado
      </span>
    );
  }
  if (row.canalBaixa === 'API_BANESE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">
        <Globe size={12} aria-hidden="true" />
        Automática · Banese
      </span>
    );
  }
  if (row.canalBaixa === 'CNAB240') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[10px] font-extrabold text-purple-700">
        <FileCheck size={12} aria-hidden="true" />
        CNAB240 · Retorno
      </span>
    );
  }
  if (row.canalBaixa === 'MERCADO_PAGO') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-extrabold text-sky-700">
        <CreditCard size={12} aria-hidden="true" />
        Mercado Pago · Cartão
      </span>
    );
  }
  if (row.canalBaixa === 'CAIXA_MANUAL') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold text-emerald-800">
        <Building2 size={12} aria-hidden="true" />
        Manual · Caixa
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-extrabold text-slate-600">
      <HelpCircle size={12} aria-hidden="true" />
      Outra origem
    </span>
  );
};

const statusBadge = (row: ConciliacaoRecebimentoRow) => (
  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${conciliacaoStatusClass(row.status)}`}>
    {row.status}
  </span>
);

const field = (label: string, value: React.ReactNode, tone = 'text-slate-800') => (
  <div className="min-w-0">
    <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className={`mt-0.5 break-words text-[11px] font-bold ${tone}`}>{value}</dd>
  </div>
);

const titleContext = (row: ConciliacaoRecebimentoRow) => (
  [row.cursoNome, row.turmaNome, row.matriculaCodigo, row.parcelaLabel]
    .filter(Boolean)
    .join(' · ')
);

const SettlementDetails: React.FC<{
  row: ConciliacaoRecebimentoRow;
  isRefreshing: boolean;
  isBatchSyncing: boolean;
  onRefresh: (receivableId: string) => void;
}> = ({ row, isRefreshing, isBatchSyncing, onRefresh }) => {
  if (row.status !== 'PAGO') {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Baixa financeira</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-600">Ainda sem baixa registrada.</p>
        </div>
        <button
          type="button"
          onClick={() => onRefresh(row.id)}
          disabled={isRefreshing || isBatchSyncing}
          aria-label={`Reverificar cobrança ${row.descricao} na API Banese`}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw size={12} aria-hidden="true" className={isRefreshing ? 'animate-spin text-blue-600' : ''} />
          {isRefreshing ? 'Verificando...' : 'Re-verificar'}
        </button>
      </div>
    );
  }

  const receiptUrl = safeReceiptUrl(row.comprovanteUrl);
  const compositionStatus = row.composicaoStatus || '';
  const compositionNeedsContext = compositionStatus === 'NAO_DISCRIMINADA_PELO_GATEWAY';
  const compositionIsNeutral = !compositionStatus
    || compositionStatus === 'HISTORICO_SEM_COMPOSICAO';
  const compositionResolvedLabel = compositionStatus === 'COMPOSICAO_EXPLICITA'
    ? 'Composição informada na baixa manual.'
    : compositionStatus === 'CONCILIADO_POR_FORMULA_BANESE'
      ? 'Composição reconciliada pelas regras financeiras do título.'
      : compositionStatus === 'SEM_DIFERENCA_FINANCEIRA'
        ? 'Valor recebido sem diferença financeira.'
        : 'Composição não informada.';

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-5">
        {field('Data do pagamento', (
          <span className="block">
            {row.dataPagamento ? (
              <time className="block" dateTime={row.dataPagamento}>
                {formatConciliacaoDate(row.dataPagamento)}
              </time>
            ) : 'Não informada'}
            <span className="mt-0.5 block text-[9px] font-medium text-slate-500">
              Data usada no Caixa
            </span>
          </span>
        ), 'text-emerald-800')}
        {field('Baixa registrada', (
          <span className="block">
            {row.baixaRegistradaEm ? (
              <time className="block" dateTime={row.baixaRegistradaEm}>
                {settlementDateTimeLabel(row)}
              </time>
            ) : settlementDateTimeLabel(row)}
            <span className="mt-0.5 block text-[9px] font-medium text-slate-500">
              {settlementTimeSourceLabel(row)}
            </span>
          </span>
        ))}
        {field('Valor pago', optionalCurrency(row.valorPago), 'text-emerald-700')}
        {field('Desconto', signedOptionalCurrency(row.descontoAplicado, '−'), 'text-emerald-700')}
        {field('Juros', signedOptionalCurrency(row.jurosAplicados, '+'), 'text-amber-700')}
        {field('Multa', signedOptionalCurrency(row.multaAplicada, '+'), 'text-rose-700')}
        {field('Acréscimos', signedOptionalCurrency(row.acrescimoAplicado, '+'), 'text-indigo-700')}
        {field('Forma', paymentMethodLabel(row.formaPagamento))}
        {field('Conta recebedora', row.contaRecebedoraNome || 'Não informada')}
        {field('Responsável', isHistorical(row) ? 'Histórico migrado' : row.operadorNome || 'Sistema')}
      </dl>

      <div className="flex flex-col gap-2 border-t border-slate-200/70 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {settlementOriginBadge(row)}
          {compositionNeedsContext ? (
            <span className="text-[10px] font-semibold text-amber-800">
              Composição parcial: diferença não discriminada {optionalCurrency(row.diferencaNaoDiscriminada)}.
            </span>
          ) : compositionIsNeutral ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
              <HelpCircle size={12} aria-hidden="true" />
              {isHistorical(row)
                ? 'Histórico sem detalhamento da composição.'
                : 'Composição não informada na origem.'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700">
              <CheckCircle2 size={12} aria-hidden="true" />
              {compositionResolvedLabel}
            </span>
          )}
        </div>
        {receiptUrl ? (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-9 items-center justify-center gap-1.5 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:self-auto"
          >
            <ExternalLink size={12} aria-hidden="true" />
            Abrir comprovante
          </a>
        ) : null}
      </div>
    </div>
  );
};

const RowIdentity: React.FC<{
  row: ConciliacaoRecebimentoRow;
  titleId?: string;
}> = ({ row, titleId }) => {
  const context = titleContext(row);
  const errorText = row.gatewayLastError && !['-', '[object Object]'].includes(row.gatewayLastError)
    ? row.gatewayLastError
    : null;
  return (
    <div>
      <p className="font-black text-slate-900">{row.clienteNome || 'Pagador não identificado'}</p>
      <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-500">
        {row.clienteDocumentoMascarado || 'Documento não informado'}
      </p>
      <p id={titleId} className="mt-1.5 font-bold text-slate-700">
        {row.descricao}
      </p>
      {context ? <p className="mt-0.5 text-[10px] font-medium text-slate-500">{context}</p> : null}
      {errorText ? (
        <p className="mt-1 flex items-start gap-1 text-[10px] font-medium text-rose-600">
          <ShieldAlert size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
          {errorText}
        </p>
      ) : null}
    </div>
  );
};

const ConciliacaoRecebimentoRows: React.FC<ConciliacaoRecebimentoRowsProps> = ({
  rows,
  refreshingIds,
  isLoading,
  isError,
  isBatchSyncing,
  onRefresh,
}) => {
  if (isLoading) {
    return (
      <div role="status" className="py-12 text-center text-xs font-semibold text-slate-500">
        <Loader2 size={20} aria-hidden="true" className="mx-auto mb-2 animate-spin text-blue-600" />
        Carregando dados de conciliação bancária...
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="bg-rose-50 p-6 text-center text-xs font-semibold text-rose-700">
        Não foi possível recuperar os lançamentos do ambiente bancário ativo.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="p-10 text-center text-xs font-bold uppercase text-slate-400">
        Nenhuma cobrança encontrada para os filtros selecionados.
      </div>
    );
  }

  return (
    <>
      <table className="hidden w-full text-left lg:table">
        <caption className="sr-only">
          Cobranças monitoradas e detalhes das respectivas baixas financeiras
        </caption>
        <thead className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase text-slate-500">
          <tr>
            <th scope="col" className="p-3.5">Pagador / Cobrança</th>
            <th scope="col" className="p-3.5">Nosso Número</th>
            <th scope="col" className="p-3.5">Vencimento</th>
            <th scope="col" className="p-3.5">Valor Nominal</th>
            <th scope="col" className="p-3.5">Status</th>
            <th scope="col" className="p-3.5">Origem</th>
          </tr>
        </thead>
        {rows.map((row) => {
          const isRefreshing = refreshingIds.includes(row.id);
          return (
            <tbody key={row.id} className="border-b border-slate-200 text-xs last:border-b-0">
              <tr className="align-top transition-colors hover:bg-slate-50/80">
                <th scope="row" className="min-w-[280px] p-3.5 text-left font-normal">
                  <RowIdentity row={row} />
                </th>
                <td className="p-3.5 font-mono text-[11px] font-bold text-slate-600">{row.nossoNumero || '-'}</td>
                <td className="p-3.5 text-slate-600">{formatConciliacaoDate(row.dataVencimento)}</td>
                <td className="p-3.5 font-black text-slate-800">{formatConciliacaoCurrency(row.valor)}</td>
                <td className="p-3.5">{statusBadge(row)}</td>
                <td className="p-3.5">{settlementOriginBadge(row)}</td>
              </tr>
              <tr className={row.status === 'PAGO' ? 'bg-emerald-50/35' : 'bg-slate-50/80'}>
                <td colSpan={6} className="px-4 py-3">
                  <SettlementDetails
                    row={row}
                    isRefreshing={isRefreshing}
                    isBatchSyncing={isBatchSyncing}
                    onRefresh={onRefresh}
                  />
                </td>
              </tr>
            </tbody>
          );
        })}
      </table>

      <div className="divide-y divide-slate-200 lg:hidden">
        {rows.map((row) => {
          const isRefreshing = refreshingIds.includes(row.id);
          return (
            <article key={row.id} aria-labelledby={`conciliacao-cobranca-${row.id}-mobile`} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <RowIdentity row={row} titleId={`conciliacao-cobranca-${row.id}-mobile`} />
                <span className="shrink-0">{statusBadge(row)}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-slate-100 bg-white p-3 sm:grid-cols-4">
                {field('Nosso Número', row.nossoNumero || '-')}
                {field('Vencimento', formatConciliacaoDate(row.dataVencimento))}
                {field('Valor nominal', formatConciliacaoCurrency(row.valor))}
                {field('Origem', settlementOriginBadge(row))}
              </dl>
              <div className={`rounded-xl border p-3 ${row.status === 'PAGO' ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-slate-50'}`}>
                <SettlementDetails
                  row={row}
                  isRefreshing={isRefreshing}
                  isBatchSyncing={isBatchSyncing}
                  onRefresh={onRefresh}
                />
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
};

export default ConciliacaoRecebimentoRows;
