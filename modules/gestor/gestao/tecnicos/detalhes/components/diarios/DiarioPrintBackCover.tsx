import React from 'react';
import { getDocumentValidationQrUrl, getDocumentValidationUrl } from '../../../../../../shared/document-validation/document-validation.url';
import { DiarioPrintDocumentProps } from './diario-classe.types';
import { getDiarioValidationCode } from './diario-classe.utils';
import { moduloNumero } from './diario-print.utils';

type DiarioPrintBackCoverProps = Pick<
  DiarioPrintDocumentProps,
  'template' | 'turma' | 'disciplina' | 'moduloNome' | 'watermark'
>;

const DiarioPrintBackCover: React.FC<DiarioPrintBackCoverProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  watermark,
}) => {
  const validationCode = getDiarioValidationCode(turma, disciplina);

  return (
    <section className="diario-print-page">
      {template.contracapaUrl && (
        <img src={template.contracapaUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-fill z-0" />
      )}

      {!template.contracapaUrl && watermark?.url && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none overflow-hidden">
          <img
            src={watermark.url}
            alt="Marca d'água"
            crossOrigin="anonymous"
            style={{
              width: `${watermark.scale}%`,
              opacity: watermark.opacity,
              transform: watermark.rotate ? 'rotate(-22deg)' : 'none',
              objectFit: 'contain',
            }}
          />
        </div>
      )}

      {template.imprimirValidacaoContracapa && (
        <div className="absolute inset-[12mm_15mm_12mm_20mm] border border-[#071a33]/25 p-8 flex flex-col justify-between rounded-2xl text-[#071a33] z-10 overflow-hidden text-left bg-transparent">
          <div className="relative z-10 flex justify-between items-start border-b border-[#071a33]/15 pb-3">
            <div className="w-full">
              <h3 className="text-[14pt] font-black uppercase tracking-tight leading-snug w-[75%]">
                Registro de Validação<br />e Assinatura Eletrônica
              </h3>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-[1fr_150px] gap-6 my-4 text-[8.5pt] leading-normal">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div><strong>CURSO:</strong> {turma.cursoNome || '—'}</div>
                <div><strong>TURMA:</strong> {turma.nome || turma.codigo || '—'}</div>
                <div className="col-span-2"><strong>UNIDADE EDUCACIONAL:</strong> {disciplina.nome}</div>
                <div><strong>MÓDULO:</strong> {moduloNumero(moduloNome)}</div>
                <div><strong>PROFESSOR(A):</strong> {disciplina.professor && disciplina.professor !== 'Não atribuído' ? disciplina.professor : '—'}</div>
              </div>

              <div className="border-t border-[#071a33]/10 pt-2 text-slate-600 font-medium leading-relaxed bg-transparent">
                {template.mensagemValidacao || 'Este diário de classe eletrônico foi gerado e assinado digitalmente nos termos do Regimento Escolar da instituição e da legislação de validação de documentos acadêmicos do Ministério da Educação.'}
              </div>

              <div className="bg-slate-50/20 border border-slate-100/30 p-2 rounded font-mono text-[7.5pt] text-slate-500">
                <div><strong>Chave de Autenticação:</strong> {validationCode}</div>
                <div className="mt-0.5"><strong>Endereço de Validação:</strong> {getDocumentValidationUrl(validationCode)}</div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center border-l border-slate-200/20 pl-4">
              <img
                src={getDocumentValidationQrUrl(validationCode, 180)}
                alt="QR Code"
                style={{
                  width: `${template.qrCodeSize || 28}mm`,
                  height: `${template.qrCodeSize || 28}mm`,
                  objectFit: 'contain',
                }}
                className="bg-white p-1 border border-slate-200 rounded"
              />
              <div className="text-center mt-1">
                <span className="block text-[5pt] font-black text-slate-400 tracking-widest uppercase">CÓD. VALIDAÇÃO</span>
                <span className="block text-[6pt] font-mono font-bold text-blue-600 leading-tight whitespace-pre-line">{validationCode}</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-12 text-center border-t border-[#071a33]/10 pt-4 text-[9pt]">
            <ManualSignatureLine label="ASSINATURA DO PROFESSOR" />
            <ManualSignatureLine label="ASSINATURA DO COORDENADOR DO CURSO" />
          </div>

          {template.contracapaCampos
            ?.filter((field) =>
              field.visible
              && field.isImage
              && field.id !== 'signature_diretor'
              && field.id !== 'signature_secretario',
            )
            .map((field) => (
              <img
                key={field.id}
                src={field.imageUrl}
                alt={field.label}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: 'auto',
                  mixBlendMode: field.mixBlendMode || 'multiply',
                  zIndex: 30,
                }}
              />
            ))}
        </div>
      )}
    </section>
  );
};

const ManualSignatureLine: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex h-14 flex-col items-center justify-end">
    <div className="mb-1 w-full border-b border-slate-400" />
    <p className="text-[7pt] font-black text-slate-500">{label}</p>
  </div>
);

export default DiarioPrintBackCover;
