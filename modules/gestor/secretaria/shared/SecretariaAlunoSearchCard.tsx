import React from 'react';
import { ChevronRight, UserRound } from 'lucide-react';
import { formatCpf } from '../../../../lib/documentFormatters';

interface SecretariaAlunoSearchCardProps {
  nome: string;
  cpf?: string | null;
  cursoNome?: string | null;
  turmaNome?: string | null;
  turmaCodigo?: string | null;
  matricula?: string | null;
  rg?: string | null;
  fotoUrl?: string | null;
  actionLabel?: string;
  statusLabel?: string;
  statusTone?: 'success' | 'warning' | 'neutral';
  tone?: 'blue' | 'cyan' | 'purple';
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const toneClasses = {
  blue: {
    border: 'hover:border-blue-300',
    active: 'border-blue-200 bg-blue-50/60',
    avatar: 'bg-blue-50 text-blue-700 border-blue-100',
    action: 'bg-blue-50 text-blue-700',
  },
  cyan: {
    border: 'hover:border-cyan-300',
    active: 'border-cyan-200 bg-cyan-50/60',
    avatar: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    action: 'bg-cyan-50 text-cyan-700',
  },
  purple: {
    border: 'hover:border-purple-300',
    active: 'border-purple-200 bg-purple-50/60',
    avatar: 'bg-purple-50 text-purple-700 border-purple-100',
    action: 'bg-purple-50 text-purple-700',
  },
};

const statusToneClasses = {
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  neutral: 'bg-slate-100 text-slate-600',
};

const InfoItem = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => (
  <span className="min-w-0">
    <span className="block text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</span>
    <strong className={`mt-0.5 block truncate text-[11px] font-black text-slate-700 ${mono ? 'font-mono' : ''}`}>
      {value || 'Não informado'}
    </strong>
  </span>
);

const SecretariaAlunoSearchCard: React.FC<SecretariaAlunoSearchCardProps> = ({
  nome,
  cpf,
  cursoNome,
  turmaNome,
  turmaCodigo,
  matricula,
  rg,
  fotoUrl,
  actionLabel = 'Selecionar',
  statusLabel,
  statusTone = 'success',
  tone = 'blue',
  selected = false,
  disabled = false,
  onClick,
}) => {
  const toneClass = toneClasses[tone];
  const turmaLabel = [turmaCodigo, turmaNome].filter(Boolean).join(' - ');
  const formattedCpf = formatCpf(cpf) || 'Não informado';

  const content = (
    <div
      className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-left shadow-sm transition-all ${
        selected ? toneClass.active : `border-slate-200 bg-white ${toneClass.border} hover:bg-slate-50`
      } ${disabled ? 'opacity-55' : ''}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border font-black ${toneClass.avatar}`}>
          {fotoUrl ? <img src={fotoUrl} alt="Foto do aluno" className="h-full w-full object-cover" /> : <UserRound size={18} />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black uppercase tracking-tight text-[#001a33]">{nome || 'Aluno sem nome'}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <InfoItem label="CPF" value={formattedCpf} mono />
            <InfoItem label="Curso" value={cursoNome} />
            <InfoItem label="Turma" value={turmaLabel || turmaNome} />
            <InfoItem label={matricula ? 'Matrícula' : 'RG'} value={matricula || rg} mono />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {statusLabel && (
          <span className={`hidden rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest md:inline-flex ${statusToneClasses[statusTone]}`}>
            {statusLabel}
          </span>
        )}
        {onClick && (
          <span className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest ${toneClass.action}`}>
            {actionLabel}
            <ChevronRight size={13} />
          </span>
        )}
      </div>
    </div>
  );

  if (!onClick) return content;

  return (
    <button type="button" disabled={disabled} onClick={onClick} className="block w-full text-left disabled:cursor-not-allowed">
      {content}
    </button>
  );
};

export default SecretariaAlunoSearchCard;
