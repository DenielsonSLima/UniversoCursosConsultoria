import React, { useState } from 'react';
import { FileText, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { LocalQrCodeImage } from '../../../../../shared/qrcode/LocalQrCodeImage';
import { parseContratoAlunoClosingLayout } from '../../../../../shared/contrato-aluno/closing-layout';
import type { ConfiguracaoQrContrato } from '../types/contrato-aluno.types';

export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;

const pageBreakRegex = /<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>|---QUEBRA_DE_PAGINA---/gi;

export interface ContratoAlunoTemplatePage {
  body: string;
  /** O encerramento do contrato (local, assinaturas e testemunhas) só cabe na última folha. */
  footer: string | null;
}

/** Corrige conteúdo salvo em versões iniciais com "\\n" literal no JSON. */
export const normalizeContratoTemplateLineBreaks = (value: string) => value
  .replace(/\r\n?/g, '\n')
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n/g, '\n');

/**
 * Calcula dinamicamente as páginas do contrato.
 * Se houver quebra de página explícita, respeita as marcações.
 * Caso contrário, distribui o texto automaticamente pelas páginas A4 com base na capacidade de linhas.
 * O encerramento é aplicado uma única vez, na última página, tal como a minuta.
 */
export const autoPaginateContractText = (
  corpoText: string,
  footerText = '',
): ContratoAlunoTemplatePage[] => {
  const normalizedBody = normalizeContratoTemplateLineBreaks(corpoText);
  const normalizedFooter = normalizeContratoTemplateLineBreaks(footerText).trim();
  const toPages = (bodyPages: string[]) => bodyPages.map((body, index) => ({
    body,
    footer: index === bodyPages.length - 1 ? normalizedFooter || null : null,
  }));

  if (!normalizedBody.trim()) return toPages(['']);

  // Se houver marcação explícita de quebra de página, utiliza-a
  if (pageBreakRegex.test(normalizedBody)) {
    const splitPages = normalizedBody.split(pageBreakRegex);
    return toPages(splitPages.length > 0 ? splitPages : ['']);
  }

  // Paginação automática por capacidade de linhas/parágrafos
  const paragraphs = normalizedBody.split(/\n+/);
  const pages: string[] = [];
  let currentPageParagraphs: string[] = [];
  let currentLines = 0;

  // Em média 90 caracteres por linha em fonte serif 11px em A4
  const CHARS_PER_LINE = 90;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraLines = Math.max(1, Math.ceil(para.length / CHARS_PER_LINE));
    const isPageOne = pages.length === 0;
    // Página 1 possui cabeçalho + título (limite ~28 linhas); demais páginas (~34 linhas)
    const pageLineLimit = isPageOne ? 28 : 34;

    if (currentLines > 0 && currentLines + paraLines > pageLineLimit) {
      pages.push(currentPageParagraphs.join('\n\n'));
      currentPageParagraphs = [para];
      currentLines = paraLines;
    } else {
      currentPageParagraphs.push(para);
      currentLines += paraLines + 1;
    }
  }

  if (currentPageParagraphs.length > 0) {
    pages.push(currentPageParagraphs.join('\n\n'));
  }

  return toPages(pages.length > 0 ? pages : ['']);
};

interface ContratoAlunoCanvasProps {
  tituloDocumento: string;
  cabecalho: string;
  corpo: string;
  rodape: string;
  observacaoEscopo: string;
  qr: ConfiguracaoQrContrato;
  polo?: any;
  centralWatermark?: {
    watermarkUrl?: string | null;
    landscapeWatermarkUrl?: string | null;
    watermarkOpacity?: number;
    watermarkScale?: number;
    watermarkRotate?: boolean;
  } | null;
  activePageIndex?: number;
  onPageSelect?: (index: number) => void;
}

export const ContratoAlunoCanvas: React.FC<ContratoAlunoCanvasProps> = ({
  tituloDocumento,
  cabecalho,
  corpo,
  rodape,
  qr,
  polo,
  centralWatermark,
  activePageIndex = 0,
  onPageSelect,
}) => {
  const [zoomScale, setZoomScale] = useState<number>(0.58);
  const pages = autoPaginateContractText(corpo, rodape);
  const totalPages = pages.length;

  const watermarkUrl =
    centralWatermark?.watermarkUrl ||
    centralWatermark?.landscapeWatermarkUrl ||
    polo?.watermark_url ||
    polo?.watermarkUrl ||
    null;

  const rawOpacity = centralWatermark?.watermarkOpacity ?? polo?.watermark_opacity ?? 0.12;
  const watermarkOpacity = rawOpacity > 1 ? rawOpacity / 100 : rawOpacity;
  const watermarkScale = centralWatermark?.watermarkScale ?? polo?.watermark_scale ?? 50;
  const watermarkRotate = centralWatermark?.watermarkRotate !== false;

  const scaledHeight = PAGE_HEIGHT * zoomScale;
  const scaledWidth = PAGE_WIDTH * zoomScale;

  return (
    <div className="flex flex-col items-center gap-4 animate-fadeIn w-full">
      {/* Top Controls Bar: Page Count & Zoom Slider */}
      <div className="flex flex-wrap items-center justify-between gap-3 w-full px-4 py-2.5 bg-slate-200/80 rounded-2xl border border-slate-300 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText size={17} className="text-[#ed1c4e]" />
          <span className="text-xs font-black uppercase tracking-wider text-[#001a33]">
            Prévia Estrutural A4 ({totalPages} {totalPages === 1 ? 'Página' : 'Páginas'})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 rounded-xl bg-white px-2 py-1 border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setZoomScale((z) => Math.max(0.35, Number((z - 0.05).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-[#001a33] transition"
              title="Reduzir Zoom"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#001a33] min-w-10 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoomScale((z) => Math.min(1.0, Number((z + 0.05).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-[#001a33] transition"
              title="Aumentar Zoom"
            >
              <ZoomIn size={14} />
            </button>
            <button
              type="button"
              onClick={() => setZoomScale(0.56)}
              className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 hover:bg-slate-200"
              title="Ajustar à tela"
            >
              <Maximize2 size={11} />
            </button>
          </div>

          {/* Page navigation badges */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 max-w-[200px] custom-scrollbar">
            {pages.map((_, idx) => (
              <button
                key={`page-nav-${idx}`}
                type="button"
                onClick={() => onPageSelect?.(idx)}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider transition ${
                  activePageIndex === idx
                    ? 'bg-[#001a33] text-white shadow-md shadow-blue-950/20'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                P{idx + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pages render container */}
      <div className="flex flex-col gap-6 w-full items-center overflow-x-auto overflow-y-auto max-h-[820px] custom-scrollbar p-4 bg-slate-200/60 rounded-3xl border border-slate-300 shadow-inner">
        {pages.map((pageText, pageIndex) => {
          const isSelected = activePageIndex === pageIndex;
          const isFinalPage = pageIndex === totalPages - 1;
          const shouldRenderClosing = isFinalPage && Boolean(pageText.footer || qr.habilitado);
          const closingLayout = parseContratoAlunoClosingLayout(pageText.footer);

          return (
            <div
              key={`contract-page-${pageIndex}`}
              id={`contract-page-view-${pageIndex}`}
              onClick={() => onPageSelect?.(pageIndex)}
              className={`flex flex-col items-center transition-all duration-200 ${
                isSelected ? 'ring-2 ring-blue-500 ring-offset-4 rounded-xl p-1 bg-blue-50/40' : 'opacity-95 hover:opacity-100'
              }`}
            >
              {/* Page Number Badge */}
              <div className="mb-2 flex items-center justify-center">
                <span className="rounded-full border border-slate-300 bg-white px-4 py-1 text-[10px] font-black uppercase tracking-widest text-[#001a33] shadow-sm">
                  PÁGINA {pageIndex + 1} DE {totalPages}
                </span>
              </div>

              {/* Scaled A4 Sheet Outer Wrapper */}
              <div
                style={{
                  width: `${scaledWidth}px`,
                  height: `${scaledHeight}px`,
                  position: 'relative',
                }}
                className="overflow-hidden shadow-2xl rounded-sm shrink-0"
              >
                {/* A4 Sheet Render Container (fixed 794px x 1123px scaled via transform) */}
                <article
                  className="relative bg-white overflow-hidden text-left origin-top-left"
                  style={{
                    width: `${PAGE_WIDTH}px`,
                    height: `${PAGE_HEIGHT}px`,
                    padding: '64px 76px 76px 76px',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'top left',
                    backgroundImage: `
                      linear-gradient(to right, rgba(14, 165, 233, 0.05) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(14, 165, 233, 0.05) 1px, transparent 1px)
                    `,
                    backgroundSize: '20px 20px',
                  }}
                >

                  {/* Visual Alignment Guides */}
                  <div className="pointer-events-none absolute inset-0 z-[1]">
                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-blue-500/15" />
                    <div className="absolute left-0 right-0 top-1/2 border-t border-blue-500/15" />
                    <div
                      className="absolute border border-dashed border-slate-300/60"
                      style={{ left: 76, right: 76, top: 64, bottom: 76 }}
                    />
                  </div>

                  {/* Central Watermark Layer (Idêntico ao modelo de Declaração) */}
                  {watermarkUrl && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                      <img
                        src={watermarkUrl}
                        alt="Watermark"
                        style={{
                          opacity: watermarkOpacity || 0.1,
                          width: `${watermarkScale || 50}%`,
                          transform: watermarkRotate !== false ? 'rotate(-45deg)' : 'none',
                        }}
                      />
                    </div>
                  )}

                  {/* Institutional Header (DocumentHeader) */}
                  <div className="relative z-10">
                    <DocumentHeader polo={polo} orientation="portrait" />
                  </div>

                  {/* Document Title Header (shown on page 1) */}
                  {pageIndex === 0 && (
                    <div className="relative z-10 mt-6 mb-6 text-center">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#001a33]">
                        {cabecalho || 'UNIVERSO CURSOS E CONSULTORIA'}
                      </p>
                      <div className="mx-auto mt-2.5 h-0.5 w-20 bg-[#ed1c4e]" />
                      <h1 className="mt-4 text-xl font-black uppercase leading-tight tracking-tight text-[#001a33]">
                        {tituloDocumento || 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS EDUCACIONAIS'}
                      </h1>
                    </div>
                  )}

                  {/* Page Body Text Content */}
                  <div className="relative z-10 mt-6 mb-20 text-justify text-[11.5px] leading-[1.8] text-slate-800 font-serif whitespace-pre-wrap break-words">
                    {pageText.body || (
                      <span className="italic text-slate-400 font-sans">
                        Página {pageIndex + 1} vazia ou sem texto configurado.
                      </span>
                    )}
                  </div>

                  {/* O encerramento da minuta e seu QR são exclusivos da última página. */}
                  {shouldRenderClosing && (
                    <footer className="absolute bottom-[176px] left-[76px] right-[76px] z-10 border-t border-slate-200 pt-4">
                      <div className="grid grid-cols-[minmax(0,1fr)_112px] items-start gap-5">
                        <div className="min-w-0">
                          {closingLayout.fallbackText ? (
                            <p className="whitespace-pre-wrap text-[9px] leading-relaxed text-slate-600 font-sans">
                              {closingLayout.fallbackText}
                            </p>
                          ) : (
                            <div className="space-y-4 font-sans text-slate-600">
                              {closingLayout.location && (
                                <p className="text-[9px] font-medium leading-relaxed">{closingLayout.location}</p>
                              )}

                              {closingLayout.parties.length > 0 && (
                                <div className="grid grid-cols-2 gap-7">
                                  {closingLayout.parties.map((party) => (
                                    <div key={party.label} className="min-w-0 text-center">
                                      <div className="flex h-8 items-end justify-center border-b border-slate-500 px-2 text-[8px] font-medium text-slate-700">
                                        {party.value}
                                      </div>
                                      <p className="mt-1 text-[7px] font-black uppercase tracking-wider text-slate-500">{party.label}</p>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {closingLayout.witnesses.length > 0 && (
                                <div>
                                  <p className="mb-2 text-[7px] font-black uppercase tracking-wider text-slate-500">Testemunhas</p>
                                  <div className="grid grid-cols-2 gap-7">
                                    {closingLayout.witnesses.map((witness) => (
                                      <div key={witness.label} className="min-w-0 text-center">
                                        <div className="flex h-6 items-end justify-center border-b border-slate-400 px-2 text-[7px] font-medium text-slate-700">
                                          {witness.value}
                                        </div>
                                        <p className="mt-1 text-[6.5px] font-bold uppercase tracking-wider text-slate-400">{witness.label}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {closingLayout.additionalLines.length > 0 && (
                                <p className="whitespace-pre-wrap text-[8px] leading-relaxed text-slate-500">
                                  {closingLayout.additionalLines.join('\n')}
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* QR Code Container */}
                        {qr.habilitado && (
                          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-center shadow-sm w-28">
                            <div className="w-16 h-16 mx-auto bg-white flex items-center justify-center">
                              <LocalQrCodeImage
                                value="https://universocursos.com/validar/PREVIA-CONTRATO"
                                size={160}
                                alt="QR Code de validação"
                                className="w-full h-full pointer-events-none"
                              />
                            </div>
                            <p className="mt-1 text-[7px] font-black uppercase tracking-wider text-slate-500">
                              {qr.rotulo || 'Validar documento'}
                            </p>
                            <p className="text-[8px] font-mono font-black text-blue-700 tracking-wider">
                              CON-PREVIA-001
                            </p>
                            <p className="text-[6.5px] font-semibold text-slate-400">
                              {qr.modoValidade === 'POR_DIAS' && qr.diasValidade
                                ? `Validade: ${qr.diasValidade} dias`
                                : 'Sem vencimento'}
                            </p>
                          </div>
                        )}
                      </div>
                    </footer>
                  )}
                </article>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
