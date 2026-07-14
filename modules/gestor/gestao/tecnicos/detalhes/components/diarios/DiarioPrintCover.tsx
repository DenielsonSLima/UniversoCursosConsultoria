import React from 'react';
import capaDiarioPadrao from '../../../../../../../Documentos/Capa-Diario.jpg';
import { DiarioPrintDocumentProps } from './diario-classe.types';
import { moduloNumero } from './diario-print.utils';

type DiarioPrintCoverProps = Pick<
  DiarioPrintDocumentProps,
  'template' | 'turma' | 'disciplina' | 'moduloNome'
>;

const DiarioPrintCover: React.FC<DiarioPrintCoverProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
}) => {
  const capaUrl = template.capaUrl || capaDiarioPadrao;

  return (
    <section className="diario-print-page">
      <img src={capaUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-fill" />
      {template.capaCampos && template.capaCampos.length > 0 ? (
        template.capaCampos
          .filter((field) => field.visible)
          .map((field) => {
            let value = '—';
            if (field.id === 'curso') value = turma.cursoNome || '—';
            else if (field.id === 'modulo') value = moduloNumero(moduloNome);
            else if (field.id === 'areaTematica') value = moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, '');
            else if (field.id === 'disciplina') value = disciplina.nome;
            else if (field.id === 'turma') value = turma.nome || turma.codigo || '—';
            else if (field.id === 'professor') {
              value = disciplina.professor && disciplina.professor !== 'Não atribuído'
                ? disciplina.professor
                : 'Professor(a)';
            }

            return (
              <div
                key={field.id}
                className="absolute"
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  fontSize: `${field.fontSize}pt`,
                  color: field.color || '#071a33',
                  fontWeight: field.bold ? 'bold' : 'normal',
                  textAlign: field.align || 'left',
                  borderTop: field.borderTop ? `1px solid ${field.color || '#071a33'}` : 'none',
                  paddingTop: field.borderTop ? '3px' : '0px',
                  lineHeight: '1.2',
                  wordBreak: 'break-word',
                }}
              >
                <strong>{field.label}</strong>{value}
              </div>
            );
          })
      ) : (
        <>
          <div className="absolute left-[88mm] top-[111mm] w-[150mm] text-[11pt] leading-[1.75] text-[#071a33]">
            <p><strong>CURSO:</strong> {turma.cursoNome || '—'}</p>
            <p><strong>MÓDULO:</strong> {moduloNumero(moduloNome)}</p>
            <p><strong>ÁREA TEMÁTICA:</strong> {moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, '')}</p>
            <p><strong>UNIDADE EDUCACIONAL:</strong> {disciplina.nome}</p>
            <p><strong>TURMA:</strong> {turma.nome || turma.codigo || '—'}</p>
          </div>
          <div className="absolute bottom-[28mm] right-[30mm] w-[70mm] border-t border-[#071a33] pt-2 text-center text-[10pt]">
            {disciplina.professor && disciplina.professor !== 'Não atribuído' ? disciplina.professor : 'Professor(a)'}
          </div>
        </>
      )}
    </section>
  );
};

export default DiarioPrintCover;
