import React from 'react';
import { Activity, BookOpen, ClipboardCheck, LockKeyhole, ShieldAlert } from 'lucide-react';
import { EstagioAluno } from '../../turma-estagio.types';

interface EstagioStudentsPanelProps {
  disciplinas: any[];
  selectedDiscId: string;
  onDisciplinaChange: (disciplinaId: string) => void;
  alunos: EstagioAluno[];
  avaliacoes: Record<string, any>;
  vacinasResumo: any;
  readOnly: boolean;
  readOnlyMessage: string;
  onStartEvaluation: (aluno: EstagioAluno) => void;
}

const EstagioStudentsPanel: React.FC<EstagioStudentsPanelProps> = ({
  disciplinas,
  selectedDiscId,
  onDisciplinaChange,
  alunos,
  avaliacoes,
  vacinasResumo,
  readOnly,
  readOnlyMessage,
  onStartEvaluation,
}) => (
  <div className="bg-white p-6 md:p-8 rounded-[2rem] shadow-sm border border-slate-100 animate-fadeIn">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-6">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-teal-50 text-teal-600 rounded-2xl">
          <Activity size={32} />
        </div>
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Estágio Supervisionado</h3>
          <p className="text-slate-500 text-xs font-medium">Lance avaliações, controle checklists de técnicas e gere fichas em PDF.</p>
        </div>
      </div>

      {disciplinas.length > 0 ? (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Unidade:</span>
          <select
            value={selectedDiscId}
            onChange={(event) => onDisciplinaChange(event.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-teal-500 px-3.5 py-3 transition-colors text-slate-700 shadow-sm"
          >
            {disciplinas.map((disciplina) => (
              <option key={disciplina.id} value={disciplina.id}>
                {disciplina.nome} ({disciplina.cargaHorariaEstagio}h estágio)
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>

    {readOnly ? (
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
        <LockKeyhole className="mt-0.5 shrink-0" size={17} />
        <p className="text-xs font-bold leading-relaxed">{readOnlyMessage}</p>
      </div>
    ) : null}

    {disciplinas.length === 0 ? (
      <div className="text-center py-20 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
        <BookOpen className="text-slate-300 mx-auto mb-4" size={48} />
        <h4 className="font-bold text-slate-500">Nenhuma disciplina com estágio</h4>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-2">
          Para utilizar este módulo, acesse a grade curricular deste curso nos cadastros e configure horas de estágio (E) em pelo menos uma disciplina.
        </p>
      </div>
    ) : (
      <div className="bg-white border border-slate-100 rounded-[2rem] overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#001a33] text-white">
            <tr>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider rounded-tl-[2rem]">Aluno</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Status Ficha</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Vacinas</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Frequência</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider">Nota Estágio</th>
              <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-right rounded-tr-[2rem]">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {alunos.map((aluno) => {
              const avaliacao = avaliacoes[aluno.id];
              const isEvaluated = Boolean(avaliacao);
              const notaFinal = Number(avaliacao?.nota_final || 0);
              const vacinaStatus = vacinasResumo?.porAluno?.[aluno.id];
              const vacinaLiberada = !vacinasResumo?.exige || Boolean(vacinaStatus?.liberado);
              const canOpen = readOnly ? isEvaluated : vacinaLiberada;

              return (
                <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center text-xs font-black border border-teal-100">
                        {aluno.nome.charAt(0)}
                      </div>
                      <div>
                        <span className="font-bold text-[#001a33] text-sm block">{aluno.nome}</span>
                        <span className="text-[10px] text-slate-500 font-medium">CPF: {aluno.cpf || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${isEvaluated
                      ? 'bg-teal-50 border border-teal-100 text-teal-700'
                      : 'bg-slate-50 border border-slate-200 text-slate-500'
                    }`}>
                      {isEvaluated ? 'AVALIADO' : 'PENDENTE'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-600">
                    {vacinasResumo?.exige ? (
                      vacinaStatus?.liberado ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                          <ClipboardCheck size={12} /> Em dia
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                          <ShieldAlert size={12} /> {vacinaStatus?.aprovadas || 0}/{vacinaStatus?.totalDoses || vacinasResumo.totalDoses}
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Não exige</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-xs font-bold text-slate-600">
                    {isEvaluated ? `${avaliacao.frequencia_estagio}%` : '—'}
                  </td>
                  <td className="px-6 py-5">
                    {isEvaluated ? (
                      <span className="text-sm font-black text-teal-700">{notaFinal.toFixed(1)} / 10.0</span>
                    ) : (
                      <span className="text-xs text-slate-400 italic font-semibold">Pendente</span>
                    )}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button
                      onClick={() => onStartEvaluation(aluno)}
                      disabled={!canOpen}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors ${!canOpen
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : isEvaluated
                          ? 'bg-slate-100 hover:bg-[#001a33] text-slate-600 hover:text-white'
                          : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
                      }`}
                      title={!canOpen
                        ? readOnly ? readOnlyMessage : 'Aprovação de vacinas pendente'
                        : readOnly ? 'Consultar ficha de estágio' : undefined}
                    >
                      {readOnly
                        ? isEvaluated ? 'Consultar Ficha' : 'Encerrado'
                        : !vacinaLiberada ? 'Bloqueado' : isEvaluated ? 'Editar Ficha' : 'Avaliar Estágio'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export default EstagioStudentsPanel;
