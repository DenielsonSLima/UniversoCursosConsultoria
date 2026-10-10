import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, FileOutput, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeGestorPermissions } from '../../access-control';
import { canReceivePlannedExternalTransfer } from '../../gestao/tecnicos/detalhes/components/academic/external-transfer-access';
import ReceiveExternalTransferController from '../../gestao/tecnicos/detalhes/components/academic/ReceiveExternalTransferController';
import { academicLifecycleKeys } from '../../gestao/tecnicos/detalhes/academic-lifecycle.keys';
import SecretariaAlunoSearchCard from '../shared/SecretariaAlunoSearchCard';
import { secretariaDocumentosCatalogo } from '../shared/secretaria-documentos.catalogo';
import { secretariaDocumentoDefinitions } from '../shared/secretaria-documentos.definitions';
import { secretariaDocumentosKeys } from '../shared/secretaria-documentos.keys';
import { getSecretariaErrorMessage } from '../shared/secretaria-error';
import type { SecretariaAlunoResumo, SecretariaTurmaResumo } from '../shared/secretaria-documentos.types';
import TransferenciaDestinoPicker from './TransferenciaDestinoPicker';
import { transferenciaCursoOptions, transferenciaTurmaOptions, transferenciaTurmasDoCurso } from './transferencia-destinos';

const SecretariaDocumentoEmissionPage = lazy(() => import('../shared/SecretariaDocumentoEmissionPage'));

interface Props {
  poloId?: string | null;
  gestorPermissions?: unknown;
}

const SecretariaTransferenciaPage: React.FC<Props> = ({ poloId, gestorPermissions }) => {
  const client = useQueryClient();
  const [mode, setMode] = useState<'receber' | 'guia'>('receber');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [student, setStudent] = useState<SecretariaAlunoResumo | null>(null);
  const [courseId, setCourseId] = useState('');
  const [classId, setClassId] = useState('');
  const [receipt, setReceipt] = useState<{ student: SecretariaAlunoResumo; turma: SecretariaTurmaResumo } | null>(null);
  const received = useRef(false);
  const studentInput = useRef<HTMLInputElement>(null);
  const courseInput = useRef<HTMLInputElement>(null);
  const classInput = useRef<HTMLInputElement>(null);
  const permissions = useMemo(() => normalizeGestorPermissions(
    gestorPermissions, { fallbackFullAccess: false },
  ), [gestorPermissions]);
  const canReceive = canReceivePlannedExternalTransfer(permissions);
  const scope = ['secretaria-transferencia-recebida', poloId] as const;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setStudent(null); setCourseId(''); setClassId(''); setSearch(''); setDebouncedSearch(''); setReceipt(null);
  }, [poloId]);

  const students = useQuery({
    queryKey: [...scope, 'alunos', debouncedSearch],
    queryFn: () => secretariaDocumentosCatalogo.searchAlunos(poloId!, debouncedSearch),
    enabled: mode === 'receber' && canReceive && Boolean(poloId) && debouncedSearch.length >= 2 && !student,
    retry: false,
  });
  const classes = useQuery({
    queryKey: [...scope, 'turmas'],
    queryFn: () => secretariaDocumentosCatalogo.getTurmas(poloId!, true, true),
    enabled: mode === 'receber' && canReceive && Boolean(poloId),
    retry: false,
  });
  const courses = useMemo(() => transferenciaCursoOptions(classes.data || []), [classes.data]);
  const availableClasses = useMemo(() => transferenciaTurmasDoCurso(classes.data || [], courseId), [classes.data, courseId]);
  const classOptions = useMemo(() => transferenciaTurmaOptions(availableClasses), [availableClasses]);
  const selectedCourse = courses.find((item) => item.id === courseId);
  const selectedClass = availableClasses.find((item) => item.id === classId);
  const chooseStudent = (item: SecretariaAlunoResumo) => {
    setStudent(item); setSearch(item.nome);
    window.requestAnimationFrame(() => courseInput.current?.focus());
  };
  const changeStudent = () => {
    setStudent(null); setCourseId(''); setClassId(''); setSearch(''); setDebouncedSearch('');
    window.requestAnimationFrame(() => studentInput.current?.focus());
  };
  const chooseCourse = (id: string) => {
    if (id !== courseId) { setCourseId(id); setClassId(''); }
    window.requestAnimationFrame(() => classInput.current?.focus());
  };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Operação de transferência" className="grid gap-3 sm:grid-cols-2">
        {([
          ['receber', 'Receber de outra escola', 'Aluno vindo de outra instituição, com ou sem matrícula no Universo.', ArrowDownToLine],
          ['guia', 'Emitir guia de saída', 'Documento para um aluno com matrícula no Universo.', FileOutput],
        ] as const).map(([id, title, description, Icon]) => (
          <button key={id} id={`transferencia-tab-${id}`} type="button" role="tab"
            aria-selected={mode === id} aria-controls={`transferencia-panel-${id}`} tabIndex={mode === id ? 0 : -1}
            onClick={() => setMode(id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === 'Home' ? 'receber' : event.key === 'End' ? 'guia' : mode === 'receber' ? 'guia' : 'receber';
              setMode(next);
              document.getElementById(`transferencia-tab-${next}`)?.focus();
            }}
            className={`rounded-2xl border p-5 text-left ${mode === id ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <span className="flex items-center gap-2 text-sm font-black text-[#001a33]"><Icon size={20} />{title}</span>
            <span className="mt-2 block text-xs text-slate-600">{description}</span>
          </button>
        ))}
      </div>

      {mode === 'guia' ? (
        <div role="tabpanel" id="transferencia-panel-guia" aria-labelledby="transferencia-tab-guia">
          <Suspense fallback={<p role="status" className="text-sm text-slate-500">Carregando emissão da guia...</p>}>
            <SecretariaDocumentoEmissionPage definition={secretariaDocumentoDefinitions.transferencia} />
          </Suspense>
        </div>
      ) : (
        <section role="tabpanel" id="transferencia-panel-receber" aria-labelledby="transferencia-tab-receber"
          className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 md:p-8">
          <div>
            <h3 className="text-lg font-black text-[#001a33]">Recebimento de transferência externa</h3>
            <p className="mt-2 text-sm text-slate-600">Selecione o aluno, nosso curso técnico e a turma em que ele vai ingressar. Depois informe a escola de origem, as disciplinas aproveitadas e o plano financeiro.</p>
          </div>
          {!canReceive ? (
            <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">O recebimento exige acesso ao Financeiro da turma e a Financeiro → Receber.</p>
          ) : !poloId ? (
            <p role="status" className="text-sm text-slate-600">Selecione uma unidade para receber a transferência.</p>
          ) : (
            <>
              {student ? (
                <SecretariaAlunoSearchCard {...student} tone="purple" selected actionLabel="Trocar aluno"
                  statusLabel={student.matricula ? 'Aluno cadastrado' : 'Sem matrícula acadêmica'}
                  onClick={changeStudent} />
              ) : (
                <div>
                  <label htmlFor="transferencia-aluno" className="text-xs font-black uppercase tracking-wider text-slate-500">Localizar aluno</label>
                  <div className="relative mt-2">
                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input ref={studentInput} id="transferencia-aluno" value={search} onChange={(event) => setSearch(event.target.value)}
                      placeholder="Pesquise por nome ou CPF" autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-bold text-[#001a33] outline-none focus:border-violet-500" />
                  </div>
                  <div className="mt-3 space-y-2" aria-live="polite">
                    {search.trim().length < 2 ? <p className="text-xs text-slate-500">Digite ao menos 2 caracteres. A busca inclui alunos sem turma.</p>
                      : search.trim() !== debouncedSearch || students.isFetching ? <p role="status" className="text-sm text-slate-500">Pesquisando alunos...</p>
                        : students.isError ? (
                          <div role="alert" className="text-sm text-red-700">
                            <p>{getSecretariaErrorMessage(students.error, 'Não foi possível pesquisar os alunos.')}</p>
                            <button type="button" onClick={() => { void students.refetch(); }} className="mt-2 font-bold">Tentar novamente</button>
                          </div>
                        ) : students.data?.length ? students.data.map((item) => (
                          <SecretariaAlunoSearchCard key={item.id} {...item} tone="purple" onClick={() => chooseStudent(item)} />
                        )) : <p className="text-sm text-slate-500">Nenhum aluno encontrado nesta unidade.</p>}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <TransferenciaDestinoPicker label="Curso técnico no Universo" options={courses} value={courseId} inputRef={courseInput}
                  placeholder={student ? 'Pesquise ou selecione nosso curso técnico' : 'Primeiro selecione o aluno'}
                  emptyMessage="Nenhum curso técnico com turma em andamento nesta unidade."
                  disabled={!student} loading={classes.isFetching} error={classes.isError} onChange={chooseCourse} />
                <TransferenciaDestinoPicker label="Turma de destino no Universo" options={classOptions} value={classId} inputRef={classInput}
                  placeholder={selectedCourse ? 'Pesquise ou selecione a turma' : 'Primeiro selecione o curso técnico'}
                  emptyMessage={selectedCourse ? 'Nenhuma turma em andamento para este curso.' : 'Selecione nosso curso técnico para ver as turmas.'}
                  disabled={!student || !selectedCourse} loading={classes.isFetching} error={classes.isError} onChange={setClassId} />
              </div>
              {classes.isError && <button type="button" onClick={() => { void classes.refetch(); }} className="text-sm font-bold text-violet-700">Tentar carregar turmas novamente</button>}
              <p className="text-xs text-slate-500">A matrícula e o plano financeiro só serão registrados ao confirmar o recebimento. Confira as condições antes de concluir.</p>
              <button type="button" disabled={!student || !selectedCourse || !selectedClass || classes.isFetching || classes.isError}
                onClick={() => {
                  if (!student || !selectedClass) return;
                  received.current = false;
                  setReceipt({ student, turma: selectedClass });
                }}
                className="flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 py-4 text-xs font-black uppercase text-white disabled:opacity-40">
                <ArrowDownToLine size={16} />Preencher recebimento
              </button>
            </>
          )}
        </section>
      )}
      {receipt && (
        <ReceiveExternalTransferController key={`${poloId}:${receipt.turma.id}:${receipt.student.id}`}
          turmaId={receipt.turma.id} canReceive={canReceive}
          destinationLabel={`${receipt.turma.cursoNome} — ${receipt.turma.nome} (${receipt.turma.codigo})`}
          initialStudent={{ id: receipt.student.id, nome: receipt.student.nome, cpf_cnpj: receipt.student.cpf }}
          onClose={() => {
            setReceipt(null);
            if (received.current) changeStudent();
          }}
          onSaved={async () => {
            received.current = true;
            await Promise.all([
              client.invalidateQueries({ queryKey: scope }),
              client.invalidateQueries({ queryKey: academicLifecycleKeys.turma(receipt.turma.id) }),
              client.invalidateQueries({ queryKey: ['parceiro', receipt.student.id] }),
              client.invalidateQueries({ queryKey: ['aluno-matriculas', poloId, receipt.student.id] }),
              client.invalidateQueries({ queryKey: ['secretaria-alunos-search', poloId] }),
              client.invalidateQueries({ queryKey: secretariaDocumentosKeys.all,
                predicate: (query) => query.queryKey[2] === poloId && (
                  query.queryKey.includes('alunos') || query.queryKey.includes(receipt.student.id)
                ),
              }),
            ]);
          }} />
      )}
    </div>
  );
};

export default SecretariaTransferenciaPage;
