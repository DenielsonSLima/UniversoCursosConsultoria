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

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4';

function CopyAction({ value, label, primary = false }: { value: string; label: string; primary?: boolean }) {
  const { state, copy } = useCopyFeedback(value);
  return (
    <div>
      <button type="button" onClick={() => void copy(value)} disabled={!value}
        className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${focusRing} ${primary
          ? 'bg-[#001a33] text-white hover:bg-[#07345f]'
          : 'border border-slate-200 bg-white text-[#001a33] hover:border-slate-400'}`}>
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
    <div className="mx-auto grid w-full max-w-7xl lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_410px]">
      <section className="flex min-w-0 flex-col items-center px-5 py-8 text-center sm:px-10 sm:py-10 lg:px-16 lg:py-12" aria-label="Pagamento da cobrança">
        <div role="status" className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-bold ${paid
          ? 'bg-emerald-50 text-emerald-800' : closed || !payable ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
          {paid ? <CheckCircle2 size={15} aria-hidden="true" /> : <Clock3 size={15} aria-hidden="true" />}
          {statusLabel}
        </div>
        <p className="mt-7 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Valor da cobrança</p>
        <p className="mt-2 max-w-full break-words text-[clamp(2.65rem,6vw,4.75rem)] font-black leading-none tracking-[-0.06em] text-[#001a33]">
          {formatBaneseCurrency(record.valor)}
        </p>

        {paid ? (
          <div className="my-12 flex max-w-md flex-col items-center">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/50"><CheckCircle2 size={48} strokeWidth={1.6} aria-hidden="true" /></div>
            <h3 className="mt-8 text-2xl font-black tracking-tight text-[#001a33]">Recebimento concluído</h3>
            <p className="mt-3 text-sm leading-6 text-slate-500">Recebido: <strong className="font-bold text-emerald-700">{record.valor_pago == null ? 'Valor não informado' : formatBaneseCurrency(record.valor_pago)}</strong> · {formatBaneseDate(record.data_pagamento)}</p>
            <p className="mt-3 text-sm text-slate-500">As opções de pagamento desta cobrança foram encerradas.</p>
          </div>
        ) : !payable ? (
          <div className="my-10 w-full max-w-md rounded-2xl border border-amber-200 bg-amber-50/60 px-6 py-8">
            <LockKeyhole size={30} className="mx-auto text-amber-700" aria-hidden="true" />
            <h3 className="mt-4 text-lg font-black text-[#001a33]">{closed ? 'Pagamento desativado' : 'Aguardando conferência'}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{closed
              ? 'Esta cobrança está encerrada. Nenhum código de pagamento será exibido.'
              : 'Os dados bancários ainda não permitem receber com segurança. Verifique a situação da cobrança antes de continuar.'}</p>
          </div>
        ) : (
          <div className="mt-8 w-full max-w-[360px]">
            {pixAvailable ? (
              <>
                <div className="relative mx-auto w-fit rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-[0_12px_45px_-24px_rgba(0,26,51,0.3)] sm:p-5">
                  <img src={pix.imageSource!} alt="QR Code Pix oficial desta cobrança Banese"
                    className="h-[240px] w-[240px] max-w-full object-contain sm:h-[280px] sm:w-[280px]" />
                </div>
                <h3 className="mt-5 text-base font-bold text-[#001a33]">Pague com Pix</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">Abra o aplicativo do banco e aponte a câmera para o QR Code.</p>
                <div className="mt-5"><CopyAction value={pix.payload!} label="Copiar Pix" primary /></div>
                <details className="mt-3 text-left text-xs text-slate-500">
                  <summary className={`cursor-pointer rounded-lg px-2 py-1 text-center ${focusRing}`}>Ver código Pix copia e cola</summary>
                  <p className="mt-2 select-all break-all rounded-xl bg-slate-50 p-3 font-mono leading-5">{pix.payload}</p>
                </details>
                <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400"><ShieldCheck size={13} aria-hidden="true" /> QR oficial · BolePix Banese</p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-9">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-slate-300"><QrCode size={32} aria-hidden="true" /></div>
                <h3 className="mt-5 text-lg font-black text-[#001a33]">{data.pixState === 'sandbox-unavailable' ? 'Ambiente de homologação' : 'Pix ainda não disponível'}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{data.pixState === 'sandbox-unavailable'
                  ? 'O Pix não opera neste ambiente. O boleto de teste permanece disponível.'
                  : 'O QR Pix completo ainda não está disponível. Use o boleto validado ou verifique a situação do pagamento.'}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="min-w-0 border-t border-slate-100 bg-[#f8fafb] px-6 py-8 sm:px-10 lg:border-l lg:border-t-0 lg:px-8 lg:py-12" aria-label="Resumo do atendimento">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Resumo do atendimento</p>
        <p className="mt-7 text-xs font-semibold text-slate-500">Pagador</p>
        <h3 className="mt-2 break-words text-2xl font-black leading-tight tracking-tight text-[#001a33]">{data.customerName}</h3>
        <p className="mt-3 break-words text-sm leading-6 text-slate-500">{record.descricao}</p>
        <dl className="mt-7 border-y border-slate-200 py-5 text-sm">
          <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-2 text-slate-500"><CalendarDays size={15} aria-hidden="true" /> Vencimento</dt><dd className={`font-bold ${record.status === 'VENCIDO' ? 'text-amber-700' : 'text-[#001a33]'}`}>{formatBaneseDate(record.data_vencimento)}</dd></div>
          <div className="mt-4 flex items-center justify-between gap-4"><dt className="text-slate-500">Forma de pagamento</dt><dd className="font-bold text-[#001a33]">BolePix Banese</dd></div>
        </dl>

        {payable && data.boletoAvailable && (
          <section className="mt-7" aria-label="Boleto da mesma cobrança">
            <h4 className="flex items-center gap-2 text-sm font-black text-[#001a33]"><Barcode size={18} aria-hidden="true" /> Boleto da mesma cobrança</h4>
            <p className="mt-3 select-all break-all rounded-xl border border-slate-200 bg-white px-3 py-3 font-mono text-[11px] leading-5 text-slate-500">{formatBaneseDigitableLine(line)}</p>
            <div className="mt-3"><CopyAction value={line} label="Copiar linha digitável" /></div>
            {onOpenDocument && <button type="button" onClick={onOpenDocument} disabled={documentPending}
              className={`mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#001a33] transition hover:bg-slate-200/60 disabled:opacity-40 ${focusRing}`}>
              <Download size={16} aria-hidden="true" /> {documentPending ? 'Preparando PDF...' : 'Abrir boleto PDF'}
            </button>}
            <p className="mt-3 text-xs leading-5 text-slate-500">Use Pix ou boleto para pagar esta cobrança uma única vez.</p>
          </section>
        )}

        {!paid && !closed && !bankClosed && data.canRefresh && onRefresh && (
          <div className="mt-7 border-t border-slate-200 pt-6">
            <button type="button" onClick={onRefresh} disabled={refreshPending || isFetching}
              className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}>
              <RefreshCw size={17} className={refreshPending ? 'animate-spin' : ''} aria-hidden="true" />
              {refreshPending ? 'Verificando pagamento...' : 'Verificar pagamento'}
            </button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">Consulte o banco se o pagamento já foi realizado.</p>
          </div>
        )}
        {payable && <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-slate-400"><Clock3 size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> A confirmação é acompanhada nesta tela por até 10 minutos.</p>}
        {link && <div className="mt-6 border-t border-slate-200 pt-5">
          <a href={link} target="_blank" rel="noreferrer" className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-[#001a33] ${focusRing}`}>Portal do Aluno <ArrowUpRight size={14} aria-hidden="true" /></a>
          <div className="mt-2"><CopyAction value={link} label="Copiar link do aluno" /></div>
        </div>}
      </aside>
    </div>
  );
}
