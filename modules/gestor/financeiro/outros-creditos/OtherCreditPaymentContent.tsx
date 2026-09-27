import React from 'react';
import { ArrowUpRight, Barcode, CalendarDays, Check, CheckCircle2, Clock3, Copy, Download, LockKeyhole, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { formatBaneseCurrency, formatBaneseDate, formatBaneseDigitableLine, getBanesePixPresentation } from '../../../aluno/financeiro/banese/banese-payment.utils';
import useCopyFeedback from '../../../aluno/financeiro/banese/hooks/useCopyFeedback';
import { safeOtherCreditLink, type OtherCreditPayment } from './other-credit-payment.service';

export interface OtherCreditPaymentContentProps {
  data: OtherCreditPayment;
  onRefresh?: () => void;
  refreshPending?: boolean;
  isFetching?: boolean;
  onOpenDocument?: () => void;
  documentPending?: boolean;
}

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-4';

function CopyAction({ value, label, primary = false }: { value: string; label: string; primary?: boolean }) {
  const { state, copy } = useCopyFeedback(value);
  return (
    <div>
      <button type="button" onClick={() => void copy(value)} disabled={!value}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${primary
          ? 'bg-[#0b1f4a] text-white hover:bg-[#163768]'
          : 'border border-slate-200 bg-white text-[#0b1f4a] hover:border-blue-300 hover:bg-blue-50/40'}`}>
        {state === 'copied' ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
        {state === 'copied' ? 'Copiado' : label}
      </button>
      {state === 'error' && <p role="status" className="mt-2 text-xs text-rose-700">Não foi possível copiar. Selecione o código na tela.</p>}
    </div>
  );
}

export function OtherCreditPaymentContent({ data, onRefresh, refreshPending = false, isFetching = false, onOpenDocument, documentPending = false }: OtherCreditPaymentContentProps) {
  const record = data.payment;
  const paid = record.status === 'PAGO';
  const closed = ['CANCELADO', 'ESTORNADO', 'DEVOLVIDO'].includes(String(record.status));
  const bankClosed = ['PAID', 'RECEIVED', 'CONFIRMED', 'CANCELED', 'CANCELLED', 'CANCELED_BY_BANK', 'DELETED', 'REFUNDED'].includes(String(record.gateway_status));
  const payable = data.canPay && !paid && !closed && !bankClosed;
  const pix = getBanesePixPresentation(record);
  const pixAvailable = payable && data.pixState === 'available' && pix.state === 'available' && Boolean(pix.payload && pix.imageSource);
  const link = payable ? safeOtherCreditLink(record.gateway_invoice_url) : null;
  const line = String(record.gateway_boleto_linha_digitavel || '');
  const statusLabel = paid ? 'Pagamento confirmado' : closed ? 'Cobrança encerrada' : payable ? 'Aguardando pagamento' : 'Cobrança em conferência';

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 px-4 py-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
      <section className="flex min-w-0 flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center shadow-sm shadow-slate-900/[0.02] sm:px-8 sm:py-7" aria-label="Pagamento da cobrança">
        <div role="status" className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ${paid
          ? 'bg-emerald-50 text-emerald-800' : closed || !payable ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-800'}`}>
          {paid ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
          {statusLabel}
        </div>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Valor da cobrança</p>
        <p className="mt-2 max-w-full break-words text-[clamp(2.4rem,5vw,3.5rem)] font-bold leading-none tracking-[-0.055em] text-[#0b1f4a]">
          {formatBaneseCurrency(record.valor)}
        </p>

        {paid ? (
          <div className="my-9 flex max-w-md flex-col items-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50"><CheckCircle2 size={48} strokeWidth={1.6} aria-hidden="true" /></div>
            <h3 className="mt-7 text-2xl font-bold tracking-tight text-[#0b1f4a]">Recebimento concluído</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">Recebido: <strong className="font-bold text-emerald-700">{record.valor_pago == null ? 'Valor não informado' : formatBaneseCurrency(record.valor_pago)}</strong> · {formatBaneseDate(record.data_pagamento)}</p>
            <p className="mt-3 text-sm text-slate-500">As opções de pagamento desta cobrança foram encerradas.</p>
          </div>
        ) : !payable ? (
          <div className="my-10 w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-8">
            <LockKeyhole size={30} className="mx-auto text-amber-700" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-[#001a33]">{closed ? 'Pagamento desativado' : 'Aguardando conferência'}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{closed
              ? 'Esta cobrança está encerrada. Nenhum código de pagamento será exibido.'
              : 'Estamos acompanhando a confirmação bancária. Esta tela será atualizada automaticamente quando os dados estiverem disponíveis.'}</p>
          </div>
        ) : (
          <div className="mt-6 w-full max-w-[360px]">
            {pixAvailable ? (
              <>
                <div className="relative mx-auto w-fit max-w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_5px_24px_-14px_rgba(11,31,74,0.22)] sm:p-3">
                  <img src={pix.imageSource!} alt="QR Code Pix oficial desta cobrança Banese"
                    className="h-[240px] w-[240px] max-w-full object-contain sm:h-[280px] sm:w-[280px]" />
                </div>
                <h3 className="mt-4 text-sm font-bold text-[#0b1f4a]">Pague com Pix</h3>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-500">Abra o aplicativo do banco e aponte a câmera para o QR Code.</p>
                <div className="mt-4"><CopyAction value={pix.payload!} label="Copiar Pix" primary /></div>
                <details className="mt-2 text-left text-[11px] text-slate-500">
                  <summary className={`cursor-pointer rounded-lg px-2 py-1 text-center ${focusRing}`}>Ver código Pix copia e cola</summary>
                  <p className="mt-2 select-all break-all rounded-xl bg-slate-50 p-3 font-mono leading-5">{pix.payload}</p>
                </details>
                <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-500"><ShieldCheck size={13} aria-hidden="true" /> QR oficial · BolePix Banese</p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-9">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-slate-300"><QrCode size={32} aria-hidden="true" /></div>
                <h3 className="mt-5 text-lg font-black text-[#001a33]">{data.pixState === 'sandbox-unavailable' ? 'Ambiente de homologação' : 'Pix ainda não disponível'}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{data.pixState === 'sandbox-unavailable'
                  ? 'O Pix não opera neste ambiente. O boleto de teste permanece disponível.'
                  : 'Aguardando o QR Pix oficial do banco. Esta tela acompanha as atualizações automaticamente.'}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white px-6 pb-6 shadow-sm shadow-slate-900/[0.02]" aria-label="Resumo do atendimento">
        <p className="-mx-6 border-b border-[#152e5b] bg-[#0b1f4a] px-6 py-5 text-[10px] font-bold uppercase tracking-[0.18em] text-white">Resumo do atendimento</p>
        <p className="mt-5 text-xs font-semibold text-slate-500">Pagador</p>
        <h3 className="mt-2 break-words text-xl font-bold leading-tight tracking-tight text-[#0b1f4a]">{data.customerName}</h3>
        <p className="mt-2 break-words text-xs leading-5 text-slate-500">{record.descricao}</p>
        <dl className="mt-5 border-y border-slate-100 py-4 text-xs">
          <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-slate-500"><CalendarDays size={15} aria-hidden="true" /> Vencimento</dt><dd className={`font-bold ${record.status === 'VENCIDO' ? 'text-amber-700' : 'text-[#001a33]'}`}>{formatBaneseDate(record.data_vencimento)}</dd></div>
          <div className="mt-3 flex items-center justify-between gap-4"><dt className="text-slate-500">Forma de pagamento</dt><dd className="font-bold text-[#001a33]">BolePix Banese</dd></div>
        </dl>

        {payable && data.boletoAvailable && (
          <section className="mt-5" aria-label="Boleto da mesma cobrança">
            <h4 className="flex items-center gap-2 text-xs font-bold text-[#0b1f4a]"><Barcode size={18} aria-hidden="true" /> Boleto da mesma cobrança</h4>
            <p className="mt-3 select-all break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-[11px] leading-5 text-slate-600">{formatBaneseDigitableLine(line)}</p>
            <div className="mt-3"><CopyAction value={line} label="Copiar linha digitável" /></div>
            {onOpenDocument && <button type="button" onClick={onOpenDocument} disabled={documentPending}
              className={`mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#001a33] transition hover:bg-slate-200/60 disabled:opacity-40 ${focusRing}`}>
              <Download size={16} aria-hidden="true" /> {documentPending ? 'Preparando PDF...' : 'Abrir boleto PDF'}
            </button>}
            <p className="mt-3 text-[11px] leading-5 text-slate-500">Use Pix ou boleto para pagar esta cobrança uma única vez.</p>
          </section>
        )}

        {!paid && !closed && !bankClosed && data.canRefresh && onRefresh && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <button type="button" onClick={onRefresh} disabled={refreshPending || isFetching}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}>
              <RefreshCw size={17} className={refreshPending ? 'animate-spin' : ''} aria-hidden="true" />
              {refreshPending ? 'Verificando pagamento...' : 'Verificar pagamento'}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Consulte o banco se o pagamento já foi realizado.</p>
          </div>
        )}
        {!paid && !closed && <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-slate-500"><Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> A confirmação bancária aparece automaticamente nesta tela.</p>}
        {link && <div className="mt-5 border-t border-slate-100 pt-5">
          <a href={link} target="_blank" rel="noreferrer" className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#001a33] ${focusRing}`}>Portal do Aluno <ArrowUpRight size={14} aria-hidden="true" /></a>
          <div className="mt-2"><CopyAction value={link} label="Copiar link do aluno" /></div>
        </div>}
      </aside>
    </div>
  );
}
