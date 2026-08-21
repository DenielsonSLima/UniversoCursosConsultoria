import { BadgeCheck, FileWarning, QrCode, UserRound } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../shared/document-validation/DocumentValidationQrCodeImage';
import {
  canonicalAsRecord,
  canonicalText,
} from '../../shared/canonical-document-render.utils';
import type { CarteirinhaPreceptorPreparedDocument } from '../types/carteirinhas-preceptor.types';

interface CarteirinhaPreceptorDocumentRendererProps {
  document: CarteirinhaPreceptorPreparedDocument;
}

const booleanValue = (...values: unknown[]) => {
  const value = values.find((item) => typeof item === 'boolean' || item === 'true' || item === 'false');
  return value === true || value === 'true';
};

export const isCarteirinhaPreceptorRenderPayloadReady = (
  document: CarteirinhaPreceptorPreparedDocument,
) => {
  const payload = document.renderPayload;
  const template = canonicalAsRecord(payload?.template);
  const snapshot = canonicalAsRecord(payload?.snapshot);
  if (!Object.keys(template).length || !Object.keys(snapshot).length) return false;
  if (template.layoutVersion === 'CR80_VERTICAL_V1') {
    const emissao = canonicalAsRecord(snapshot.emissao);
    if (!Array.isArray(template.fields) || !canonicalText(emissao.dataExibicao, emissao.data_exibicao)) return false;
  }
  const renderedQr = payload?.rendered?.qr;
  const templateQr = canonicalAsRecord(template.qr);
  const qrEnabled = renderedQr ? renderedQr.enabled : booleanValue(templateQr.habilitado, templateQr.enabled);
  return !(qrEnabled && !document.validationCode);
};

const PreceptorPayloadUnavailable = () => (
  <section
    data-render-error="O servidor não retornou o snapshot canônico do Crachá de Preceptor."
    className="mx-auto flex min-h-[420px] w-[min(210mm,100%)] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl"
  >
    <FileWarning className="text-amber-500" size={38} />
    <h5 className="mt-4 text-sm font-black uppercase tracking-wide text-[#001a33]">Prévia canônica indisponível</h5>
    <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
      A credencial foi preparada, mas o retorno não contém o modelo e o snapshot necessários para montar um crachá oficial.
    </p>
  </section>
);

const CarteirinhaPreceptorDocumentRenderer = ({ document }: CarteirinhaPreceptorDocumentRendererProps) => {
  const payload = document.renderPayload;
  const template = canonicalAsRecord(payload?.template);
  const snapshot = canonicalAsRecord(payload?.snapshot);

  if (!Object.keys(template).length || !Object.keys(snapshot).length) return <PreceptorPayloadUnavailable />;

  const rendered = payload?.rendered;
  const front = rendered?.front || {};
  const back = rendered?.back || {};
  const preceptor = canonicalAsRecord(snapshot.preceptor);
  const institution = canonicalAsRecord(snapshot.instituicao);
  const validation = canonicalAsRecord(snapshot.validacao);
  const templateQr = canonicalAsRecord(template.qr);
  const qrEnabled = rendered?.qr ? rendered.qr.enabled : booleanValue(templateQr.habilitado, templateQr.enabled);
  const qrLabel = canonicalText(rendered?.qr?.label, templateQr.rotulo, 'Validar credencial');
  const watermarkEnabled = rendered?.watermark
    ? rendered.watermark.enabled
    : booleanValue(template.marcaDaguaHabilitada, template.marca_dagua_habilitada);
  const watermarkLabel = canonicalText(rendered?.watermark?.label, institution.nome, 'UNIVERSO');
  const watermarkOpacity = rendered?.watermark?.opacity ?? 0.1;
  const watermarkImageUrl = rendered?.watermark?.imageUrl || null;
  const showPhoto = booleanValue(template.mostrarFoto, front.mostrarFoto) && Boolean(canonicalText(front.fotoUrl, preceptor.fotoUrl));
  const showPolo = template.mostrarPolo !== false && front.mostrarPolo !== false;
  const frontTitle = canonicalText(front.titulo, front.title, template.tituloFrente, 'PRECEPTOR(A)');
  const frontSubtitle = canonicalText(front.subtitulo, front.subtitle, template.subtituloFrente, institution.nome);
  const role = canonicalText(front.cargo, front.role, 'Preceptor');
  const area = canonicalText(front.areaAtuacao, front.area, preceptor.areaFormacao, preceptor.titulacao);
  const backMessage = canonicalText(back.mensagem, back.message, template.mensagemVerso);
  const footer = canonicalText(back.rodape, back.footer, template.rodape);
  const photoUrl = canonicalText(front.fotoUrl, preceptor.fotoUrl) || null;
  const validityLabel = canonicalText(
    rendered?.qr?.validityLabel,
    back.validityLabel,
    validation.validadeExibicao,
  );

  if (qrEnabled && !document.validationCode) return <PreceptorPayloadUnavailable />;

  return (
    <article
      className="print-page relative mx-auto flex h-[297mm] w-[210mm] flex-col items-center justify-center gap-[14mm] overflow-hidden bg-white p-[16mm] text-black shadow-2xl box-border print:shadow-none"
      data-pdf-orientation="portrait"
      data-requires-qr-code={qrEnabled ? 'true' : undefined}
    >
      {watermarkEnabled && (
        <div
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center"
          style={{ opacity: watermarkOpacity }}
          aria-hidden="true"
        >
          {watermarkImageUrl ? (
            <img src={watermarkImageUrl} alt="" className="max-h-[62%] max-w-[62%] -rotate-45 object-contain" />
          ) : (
            <span className="-rotate-45 text-center text-5xl font-black uppercase tracking-[0.22em] text-[#001a33]">{watermarkLabel}</span>
          )}
        </div>
      )}

      <section className="relative z-10 flex h-[54mm] w-[85.6mm] overflow-hidden rounded-[3mm] bg-[#001a33] text-white shadow-xl">
        <div className="flex min-w-0 flex-1 flex-col p-[5mm]">
          <p className="text-[7px] font-black uppercase tracking-[0.18em] text-cyan-200">{frontSubtitle}</p>
          <h1 className="mt-[4mm] text-[13px] font-black uppercase leading-[1.15]">{frontTitle}</h1>
          <div className="mt-auto min-w-0">
            <p className="truncate text-[9px] font-black uppercase tracking-wide">{canonicalText(front.nome, front.name, preceptor.nome, document.targetName)}</p>
            <p className="mt-[1mm] truncate text-[6px] font-bold uppercase tracking-[0.12em] text-cyan-200">{[role, area].filter(Boolean).join(' · ')}</p>
            {showPolo && <p className="mt-[1mm] truncate text-[5.5px] font-bold uppercase tracking-[0.1em] text-slate-300">{canonicalText(front.institution, institution.nome, 'Polo emissor')}</p>}
          </div>
        </div>
        <div className="relative m-[4mm] ml-0 flex w-[24mm] shrink-0 items-center justify-center overflow-hidden rounded-[2mm] border border-white/20 bg-slate-200">
          {showPhoto && photoUrl ? (
            <img src={photoUrl} alt={`Foto de ${document.targetName}`} className="h-full w-full object-cover" />
          ) : (
            <UserRound size={25} className="text-slate-400" aria-label="Foto não disponível" />
          )}
        </div>
      </section>

      <section className="relative z-10 flex h-[54mm] w-[85.6mm] flex-col overflow-hidden rounded-[3mm] bg-slate-50 p-[5mm] text-[#001a33] shadow-xl">
        <BadgeCheck size={15} className="text-violet-700" />
        <p className="mt-[3mm] whitespace-pre-line text-[6.5px] font-medium leading-[1.35] text-slate-600">{backMessage}</p>
        <div className="mt-auto flex items-end justify-between gap-[3mm] border-t border-slate-200 pt-[3mm]">
          <div className="min-w-0">
            <p className="text-[5.5px] font-bold uppercase leading-[1.25] tracking-[0.08em] text-slate-500">{footer}</p>
            {validityLabel && <p className="mt-[1mm] text-[5.5px] font-black uppercase tracking-wide text-violet-700">Validade: {validityLabel}</p>}
          </div>
          {qrEnabled && document.validationCode && (
            <div className="shrink-0 rounded-[1mm] border border-slate-200 bg-white p-[1mm] text-center">
              <DocumentValidationQrCodeImage
                code={document.validationCode}
                size={240}
                alt="QR Code de validação do crachá"
                className="h-[17mm] w-[17mm]"
              />
              <p className="mt-[0.5mm] flex items-center justify-center gap-[0.5mm] text-[4.5px] font-black uppercase tracking-wide text-slate-500"><QrCode size={6} /> {qrLabel}</p>
              <p className="text-[4.5px] font-black tracking-wider text-violet-700">{document.validationCode}</p>
            </div>
          )}
        </div>
      </section>
    </article>
  );
};

export default CarteirinhaPreceptorDocumentRenderer;
