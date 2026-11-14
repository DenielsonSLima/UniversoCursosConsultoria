import React, { useEffect, useState } from 'react';
import InstitutionalSelect from '../../../../../../../shared/components/InstitutionalSelect';
import type { DiarioFrequenciaTabProps } from '../DiarioFrequenciaTab';
import { useDiarioDocumentary } from '../historico/DiarioDocumentaryContext';
import { documentaryAttendanceText } from '../historico/diario-documentary.presentation';

const statusLabels: Record<string, string> = { P: 'Presença', F: 'Falta', J: 'Falta justificada' };
const sessionLabels: Record<string, string> = { M: 'Manhã', T: 'Tarde', N: 'Noite', U: 'Aula única' };

const DiarioFrequenciaMobile: React.FC<DiarioFrequenciaTabProps> = ({ students, aulas, attendanceMap, isReadOnly, onToggleAttendance, getStats }) => {
  const documentary = useDiarioDocumentary();
  const sessions = aulas.flatMap(aula => aula.sessoes.map(session => ({ ...session, aula })));
  const [selected, setSelected] = useState(sessions[0]?.id || '');
  const [search, setSearch] = useState('');
  const current = sessions.find(session => session.id === selected) || sessions[0];
  useEffect(() => { if (!sessions.some(session => session.id === selected)) setSelected(sessions[0]?.id || ''); }, [aulas, selected]);
  const visibleStudents = students.filter(student => student.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  return <section className="professor-diary-mobile" aria-label="Frequência por aula">
    {!students.length || !current ? <p className="p-4 text-slate-600">{!students.length ? 'Nenhum aluno disponível neste diário.' : 'A Gestão ainda não definiu aulas para esta disciplina.'}</p> : <>
      <label className="diary-mobile-label" htmlFor="diary-mobile-session">Aula e sessão</label>
      <InstitutionalSelect id="diary-mobile-session" ariaLabel="Aula e sessão para lançar frequência" value={current.id}
        onValueChange={setSelected} options={sessions.map(session => ({ value: session.id,
          label: `${session.aula.dataLabel} · ${sessionLabels[session.periodo]} · ${session.cargaHoraria}h`, description: session.aula.titulo }))} showOptionDescriptions />
      <p className="mt-3 break-words text-slate-700">{current.aula.titulo}</p>
      <label className="diary-mobile-label mt-4" htmlFor="diary-attendance-student">Buscar aluno</label>
      <input id="diary-attendance-student" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome do aluno" />
      <p className="my-3 text-xs text-slate-500">{isReadOnly || documentary ? 'Diário disponível para consulta.' : 'Toque na marcação para alternar presença, falta, justificativa ou remover.'}</p>
      <div className="space-y-3">{visibleStudents.map(student => {
        const status = attendanceMap[student.id]?.[current.id] || null;
        const stats = getStats(student.id);
        const credited = stats.resultado === 'APROVEITADO';
        const mark = documentaryAttendanceText(documentary?.attendance[student.id]?.[current.id], status);
        return <article key={student.id} className="diary-mobile-card flex items-center gap-3">
          <div className="min-w-0 flex-1"><h4 className="break-words font-medium">{student.nome}</h4>
            <p className="mt-1 text-xs text-slate-500">{credited ? 'Frequência preservada por equivalência' : `Faltas registradas: ${stats.faltas ?? '—'}`}</p></div>
          <button type="button" disabled={isReadOnly || Boolean(documentary) || credited}
            aria-label={`Alterar frequência de ${student.nome}: ${credited ? 'Aproveitado' : statusLabels[status || ''] || 'Sem lançamento'}`}
            onClick={() => onToggleAttendance(student.id, current.id)}
            className={`shrink-0 rounded-lg border px-3 py-2 font-medium ${status === 'P' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status === 'F' ? 'border-red-200 bg-red-50 text-red-800' : status === 'J' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-50 text-slate-700'} disabled:opacity-70`}>
            {credited ? 'APR' : mark !== undefined ? mark || '—' : status || '—'}
          </button>
        </article>;
      })}</div>
      {!visibleStudents.length && <p className="py-4 text-slate-500">Nenhum aluno encontrado.</p>}
    </>}
  </section>;
};

export default DiarioFrequenciaMobile;
