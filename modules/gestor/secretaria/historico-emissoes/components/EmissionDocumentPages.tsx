import React from 'react';
import { sanitizedHtml } from '../../../../../lib/htmlSanitizer';
import { DocumentValidationQrCodeImage } from '../../../../shared/document-validation/DocumentValidationQrCodeImage';
import DocumentHeader from '../../../components/DocumentHeader';
import CertificadoPreview from '../../certificados/components/CertificadoPreview';
import CarteirinhaPreview from '../../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from '../../../cadastros/modelos-documentos/declaracao/components/declaracao-editor.utils';
import { DOCUMENT_TABS, isCertificateDocument } from '../historico-emissoes.constants';
import { getPreviewStudent } from '../preview-utils';
import { parseEmissionTemplate } from '../template-parser';
import type {
  AcademicPreviewData,
  EmissionLog,
} from '../historico-emissoes.types';
import type { CertificadoAcademico } from '../../certificados/certificados.types';
import {
  hasExplicitQrCodeField,
  isPublicDocumentValidationEnabled,
} from '../document-validation-rendering';

interface EmissionDocumentPagesProps {
  emission: EmissionLog;
  templateConfig: any;
  certificatePreview: CertificadoAcademico | null;
  watermark: any;
  poloInfo: any;
  academicPreviewData: AcademicPreviewData | null;
}

const splitTemplatePages = (html: string, minimumPageCount = 1) => {
  const pages = html
    .split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi)
    .map((page) => page.trim());
  while (pages.length < minimumPageCount) pages.push('');
  return pages.length ? pages : [html];
};

const QrCodeField: React.FC<{ code: string; width?: number }> = ({ code, width }) => {
  return (
    <div
      className="flex w-full flex-col items-center justify-center rounded border border-slate-100 bg-white p-1 text-center"
    >
      <div className="mb-0.5 flex aspect-square w-full items-center justify-center bg-white" style={{ width: width ? `${width}px` : '80px' }}>
        <DocumentValidationQrCodeImage
          code={code}
          size={320}
          alt="QR Code"
          className="h-full w-full"
        />
      </div>
      <p className="text-[6px] font-bold uppercase leading-none tracking-wide text-slate-400">CÓD. VALIDAÇÃO</p>
      <p className="mt-0.5 text-[8px] font-black leading-none tracking-wider text-blue-600">{code}</p>
    </div>
  );
};

const EmissionDocumentPages: React.FC<EmissionDocumentPagesProps> = ({
  emission,
  templateConfig,
  certificatePreview,
  watermark,
  poloInfo,
  academicPreviewData,
}) => {
  const parseTemplate = (text: string) => parseEmissionTemplate(text, emission, {
    academicData: academicPreviewData,
    poloInfo,
    templateConfig,
  });
  const cardStudent = getPreviewStudent(emission, poloInfo);
  const isCertificate = isCertificateDocument(emission.documento);
  const validationPublic = isPublicDocumentValidationEnabled(emission);
  const templateHasExplicitQrCode = hasExplicitQrCodeField(templateConfig);
  const parsedTemplateBody = templateConfig
    ? parseTemplate(templateConfig.textContent || templateConfig.textoFrente || '')
    : null;
  const highestAbsoluteFieldPage = (templateConfig?.absoluteFields || []).reduce(
    (highestPage: number, field: any) => Math.max(
      highestPage,
      Math.floor(Math.max(0, Number(field?.y || 0)) / PAGE_HEIGHT),
    ),
    0,
  );
  const configuredPageCount = Math.max(
    1,
    Number(templateConfig?.pageCount || 1),
    highestAbsoluteFieldPage + 1,
  );
  const standardPages = parsedTemplateBody !== null
    ? splitTemplatePages(parsedTemplateBody, configuredPageCount)
    : Array.from({ length: configuredPageCount }, () => null);
  const absoluteFieldsForPage = (pageIndex: number) => (
    (templateConfig?.absoluteFields || []).filter((field: any) => {
      const fieldPage = Math.max(0, Math.floor(Number(field.y || 0) / PAGE_HEIGHT));
      return Math.min(standardPages.length - 1, fieldPage) === pageIndex;
    })
  );

  if (emission.documento === 'carteirinha' && templateConfig) {
    return (
      <div
        className="print-page reprint-card-page mx-auto h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-xl box-border"
        data-requires-qr-code={validationPublic ? 'true' : undefined}
      >
        <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
          <div className="relative flex w-full items-center justify-center">
            <div className="relative flex overflow-hidden rounded-[2.5mm] border border-slate-300 shadow-sm">
              <div className="relative h-[54mm] w-[85.6mm] border-r border-dashed border-slate-400"><CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={cardStudent} showValidationQrCode={validationPublic} /></div>
              <div className="relative h-[54mm] w-[85.6mm]"><CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={cardStudent} showValidationQrCode={validationPublic} /></div>
            </div>
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="mx-auto flex h-[54mm] w-[171.2mm] items-center justify-center rounded-[2.5mm] border-2 border-dashed border-slate-100 bg-slate-50/30 text-[10px] font-bold uppercase tracking-widest text-slate-300 print:hidden">Espaço disponível</div>
          ))}
        </div>
      </div>
    );
  }

  if (emission.documento === 'cracha_estagio' && templateConfig) {
    const hasQrCodeField = !Array.isArray(templateConfig.fields)
      || templateConfig.fields.some((field: any) => field?.type === 'qrcode');
    return (
      <div
        className="print-page mx-auto flex h-[297mm] min-h-[297mm] w-[210mm] flex-col items-center justify-center gap-[8mm] overflow-hidden border border-slate-200 bg-white p-[12mm] shadow-xl box-border print:shadow-none"
        data-requires-qr-code={
          validationPublic && hasQrCodeField ? 'true' : undefined
        }
      >
        {(['frente', 'verso'] as const).map((page) => (
          <div key={page} className="rounded-2xl border border-slate-150 bg-white p-2">
            <h5 className="mb-2 text-center text-[10px] font-bold uppercase text-slate-400 print:hidden">{page}</h5>
            <CrachaPreview
              formData={{
                ...templateConfig,
                validationPublic,
              }}
              page={page}
              zoomLevel={100}
              aluno={{
                nome: emission.dados_emissao?.studentName || emission.aluno?.nome || '',
                cpf: emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || '',
                rg: emission.aluno?.rg || '',
                matricula: emission.dados_emissao?.studentMatricula || '',
                cargo: 'ESTUDANTE',
                polo: emission.dados_emissao?.unitName || '',
                curso: emission.dados_emissao?.courseName || '',
                validade: emission.validade_ate
                  ? new Date(emission.validade_ate).toLocaleDateString('pt-BR')
                  : 'Sem vencimento',
                fotoUrl: emission.dados_emissao?.studentPhotoUrl || emission.aluno?.foto_url || null,
                validationCode: emission.codigo,
              }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (isCertificate && certificatePreview) {
    return (
      <div className="space-y-6">
        <CertificadoPreview
          certificado={certificatePreview}
          modelo={templateConfig}
          pdfMode
          showValidationQrCode={validationPublic}
          validationCode={emission.codigo}
        />
      </div>
    );
  }

  if (isCertificate) return null;

  return (
    <div
      className="space-y-6"
      data-requires-qr-code={
        validationPublic && templateHasExplicitQrCode ? 'true' : undefined
      }
    >
      {standardPages.map((pageBody, pageIndex) => (
        <div
          key={pageIndex}
          className="print-page relative mx-auto h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[20mm] text-left text-black shadow-xl box-border"
          style={{
            fontFamily: '"Times New Roman", Times, serif',
            width: `${PAGE_WIDTH}px`,
            height: `${PAGE_HEIGHT}px`,
          }}
        >
          {watermark?.watermarkUrl && (
            <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
              <img src={watermark.watermarkUrl} alt="Watermark" style={{ opacity: watermark.watermarkOpacity || 0.1, width: `${watermark.watermarkScale || 50}%`, transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none' }} />
            </div>
          )}
          <DocumentHeader polo={poloInfo} orientation="portrait" />
          {pageIndex === 0 && (
            <div className="relative z-10 mb-12 mt-6 text-center">
              <h2 className="text-2xl font-bold uppercase text-[#001a33] underline decoration-2 decoration-blue-600 underline-offset-4">
                {DOCUMENT_TABS.find((tab) => tab.key === emission.documento)?.label || 'DOCUMENTO'}
              </h2>
            </div>
          )}
          {pageBody !== null ? (
            <div className="relative z-20 mb-20 text-justify text-lg leading-loose text-black" dangerouslySetInnerHTML={sanitizedHtml(pageBody)} />
          ) : (
            <div className="relative z-20 mb-20 text-justify text-sm leading-relaxed text-black"><p>Declaramos para os devidos fins que o(a) aluno(a) <b>{(emission.dados_emissao?.studentName || emission.aluno?.nome || '').toUpperCase()}</b>, portador(a) do CPF nº <b>{emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || 'Não informado'}</b>, regularmente matriculado(a) no curso de <b>{emission.dados_emissao?.courseName || ''}</b>, na turma <b>{emission.dados_emissao?.className || ''}</b>, encontra-se regular com suas obrigações acadêmicas.</p></div>
          )}
          {absoluteFieldsForPage(pageIndex).map((field: any) => (
            <div
              key={field.id}
              className="absolute z-30"
              style={{
                left: field.x,
                top: Number(field.y || 0) - (pageIndex * PAGE_HEIGHT),
                color: '#000',
                width: field.width ? `${field.width}px` : 'auto',
                height: field.height ? `${field.height}px` : 'auto',
                overflow: field.height ? 'hidden' : 'visible',
                ...field.style,
              }}
            >
              {field.type === 'qrcode' && validationPublic && templateHasExplicitQrCode && (
                <QrCodeField code={emission.codigo} width={field.width} />
              )}
              {field.type === 'image' && (
                <img
                  src={parseTemplate(field.value)}
                  alt="Elemento visual"
                  className="w-full"
                  style={{
                    height: field.height ? '100%' : 'auto',
                    objectFit: field.style?.objectFit || 'contain',
                    objectPosition: field.style?.objectPosition || 'center',
                  }}
                />
              )}
              {field.type === 'text' && <span dangerouslySetInnerHTML={sanitizedHtml(parseTemplate(field.value))} className="w-full break-words" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default EmissionDocumentPages;
