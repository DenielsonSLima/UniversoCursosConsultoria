import React from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  GraduationCap,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import type { Curso } from '../../cadastros.types';
import {
  formatCursoEadPrice,
  formatCursoEadUpdatedAt,
  getCursoEadMetrics,
} from '../cursos-ead.utils';

interface CursoEadTableProps {
  cursos: Curso[];
  readOnly?: boolean;
  onEdit: (curso: Curso) => void;
  onDuplicate: (curso: Curso, event: React.MouseEvent) => void;
  onToggleStatus: (curso: Curso, event: React.MouseEvent) => void;
  onDelete: (curso: Curso, event: React.MouseEvent) => void;
}

const CursoEadTable: React.FC<CursoEadTableProps> = ({
  cursos,
  readOnly = false,
  onEdit,
  onDuplicate,
  onToggleStatus,
  onDelete,
}) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Curso</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Área / versão</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Conteúdo</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Valor</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Última atualização</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
            {!readOnly ? (
              <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Ações</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cursos.map((curso) => {
            const { videoCount, questionsCount } = getCursoEadMetrics(curso);
            const isActive = curso.status === 'ativo';

            return (
              <tr key={curso.id} className="group transition-colors hover:bg-purple-50/30">
                <td className="px-5 py-4">
                  <div className="flex min-w-[280px] items-center gap-3">
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {curso.imagem_url ? (
                        <img
                          src={curso.imagem_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-purple-50 text-purple-500">
                          <GraduationCap size={22} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-[300px] truncate text-sm font-black text-[#001a33]" title={curso.nome}>
                        {curso.nome}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] font-bold text-slate-400">
                        <Clock size={12} className="text-purple-500" />
                        {curso.carga_horaria || 0}h EAD
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col items-start gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase text-slate-500">
                      {curso.area || 'Outros'}
                    </span>
                    <span className="px-1 text-[10px] font-bold text-purple-600">v{curso.versao || '1.0'}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="space-y-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    <p>{videoCount} videoaula{videoCount === 1 ? '' : 's'}</p>
                    <p>{questionsCount} quest{questionsCount === 1 ? 'ão' : 'ões'}</p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${
                    curso.valor && curso.valor > 0
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-600'
                  }`}>
                    {formatCursoEadPrice(curso.valor)}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <p className="text-xs font-bold text-slate-600">{formatCursoEadUpdatedAt(curso)}</p>
                  <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Data e hora</p>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                    isActive
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-600'
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    {isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                {!readOnly ? (
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEdit(curso)}
                        title="Configurar EAD"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-purple-700"
                      >
                        <Edit3 size={12} />
                        Configurar
                        <CheckCircle2 size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => onDuplicate(curso, event)}
                        title="Copiar / criar nova versão"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600"
                      >
                        <Copy size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => onToggleStatus(curso, event)}
                        title={isActive ? 'Pausar curso' : 'Ativar curso'}
                        className={`rounded-xl border border-slate-200 p-2 transition-colors ${
                          isActive
                            ? 'bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600'
                            : 'bg-red-50 text-red-500 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600'
                        }`}
                      >
                        {isActive ? <Power size={13} /> : <PowerOff size={13} />}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => onDelete(curso, event)}
                        title="Excluir curso"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

export default CursoEadTable;
