// File: modules/gestor/parceiros/components/cards/AlunoCard.tsx

import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, GraduationCap, MapPin, Mail, Phone, ChevronRight, MoreVertical, Edit3, Trash2, ToggleLeft, ToggleRight, Users } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../../parceiros.service';
import { formatMatricula } from '../../../../../lib/academicUtils';
import { formatCpf, formatPhone } from '../../../../../lib/documentFormatters';
import EmailConfirmationStatus from './EmailConfirmationStatus';

interface AlunoCardProps {
  data: any;
  onClick?: () => void;
  onDelete?: () => void;
}

const AlunoCard: React.FC<AlunoCardProps> = ({ data, onClick, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isAtivo = data.status?.toUpperCase() === 'ATIVO';
  const formattedCpf = formatCpf(data.cpf);
  const telefone = data.telefone || data.contato1;
  const matriculasAluno = Array.isArray(data.matriculasAluno) ? data.matriculasAluno : [];
  const matriculaAtual = matriculasAluno[0];

  const toggleStatusMutation = useMutation({
    mutationFn: () => parceirosService.update(data.id, { ...data, tipo: 'Aluno', status: isAtivo ? 'INATIVO' : 'ATIVO' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    },
  });



  // Cor de status para alunos tem mais variações
  const statusConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
    ATIVO: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', label: 'Ativo' },
    INATIVO: { bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200', label: 'Inativo' },
    TRANCADO: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', label: 'Trancado' },
    CONCLUÍDO: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', label: 'Concluído' },
    DESISTENTE: { bg: 'bg-red-50', text: 'text-red-500', border: 'border-red-100', label: 'Desistente' },
  };
  const sc = statusConfig[data.status?.toUpperCase()] || statusConfig.INATIVO;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-[24px] border border-slate-200/60 p-6 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-blue-300/50 transition-all duration-300 group relative cursor-pointer flex flex-col h-full overflow-hidden"
    >
      <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      {/* Header */}
      <div className="flex justify-between items-start mb-4 relative z-20">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-blue-50 text-blue-600 flex items-center justify-center overflow-hidden border border-blue-100 shadow-sm shrink-0">
            <img
              src={data.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.nome)}&background=E0F2FE&color=2563EB&bold=true`}
              alt={data.nome}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <h3 className="line-clamp-1 text-xs font-bold leading-4 tracking-[-0.01em] text-slate-800 transition-colors group-hover:text-blue-600" title={data.nome}>
              {data.nome}
            </h3>
            <div className="text-[11px] text-slate-400 font-medium font-mono flex items-center gap-1.5 flex-wrap">
              {data.cpf && <span>{formattedCpf}</span>}
              {data.cpf && <span className="text-slate-300">•</span>}
              <span className="text-purple-650 font-semibold">
                {formatMatricula(data.id, data.createdAt, data.poloId)}
              </span>
            </div>
            {data.nomeSocial && (
              <div className="text-[10px] text-blue-500 font-semibold mt-0.5 truncate">Social: {data.nomeSocial}</div>
            )}
          </div>
        </div>

        <div ref={menuRef} className="relative" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 w-44 bg-white border border-slate-100 rounded-2xl shadow-xl shadow-slate-900/10 z-50 overflow-hidden ">
              <button
                onClick={() => { setMenuOpen(false); onClick?.(); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit3 size={13} className="text-slate-400" /> Ver / Editar
              </button>
              <button
                onClick={() => { setMenuOpen(false); toggleStatusMutation.mutate(); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {isAtivo
                  ? <><ToggleLeft size={13} className="text-orange-400" /> Inativar</>
                  : <><ToggleRight size={13} className="text-emerald-500" /> Ativar</>
                }
              </button>
              <div className="h-px bg-slate-100 mx-3" />
              <button
                onClick={() => { setMenuOpen(false); onDelete?.(); }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={13} /> Excluir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-3 relative z-10">
        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${sc.bg} ${sc.text} ${sc.border}`}>
          {sc.label}
        </span>
        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-semibold rounded-full border border-blue-100">
          <GraduationCap size={9} className="inline mr-1" />Aluno
        </span>
      </div>

      {/* Infos */}
      <div className="flex-1 space-y-2 relative z-10">
        {telefone && (
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Phone size={13} className="text-slate-400 shrink-0" />
            <span className="truncate font-medium">{formatPhone(telefone)}</span>
          </div>
        )}
        {data.email && (
          <div className="flex items-start gap-2 text-xs text-slate-600">
            <Mail size={13} className="mt-0.5 text-slate-400 shrink-0" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <span className="truncate font-medium" title={data.email}>{data.email}</span>
              <EmailConfirmationStatus
                status={data.emailConfirmationStatus}
                emailValidatedByManager={data.emailValidatedByManager}
              />
            </div>
          </div>
        )}
        {data.cidade && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <MapPin size={13} className="text-slate-400 shrink-0" />
            <span className="truncate">{data.cidade}{data.uf ? `/${data.uf}` : ''}</span>
          </div>
        )}
        {(data.nomeMae || data.nomePai) && (
          <div className="flex items-start gap-2 text-xs text-slate-500 pt-1">
            <Users size={13} className="text-slate-400 shrink-0 mt-0.5" />
            <div className="flex flex-col min-w-0">
              {data.nomeMae && <span className="truncate"><span className="text-[10px] font-semibold text-slate-400 mr-1">Mãe:</span>{data.nomeMae}</span>}
              {data.nomePai && <span className="truncate"><span className="text-[10px] font-semibold text-slate-400 mr-1">Pai:</span>{data.nomePai}</span>}
            </div>
          </div>
        )}

        <div className="pt-2">
          <div className={`flex items-start gap-2.5 rounded-xl border p-3 ${matriculaAtual ? 'border-blue-100 bg-blue-50/70' : 'border-slate-100 bg-slate-50'}`}>
            <BookOpen size={14} className={`mt-0.5 shrink-0 ${matriculaAtual ? 'text-blue-600' : 'text-slate-400'}`} />
            {matriculaAtual ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-slate-800" title={matriculaAtual.cursoNome}>
                  {matriculaAtual.cursoNome}
                </p>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500" title={matriculaAtual.turmaNome}>
                  Turma: {matriculaAtual.turmaNome}
                </p>
                {matriculasAluno.length > 1 && (
                  <p className="mt-1 text-[9px] font-bold text-blue-600">
                    +{matriculasAluno.length - 1} {matriculasAluno.length === 2 ? 'outro vínculo' : 'outros vínculos'}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] font-semibold text-slate-400">Sem curso ou turma vinculados</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between relative z-10">
        <span className="text-[10px] text-slate-400 font-medium">{data.poloNome || 'Matriz'}</span>
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-blue-600 transition-colors">
          Abrir <ChevronRight size={13} className="opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
        </div>
      </div>
    </div>
  );
};

export default AlunoCard;
