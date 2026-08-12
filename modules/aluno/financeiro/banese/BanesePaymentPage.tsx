import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import Clock3 from 'lucide-react/dist/esm/icons/clock-3';
import FileStack from 'lucide-react/dist/esm/icons/file-stack';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import MessageCircle from 'lucide-react/dist/esm/icons/message-circle';
import BaneseBoletoPanel from './components/BaneseBoletoPanel';
import BaneseBoletoDocument from './components/BaneseBoletoDocument';
import BaneseCarnetDownload from './components/BaneseCarnetDownload';
import BaneseChargeSummary from './components/BaneseChargeSummary';
import BaneseInstallmentNavigator from './components/BaneseInstallmentNavigator';
import BanesePaymentHeader from './components/BanesePaymentHeader';
import BanesePixPanel from './components/BanesePixPanel';
import type { BanesePaymentRecord } from './banese-payment.types';
import useBanesePaymentOverlay from './hooks/useBanesePaymentOverlay';
import useBaneseBoletoDocument from './hooks/useBaneseBoletoDocument';
import useBaneseCarnetDocument from './hooks/useBaneseCarnetDocument';
import {
  canPayBaneseRecord,
  formatBaneseCurrency,
  formatBaneseDate,
  getBaneseCarnetInstallments,
  getBanesePixPresentation,
  getBaneseStatusPresentation,
  normalizeBaneseEnvironment,
} from './banese-payment.utils';

interface BanesePaymentPageProps {
  installment: BanesePaymentRecord;
  installments: BanesePaymentRecord[];
  onBack: () => void;
  onRefresh?: () => Promise<void> | void;
}

const BanesePaymentPage = ({ installment, installments, onBack, onRefresh }: BanesePaymentPageProps) => {
  const [selectedId, setSelectedId] = useState(installment.id);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const pageRef = useRef<HTMLDivElement>(null);
  useBanesePaymentOverlay(pageRef, onBack);

  const carnetInstallments = useMemo(
    () => getBaneseCarnetInstallments(installment, installments),
    [installment, installments],
  );
  const record = installments.find((item) => item.id === selectedId)
    ?? carnetInstallments.find((item) => item.id === selectedId)
    ?? installment;
  const isCarnet = carnetInstallments.length >= 3;
  const environment = normalizeBaneseEnvironment(record.gateway_environment);
  const pix = getBanesePixPresentation(record);
  const status = getBaneseStatusPresentation(record);
  const paymentClosed = !canPayBaneseRecord(record);
  const isPendingEad = !paymentClosed && String(record.modalidade || '').toUpperCase() === 'EAD';
  const boletoDocument = useBaneseBoletoDocument(
    record.id,
    Boolean(record.gateway_boleto_linha_digitavel && record.gateway_boleto_codigo_barras),
    pix.state,
  );
  const carnetDocument = useBaneseCarnetDocument(
    carnetInstallments[0]?.id ?? record.id,
    isCarnet,
  );

  useEffect(() => {
    setSelectedId(installment.id);
  }, [installment.id]);

  const refresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    setRefreshMessage('');
    try {
      await onRefresh();
      setRefreshMessage('Status atualizado com os dados mais recentes do sistema.');
    } catch {
      setRefreshMessage('Não foi possível atualizar agora. Tente novamente em instantes.');
    } finally {
      setIsRefreshing(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={pageRef}
      tabIndex={-1}
      className="fixed inset-0 z-[99999] overflow-y-auto overflow-x-hidden bg-[#f2f5f7] text-slate-900 outline-none"
    >
      <BanesePaymentHeader environment={environment} onBack={onBack} />

      <BaneseInstallmentNavigator
        installments={carnetInstallments}
        selectedId={record.id}
        onSelect={(nextRecord) => {
          setSelectedId(nextRecord.id);
          pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
        <section className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">
                {String(record.tipo_lancamento || '').toUpperCase() === 'DISCIPLINA'
                  ? 'Disciplina'
                  : record.modalidade || 'Curso'}
              </span>
              {isCarnet ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  <FileStack size={11} /> Carnê com {carnetInstallments.length} parcelas
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight text-[#001a33] sm:text-4xl">
              {record.chargeKind || 'Sua cobrança Banese'}
            </h1>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
              {environment === 'sandbox'
                ? 'Boleto de homologação Banese, com a experiência BolePix preparada para a ativação em produção.'
                : 'Boleto e Pix reunidos em uma experiência de pagamento da Universo Cursos e Consultoria.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Vencimento</p>
              <p className="mt-1 text-sm font-black text-[#001a33]">{formatBaneseDate(record.data_vencimento)}</p>
            </div>
            <div className="rounded-2xl bg-[#001a33] px-4 py-3 text-white shadow-lg shadow-blue-950/10">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-300">Valor</p>
              <p className="mt-1 text-sm font-black">{formatBaneseCurrency(record.valor)}</p>
            </div>
          </div>
        </section>

        {paymentClosed ? (
          <section className={`mb-5 flex items-start gap-3 rounded-[1.4rem] border p-4 ${
            status.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-slate-200 bg-slate-100 text-slate-700'
          }`}>
            {status.tone === 'success' ? <CheckCircle2 size={20} className="mt-0.5 shrink-0" /> : <Clock3 size={20} className="mt-0.5 shrink-0" />}
            <div>
              <p className="text-sm font-black">{status.label}</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed">{status.detail} As opções de pagamento foram desativadas.</p>
            </div>
          </section>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.58fr)_minmax(340px,0.72fr)] xl:gap-7">
          <div className="order-2 rounded-[2rem] border border-slate-200/80 bg-[#e8edf0] p-3 shadow-inner sm:p-5 lg:order-1 lg:p-7">
            <BaneseBoletoDocument
              documentUrl={boletoDocument.documentUrl}
              isLoading={boletoDocument.isLoading}
              error={boletoDocument.error}
              onRetry={() => void boletoDocument.retry()}
              onDownload={boletoDocument.download}
            />
            <div className="mt-4 flex items-start gap-2 px-2 text-xs font-semibold leading-relaxed text-slate-500">
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />
              Este é o boleto bancário real, montado no servidor com a linha digitável e o código de barras retornados pelo Banese.
            </div>
          </div>

          <aside className="order-1 space-y-3 lg:sticky lg:top-5 lg:order-2">
            <BaneseChargeSummary record={record} pix={pix} />
            {isPendingEad ? (
              <section className="rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm">
                <div className="flex items-start gap-3">
                  <Clock3 size={19} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-black">Aguardando confirmação do Banese</p>
                    <p className="mt-1 text-[11px] font-semibold leading-relaxed">
                      O curso será liberado automaticamente após a confirmação. Se você pagou via Pix e o acesso
                      não for liberado em até 20 minutos, fale conosco. Boleto pode levar até 48 horas úteis.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <a
                        href={`https://wa.me/557996028316?text=${encodeURIComponent('Olá! Realizei o pagamento de um curso EAD e ainda aguardo a confirmação do Banese.')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-[9px] font-black uppercase tracking-wider text-white hover:bg-emerald-700"
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                      <a
                        href="/aluno?module=comunicacao"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 text-[9px] font-black uppercase tracking-wider text-amber-900 hover:bg-amber-100"
                      >
                        <MessageCircle size={13} /> Comunicação
                      </a>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {isCarnet ? (
              <BaneseCarnetDownload
                installmentCount={carnetInstallments.length}
                isDownloading={carnetDocument.isDownloading}
                error={carnetDocument.error}
                onDownload={carnetDocument.download}
              />
            ) : null}
            <BanesePixPanel pix={pix} disabled={paymentClosed} />
            <BaneseBoletoPanel
              record={record}
              disabled={paymentClosed}
              documentUrl={boletoDocument.documentUrl}
              documentLoading={boletoDocument.isLoading}
              documentError={boletoDocument.error}
              onDownloadDocument={boletoDocument.download}
              onRetryDocument={() => void boletoDocument.retry()}
            />

            <section className="rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={!onRefresh || isRefreshing}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Atualizando...' : 'Atualizar status'}
              </button>
              <p className="mt-2 text-center text-[10px] font-semibold leading-relaxed text-slate-400" aria-live="polite">
                {refreshMessage || 'A consulta bancária acontece no servidor; esta página sincroniza o resultado automaticamente.'}
              </p>
            </section>
          </aside>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Universo Cursos e Consultoria • Pagamentos processados pelo Banese
        </p>
      </footer>
    </div>,
    document.body,
  );
};

export default BanesePaymentPage;
