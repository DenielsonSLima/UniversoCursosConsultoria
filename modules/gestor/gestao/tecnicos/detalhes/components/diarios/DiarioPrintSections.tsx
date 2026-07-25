import React from 'react';
import { DiarioAula, DiarioStudent } from './diario-classe.service';
import { DiarioPrintDocumentProps } from './diario-classe.types';
import { getStudentStats } from './diario-classe.utils';
import { DEFAULT_ACTIVE_INSTRUMENTS } from './diario-instruments';
import { chunks } from './diario-print.utils';
import DiarioPrintPage from './DiarioPrintPage';

type PrintBaseProps = Pick<
  DiarioPrintDocumentProps,
  'template' | 'turma' | 'disciplina' | 'moduloNome'
>;

type FrequencyPagesProps = PrintBaseProps & Pick<
  DiarioPrintDocumentProps,
  'students' | 'aulas' | 'attendanceMap' | 'gradesMap' | 'exportMode'
>;

const compactPrintPageProps = {
  compactMode: true,
  logoAlignRight: true,
};

export const DiarioPrintFrequencyPages: React.FC<FrequencyPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  aulas,
  attendanceMap,
  gradesMap,
  exportMode,
}) => {
  const isBlank = exportMode === 'EM_BRANCO';
  const aulaGroups = chunks<DiarioAula>(aulas, 10);

  const getRowsPerPage = (aulasNoBloco: number) => {
    if (aulasNoBloco <= 4) return 30;
    if (aulasNoBloco <= 6) return 24;
    if (aulasNoBloco <= 8) return 22;
    return 18;
  };

  return (
    <>
      {aulaGroups.flatMap((aulaGroup, aulaIndex) =>
        (() => {
          const studentGroups = chunks<DiarioStudent>(students, getRowsPerPage(aulaGroup.length));

          return studentGroups.map((studentGroup, studentIndex) => (
            <DiarioPrintPage
              key={`freq-${aulaIndex}-${studentIndex}`}
              template={template}
              turma={turma}
              disciplina={disciplina}
              moduloNome={moduloNome}
              title="Registro de Frequência"
              pageLabel={`Frequência ${aulaIndex + 1}.${studentIndex + 1}`}
              {...compactPrintPageProps}
            >
              <table className="diario-table diario-frequency-table">
                <thead>
                  <tr>
                    <th style={{ width: '8mm' }}>Nº</th>
                    <th style={{ width: '60mm' }}>Aluno(a)</th>
                    {aulaGroup.map((aula) => (
                      <th key={aula.id} className="text-center py-1">
                        <div>{`${aula.dataLabel} (${String(aula.cargaHoraria).padStart(2, '0')}hrs)`}</div>
                      </th>
                    ))}
                    <th style={{ width: '15mm' }}>Faltas</th>
                  </tr>
                </thead>
                <tbody>
                  {studentGroup.map((student, index) => {
                    const totalFaltas = gradesMap[student.id]?.total_faltas;
                    return (
                      <tr key={student.id}>
                        <td className="text-center">{studentIndex * getRowsPerPage(aulaGroup.length) + index + 1}</td>
                        <td className="diario-frequency-student">
                          <strong>{student.nome}</strong>
                          <span className="text-[6pt] text-slate-500"> ({student.matricula})</span>
                        </td>
                        {aulaGroup.map((aula) => (
                          <td key={aula.id} className="text-center font-bold">
                            {isBlank ? '' : attendanceMap[student.id]?.[aula.id] || '—'}
                          </td>
                        ))}
                        <td className="text-center font-bold">
                          {isBlank || totalFaltas === null || totalFaltas === undefined ? '' : totalFaltas}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DiarioPrintPage>
          ));
        })(),
      )}
    </>
  );
};

type ResultPagesProps = PrintBaseProps & Pick<
  DiarioPrintDocumentProps,
  'students' | 'gradesMap' | 'activeInstruments' | 'exportMode'
>;

export const DiarioPrintResultPages: React.FC<ResultPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  gradesMap,
  activeInstruments,
  exportMode,
}) => {
  const activeInst = activeInstruments || DEFAULT_ACTIVE_INSTRUMENTS;
  const isBlank = exportMode === 'EM_BRANCO';
  const rowsPerPage = 30;

  return (
    <>
      {chunks<DiarioStudent>(students, rowsPerPage).map((studentGroup, groupIndex) => (
        <DiarioPrintPage
          key={`result-${groupIndex}`}
            template={template}
            turma={turma}
            disciplina={disciplina}
            moduloNome={moduloNome}
            title="Notas e Resultado Final"
            pageLabel={`Resultados ${groupIndex + 1}`}
            {...compactPrintPageProps}
          >
          <table className="diario-table diario-result-table">
            <thead>
              <tr>
                <th style={{ width: '8mm' }}>Nº</th>
                <th style={{ width: '57mm' }}>Aluno(a)</th>
                <th className={activeInst.p ? '' : 'opacity-40 line-through'}>P</th>
                <th className={activeInst.ti ? '' : 'opacity-40 line-through'}>TI</th>
                <th className={activeInst.tg ? '' : 'opacity-40 line-through'}>TG</th>
                <th className={activeInst.s ? '' : 'opacity-40 line-through'}>S</th>
                <th className={activeInst.cq ? '' : 'opacity-40 line-through'}>CQ</th>
                <th className={activeInst.o ? '' : 'opacity-40 line-through'}>O</th>
                <th>Média</th><th>Rec.</th><th>Final</th><th>Faltas</th><th>Freq.</th>
                <th style={{ width: '29mm' }}>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {studentGroup.map((student, index) => {
                const grade = gradesMap[student.id] || {};
                const stats = getStudentStats(gradesMap, student.id);

                const getInstValue = (active: boolean, val: number | null | undefined) => {
                  if (isBlank) return '';
                  if (!active || val === null || val === undefined) return '—';
                  return Number(val).toFixed(1);
                };

                return (
                  <tr key={student.id}>
                    <td className="text-center">{groupIndex * rowsPerPage + index + 1}</td>
                    <td className="diario-result-student"><strong>{student.nome}</strong></td>
                    <td className="text-center">{getInstValue(activeInst.p, grade.p)}</td>
                    <td className="text-center">{getInstValue(activeInst.ti, grade.ti)}</td>
                    <td className="text-center">{getInstValue(activeInst.tg, grade.tg)}</td>
                    <td className="text-center">{getInstValue(activeInst.s, grade.s)}</td>
                    <td className="text-center">{getInstValue(activeInst.cq, grade.cq)}</td>
                    <td className="text-center">{getInstValue(activeInst.o, grade.o)}</td>
                    <td className="text-center font-bold">{isBlank ? '' : stats.mediaParcial === null ? '—' : stats.mediaParcial.toFixed(1)}</td>
                    <td className="text-center">{isBlank ? '' : grade.rec === null || grade.rec === undefined ? '—' : Number(grade.rec).toFixed(1)}</td>
                    <td className="text-center font-bold">{isBlank ? '' : stats.mediaFinal === null ? '—' : stats.mediaFinal.toFixed(1)}</td>
                    <td className="text-center">{isBlank ? '' : stats.faltas}</td>
                    <td className="text-center">{isBlank ? '' : stats.frequencia === null ? '—' : `${stats.frequencia}%`}</td>
                    <td className="text-center text-[6.5pt] font-bold">{isBlank ? '' : stats.resultado.replaceAll('_', ' ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DiarioPrintPage>
      ))}
    </>
  );
};

type ContentPagesProps = PrintBaseProps & Pick<
  DiarioPrintDocumentProps,
  'aulas' | 'praticasMap' | 'observacoes' | 'exportMode'
>;

export const DiarioPrintContentPages: React.FC<ContentPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  aulas,
  praticasMap,
  observacoes,
  exportMode,
}) => {
  const contentGroups = chunks<DiarioAula>(aulas, 10);

  return (
    <>
      {contentGroups.map((aulaGroup, groupIndex) => (
        <DiarioPrintPage
          key={`content-${groupIndex}`}
            template={template}
            turma={turma}
            disciplina={disciplina}
            moduloNome={moduloNome}
            title="Conteúdo Programático e Prática Pedagógica"
            pageLabel={`Conteúdo ${groupIndex + 1}`}
            {...compactPrintPageProps}
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
                <p className="mt-2 whitespace-pre-wrap">
                  {exportMode === 'EM_BRANCO' ? '' : observacoes || 'Sem observações registradas.'}
                </p>
              </div>
              <div className="diario-signatures">
                <div className="diario-signature-line"><span>ASSINATURA DO PROFESSOR</span></div>
                <div className="diario-signature-line"><span>ASSINATURA DO COORDENADOR DO CURSO</span></div>
              </div>
            </>
          )}
        </DiarioPrintPage>
      ))}
    </>
  );
};

export const DiarioPrintInstructionsPage: React.FC<PrintBaseProps> = (props) => (
  <DiarioPrintPage
    {...props}
    {...compactPrintPageProps}
    title="Instruções de Preenchimento"
    pageLabel="Instruções"
  >
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
  </DiarioPrintPage>
);
