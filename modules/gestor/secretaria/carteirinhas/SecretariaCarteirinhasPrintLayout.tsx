import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, Loader2, Printer, RefreshCw, AlertTriangle } from 'lucide-react';
import CarteirinhaPreview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import type { Aluno } from './secretaria-carteirinhas.types';
import { useCarteirinhasPdf } from './useCarteirinhasPdf';

export type CarteirinhaLayoutType = 'dobra' | 'espelhado';
export type CarteirinhaPrintAluno = Aluno & {
  validationCode?: string;
  validationPublic?: boolean;
};

interface SecretariaCarteirinhasPrintLayoutProps {
  alunos: CarteirinhaPrintAluno[];
  layoutType: CarteirinhaLayoutType;
  onBack: () => void;
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
                    ? <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} showValidationQrCode={aluno.validationPublic === true} />
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
                    ? <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} showValidationQrCode={aluno.validationPublic === true} />
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
                  <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} showValidationQrCode={aluno.validationPublic === true} />
                  <div data-card-fold-guide="true" className="pointer-events-none absolute bottom-0 right-0 top-0 z-20 w-px border-r border-dashed border-slate-400" />
                </div>
                <div className="relative h-[54mm] w-[85.6mm]">
                  <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} showValidationQrCode={aluno.validationPublic === true} />
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

const SecretariaCarteirinhasPrintLayout: React.FC<SecretariaCarteirinhasPrintLayoutProps> = ({
  alunos, layoutType, onBack, startNumber, templateConfig,
}) => {
  const sourceKey = JSON.stringify({ alunos, layoutType, startNumber, templateConfig });
  const pdf = useCarteirinhasPdf(sourceKey, layoutType);
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950" id="print-layout">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800 p-4 text-white shadow-md">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-700 hover:text-white">
            <ArrowLeft size={16} /> Voltar
          </button>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">Visualizador de Impressão A4</h3>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {layoutType === 'dobra' ? 'Dobra Lateral (5 por Folha)' : 'Frente e Verso Espelhado (10 por Folha)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={pdf.download} disabled={!pdf.ready} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-xs font-bold uppercase tracking-widest hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">
            <Download size={16} /> Baixar PDF
          </button>
          <button type="button" onClick={() => { void pdf.print(); }} disabled={!pdf.ready || pdf.printing} className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-xs font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {pdf.printing ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            {pdf.printing ? 'Abrindo impressão...' : 'Confirmar Impressão'}
          </button>
        </div>
      </div>
      {pdf.actionError && <p role="alert" className="bg-rose-50 px-6 py-3 text-sm text-rose-800">{pdf.actionError}</p>}
      <div className="relative min-h-0 flex-1">
        {pdf.error ? (
          <div role="alert" className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center text-white">
            <AlertTriangle size={32} className="text-amber-400" />
            <h4 className="font-bold">Não foi possível preparar as carteirinhas</h4>
            <p className="max-w-xl text-sm text-slate-300">{pdf.error}</p>
            <button type="button" onClick={pdf.retry} className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-bold hover:bg-blue-700">
              <RefreshCw size={16} /> Tentar novamente
            </button>
          </div>
        ) : pdf.url ? (
          <iframe title="PDF oficial das carteirinhas" src={pdf.url} className="h-full w-full border-0" />
        ) : (
          <div role="status" className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center text-white">
            <Loader2 size={32} className="animate-spin text-blue-400" />
            <p className="font-bold">Preparando as carteirinhas</p>
            <p className="text-sm text-slate-300">Carregando o modelo, as fotografias e os códigos de validação…</p>
          </div>
        )}
      </div>
      <div key={pdf.attempt} ref={pdf.sourceRef} aria-hidden="true" className="carteirinha-pdf-source" style={{
        position: 'fixed', left: '-20000px', top: 0, width: '210mm', pointerEvents: 'none',
      }}>
        {layoutType === 'dobra'
          ? <DobraPages alunos={alunos} startNumber={startNumber} templateConfig={templateConfig} />
          : <EspelhadoPages alunos={alunos} startNumber={startNumber} templateConfig={templateConfig} />}
      </div>
      <style>{`.carteirinha-pdf-source .print-page { margin: 0; border: 0; box-shadow: none; }`}</style>
    </div>, document.body,
  );
};

export default SecretariaCarteirinhasPrintLayout;
