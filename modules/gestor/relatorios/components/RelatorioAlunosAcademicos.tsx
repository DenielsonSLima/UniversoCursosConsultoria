import React, { useEffect, useMemo, useState } from 'react';
import { relatoriosService, RelatorioMatriculaAcademicaItem, RelatorioModalidade, RelatorioTurmaOption } from '../relatorios.service';
import {
  A4ReportShell,
  EmptyReportState,
  FilterField,
  FilterSelect,
  formatDate,
  MODALIDADE_LABELS,
  ReportFilterPanel,
  ReportKpiCard,
  ReportMetaCard,
  STATUS_LABELS,
  SummaryCard,
} from './RelatorioShared';

export type RelatorioAlunosAcademicosModo = 'cursando' | 'finalizados' | 'matricula-inicial' | 'situacao-aluno';

interface RelatorioAlunosAcademicosProps {
  company: any;
  polo: any;
  modo: RelatorioAlunosAcademicosModo;
}

const modeConfig = {
  cursando: {
    title: 'Relatório de Alunos Cursando',
    rightTitle: 'Controle Acadêmico',
    rightType: 'Alunos Cursando',
    description: 'Relação de alunos ativos/em curso separados por modalidade, curso, turma e polo, com dados de vínculo acadêmico e identificação da matrícula.',
    defaultStatus: 'ATIVO',
  },
  finalizados: {
    title: 'Relatório de Alunos Finalizados / Concluintes',
    rightTitle: 'Conclusão Acadêmica',
    rightType: 'Alunos Finalizados',
    description: 'Relação de alunos com curso concluído, carga horária, turma, certificado vinculado e situação de emissão documental.',
    defaultStatus: 'CONCLUIDO',
  },
  'matricula-inicial': {
    title: 'Relatório de Matrícula Inicial',
    rightTitle: 'Base Censo Escolar',
    rightType: 'Matrícula Inicial',
    description: 'Listagem acadêmica inspirada na coleta de Matrícula Inicial do Censo Escolar, contendo escola/polo, turma, aluno, curso, turno/modalidade e dados cadastrais essenciais.',
    defaultStatus: 'todos',
  },
  'situacao-aluno': {
    title: 'Relatório de Situação do Aluno',
    rightTitle: 'Movimento e Rendimento',
    rightType: 'Situação do Aluno',
    description: 'Consolidação da situação acadêmica por matrícula: cursando, concluído, transferido, desistente, trancado ou cancelado, apoiando controles internos e levantamentos oficiais.',
    defaultStatus: 'todos',
  },
} as const;

const academicStatuses = ['todos', 'ATIVO', 'CONCLUIDO', 'TRANCADO', 'CANCELADO', 'DESISTENTE', 'TRANSFERIDO'];

const isCursando = (status: string) => ['ATIVO', 'CONFIRMADO', 'AGUARDANDO_PAGAMENTO', 'AGUARDANDO_CONFIRMACAO'].includes(String(status).toUpperCase());
const isFinalizado = (status: string) => String(status).toUpperCase() === 'CONCLUIDO';

const RelatorioAlunosAcademicos: React.FC<RelatorioAlunosAcademicosProps> = ({ company, polo, modo }) => {
  const config = modeConfig[modo];
  const [items, setItems] = useState<RelatorioMatriculaAcademicaItem[]>([]);
  const [turmas, setTurmas] = useState<RelatorioTurmaOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalidade, setModalidade] = useState<RelatorioModalidade>('todos');
  const [turmaId, setTurmaId] = useState('todos');
  const [status, setStatus] = useState(config.defaultStatus);

  const poloId = polo?.id;

  useEffect(() => {
    setStatus(config.defaultStatus);
  }, [config.defaultStatus, modo]);

  useEffect(() => {
    let mounted = true;
    relatoriosService.getTurmasOptions(modalidade, poloId)
      .then((rows) => {
        if (!mounted) return;
        setTurmas(rows);
        if (turmaId !== 'todos' && !rows.some(row => row.id === turmaId)) setTurmaId('todos');
      })
      .catch((err) => console.error('Erro ao carregar turmas do relatório acadêmico:', err));
    return () => { mounted = false; };
  }, [modalidade, poloId, turmaId]);

  useEffect(() => {
    fetchData();
  }, [modalidade, turmaId, status, poloId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const rows = await relatoriosService.getMatriculasAcademicas({
        modalidade,
        turmaId,
        poloId,
        status: status === 'todos' ? undefined : status,
      });
      setItems(rows);
    } catch (error) {
      console.error('Erro ao carregar relatório acadêmico:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    if (modo === 'cursando') return items.filter(item => isCursando(item.status));
    if (modo === 'finalizados') return items.filter(item => isFinalizado(item.status));
    return items;
  }, [items, modo]);

  const totals = useMemo(() => {
    const byStatus = filteredItems.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || 'SEM_STATUS').toUpperCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const byModalidade = filteredItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.modalidade] = (acc[item.modalidade] || 0) + 1;
      return acc;
    }, {});
    const certificados = filteredItems.filter(item => item.certificadoStatus === 'FINALIZADO').length;
    return { byStatus, byModalidade, certificados };
  }, [filteredItems]);

  const renderTable = () => {
    if (filteredItems.length === 0) return <EmptyReportState />;

    if (modo === 'matricula-inicial') {
      return (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="py-2 px-2">Aluno</th>
              <th className="py-2 px-2">Nascimento</th>
              <th className="py-2 px-2">Curso/Turma</th>
              <th className="py-2 px-2">Modalidade</th>
              <th className="py-2 px-2">Polo</th>
              <th className="py-2 px-2">PCD</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <tr key={item.id} className="text-[9px] text-slate-700">
                <td className="py-2 px-2"><p className="font-black text-[#001a33]">{item.alunoNome}</p><p className="text-[8px] text-slate-400">CPF {item.alunoCpf}</p></td>
                <td className="py-2 px-2">{formatDate(item.dataNascimento)}</td>
                <td className="py-2 px-2"><p className="font-bold">{item.cursoNome}</p><p className="text-[8px] text-slate-400">{item.turmaNome}</p></td>
                <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
                <td className="py-2 px-2">{item.poloNome}</td>
                <td className="py-2 px-2">{item.pcd ? (item.pcdTipo || 'Sim') : 'Não'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (modo === 'situacao-aluno') {
      return (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
              <th className="py-2 px-2">Aluno</th>
              <th className="py-2 px-2">Curso/Turma</th>
              <th className="py-2 px-2">Entrada</th>
              <th className="py-2 px-2">Situação</th>
              <th className="py-2 px-2">Modalidade</th>
              <th className="py-2 px-2">Polo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <tr key={item.id} className="text-[9px] text-slate-700">
                <td className="py-2 px-2"><p className="font-black text-[#001a33]">{item.alunoNome}</p><p className="text-[8px] text-slate-400">{item.alunoCpf}</p></td>
                <td className="py-2 px-2"><p className="font-bold">{item.cursoNome}</p><p className="text-[8px] text-slate-400">{item.turmaNome}</p></td>
                <td className="py-2 px-2">{formatDate(item.dataMatricula)}</td>
                <td className="py-2 px-2"><span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 text-[8px] font-black uppercase">{STATUS_LABELS[item.status] || item.status}</span></td>
                <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
                <td className="py-2 px-2">{item.poloNome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    return (
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-300 text-[8px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
            <th className="py-2 px-2">Aluno</th>
            <th className="py-2 px-2">Curso/Turma</th>
            <th className="py-2 px-2">Modalidade</th>
            <th className="py-2 px-2">Período</th>
            <th className="py-2 px-2">Carga</th>
            <th className="py-2 px-2">Certificado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filteredItems.map((item) => (
            <tr key={item.id} className="text-[9px] text-slate-700">
              <td className="py-2 px-2"><p className="font-black text-[#001a33]">{item.alunoNome}</p><p className="text-[8px] text-slate-400">{item.alunoCpf}</p></td>
              <td className="py-2 px-2"><p className="font-bold">{item.cursoNome}</p><p className="text-[8px] text-slate-400">{item.turmaNome}</p></td>
              <td className="py-2 px-2">{MODALIDADE_LABELS[item.modalidade] || item.modalidade}</td>
              <td className="py-2 px-2">{formatDate(item.dataInicio)} a {formatDate(item.dataFim)}</td>
              <td className="py-2 px-2">{item.cargaHoraria}h</td>
              <td className="py-2 px-2">
                {item.certificadoStatus ? (
                  <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.certificadoStatus === 'FINALIZADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.certificadoStatus}</span>
                ) : <span className="text-slate-400">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full w-full">
      <ReportFilterPanel
        summary={
          <>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumo Acadêmico</h4>
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard label="Registros" value={filteredItems.length} tone="blue" />
              <SummaryCard label="Técnico" value={totals.byModalidade.TECNICO || 0} />
              <SummaryCard label="EAD" value={totals.byModalidade.EAD || 0} />
              <SummaryCard label="Certificados" value={totals.certificados} tone="emerald" />
            </div>
          </>
        }
      >
        <FilterField label="Modalidade">
          <FilterSelect value={modalidade} onChange={(e) => setModalidade(e.target.value as RelatorioModalidade)}>
            {Object.entries(MODALIDADE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </FilterSelect>
        </FilterField>
        <FilterField label="Turma">
          <FilterSelect value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
            <option value="todos">Todas as turmas</option>
            {turmas.map((turma) => <option key={turma.id} value={turma.id}>{turma.nome} {turma.codigo ? `(${turma.codigo})` : ''}</option>)}
          </FilterSelect>
        </FilterField>
        {modo !== 'cursando' && modo !== 'finalizados' && (
          <FilterField label="Situação acadêmica">
            <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
              {academicStatuses.map((key) => <option key={key} value={key}>{STATUS_LABELS[key] || key}</option>)}
            </FilterSelect>
          </FilterField>
        )}
      </ReportFilterPanel>

      <A4ReportShell
        company={company}
        polo={polo}
        loading={loading}
        rightTitle={config.rightTitle}
        rightType={config.rightType}
        title={config.title}
        description={config.description}
        meta={
          <>
            <ReportMetaCard label="Modalidade" value={MODALIDADE_LABELS[modalidade]} />
            <ReportMetaCard label="Situação" value={modo === 'cursando' ? 'Cursando' : modo === 'finalizados' ? 'Concluído' : STATUS_LABELS[status] || status} />
            <ReportMetaCard label="Unidade / Polo" value={polo?.nome || 'Matriz'} />
          </>
        }
        kpis={
          <>
            <ReportKpiCard label="Total" value={filteredItems.length} tone="blue" />
            <ReportKpiCard label="Cursando" value={totals.byStatus.ATIVO || 0} tone="emerald" />
            <ReportKpiCard label="Concluídos" value={totals.byStatus.CONCLUIDO || 0} tone="amber" />
          </>
        }
      >
        {renderTable()}
      </A4ReportShell>
    </div>
  );
};

export default RelatorioAlunosAcademicos;
