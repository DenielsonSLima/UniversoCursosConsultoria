import React from 'react';
import { Building, Check, Edit2, Power, Trash2 } from 'lucide-react';
import type { Curso } from '../cadastros.types';

interface CursoSuperiorTableProps {
  cursos: Curso[];
  readOnly?: boolean;
  onEdit: (curso: Curso, event: React.MouseEvent) => void;
  onToggleStatus: (curso: Curso, event: React.MouseEvent) => void;
  onDelete: (cursoId: string, event: React.MouseEvent) => void;
}

const CursoSuperiorTable: React.FC<CursoSuperiorTableProps> = ({
  cursos,
  readOnly = false,
  onEdit,
  onToggleStatus,
  onDelete,
}) => (
  <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/90">
            <th className="px-5 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Curso</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Categoria / versão</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Parceiro</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Descrição</th>
            <th className="px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
            {!readOnly ? (
              <th className="px-5 py-4 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">Ações</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {cursos.map((curso) => {
            const isActive = curso.status === 'ativo';

            return (
              <tr key={curso.id} className="group transition-colors hover:bg-blue-50/40">
                <td className="px-5 py-4">
                  <div className="flex min-w-[260px] items-center gap-3">
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                      {curso.imagem_url ? (
                        <img
                          src={curso.imagem_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-blue-50 text-blue-500">
                          <Building size={22} />
                        </div>
                      )}
                    </div>
                    <p className="max-w-[300px] text-sm font-black leading-snug text-[#001a33]">
                      {curso.nome}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex max-w-[230px] flex-col items-start gap-1.5">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase text-slate-500">
                      {curso.area || 'Outros'}
                    </span>
                    <span className="px-1 text-[10px] font-bold text-blue-600">Versão {curso.versao || '1.0'}</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex min-w-[190px] items-center gap-2.5">
                    <div className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5">
                      {curso.parceiro_logo_url ? (
                        <img
                          src={curso.parceiro_logo_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Building size={17} className="text-slate-300" />
                      )}
                    </div>
                    <p className="max-w-[190px] text-[10px] font-black uppercase leading-relaxed tracking-wide text-blue-600">
                      {curso.parceiro_instituicao || 'Não informado'}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="max-w-[280px] text-xs font-medium leading-relaxed text-slate-500 line-clamp-2">
                    {curso.descricao || 'Sem descrição cadastrada.'}
                  </p>
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
                        onClick={(event) => onToggleStatus(curso, event)}
                        title={isActive ? 'Inativar curso' : 'Ativar curso'}
                        className={`rounded-xl border border-slate-200 p-2 transition-colors ${
                          isActive
                            ? 'bg-white text-emerald-500 hover:border-emerald-200 hover:bg-emerald-50'
                            : 'bg-white text-slate-400 hover:bg-slate-100'
                        }`}
                      >
                        {isActive ? <Check size={14} /> : <Power size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => onEdit(curso, event)}
                        title="Editar curso"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-blue-500 transition-colors hover:border-blue-200 hover:bg-blue-50"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(event) => onDelete(curso.id, event)}
                        title="Excluir curso"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-red-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
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

export default CursoSuperiorTable;
