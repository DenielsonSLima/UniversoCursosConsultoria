import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { polosService, type Polo } from '../../../../configuracoes/polos/polos.service';
import type { ContasReceber } from '../../../financeiro.service';
import { paymentMethodLabel } from './modalidade-receber.utils';

interface InstitutionalReceiptModalProps {
  item: ContasReceber;
  onClose: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return 'Não informada';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

const formatDocument = (value?: string) => {
  if (!value) return 'Não informado';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return value;
};

const buildFallbackPolo = (item: ContasReceber): Polo => ({
  id: item.poloId,
  nome: item.poloNome || 'Universo Cursos e Consultoria',
  nomeFantasia: item.poloNome || 'Universo Cursos e Consultoria',
  cnpj: item.poloCnpj || '',
  cidade: item.poloCidade || '',
  estado: item.poloUf || '',
  uf: item.poloUf || '',
  status: 'ativo',
});

const InstitutionalReceiptModal: React.FC<InstitutionalReceiptModalProps> = ({ item, onClose }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const receiptNumber = useMemo(
    () => item.id?.slice(0, 8).toUpperCase() || 'RECIBO',
    [item.id],
  );
  const emittedAt = useMemo(() => new Date(), []);
  const fallbackPolo = useMemo(() => buildFallbackPolo(item), [item]);

  const {
    data: fetchedPolo,
    isLoading: isLoadingPolo,
    isError: isPoloError,
  } = useQuery({
    queryKey: ['financeiro', 'recibo-institucional', 'polo', item.poloId],
    queryFn: () => polosService.getById(item.poloId),
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(item.poloId),
  });

  const polo = fetchedPolo || fallbackPolo;
  const paidValue = item.valorPago ?? item.valor;
  const category = [item.cursoNome, item.turmaNome, item.tipoLancamento]
    .filter(Boolean)
    .join(' • ');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const handleDownload = async () => {
    if (!previewRef.current || isDownloading || isLoadingPolo) return;
    setIsDownloading(true);
    setDownloadError('');

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: previewRef.current.scrollWidth,
        windowHeight: previewRef.current.scrollHeight,
      });
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 210, 297);
      pdf.save(
        `recibo-universo-${receiptNumber}-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
    } catch (error) {
      console.error('Não foi possível gerar o PDF do recibo:', error);
      setDownloadError('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      id="institutional-receipt-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Visualizador do recibo ${receiptNumber}`}
      className="fixed inset-0 z-[2147483000] flex h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950"
    >
      <header className="receipt-viewer-toolbar z-10 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-60"
            aria-label="Fechar visualizador"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black uppercase tracking-widest text-white">
              Visualizador de Documentos
            </h3>
            <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Emissão: Recibo de pagamento (1 pág.)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloading || isLoadingPolo}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-xs"
          >
            {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            <span>{isDownloading ? 'Gerando...' : 'Download PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={isDownloading || isLoadingPolo}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-blue-700 disabled:opacity-60 sm:px-6 sm:py-3 sm:text-xs"
          >
            <Printer size={16} /> <span>Imprimir</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-slate-900 p-3 custom-scrollbar sm:p-8">
        {isLoadingPolo ? (
          <div className="flex min-h-[297mm] w-[210mm] max-w-full shrink-0 flex-col items-center justify-center bg-white text-slate-400">
            <Loader2 className="mb-4 animate-spin text-blue-600" size={36} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Montando recibo institucional...
            </span>
          </div>
        ) : (
          <div
            ref={previewRef}
            className="receipt-print-page relative mx-auto min-h-[297mm] w-[210mm] shrink-0 overflow-hidden border border-slate-200 bg-white p-[15mm] pl-[20mm] text-black shadow-2xl box-border"
            style={{ fontFamily: '"Times New Roman", Times, serif' }}
          >
            {polo.watermark_url ? (
              <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                <img
                  src={polo.watermark_url}
                  alt=""
                  crossOrigin="anonymous"
                  className="object-contain"
                  style={{
                    opacity: polo.watermark_opacity ?? 0.1,
                    width: `${polo.watermark_scale ?? 50}%`,
                    transform: polo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none',
                  }}
                />
              </div>
            ) : null}

            <DocumentHeader polo={polo} orientation="portrait" />

            <main className="relative z-10">
              <div className="mb-9 mt-7 text-center">
                <h1 className="text-2xl font-bold uppercase text-[#001a33] underline decoration-2 decoration-blue-600 underline-offset-8">
                  Recibo de Pagamento
                </h1>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Recibo nº {receiptNumber}
                </p>
              </div>

              <section className="mb-8 border-y border-slate-300 px-7 py-6 text-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Valor recebido
                </p>
                <p className="mt-2 font-sans text-4xl font-black tracking-tight text-[#001a33]">
                  {formatCurrency(paidValue)}
                </p>
              </section>

              <p className="text-justify text-[17px] leading-[2] text-black">
                Recebemos de <strong>{item.clienteNome || 'Aluno / pagador'}</strong>,
                inscrito(a) no CPF/CNPJ nº <strong>{formatDocument(item.clienteCpfCnpj)}</strong>,
                a importância de <strong>{formatCurrency(paidValue)}</strong>, referente a{' '}
                <strong>{item.descricao}</strong>.
              </p>

              {category ? (
                <p className="mt-6 text-justify text-[15px] leading-relaxed text-black">
                  O pagamento está vinculado a <strong>{category}</strong>.
                </p>
              ) : null}

              <div className="mt-10 grid grid-cols-2 gap-x-12 gap-y-7 border-y border-slate-200 px-7 py-7">
                {[
                  ['Aluno / Pagador', item.clienteNome || 'Não informado'],
                  ['CPF/CNPJ', formatDocument(item.clienteCpfCnpj)],
                  ['Data de vencimento', formatDate(item.dataVencimento)],
                  ['Data de pagamento', formatDate(item.dataPagamento)],
                  ['Forma de pagamento', paymentMethodLabel(item)],
                  ['Situação', item.status],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="font-sans text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-[15px] font-bold text-[#001a33]">{value}</p>
                  </div>
                ))}
              </div>

              <p className="mt-8 text-[13px] leading-relaxed text-slate-700">
                Para maior clareza, firmamos o presente recibo, que comprova a baixa financeira
                registrada no sistema da Universo Cursos e Consultoria.
              </p>
            </main>

            <div className="absolute bottom-[65mm] left-[25mm] z-10 text-[15px] text-black">
              {polo.cidade || item.poloCidade || 'Japoatã'}/{polo.estado || item.poloUf || 'SE'},{' '}
              {emittedAt.toLocaleDateString('pt-BR')}.
            </div>

            <div className="absolute bottom-[37mm] left-[27mm] z-10 w-[76mm] text-center">
              <div className="border-t border-black" />
              <p className="mt-2 text-sm font-bold uppercase text-[#001a33]">
                {polo.nome || item.poloNome || 'Universo Cursos e Consultoria'}
              </p>
              <p className="mt-1 font-sans text-[9px] font-bold uppercase tracking-widest text-slate-500">
                Responsável financeiro
              </p>
            </div>

            <footer className="absolute bottom-[12mm] left-[20mm] right-[52mm] z-10 flex items-end justify-between border-t border-slate-200 pt-3 font-sans">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                  Documento emitido eletronicamente
                </p>
                <p className="mt-1 text-[9px] font-semibold text-slate-500">
                  {emittedAt.toLocaleString('pt-BR')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                  Identificação
                </p>
                <p className="mt-1 font-mono text-[10px] font-black tracking-wider text-[#001a33]">
                  {receiptNumber}
                </p>
              </div>
            </footer>
          </div>
        )}

        {isPoloError ? (
          <p className="receipt-viewer-message mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-xs font-bold text-amber-700">
            Os dados completos do polo não puderam ser carregados; o recibo está usando os dados
            disponíveis no lançamento.
          </p>
        ) : null}
        {downloadError ? (
          <p role="alert" className="receipt-viewer-message mt-4 text-center text-xs font-bold text-rose-400">
            {downloadError}
          </p>
        ) : null}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #institutional-receipt-modal,
          #institutional-receipt-modal * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #institutional-receipt-modal {
            position: absolute !important;
            inset: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            overflow: visible !important;
            background: white !important;
          }
          #institutional-receipt-modal .receipt-viewer-toolbar,
          #institutional-receipt-modal .receipt-viewer-message {
            display: none !important;
          }
          #institutional-receipt-modal > div {
            display: block !important;
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }
          #institutional-receipt-modal .receipt-print-page {
            width: 210mm !important;
            min-width: 210mm !important;
            min-height: 297mm !important;
            height: 297mm !important;
            margin: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </div>
  );
};

export default InstitutionalReceiptModal;
