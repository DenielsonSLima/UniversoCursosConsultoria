import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import CrachaPreview from '../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { waitForQrCodeAssets } from '../../../shared/qrcode/qr-code-assets';
import CrachaPeriodoEleitoralPreview from '../../cadastros/modelos-documentos/cracha-periodo-eleitoral/components/CrachaPeriodoEleitoralPreview';
import type { SecretariaDocumentoWorkspace } from './useSecretariaDocumentoWorkspace';

  const SecretariaDocumentoPrint = ({ workspace }: { workspace: SecretariaDocumentoWorkspace }) => {
  const {
    crachaPrintLayout,
    isCrachaPrinting,
    setIsCrachaPrinting,
    printContentRef,
    isCrachaPeriodoEleitoral,
    crachaTemplate,
    crachaEleitoralTemplate,
    crachaPrintItems,
  } = workspace;
  const getCrachaRenderTemplate = (item: any) => ({
    ...(crachaTemplate || {}),
    validationPublic: item?.validationPublic === true,
  });

  const chunkArray = <T,>(items: T[], size: number) => {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  };

  const renderCrachaEmptySlot = () => (
    <div className="w-[54mm] h-[85.6mm] border-2 border-dashed border-slate-150 rounded-[2.5mm] bg-slate-50/50 text-[8px] text-slate-300 font-black uppercase tracking-widest flex items-center justify-center print:hidden">
      Espaço vazio
    </div>
  );

  const renderCrachaEleitoralEmptySlot = () => (
    <div className="w-[142mm] h-[86mm] border-2 border-dashed border-slate-150 bg-slate-50/50 text-[8px] text-slate-300 font-black uppercase tracking-widest flex items-center justify-center print:hidden">
      Espaço vazio
    </div>
  );

  const renderCrachaDobraPages = () => {
    const lotes = chunkArray(crachaPrintItems, 5);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 5) slots.push(null as any);

      return (
        <div key={`cracha-dobra-${loteIndex}`} className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="cracha-fold-grid grid grid-cols-5 gap-x-[1.5mm] justify-items-center items-start">
            {slots.map((aluno, index) => (
              <div key={`cracha-dobra-slot-${index}`} className="w-[54mm] h-[171.2mm] flex flex-col rounded-[2.5mm] overflow-hidden border border-slate-250 bg-white">
                {aluno ? (
                  <>
                    <div className="w-[54mm] h-[85.6mm] relative border-b border-dashed border-slate-300">
                      <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="frente" zoomLevel={100} aluno={aluno} />
                    </div>
                    <div className="w-[54mm] h-[85.6mm] relative">
                      <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="verso" zoomLevel={100} aluno={aluno} />
                    </div>
                  </>
                ) : renderCrachaEmptySlot()}
              </div>
            ))}
          </div>
          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Crachás de Estágio #{loteIndex + 1} — 5 conjuntos frente + verso</span>
            <span>A4 paisagem</span>
          </div>
        </div>
      );
    });
  };

  const renderCrachaDuplexPages = () => {
    const lotes = chunkArray(crachaPrintItems, 10);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 10) slots.push(null as any);
      const versoSlots = slots
        .slice(0, 5).reverse()
        .concat(slots.slice(5, 10).reverse());

      return (
        <React.Fragment key={`cracha-duplex-${loteIndex}`}>
          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {slots.map((aluno, index) => (
                <div key={`cracha-frente-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="frente" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — frentes</span>
              <span>10 por página</span>
            </div>
          </div>

          <div className="print-page cracha-print-page cracha-print-page-landscape w-[297mm] h-[210mm] bg-white text-black p-[8mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
            <div className="cracha-card-grid grid grid-cols-5 grid-rows-2 gap-x-[1.5mm] gap-y-[3mm] justify-items-center items-center">
              {versoSlots.map((aluno, index) => (
                <div key={`cracha-verso-${index}`} className="w-[54mm] h-[85.6mm] relative rounded-[2.5mm] overflow-hidden border border-slate-200 bg-white">
                  {aluno ? <CrachaPreview formData={getCrachaRenderTemplate(aluno)} page="verso" zoomLevel={100} aluno={aluno} /> : renderCrachaEmptySlot()}
                </div>
              ))}
            </div>
            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Crachás de Estágio #{loteIndex + 1} — versos espelhados</span>
              <span>Virar no lado curto para duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  const buildCrachaEleitoralAluno = (aluno: any) => ({
    nome: aluno.nome,
    matricula: aluno.matricula,
    curso: aluno.curso,
    polo: aluno.polo,
    instituicaoEnsino: crachaEleitoralTemplate?.instituicaoEnsinoPadrao,
    instrutor: crachaEleitoralTemplate?.instrutorPadrao,
  });

  const renderCrachaEleitoralPages = () => {
    const lotes = chunkArray(crachaPrintItems, 2);

    return lotes.map((lote, loteIndex) => {
      const slots = [...lote];
      while (slots.length < 2) slots.push(null as any);

      return (
        <div key={`cracha-eleitoral-${loteIndex}`} className="print-page cracha-eleitoral-print-page w-[297mm] h-[210mm] bg-white text-black p-[6mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 overflow-hidden">
          <div className="grid grid-rows-2 gap-y-[4mm]">
            {slots.map((aluno, index) => (
              <div key={`cracha-eleitoral-slot-${index}`} className="grid grid-cols-2 gap-x-[4mm] justify-items-center">
                {aluno ? (
                  <>
                    <CrachaPeriodoEleitoralPreview formData={crachaEleitoralTemplate || {}} page="frente" zoomLevel={100} aluno={buildCrachaEleitoralAluno(aluno)} />
                    <CrachaPeriodoEleitoralPreview formData={crachaEleitoralTemplate || {}} page="verso" zoomLevel={100} aluno={buildCrachaEleitoralAluno(aluno)} />
                  </>
                ) : (
                  <>
                    {renderCrachaEleitoralEmptySlot()}
                    {renderCrachaEleitoralEmptySlot()}
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Crachás SES #{loteIndex + 1} — frente e verso lado a lado</span>
            <span>A4 paisagem</span>
          </div>
        </div>
      );
    });
  };

  const handleCrachaPrint = async () => {
    if (!printContentRef.current) return;
    try {
      await waitForQrCodeAssets(printContentRef.current);
      window.print();
    } catch (error) {
      console.error('[SecretariaDocumentoEmissionPage] QR Code indisponível:', error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar os QR Codes para impressão.',
      );
    }
  };

  if (isCrachaPrinting) {
    return createPortal(
      <div data-secretaria-document className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-y-auto bg-slate-950 custom-scrollbar" id="cracha-print-layout">
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCrachaPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">
                Impressão A4 do {isCrachaPeriodoEleitoral ? 'Crachá SES' : 'Crachá'}
              </h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {isCrachaPeriodoEleitoral
                  ? '2 alunos por folha, frente e verso lado a lado'
                  : crachaPrintLayout === 'dobra' ? '5 conjuntos frente + verso por folha' : '10 por página frente e verso'}
              </p>
            </div>
          </div>

          <button
            onClick={() => void handleCrachaPrint()}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-blue-950/30"
          >
            <Printer size={16} /> Imprimir / Salvar PDF
          </button>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div className="mb-8 flex w-full max-w-[297mm] items-center gap-3 rounded-2xl border border-blue-800 bg-blue-950/70 p-4 text-white print:hidden">
            <Printer size={20} className="text-blue-300" />
            <p className="text-[10px] font-medium leading-normal text-blue-100">
              {isCrachaPeriodoEleitoral
                ? 'Use papel A4 em paisagem. O modelo eleitoral não possui QR Code e usa a data final configurada como validade padrão.'
                : 'Use papel A4 em paisagem. Para o modo 10 por página, imprima frente e verso virando no lado curto.'}
            </p>
          </div>

          <div ref={printContentRef} className="print-content flex flex-col items-center">
            {isCrachaPeriodoEleitoral
              ? renderCrachaEleitoralPages()
              : crachaPrintLayout === 'dobra' ? renderCrachaDobraPages() : renderCrachaDuplexPages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            #cracha-print-layout, #cracha-print-layout * {
              visibility: visible;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #cracha-print-layout {
              position: absolute;
              left: 0;
              top: 0;
              width: 297mm !important;
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
            }
            .cracha-print-page {
              width: 297mm !important;
              height: 210mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 8mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .cracha-card-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              grid-template-rows: repeat(2, 85.6mm) !important;
              column-gap: 1.5mm !important;
              row-gap: 3mm !important;
              justify-content: center !important;
              align-content: center !important;
            }
            .cracha-fold-grid {
              display: grid !important;
              grid-template-columns: repeat(5, 54mm) !important;
              column-gap: 1.5mm !important;
              justify-content: center !important;
              align-content: start !important;
            }
            .cracha-print-page img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .cracha-eleitoral-print-page {
              width: 297mm !important;
              height: 210mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 6mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          }
          @page { size: A4 landscape; margin: 0; }
        `}} />
      </div>,
      document.body
    );
  }
  return null;
};

export default SecretariaDocumentoPrint;
