import React from 'react';
import { BadgeCheck, FileWarning, QrCode, UserRound } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../shared/document-validation/DocumentValidationQrCodeImage';
import {
  canonicalAsRecord,
  canonicalText,
} from '../../shared/canonical-document-render.utils';
import type { CarteirinhaPreceptorPreparedDocument } from '../types/carteirinhas-preceptor.types';

const CARDS_PER_SHEET = 10;
const CARDS_PER_ROW = 2;

interface CarteirinhasPreceptorBatchPrintLayoutProps {
  /**
   * Saída já preparada pela RPC. Este layout apenas organiza a impressão;
   * não consulta, calcula elegibilidade ou resolve valores no navegador.
   */
  documents: readonly CarteirinhaPreceptorPreparedDocument[];
  className?: string;
}

interface CanonicalPreceptorCardData {
  area: string;
  backMessage: string;
  footer: string;
  holderName: string;
  institution: string;
  photoUrl: string | null;
  qrEnabled: boolean;
  qrLabel: string;
  role: string;
  showPhoto: boolean;
  showPolo: boolean;
  subtitle: string;
  title: string;
  validationCode: string;
  validityLabel: string;
  watermarkEnabled: boolean;
  watermarkImageUrl: string | null;
  watermarkLabel: string;
  watermarkOpacity: number | null;
  ready: boolean;
}

const chunkArray = <Item,>(items: readonly Item[], size: number): Item[][] => {
  const chunks: Item[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

/**
 * A face traseira mantém a mesma linha física, com as colunas invertidas.
 * É uma transformação de posicionamento para duplex — não altera os dados
 * nem a ordem canônica retornada pela emissão.
 */
const mirrorDuplexRows = <Item,>(
  slots: readonly (Item | null)[],
): Array<Item | null> => {
  const mirrored: Array<Item | null> = [];
  for (let index = 0; index < slots.length; index += CARDS_PER_ROW) {
    mirrored.push(slots[index + 1] ?? null, slots[index] ?? null);
  }
  return mirrored;
};

const paddedSheet = (
  documents: readonly CarteirinhaPreceptorPreparedDocument[],
): Array<CarteirinhaPreceptorPreparedDocument | null> => {
  const slots: Array<CarteirinhaPreceptorPreparedDocument | null> = [...documents];
  while (slots.length < CARDS_PER_SHEET) slots.push(null);
  return slots;
};

const getCanonicalCardData = (
  document: CarteirinhaPreceptorPreparedDocument,
): CanonicalPreceptorCardData => {
  const payload = document.renderPayload;
  const template = canonicalAsRecord(payload?.template);
  const snapshot = canonicalAsRecord(payload?.snapshot);
  const rendered = payload?.rendered;
  const front = canonicalAsRecord(rendered?.front);
  const back = canonicalAsRecord(rendered?.back);
  const preceptor = canonicalAsRecord(snapshot.preceptor);
  const institutionSnapshot = canonicalAsRecord(snapshot.instituicao);
  const validation = canonicalAsRecord(snapshot.validacao);
  const validationCode = document.validationCode?.trim() || '';
  const qrEnabled = rendered?.qr?.enabled === true;
  const holderName = canonicalText(
    front.holder_name,
    front.holderName,
    front.nome,
    preceptor.nome,
  );
  const institution = canonicalText(
    front.institution,
    front.instituicao,
    institutionSnapshot.nome,
  );

  return {
    area: canonicalText(front.area, front.area_atuacao, preceptor.areaFormacao, preceptor.titulacao),
    backMessage: canonicalText(back.message, back.mensagem),
    footer: canonicalText(back.footer, back.rodape),
    holderName,
    institution,
    photoUrl: canonicalText(front.photo_url, front.photoUrl, preceptor.fotoUrl) || null,
    qrEnabled,
    qrLabel: canonicalText(rendered?.qr?.label, back.qr_label),
    role: canonicalText(front.role, front.cargo),
    showPhoto: template.mostrarFoto !== false && front.mostrarFoto !== false,
    showPolo: template.mostrarPolo !== false && front.mostrarPolo !== false,
    subtitle: canonicalText(front.subtitle, front.subtitulo),
    title: canonicalText(front.title, front.titulo),
    validationCode,
    validityLabel: canonicalText(
      rendered?.qr?.validityLabel,
      back.validity_label,
      back.validityLabel,
      validation.validadeExibicao,
    ),
    watermarkEnabled: rendered?.watermark?.enabled === true,
    watermarkImageUrl: rendered?.watermark?.imageUrl || null,
    watermarkLabel: canonicalText(rendered?.watermark?.label, institution),
    watermarkOpacity: rendered?.watermark?.opacity ?? null,
    ready: Boolean(
      Object.keys(snapshot).length
      && Object.keys(front).length
      && Object.keys(back).length
      && holderName
      && (!qrEnabled || validationCode),
    ),
  };
};

const CardWatermark = ({ card }: { card: CanonicalPreceptorCardData }) => {
  if (!card.watermarkEnabled) return null;

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"
      style={{ opacity: card.watermarkOpacity ?? undefined }}
    >
      {card.watermarkImageUrl ? (
        <img
          src={card.watermarkImageUrl}
          alt=""
          className="h-[72%] w-[72%] object-contain opacity-80"
        />
      ) : (
        <span className="-rotate-45 whitespace-nowrap text-[10px] font-black uppercase tracking-[0.24em] text-current">
          {card.watermarkLabel}
        </span>
      )}
    </span>
  );
};

const CardPayloadUnavailable = () => (
  <div
    data-render-error="O servidor não retornou os dados canônicos necessários para imprimir este Crachá de Preceptor."
    className="flex h-[54mm] w-[85.6mm] flex-col items-center justify-center border border-amber-200 bg-amber-50 p-[5mm] text-center text-amber-800"
  >
    <FileWarning size={18} />
    <span className="mt-[2mm] text-[6px] font-black uppercase leading-[1.35] tracking-[0.1em]">
      Dados canônicos indisponíveis
    </span>
  </div>
);

const PreceptorCardFront = ({ document }: { document: CarteirinhaPreceptorPreparedDocument }) => {
  const card = getCanonicalCardData(document);
  if (!card.ready) return <CardPayloadUnavailable />;

  return (
    <article
      aria-label={`Frente do Crachá de Preceptor de ${card.holderName}`}
      className="relative flex h-[54mm] w-[85.6mm] overflow-hidden bg-[#001a33] text-white shadow-sm [box-sizing:border-box]"
      data-canonical-document-side="front"
    >
      <CardWatermark card={card} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col p-[5mm]">
        <p className="truncate text-[6.5px] font-black uppercase tracking-[0.17em] text-cyan-200">
          {card.subtitle}
        </p>
        <h2 className="mt-[4mm] text-[12px] font-black uppercase leading-[1.12]">{card.title}</h2>
        <div className="mt-auto min-w-0">
          <p className="truncate text-[9px] font-black uppercase tracking-wide">{card.holderName}</p>
          {card.role && <p className="mt-[1mm] truncate text-[6px] font-bold uppercase tracking-[0.12em] text-cyan-200">{card.role}</p>}
          {card.area && <p className="mt-[0.5mm] truncate text-[5.5px] font-bold uppercase tracking-[0.1em] text-slate-200">{card.area}</p>}
          {card.showPolo && card.institution && <p className="mt-[1mm] truncate text-[5px] font-bold uppercase tracking-[0.1em] text-slate-300">{card.institution}</p>}
        </div>
      </div>
      <div className="relative z-10 m-[4mm] ml-0 flex w-[24mm] shrink-0 items-center justify-center overflow-hidden rounded-[2mm] border border-white/20 bg-slate-100">
        {card.showPhoto && card.photoUrl ? (
          <img src={card.photoUrl} alt={`Foto de ${card.holderName}`} className="h-full w-full object-cover" />
        ) : (
          <UserRound size={25} className="text-slate-400" aria-label="Foto não disponível" />
        )}
      </div>
    </article>
  );
};

const PreceptorCardBack = ({ document }: { document: CarteirinhaPreceptorPreparedDocument }) => {
  const card = getCanonicalCardData(document);
  if (!card.ready) return <CardPayloadUnavailable />;

  return (
    <article
      aria-label={`Verso do Crachá de Preceptor de ${card.holderName}`}
      className="relative flex h-[54mm] w-[85.6mm] flex-col overflow-hidden bg-slate-50 p-[5mm] text-[#001a33] shadow-sm [box-sizing:border-box]"
      data-canonical-document-side="back"
      data-requires-qr-code={card.qrEnabled ? 'true' : undefined}
    >
      <CardWatermark card={card} />
      <div className="relative z-10 flex h-full flex-col">
        <BadgeCheck size={14} className="text-violet-700" />
        {card.backMessage && (
          <p className="mt-[3mm] whitespace-pre-line text-[6.5px] font-medium leading-[1.35] text-slate-600">{card.backMessage}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-[3mm] border-t border-slate-200 pt-[3mm]">
          <div className="min-w-0">
            {card.footer && <p className="text-[5.5px] font-bold uppercase leading-[1.25] tracking-[0.08em] text-slate-500">{card.footer}</p>}
            {card.validityLabel && (
              <p className="mt-[1mm] text-[5.5px] font-black uppercase tracking-wide text-violet-700">
                Validade: {card.validityLabel}
              </p>
            )}
          </div>
          {card.qrEnabled && (
            <div className="shrink-0 rounded-[1mm] border border-slate-200 bg-white p-[1mm] text-center">
              <DocumentValidationQrCodeImage
                code={card.validationCode}
                size={240}
                alt="QR Code de validação do Crachá de Preceptor"
                className="h-[16.5mm] w-[16.5mm]"
              />
              <p className="mt-[0.5mm] flex items-center justify-center gap-[0.5mm] text-[4.5px] font-black uppercase tracking-wide text-slate-500">
                <QrCode size={6} /> {card.qrLabel || 'Validação'}
              </p>
              <p className="text-[4.5px] font-black tracking-wider text-violet-700">{card.validationCode}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
};

const EmptyCardSlot = () => (
  <div
    aria-hidden="true"
    className="flex h-[54mm] w-[85.6mm] items-center justify-center border border-dashed border-slate-200 bg-slate-50/70 text-[6px] font-black uppercase tracking-[0.14em] text-slate-300 [box-sizing:border-box]"
  >
    Espaço não utilizado
  </div>
);

const BATCH_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 0; }
  @media print {
    .preceptor-batch-print-page {
      width: 210mm !important;
      height: 297mm !important;
      min-height: 297mm !important;
      margin: 0 !important;
      padding: 10mm !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      box-shadow: none !important;
      border: none !important;
      break-after: page !important;
      page-break-after: always !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .preceptor-batch-print-page:last-of-type {
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .preceptor-batch-print-grid {
      display: grid !important;
      grid-template-columns: repeat(2, 85.6mm) !important;
      grid-template-rows: repeat(5, 54mm) !important;
      column-gap: 3mm !important;
      row-gap: 1.5mm !important;
      justify-content: center !important;
      align-content: start !important;
    }
    .preceptor-batch-print-page img {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

/**
 * Folhas A4 retrato para impressão frente/verso de Crachás de Preceptor CR80.
 * Cada página de frentes é seguida de uma página de versos com as colunas
 * espelhadas, pronta para duplex. A emissão e os dados exibidos já chegaram
 * prontos da RPC; o componente só monta a grade física de impressão.
 */
const CarteirinhasPreceptorBatchPrintLayout: React.FC<CarteirinhasPreceptorBatchPrintLayoutProps> = ({
  documents,
  className = '',
}) => {
  if (!documents.length) return null;

  return (
    <section
      className={`preceptor-batch-print-root flex flex-col items-center gap-8 bg-slate-900 p-6 print:block print:bg-white print:p-0 ${className}`.trim()}
      data-canonical-document-batch="CARTEIRINHA_PRECEPTOR"
      data-cards-per-sheet={CARDS_PER_SHEET}
    >
      {chunkArray<CarteirinhaPreceptorPreparedDocument>(documents, CARDS_PER_SHEET).map((sheetDocuments, sheetIndex) => {
        const frontSlots = paddedSheet(sheetDocuments);
        const backSlots = mirrorDuplexRows(frontSlots);

        return (
          <React.Fragment key={`preceptor-sheet-${sheetIndex + 1}`}>
            <section
              className="print-page preceptor-batch-print-page relative h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[10mm] shadow-2xl [box-sizing:border-box] print:shadow-none"
              data-print-sheet={sheetIndex + 1}
              data-print-side="front"
              data-pdf-orientation="portrait"
            >
              <div className="preceptor-batch-print-grid grid grid-cols-2 grid-rows-5 content-start justify-center gap-x-[3mm] gap-y-[1.5mm]">
                {frontSlots.map((document, slotIndex) => (
                  <div key={`front-${sheetIndex}-${slotIndex}`} className="h-[54mm] w-[85.6mm]">
                    {document ? <PreceptorCardFront document={document} /> : <EmptyCardSlot />}
                  </div>
                ))}
              </div>
              <p className="absolute inset-x-[10mm] bottom-[2mm] flex justify-between text-[6px] font-black uppercase tracking-[0.14em] text-slate-400 print:hidden">
                <span>Crachás de Preceptor · frentes</span>
                <span>10 CR80 por folha A4</span>
              </p>
            </section>

            <section
              className="print-page preceptor-batch-print-page relative h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[10mm] shadow-2xl [box-sizing:border-box] print:shadow-none"
              data-print-sheet={sheetIndex + 1}
              data-print-side="back"
              data-pdf-orientation="portrait"
            >
              <div className="preceptor-batch-print-grid grid grid-cols-2 grid-rows-5 content-start justify-center gap-x-[3mm] gap-y-[1.5mm]">
                {backSlots.map((document, slotIndex) => (
                  <div key={`back-${sheetIndex}-${slotIndex}`} className="h-[54mm] w-[85.6mm]">
                    {document ? <PreceptorCardBack document={document} /> : <EmptyCardSlot />}
                  </div>
                ))}
              </div>
              <p className="absolute inset-x-[10mm] bottom-[2mm] flex justify-between text-[6px] font-black uppercase tracking-[0.14em] text-slate-400 print:hidden">
                <span>Crachás de Preceptor · versos espelhados</span>
                <span>Duplex: virar no lado longo</span>
              </p>
            </section>
          </React.Fragment>
        );
      })}
      <style>{BATCH_PRINT_STYLES}</style>
    </section>
  );
};

export default CarteirinhasPreceptorBatchPrintLayout;
