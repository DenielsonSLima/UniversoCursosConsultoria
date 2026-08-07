import React, { useMemo } from 'react';
import DocumentHeader from '../../../../components/DocumentHeader';
import ReportWatermark from '../../../../relatorios/components/ReportWatermark';
import type { ParceirosTabType } from '../../../hooks/useParceirosFilters';
import {
  normalizeParceirosForExport,
  type ParceiroExportRow,
} from '../parceiros-export.utils';

interface PdfTemplateProps {
  items: any[];
  activeTab: ParceirosTabType;
  company?: any;
  polo?: any;
  filtrosAtuais?: {
    searchTerm?: string;
    statusFilter?: string;
    alunoModalidadeFilter?: string[];
    turmaFilter?: string;
    turmaFilterLabel?: string;
  };
}

const modalidadeLabels: Record<string, string> = {
  EAD: 'EAD',
  LIVRE: 'Livres',
  ESPECIALIZACAO: 'Especialização',
  TECNICO: 'Técnico',
};

const tabLabels: Record<ParceirosTabType, string> = {
  todos: 'Todos',
  professores: 'Professores',
  alunos: 'Alunos',
  pj: 'Pessoa Jurídica',
  pf: 'Pessoa Física',
};

const FIRST_PAGE_ROW_LIMIT = 12;
const CONTINUATION_PAGE_ROW_LIMIT = 18;

const paginateRows = (rows: ParceiroExportRow[]) => {
  if (rows.length === 0) return [[]];

  const pages: ParceiroExportRow[][] = [rows.slice(0, FIRST_PAGE_ROW_LIMIT)];
  for (
    let index = FIRST_PAGE_ROW_LIMIT;
    index < rows.length;
    index += CONTINUATION_PAGE_ROW_LIMIT
  ) {
    pages.push(rows.slice(index, index + CONTINUATION_PAGE_ROW_LIMIT));
  }
  return pages;
};

const statusClass = (status: string) => {
  const normalized = status.toLocaleUpperCase('pt-BR');
  if (normalized === 'ATIVO') return 'text-emerald-700';
  if (normalized === 'INATIVO') return 'text-slate-500';
  if (normalized === 'CONCLUÍDO') return 'text-blue-700';
  if (normalized === 'TRANCADO') return 'text-amber-700';
  return 'text-rose-700';
};

const PdfTemplate: React.FC<PdfTemplateProps> = ({
  items,
  activeTab,
  company,
  polo,
  filtrosAtuais,
}) => {
  const rows = useMemo(() => normalizeParceirosForExport(items), [items]);
  const pages = useMemo(() => paginateRows(rows), [rows]);
  const modalidadesSelecionadas = filtrosAtuais?.alunoModalidadeFilter || [];
  const modalidadeLabel = modalidadesSelecionadas.length > 0
    ? modalidadesSelecionadas.map((item) => modalidadeLabels[item] || item).join(', ')
    : 'Todos os alunos';

  const filters = [
    { label: 'Aba / Tipo', value: tabLabels[activeTab] },
    {
      label: 'Status',
      value: filtrosAtuais?.statusFilter && filtrosAtuais.statusFilter !== 'todos'
        ? filtrosAtuais.statusFilter
        : 'Todos',
    },
    { label: 'Filtro de alunos', value: modalidadeLabel },
    {
      label: 'Turma',
      value: filtrosAtuais?.turmaFilter && filtrosAtuais.turmaFilter !== 'todas'
        ? filtrosAtuais.turmaFilterLabel || 'Turma selecionada'
        : 'Todas as turmas',
    },
    {
      label: 'Busca',
      value: filtrosAtuais?.searchTerm?.trim() || 'Sem termo de busca',
    },
    { label: 'Registros', value: String(rows.length) },
  ];

  return (
    <>
      {pages.map((pageRows, pageIndex) => (
        <section
          key={`page-${pageIndex + 1}`}
          className="partners-report-page relative box-border flex h-[297mm] min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white p-[12mm] text-left text-slate-800 shadow-xl print:shadow-none"
        >
          <ReportWatermark polo={polo} orientation="portrait" />

          <div className="relative z-10 flex h-full flex-col">
            <DocumentHeader
              company={company}
              polo={polo}
              orientation="portrait"
              rightContent={
                <div className="text-right">
                  <h2 className="text-sm font-black uppercase tracking-tight text-slate-800">
                    Relatório de Parceiros
                  </h2>
                  <p className="mt-2 text-[8px] font-bold uppercase text-slate-500">
                    Data de emissão
                  </p>
                  <p className="text-xs font-bold text-[#001a33]">
                    {new Date().toLocaleDateString('pt-BR')}
                  </p>
                </div>
              }
            />

            {pageIndex === 0 && (
              <section className="mb-4">
                <h3 className="mb-2 bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#001a33]">
                  Resumo dos filtros
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {filters.map((filter) => (
                    <div
                      key={filter.label}
                      className="rounded-lg border border-slate-200 bg-white/85 px-2.5 py-2"
                    >
                      <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">
                        {filter.label}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-bold text-slate-700">
                        {filter.value}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pageIndex > 0 && (
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#001a33]">
                  Continuação
                </p>
                <p className="text-[8px] font-bold text-slate-400">
                  {rows.length} registros filtrados
                </p>
              </div>
            )}

            <table className="w-full table-fixed border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="w-[28%] px-1 py-2 text-[8px] font-black uppercase tracking-wider">Nome</th>
                  <th className="w-[12%] px-1 py-2 text-[8px] font-black uppercase tracking-wider">Tipo</th>
                  <th className="w-[12%] px-1 py-2 text-[8px] font-black uppercase tracking-wider">Status</th>
                  <th className="w-[20%] px-1 py-2 text-[8px] font-black uppercase tracking-wider">Documento</th>
                  <th className="w-[28%] px-1 py-2 text-[8px] font-black uppercase tracking-wider">Contato</th>
                </tr>
              </thead>
              <tbody className="font-medium text-slate-600">
                {pageRows.length > 0 ? pageRows.map((row) => (
                  <tr key={row.id || `${row.nome}-${row.documento}`} className="partners-report-row border-b border-slate-100">
                    <td className="px-1 py-2.5 text-[9px] font-bold text-slate-700">
                      <span className="block truncate" title={row.nome}>{row.nome}</span>
                    </td>
                    <td className="px-1 py-2.5 text-[9px]">{row.tipo}</td>
                    <td className={`px-1 py-2.5 text-[9px] font-bold ${statusClass(row.status)}`}>
                      {row.status}
                    </td>
                    <td className="px-1 py-2.5 text-[9px]">{row.documento}</td>
                    <td className="px-1 py-2 text-[8px]">
                      <span className="block truncate" title={row.email}>{row.email}</span>
                      <span className="mt-0.5 block text-slate-400">{row.telefone}</span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-xs font-bold text-slate-400">
                      Nenhum parceiro corresponde aos filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <footer className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3 text-[8px] font-bold text-slate-400">
              <span>UNIVERSO CURSOS E CONSULTORIA</span>
              <span>Página {pageIndex + 1} de {pages.length}</span>
            </footer>
          </div>
        </section>
      ))}
    </>
  );
};

export default PdfTemplate;
