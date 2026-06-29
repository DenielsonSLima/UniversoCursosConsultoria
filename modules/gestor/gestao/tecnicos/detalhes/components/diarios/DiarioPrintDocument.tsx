import React, { forwardRef } from 'react';
import capaDiarioPadrao from '../../../../../../../Documentos/Capa-Diario.jpg';
import { DiarioTemplate, DEFAULT_CONTRACAPA_CAMPOS } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { getDocumentValidationUrl, getDocumentValidationQrUrl } from '../../../../../../shared/document-validation/document-validation.url';

interface DiarioPrintDocumentProps {
  template: DiarioTemplate;
  turma: any;
  disciplina: any;
  moduloNome: string;
  students: any[];
  aulas: any[];
  attendanceMap: Record<string, Record<string, 'P' | 'F' | null>>;
  gradesMap: Record<string, any>;
  praticasMap: Record<string, string>;
  observacoes: string;
  watermark?: any;
  diretorSigUrl?: string | null;
  secretarioSigUrl?: string | null;
}

const chunks = (items: any[], size: number): any[][] => {
  if (!items.length) return [[]];
  const result: any[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const moduloNumero = (nome: string) => {
  const match = nome.match(/M[ÓO]DULO\s+([IVXLC]+)/i);
  return match?.[1] || nome;
};

const DiarioPrintDocument = forwardRef<HTMLDivElement, DiarioPrintDocumentProps>(({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  aulas,
  attendanceMap,
  gradesMap,
  praticasMap,
  observacoes,
  watermark,
  diretorSigUrl,
  secretarioSigUrl,
}, ref) => {
  const studentGroups = chunks(students, 18);
  const aulaGroups = chunks(aulas, 12);
  const resultGroups = chunks(students, 20);
  const contentGroups = chunks(aulas, 14);
  const capaUrl = template.capaUrl || capaDiarioPadrao;

  return (
    <div ref={ref} id="diario-print-document" aria-hidden="true">
      <style>{`
        .diario-print-page {
          width: 297mm;
          height: 210mm;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;
          background: white;
          color: #071a33;
          font-family: "Arial Narrow", Arial, sans-serif;
          page-break-after: always;
        }
        .diario-print-page:last-child { page-break-after: auto; }
        .diario-page-body { padding: 12mm 14mm 10mm 19mm; height: 100%; box-sizing: border-box; }
        .diario-accent { position: absolute; inset: 0 auto 0 0; width: 7mm; background: #0879d8; }
        .diario-accent::after { content: ""; position: absolute; inset: 0 -2.5mm 0 auto; width: 1.5mm; background: #e30613; }
        .diario-doc-title { text-align: center; font-weight: 900; font-size: 15pt; letter-spacing: .04em; margin: 2mm 0 1.5mm; }
        .diario-meta { display: grid; grid-template-columns: 1.1fr 1fr 1.4fr; border: .35mm solid #172033; margin-bottom: 3mm; font-size: 8pt; }
        .diario-meta > div { padding: 1.4mm 2mm; border-right: .25mm solid #172033; }
        .diario-meta > div:last-child { border-right: 0; }
        .diario-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.2pt; }
        .diario-table th, .diario-table td { border: .25mm solid #202735; padding: 1.15mm; vertical-align: middle; }
        .diario-table th { background: #eef4fa; font-weight: 900; text-transform: uppercase; text-align: center; }
        .diario-table td { color: #111827; }
        .diario-footer { position: absolute; bottom: 5mm; left: 19mm; right: 14mm; display: flex; justify-content: space-between; border-top: .25mm solid #94a3b8; padding-top: 1.5mm; font-size: 6.5pt; color: #64748b; }
        .diario-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 11mm; font-size: 8pt; text-align: center; }
        .diario-signature-line { border-top: .3mm solid #172033; padding-top: 1.5mm; }
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body * { visibility: hidden !important; }
          .diario-print-host { position: absolute !important; left: 0 !important; top: 0 !important; z-index: 9999 !important; }
          #diario-print-document, #diario-print-document * { visibility: visible !important; }
          #diario-print-document { position: absolute !important; inset: 0 auto auto 0 !important; }
        }
      `}</style>

      <section className="diario-print-page">
        <img src={capaUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-fill" />
        {template.capaCampos && template.capaCampos.length > 0 ? (
          template.capaCampos
            .filter((c) => c.visible)
            .map((c) => {
              let value = '—';
              if (c.id === 'curso') value = turma.cursoNome || '—';
              else if (c.id === 'modulo') value = moduloNumero(moduloNome);
              else if (c.id === 'areaTematica') value = moduloNome.replace(/^M[ÓO]DULO\s+[IVXLC]+\s*[-–—]?\s*/i, '');
              else if (c.id === 'disciplina') value = disciplina.nome;
              else if (c.id === 'turma') value = turma.nome || turma.codigo || '—';
              else if (c.id === 'professor') {
                value = disciplina.professor && disciplina.professor !== 'Não atribuído'
                  ? disciplina.professor
                  : 'Professor(a)';
              }

              return (
                <div
                  key={c.id}
                  className="absolute"
                  style={{
                    left: `${c.x}%`,
                    top: `${c.y}%`,
                    width: `${c.width}%`,
                    fontSize: `${c.fontSize}pt`,
                    color: c.color || '#071a33',
                    fontWeight: c.bold ? 'bold' : 'normal',
                    textAlign: c.align || 'left',
                    borderTop: c.borderTop ? `1px solid ${c.color || '#071a33'}` : 'none',
                    paddingTop: c.borderTop ? '3px' : '0px',
                    lineHeight: '1.2',
                    wordBreak: 'break-word',
                  }}
                >
                  <strong>{c.label}</strong>{value}
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

      {aulaGroups.flatMap((aulaGroup, aulaIndex) =>
        studentGroups.map((studentGroup, studentIndex) => (
          <PrintPage
            key={`freq-${aulaIndex}-${studentIndex}`}
            template={template}
            turma={turma}
            disciplina={disciplina}
            moduloNome={moduloNome}
            title="Registro de Frequência"
            pageLabel={`Frequência ${aulaIndex + 1}.${studentIndex + 1}`}
          >
            <table className="diario-table">
              <thead>
                <tr>
                  <th style={{ width: '8mm' }}>Nº</th>
                  <th style={{ width: '60mm' }}>Aluno(a)</th>
                  {aulaGroup.map((aula) => <th key={aula.id}>{aula.dataLabel}</th>)}
                  <th style={{ width: '15mm' }}>Faltas</th>
                </tr>
              </thead>
              <tbody>
                {studentGroup.map((student, index) => {
                  const faltas = aulaGroup.filter((aula) => attendanceMap[student.id]?.[aula.id] === 'F').length;
                  return (
                    <tr key={student.id}>
                      <td className="text-center">{studentIndex * 18 + index + 1}</td>
                      <td><strong>{student.nome}</strong><br /><span className="text-[6pt] text-slate-500">{student.matricula}</span></td>
                      {aulaGroup.map((aula) => (
                        <td key={aula.id} className="text-center font-bold">
                          {attendanceMap[student.id]?.[aula.id] || '—'}
                        </td>
                      ))}
                      <td className="text-center font-bold">{faltas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PrintPage>
        )),
      )}

      {resultGroups.map((studentGroup, groupIndex) => (
        <PrintPage
          key={`result-${groupIndex}`}
          template={template}
          turma={turma}
          disciplina={disciplina}
          moduloNome={moduloNome}
          title="Notas e Resultado Final"
          pageLabel={`Resultados ${groupIndex + 1}`}
        >
          <table className="diario-table">
            <thead>
              <tr>
                <th style={{ width: '8mm' }}>Nº</th>
                <th style={{ width: '57mm' }}>Aluno(a)</th>
                <th>P</th><th>TI</th><th>TG</th><th>S</th><th>CQ</th><th>O</th>
                <th>Média</th><th>Rec.</th><th>Final</th><th>Faltas</th><th>Freq.</th>
                <th style={{ width: '29mm' }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {studentGroup.map((student, index) => {
                const grade = gradesMap[student.id] || {};
                const value = (item: unknown) => item === null || item === undefined ? '—' : Number(item).toFixed(1);
                return (
                  <tr key={student.id}>
                    <td className="text-center">{groupIndex * 20 + index + 1}</td>
                    <td><strong>{student.nome}</strong></td>
                    <td className="text-center">{value(grade.p)}</td>
                    <td className="text-center">{value(grade.ti)}</td>
                    <td className="text-center">{value(grade.tg)}</td>
                    <td className="text-center">{value(grade.s)}</td>
                    <td className="text-center">{value(grade.cq)}</td>
                    <td className="text-center">{value(grade.o)}</td>
                    <td className="text-center">{value(grade.media_parcial)}</td>
                    <td className="text-center">{value(grade.rec)}</td>
                    <td className="text-center font-bold">{value(grade.media_final)}</td>
                    <td className="text-center">{grade.total_faltas ?? '—'}</td>
                    <td className="text-center">{grade.frequencia_percent == null ? '—' : `${grade.frequencia_percent}%`}</td>
                    <td className="text-center text-[6.5pt] font-bold">{String(grade.resultado_final || 'SEM LANÇAMENTO').replaceAll('_', ' ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PrintPage>
      ))}

      {contentGroups.map((aulaGroup, groupIndex) => (
        <PrintPage
          key={`content-${groupIndex}`}
          template={template}
          turma={turma}
          disciplina={disciplina}
          moduloNome={moduloNome}
          title="Conteúdo Programático e Prática Pedagógica"
          pageLabel={`Conteúdo ${groupIndex + 1}`}
        >
          <table className="diario-table">
            <thead>
              <tr>
                <th style={{ width: '24mm' }}>Dia/Mês</th>
                <th>Conteúdo programático</th>
                <th>Prática pedagógica</th>
                <th style={{ width: '17mm' }}>C.H.</th>
              </tr>
            </thead>
            <tbody>
              {aulaGroup.map((aula) => (
                <tr key={aula.id} style={{ height: '9mm' }}>
                  <td className="text-center font-bold">{aula.dataLabel}</td>
                  <td>{aula.titulo}</td>
                  <td>{praticasMap[aula.id] || '—'}</td>
                  <td className="text-center">{aula.cargaHoraria}h</td>
                </tr>
              ))}
            </tbody>
          </table>
          {groupIndex === contentGroups.length - 1 && (
            <>
              <div className="mt-4 border border-slate-700 p-3 text-[8pt]">
                <strong>OBSERVAÇÕES:</strong>
                <p className="mt-2 whitespace-pre-wrap">{observacoes || 'Sem observações registradas.'}</p>
              </div>
              <div className="diario-signatures">
                <div className="diario-signature-line">{disciplina.professor || 'Professor(a)'}<br /><span>Assinatura do(a) professor(a)</span></div>
                <div className="diario-signature-line">Coordenação do curso<br /><span>Assinatura do(a) coordenador(a)</span></div>
              </div>
            </>
          )}
        </PrintPage>
      ))}

      {template.imprimirInstrucoes && (
        <PrintPage template={template} turma={turma} disciplina={disciplina} moduloNome={moduloNome} title="Instruções de Preenchimento" pageLabel="Instruções">
          <div className="grid grid-cols-2 gap-8 text-[10pt] leading-relaxed">
            <ol className="list-decimal space-y-3 pl-5">
              <li>Registre o conteúdo e a prática pedagógica na mesma data da aula.</li>
              <li>Na frequência, utilize P para presença e F para falta.</li>
              <li>Confira todos os lançamentos antes do fechamento do período.</li>
            </ol>
            <ol start={4} className="list-decimal space-y-3 pl-5">
              <li>Alterações após o fechamento exigem reabertura formal e justificativa.</li>
              <li>O resultado final é calculado pelo sistema conforme as regras acadêmicas.</li>
              <li>Professor e coordenação devem validar o diário ao término da unidade.</li>
            </ol>
          </div>
        </PrintPage>
      )}

      {(template.contracapaUrl || template.imprimirValidacaoContracapa) && (
        <section className="diario-print-page">
          {template.contracapaUrl && (
            <img src={template.contracapaUrl} alt="" crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-fill z-0" />
          )}
          
          {/* Background Landscape Watermark if no contracapaUrl */}
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
              {/* Header */}
              <div className="relative z-10 flex justify-between items-start border-b border-[#071a33]/15 pb-3">
                <div>
                  <h3 className="text-[12pt] font-black uppercase tracking-tight">Registro de Validação e Assinatura Eletrônica</h3>
                  <p className="text-[7.5pt] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{template.cabecalho || 'UNIVERSO CURSOS E CONSULTORIA'}</p>
                </div>
                <span className="bg-[#071a33] text-white text-[7.5pt] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                  Documento Oficial
                </span>
              </div>

              {/* Details & QR Code */}
              {(() => {
                const validationCode = `DIA-${(turma.codigo || turma.nome || 'TURMA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}-${disciplina.id.slice(0, 8).toUpperCase()}`;
                return (
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
                    
                    {/* Actual QR Code image with size customized from templates */}
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
                );
              })()}

              {/* Signatures */}
              <div className="relative z-10 grid grid-cols-2 gap-12 text-center border-t border-[#071a33]/10 pt-4 text-[9pt]">
                <div className="flex flex-col items-center justify-end relative h-14">
                  {diretorSigUrl && (
                    <img
                      src={diretorSigUrl}
                      alt="Assinatura Diretor"
                      crossOrigin="anonymous"
                      className="absolute -top-10 h-14 object-contain pointer-events-none"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  )}
                  <div className="border-b border-slate-400 w-full mb-1"></div>
                  <p className="font-bold">{template.diretorNome || '—'}</p>
                  <p className="text-[7pt] text-slate-500 uppercase font-black">{template.diretorCargo || 'Direção Geral'}</p>
                </div>

                <div className="flex flex-col items-center justify-end relative h-14">
                  {secretarioSigUrl && (
                    <img
                      src={secretarioSigUrl}
                      alt="Assinatura Secretário"
                      crossOrigin="anonymous"
                      className="absolute -top-10 h-14 object-contain pointer-events-none"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  )}
                  <div className="border-b border-slate-400 w-full mb-1"></div>
                  <p className="font-bold">{template.secretarioNome || '—'}</p>
                  <p className="text-[7pt] text-slate-500 uppercase font-black">{template.secretarioCargo || 'Secretaria Acadêmica'}</p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
});

interface PrintPageProps {
  template: DiarioTemplate;
  turma: any;
  disciplina: any;
  moduloNome: string;
  title: string;
  pageLabel: string;
  children: React.ReactNode;
}

const PrintPage: React.FC<PrintPageProps> = ({ template, turma, disciplina, moduloNome, title, pageLabel, children }) => (
  <section className="diario-print-page">
    <div className="diario-accent" />
    <div className="diario-page-body">
      <div className="text-center text-[7pt] font-bold uppercase tracking-[.12em] text-slate-500">{template.cabecalho}</div>
      <h2 className="diario-doc-title">{title}</h2>
      <div className="diario-meta">
        <div><strong>Curso:</strong> {turma.cursoNome || '—'}</div>
        <div><strong>Turma:</strong> {turma.nome || turma.codigo || '—'}</div>
        <div><strong>Professor(a):</strong> {disciplina.professor || 'Não atribuído'}</div>
        <div><strong>Módulo:</strong> {moduloNome}</div>
        <div><strong>Unidade educacional:</strong> {disciplina.nome}</div>
        <div><strong>Carga horária:</strong> {disciplina.cargaHoraria || 0}h</div>
      </div>
      {children}
      <div className="diario-footer">
        <span>{template.rodape}</span>
        <span>{pageLabel}</span>
      </div>
    </div>
  </section>
);

DiarioPrintDocument.displayName = 'DiarioPrintDocument';

export default DiarioPrintDocument;
