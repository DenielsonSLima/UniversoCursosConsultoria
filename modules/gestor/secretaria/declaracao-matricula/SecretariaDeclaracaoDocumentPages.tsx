import React from 'react';
import { sanitizedHtml } from '../../../../lib/htmlSanitizer';
import DocumentHeader from '../../components/DocumentHeader';
import { getDocumentValidationUrl } from '../../../shared/document-validation/document-validation.url';
import { LocalQrCodeImage } from '../../../shared/qrcode/LocalQrCodeImage';
import { parseDeclaracaoTemplate } from './declaracao-matricula.helpers';
import type { DeclaracaoAluno } from './declaracao-matricula.types';

interface SecretariaDeclaracaoDocumentPagesProps {
  alunos: DeclaracaoAluno[];
  documentTitle: string;
  frequenciesByStudent: Record<string, number>;
  poloInfo: any;
  templateConfig: any;
  validationCodes: Record<string, string>;
  validationExpirations: Record<string, string | null>;
  validationPublicByStudent: Record<string, boolean>;
  watermark: any;
}

const SecretariaDeclaracaoDocumentPages = ({
  alunos,
  documentTitle,
  frequenciesByStudent,
  poloInfo,
  templateConfig,
  validationCodes,
  validationExpirations,
  validationPublicByStudent,
  watermark,
}: SecretariaDeclaracaoDocumentPagesProps) => (
  <>
    {alunos.map((aluno) => {
      const code = validationCodes[aluno.id] || 'VALIDACAO-PENDENTE';
      const expiresAt = validationExpirations[aluno.id];
      const issuedValidationPublic = validationPublicByStudent[aluno.id] === true;
      const parseTemplate = (value: string) => parseDeclaracaoTemplate(value, aluno, {
        frequenciesByStudent,
        validationExpiresAt: expiresAt,
      });
      const parsedText = parseTemplate(templateConfig.textContent);

      return (
        <div
          key={aluno.id}
          className="print-page w-[210mm] min-h-[297mm] bg-white text-black p-[20mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 relative overflow-hidden text-left"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {watermark?.watermarkUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <img
                src={watermark.watermarkUrl}
                alt="Watermark"
                style={{
                  opacity: watermark.watermarkOpacity || 0.1,
                  width: `${watermark.watermarkScale || 50}%`,
                  transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none',
                }}
              />
            </div>
          )}

          <DocumentHeader polo={poloInfo} orientation="portrait" />

          <div className="text-center mb-12 relative z-10 mt-6">
            <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
              {documentTitle}
            </h2>
          </div>

          <div
            className="relative z-20 mb-20 text-justify leading-loose text-lg text-black"
            dangerouslySetInnerHTML={sanitizedHtml(parsedText)}
          />

          {templateConfig.absoluteFields?.map((field: any) => {
            const parsedVal = parseTemplate(field.value);
            return (
              <div
                key={field.id}
                className="absolute z-30"
                style={{
                  left: field.x,
                  top: field.y,
                  color: '#000',
                  width: field.width ? `${field.width}px` : 'auto',
                  height: 'auto',
                  ...field.style,
                }}
              >
                {field.type === 'qrcode' && issuedValidationPublic && (
                  <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-full aspect-square bg-white flex items-center justify-center mb-1" style={{ width: field.width ? `${field.width}px` : '100px' }}>
                      <LocalQrCodeImage
                        value={getDocumentValidationUrl(code)}
                        size={150}
                        alt="QR Code"
                        className="pointer-events-none h-full w-full"
                      />
                    </div>
                    <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5 select-all">
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
                      <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
                        {code}
                      </p>
                    </div>
                  </div>
                )}

                {field.type === 'image' && (
                  <img
                    src={field.value}
                    alt="Assinatura"
                    className="w-full pointer-events-none"
                    style={{
                      width: field.width ? `${field.width}px` : '200px',
                      height: field.height ? `${field.height}px` : 'auto',
                      objectFit: field.style?.objectFit || 'contain',
                      objectPosition: field.style?.objectPosition || 'center',
                    }}
                  />
                )}

                {field.type === 'text' && (
                  <span dangerouslySetInnerHTML={sanitizedHtml(parsedVal)} className="w-full break-words" />
                )}
              </div>
            );
          })}
        </div>
      );
    })}
  </>
);

export default SecretariaDeclaracaoDocumentPages;
