import React from 'react';
import { DiarioAula, DiarioStudent } from './diario-classe.service';
import { DiarioPrintDocumentProps } from './diario-classe.types';
import { chunks } from './diario-print.utils';
import DiarioPrintPage from './DiarioPrintPage';

type PrintBaseProps = Pick<
  DiarioPrintDocumentProps,
  'template' | 'turma' | 'disciplina' | 'moduloNome'
>;

type FrequencyPagesProps = PrintBaseProps & Pick<
  DiarioPrintDocumentProps,
  'students' | 'aulas' | 'attendanceMap'
>;

export const DiarioPrintFrequencyPages: React.FC<FrequencyPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  aulas,
  attendanceMap,
}) => {
  const studentGroups = chunks<DiarioStudent>(students, 18);
  const aulaGroups = chunks<DiarioAula>(aulas, 12);

  return (
    <>
      {aulaGroups.flatMap((aulaGroup, aulaIndex) =>
        studentGroups.map((studentGroup, studentIndex) => (
          <DiarioPrintPage
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
          </DiarioPrintPage>
        )),
      )}
    </>
  );
};

type ResultPagesProps = PrintBaseProps & Pick<DiarioPrintDocumentProps, 'students' | 'gradesMap'>;

export const DiarioPrintResultPages: React.FC<ResultPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  students,
  gradesMap,
}) => (
  <>
    {chunks<DiarioStudent>(students, 20).map((studentGroup, groupIndex) => (
      <DiarioPrintPage
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
      </DiarioPrintPage>
    ))}
  </>
);

type ContentPagesProps = PrintBaseProps & Pick<
  DiarioPrintDocumentProps,
  'aulas' | 'praticasMap' | 'observacoes'
>;

export const DiarioPrintContentPages: React.FC<ContentPagesProps> = ({
  template,
  turma,
  disciplina,
  moduloNome,
  aulas,
  praticasMap,
  observacoes,
}) => {
  const contentGroups = chunks<DiarioAula>(aulas, 14);

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
        </DiarioPrintPage>
      ))}
    </>
  );
};

export const DiarioPrintInstructionsPage: React.FC<PrintBaseProps> = (props) => (
  <DiarioPrintPage {...props} title="Instruções de Preenchimento" pageLabel="Instruções">
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
