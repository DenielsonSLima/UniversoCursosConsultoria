import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { sanitizedHtml } from '../../../../../lib/htmlSanitizer';
import DocumentHeader from '../../../components/DocumentHeader';
import CertificadoPreview from '../../certificados/components/CertificadoPreview';
import CarteirinhaPreview from '../../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { DOCUMENT_TABS, isCertificateDocument } from '../historico-emissoes.constants';
import { getPreviewStudent } from '../preview-utils';
import { parseEmissionTemplate } from '../template-parser';
import type {
  AcademicPreviewData,
  EmissionLog,
} from '../historico-emissoes.types';
import type { CertificadoAcademico } from '../../certificados/certificados.types';

interface EmissionDocumentPagesProps {
  emission: EmissionLog;
  templateConfig: any;
  certificatePreview: CertificadoAcademico | null;
  watermark: any;
  poloInfo: any;
  academicPreviewData: AcademicPreviewData | null;
}

const splitTemplatePages = (html: string) => {
  const pages = html
    .split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi)
    .map((page) => page.trim())
    .filter(Boolean);
  return pages.length ? pages : [html];
};

const QrCodeField: React.FC<{ code: string; width?: number }> = ({ code, width }) => {
  const [src, setSrc] = useState('');
  const validationUrl = `https://www.universocc.com.br/validador?q=${code}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(validationUrl, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [validationUrl]);

  return (
    <div
      className="flex w-full flex-col items-center justify-center rounded border border-slate-100 bg-white p-1 text-center"
      data-pdf-asset-ready={src ? 'true' : 'false'}
    >
      <div className="mb-0.5 flex aspect-square w-full items-center justify-center bg-white" style={{ width: width ? `${width}px` : '80px' }}>
        {src
          ? <img src={src} alt="QR Code" className="h-full w-full object-contain" />
          : <span className="text-[6px] font-black uppercase text-slate-300">Gerando QR</span>}
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
  const parsedTemplateBody = templateConfig
    ? parseTemplate(templateConfig.textContent || templateConfig.textoFrente || '')
    : null;
  const standardPages = parsedTemplateBody
    ? splitTemplatePages(parsedTemplateBody)
    : [null];
  const hasConfiguredQrCode = Boolean(
    templateConfig?.absoluteFields?.some((field: any) => field.type === 'qrcode')
  );
  const absoluteFieldsForPage = (pageIndex: number) => (
    (templateConfig?.absoluteFields || []).filter((field: any) => {
      const fieldPage = Math.max(0, Math.floor(Number(field.y || 0) / 1123));
      return Math.min(standardPages.length - 1, fieldPage) === pageIndex;
    })
  );

  if (emission.documento === 'carteirinha' && templateConfig) {
    return (
      <div className="print-page reprint-card-page mx-auto h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-xl box-border">
        <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
          <div className="relative flex w-full items-center justify-center">
            <div className="relative flex overflow-hidden rounded-[2.5mm] border border-slate-300 shadow-sm">
              <div className="relative h-[54mm] w-[85.6mm] border-r border-dashed border-slate-400"><CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={cardStudent} /></div>
              <div className="relative h-[54mm] w-[85.6mm]"><CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={cardStudent} /></div>
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
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
        {(['frente', 'verso'] as const).map((page) => (
          <div key={page} className="print-page mt-4 rounded-2xl border border-slate-150 bg-white p-2 first:mt-0">
            <h5 className="mb-2 text-center text-[10px] font-bold uppercase text-slate-400 print:hidden">{page}</h5>
            <CrachaPreview
              formData={templateConfig}
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
        <CertificadoPreview certificado={certificatePreview} modelo={templateConfig} pdfMode />
      </div>
    );
  }

  if (isCertificate) return null;

  return (
    <div className="space-y-6">
      {standardPages.map((pageBody, pageIndex) => (
        <div key={pageIndex} className="print-page relative mx-auto min-h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[20mm] text-left text-black shadow-xl box-border" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
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
                top: Number(field.y || 0) - (pageIndex * 1123),
                color: '#000',
                width: field.width ? `${field.width}px` : 'auto',
                height: field.height ? `${field.height}px` : 'auto',
                ...field.style,
              }}
            >
              {field.type === 'qrcode' && <QrCodeField code={emission.codigo} width={field.width} />}
              {field.type === 'image' && <img src={parseTemplate(field.value)} alt="Elemento visual" className="h-full w-full object-contain" />}
              {field.type === 'text' && <span dangerouslySetInnerHTML={sanitizedHtml(parseTemplate(field.value))} className="w-full break-words" />}
            </div>
          ))}
          {pageIndex === standardPages.length - 1 && !hasConfiguredQrCode && (
            <div className="absolute bottom-[16mm] right-[18mm] z-30 w-[24mm]">
              <QrCodeField code={emission.codigo} width={76} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default EmissionDocumentPages;
