import React, { useState } from 'react';
import DiarioFrequenciaTab from '../../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioFrequenciaTab';
import DiarioResultadoTab from '../../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioResultadoTab';
import DiarioConteudoTab from '../../../gestor/gestao/tecnicos/detalhes/components/diarios/DiarioConteudoTab';
import '../../../gestor/gestao/tecnicos/detalhes/components/diarios/mobile/professor-diary-mobile.css';
export { default as TechnicalDataError } from '../../../gestor/gestao/tecnicos/detalhes/components/TechnicalDataError';

const students = [
  { id: 'aluno-a', nome: 'Ana de Souza com nome completo para conferência no celular', matricula: 'M001', status: 'ATIVO' },
  { id: 'aluno-b', nome: 'Bruno Pereira', matricula: 'M002', status: 'ATIVO' },
];
const aulas = [{ id: 'encontro-1', titulo: 'Conteúdo preparado pela Gestão', cargaHoraria: 8, dataLabel: '20/11', dataAula: '2026-11-20',
  sessoes: [{ id: 'sessao-m', periodo: 'M' as const, cargaHoraria: 4 }, { id: 'sessao-t', periodo: 'T' as const, cargaHoraria: 4 }] }];
const stats = (studentId: string) => studentId === 'aluno-b'
  ? { faltas: 0, frequencia: 100, mediaParcial: 8, mediaFinal: 8, resultado: 'APROVEITADO' }
  : { faltas: 2, frequencia: 75, mediaParcial: 5, mediaFinal: 5, resultado: 'EM_RECUPERACAO' };

interface Props {
  initialTab?: 'frequencia' | 'notas' | 'conteudo';
  readOnly?: boolean;
  mobileLayout?: boolean;
  onAction?: (action: string, values: unknown[]) => void;
}

export const AcademicMobileFixture: React.FC<Props> = ({ initialTab = 'frequencia', readOnly = false, mobileLayout = true, onAction }) => {
  const [tab, setTab] = useState(initialTab);
  const [attendance, setAttendance] = useState<any>({ 'aluno-a': { 'sessao-m': 'P', 'sessao-t': null } });
  const [grades, setGrades] = useState<any>({ 'aluno-a': { p: 0, ti: null, tg: null, s: null, cq: null, o: null, rec: 0 } });
  const [instruments, setInstruments] = useState({ p: true, ti: true, tg: false, s: false, cq: false, o: false });
  const [titles, setTitles] = useState({ 'encontro-1': aulas[0].titulo });
  const [practices, setPractices] = useState({ 'encontro-1': 'Prática registrada' });
  const [lastAction, setLastAction] = useState('Nenhuma gravação');
  const record = (action: string, ...values: unknown[]) => { onAction?.(action, values); setLastAction(action); };
  return <main className="mx-auto w-full max-w-4xl bg-white text-slate-700">
    <h1 className="p-4 text-lg font-medium">Diário do professor · dados sintéticos</h1>
    <nav className="flex flex-wrap gap-2 px-4" aria-label="Telas de conferência">
      {(['frequencia', 'notas', 'conteudo'] as const).map(value => <button key={value} type="button" onClick={() => setTab(value)} className="min-h-11 rounded-lg border px-3">{value}</button>)}
    </nav>
    <p className="px-4 py-2 text-xs" role="status">{readOnly ? 'Somente consulta' : 'Gravações apenas em memória'} · {lastAction}</p>
    {tab === 'frequencia' && <DiarioFrequenciaTab mobileLayout={mobileLayout} students={students} aulas={aulas} attendanceMap={attendance}
      isReadOnly={readOnly} getStats={stats} onToggleAttendance={(studentId, sessionId) => {
        record('frequencia', studentId, sessionId);
        setAttendance(previous => ({ ...previous, [studentId]: { ...previous[studentId], [sessionId]: previous[studentId]?.[sessionId] === 'P' ? 'F' : 'P' } }));
      }} />}
    {tab === 'notas' && <DiarioResultadoTab mobileLayout={mobileLayout} students={students} localGrades={grades} isReadOnly={readOnly} activeInstruments={instruments}
      getStats={stats} onToggleInstrument={field => { record('instrumento', field); setInstruments(previous => ({ ...previous, [field]: !previous[field] })); }}
      onGradeChange={(studentId, field, value) => {
        record('nota-alterada', studentId, field, value);
        setGrades(previous => ({ ...previous, [studentId]: { ...previous[studentId], [field]: value === '' ? null : Number(value) } }));
      }} onSaveGrade={(studentId, field) => record('nota-salva', studentId, field)} />}
    {tab === 'conteudo' && <DiarioConteudoTab mobileLayout={mobileLayout} aulas={aulas} localTitulos={titles} setLocalTitulos={setTitles}
      localPraticas={practices} setLocalPraticas={setPractices} canEditAulaTitle={!readOnly} canEditPratica={!readOnly}
      onSaveAulaTitle={(aulaId, title) => record('conteudo', aulaId, title)} onSavePratica={(aulaId, value) => record('pratica', aulaId, value)} />}
  </main>;
};
