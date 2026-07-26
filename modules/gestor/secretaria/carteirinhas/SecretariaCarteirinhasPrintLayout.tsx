import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import CarteirinhaPreview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import type { Aluno } from './secretaria-carteirinhas.types';

export type CarteirinhaLayoutType = 'dobra' | 'espelhado';
export type CarteirinhaPrintAluno = Aluno & { validationCode?: string };

interface SecretariaCarteirinhasPrintLayoutProps {
  alunos: CarteirinhaPrintAluno[];
  isDownloading: boolean;
  layoutType: CarteirinhaLayoutType;
  onBack: () => void;
  onDownload: () => void;
  onPrint: () => void;
  printContentRef: React.RefObject<HTMLDivElement | null>;
  startNumber: number;
  templateConfig: any;
}

const chunkArray = <T,>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
};

const EmptyCard = ({ label }: { label: string }) => (
  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-350">
    {label}
  </div>
);

const EspelhadoPages = ({
  alunos,
  startNumber,
  templateConfig,
}: Pick<SecretariaCarteirinhasPrintLayoutProps, 'alunos' | 'startNumber' | 'templateConfig'>) => (
  <>
    {chunkArray(alunos, 10).map((loteAlunos, indexLote) => {
      const gridAlunos: Array<CarteirinhaPrintAluno | null> = [...loteAlunos];
      while (gridAlunos.length < 10) gridAlunos.push(null);

      const linhasVersos: Array<Array<CarteirinhaPrintAluno | null>> = [];
      for (let linha = 0; linha < 5; linha += 1) {
        linhasVersos.push([gridAlunos[linha * 2 + 1], gridAlunos[linha * 2]]);
      }

      return (
        <React.Fragment key={indexLote}>
          <div className="print-page relative mx-auto mb-8 h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-2xl box-border">
            <div className="print-card-grid grid grid-cols-2 grid-rows-5 items-center justify-items-center gap-x-[3mm] gap-y-[1.5mm]">
              {gridAlunos.map((aluno, index) => (
                <div key={`frente-${index}`} className="relative flex h-[54mm] w-[85.6mm] items-center justify-center overflow-hidden rounded-[2.5mm] border border-slate-200 bg-slate-50 shadow-sm">
                  {aluno
                    ? <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                    : <EmptyCard label="Espaço Vazio" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400 print:hidden">
              <span>Lote de Impressão #{indexLote + 1} — FRENTES (Começando em {startNumber})</span>
              <span>Padrão CR80 (2 colunas x 5 linhas)</span>
            </div>
          </div>

          <div className="print-page relative mx-auto mb-8 h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-2xl box-border">
            <div className="print-card-grid grid grid-cols-2 grid-rows-5 items-center justify-items-center gap-x-[3mm] gap-y-[1.5mm]">
              {linhasVersos.flatMap((par) => par).map((aluno, index) => (
                <div key={`verso-${index}`} className="relative flex h-[54mm] w-[85.6mm] items-center justify-center overflow-hidden rounded-[2.5mm] border border-slate-200 bg-slate-50 shadow-sm">
                  {aluno
                    ? <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                    : <EmptyCard label="Espaço Vazio" />}
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400 print:hidden">
              <span>Lote de Impão #{indexLote + 1} — VERSOS ESPELHADOS</span>
              <span>Posicionamento invertido horizontalmente para alinhamento duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    })}
  </>
);

const DobraPages = ({
  alunos,
  startNumber,
  templateConfig,
}: Pick<SecretariaCarteirinhasPrintLayoutProps, 'alunos' | 'startNumber' | 'templateConfig'>) => (
  <>
    {chunkArray(alunos, 5).map((loteAlunos, indexLote) => (
      <div key={indexLote} className="print-page mx-auto mb-8 h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-2xl box-border">
        <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
          {loteAlunos.map((aluno, index) => (
            <div key={`dobra-${index}`} className="relative flex w-full items-center justify-center">
              <div className="relative flex overflow-hidden rounded-[2.5mm] border border-slate-300 shadow-sm">
                <div className="relative h-[54mm] w-[85.6mm] border-r border-dashed border-slate-455">
                  <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                  <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-px border-r border-dashed border-slate-400" />
                </div>
                <div className="relative h-[54mm] w-[85.6mm]">
                  <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                </div>
              </div>
              <div className="pointer-events-none absolute left-4 flex items-center gap-1 text-[7px] font-bold uppercase tracking-widest text-slate-400 print:hidden">
                <span># {index + 1} (CIE-{startNumber + (indexLote * 5) + index})</span>
                <span className="rounded bg-slate-100 px-1 text-[5px] text-slate-500">Dobra</span>
              </div>
            </div>
          ))}

          {loteAlunos.length < 5 && Array.from({ length: 5 - loteAlunos.length }).map((_, emptyIndex) => (
            <div key={`empty-${emptyIndex}`} className="mx-auto flex h-[54mm] w-[171.2mm] animate-fadeIn items-center justify-center rounded-[2.5mm] border-2 border-dashed border-slate-150 bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-300">
              Espaço Disponível
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-2 text-center text-[8px] font-bold uppercase tracking-widest text-slate-400 print:hidden">
          <span>Lote de Impressão #{indexLote + 1} — DOBRA MANUAL (Início: {startNumber})</span>
          <span>Rendimento: 5 conjuntos Frente + Verso por folha A4</span>
        </div>
      </div>
    ))}
  </>
);

const PRINT_STYLES = `
  @media print {
    body * { visibility: hidden; }
    #print-layout, #print-layout * {
      visibility: visible;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    #print-layout {
      position: absolute; left: 0; top: 0; width: 210mm !important;
      height: auto !important; background: white !important; margin: 0 !important;
      padding: 0 !important; overflow: visible !important; box-shadow: none !important;
    }
    .print-page {
      width: 210mm !important; height: 297mm !important; page-break-after: always !important;
      page-break-inside: avoid !important; margin: 0 !important; padding: 5mm !important;
      box-shadow: none !important; border: none !important; background: white !important;
      box-sizing: border-box !important; overflow: hidden !important;
    }
    .print-card-grid {
      display: grid !important; grid-template-columns: repeat(2, 85.6mm) !important;
      grid-template-rows: repeat(5, 54mm) !important; column-gap: 3mm !important;
      row-gap: 1.5mm !important; justify-content: center !important; align-content: start !important;
    }
    .print-fold-grid {
      display: grid !important; grid-template-rows: repeat(5, 54mm) !important;
      row-gap: 1.5mm !important; align-content: start !important;
    }
    .print-page img {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
  @page { size: A4 portrait; margin: 0; }
`;

const SecretariaCarteirinhasPrintLayout: React.FC<SecretariaCarteirinhasPrintLayoutProps> = ({
  alunos,
  isDownloading,
  layoutType,
  onBack,
  onDownload,
  onPrint,
  printContentRef,
  startNumber,
  templateConfig,
}) => {
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const layout = (
  <div className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-y-auto bg-slate-950 custom-scrollbar" id="print-layout">
    <div className="sticky top-0 z-[10000] flex items-center justify-between bg-slate-800 p-4 text-white shadow-md print:hidden">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white">
          <ArrowLeft size={16} /> Voltar
        </button>
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Visualizador de Impressão A4</h3>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Layout: {layoutType === 'dobra' ? 'Dobra Lateral (5 por Folha)' : 'Frente e Verso Espelhado (10 por Folha)'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onDownload} disabled={isDownloading} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 disabled:opacity-60">
          {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          {isDownloading ? 'Gerando...' : 'Fazer Download'}
        </button>
        <button onClick={onPrint} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-950/30 transition-all hover:bg-blue-700">
          <Printer size={16} /> Confirmar Impressão
        </button>
      </div>
    </div>

    <div className="flex flex-1 flex-col items-center overflow-y-auto bg-slate-900 p-8">
      <div className="mb-8 flex w-full max-w-[210mm] animate-fadeIn items-center justify-between gap-4 rounded-2xl border border-blue-800 bg-blue-950/70 p-4 text-white print:hidden">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-900 p-2 text-blue-300"><Printer size={20} /></div>
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider">Dica de Configuração de Impressão</h4>
            <p className="mt-1 text-[10px] font-medium leading-normal text-blue-200">
              A folha já está configurada em A4 sem margens. O PNG do modelo agora é impresso como imagem real, sem depender da opção “Imprimir fundos” do navegador.
            </p>
          </div>
        </div>
      </div>

      <div ref={printContentRef} className="print-content flex flex-col items-center">
        {layoutType === 'dobra'
          ? <DobraPages alunos={alunos} startNumber={startNumber} templateConfig={templateConfig} />
          : <EspelhadoPages alunos={alunos} startNumber={startNumber} templateConfig={templateConfig} />}
      </div>
    </div>
    <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
  </div>
  );

  return createPortal(layout, document.body);
};

export default SecretariaCarteirinhasPrintLayout;
