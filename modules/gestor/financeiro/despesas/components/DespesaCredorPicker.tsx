import FinancialSelect from '../../components/FinancialSelect';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  GraduationCap,
  Plus,
  Search,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { textMatchesSearch } from '../../../../../lib/search';

export type DespesaCredorTipo = 'Aluno' | 'Professor' | 'PJ' | 'PF';

interface DespesaCredorPickerProps {
  parceiros: any[];
  tipo: DespesaCredorTipo | '';
  value: string;
  onTipoChange: (tipo: DespesaCredorTipo | '') => void;
  onChange: (id: string) => void;
  onNovo?: () => void;
  tipoLabel?: string;
  pessoaLabel?: string;
  emptyLabel?: string;
  accent?: 'rose' | 'emerald';
  required?: boolean;
}

const credorTipos: {
  value: DespesaCredorTipo;
  label: string;
  shortLabel: string;
  Icon: React.ElementType;
}[] = [
  { value: 'Aluno', label: 'Aluno', shortLabel: 'Alunos', Icon: GraduationCap },
  { value: 'Professor', label: 'Professor', shortLabel: 'Professores', Icon: UsersRound },
  { value: 'PJ', label: 'Pessoa Jurídica', shortLabel: 'Pessoa jurídica', Icon: Building2 },
  { value: 'PF', label: 'Pessoa Física (CPF)', shortLabel: 'Pessoa física', Icon: UserRound },
];

const formatDocument = (value?: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }
  return value || 'Documento não informado';
};

const CredorAvatar: React.FC<{
  parceiro?: any;
  tipo: DespesaCredorTipo | '';
  Icon?: React.ElementType;
  selected?: boolean;
  compact?: boolean;
  accent?: 'rose' | 'emerald';
}> = ({ parceiro, tipo, Icon, selected, compact, accent = 'rose' }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const logoUrl = parceiro?.foto_url || parceiro?.foto;
  const showLogo = tipo === 'PJ' && logoUrl && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl]);

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden border shadow-sm ${
      compact ? 'h-7 w-7 rounded-lg' : 'h-9 w-9 rounded-xl'
    } ${
      showLogo
        ? 'border-slate-200 bg-white'
        : selected
          ? accent === 'emerald'
            ? 'border-emerald-100 bg-emerald-100 text-emerald-700'
            : 'border-rose-100 bg-rose-100 text-rose-600'
          : 'border-slate-200 bg-slate-100 text-slate-500'
    }`}>
      {showLogo ? (
        <img
          src={logoUrl}
          alt={`Logo de ${parceiro.nome}`}
          className="h-full w-full bg-white object-contain p-1"
          onError={() => setImageFailed(true)}
        />
      ) : Icon ? (
        <Icon size={compact ? 14 : 16} />
      ) : null}
    </div>
  );
};

const DespesaCredorPicker: React.FC<DespesaCredorPickerProps> = ({
  parceiros,
  tipo,
  value,
  onTipoChange,
  onChange,
  onNovo,
  tipoLabel = 'Tipo de credor',
  pessoaLabel = 'Credor',
  emptyLabel = 'Nenhum credor',
  accent = 'rose',
  required = false,
}) => {
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<React.ElementRef<'button'>>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const tipoConfig = credorTipos.find((item) => item.value === tipo);
  const parceirosDoTipo = useMemo(
    () => parceiros.filter((parceiro) => parceiro.tipo === tipo),
    [parceiros, tipo],
  );
  const selected = parceirosDoTipo.find((parceiro) => parceiro.id === value);
  const filtered = useMemo(() => {
    if (!search.trim()) return parceirosDoTipo;
    return parceirosDoTipo.filter((parceiro) => textMatchesSearch(search, [
      parceiro.nome,
      parceiro.cpf_cnpj,
    ]));
  }, [parceirosDoTipo, search]);
  const accentClasses = accent === 'emerald'
    ? {
        focus: 'focus:ring-emerald-500',
        selectedBackground: 'bg-emerald-50',
        selectedIcon: 'text-emerald-600',
      }
    : {
        focus: 'focus:ring-rose-500',
        selectedBackground: 'bg-rose-50',
        selectedIcon: 'text-rose-600',
      };

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: Event) => {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const selectCredor = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
    triggerRef.current?.focus();
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:col-span-2">
      <div>
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
          {tipoLabel}{required ? ' *' : ''}
        </label>
        <div className="relative">
          <FinancialSelect value={tipo} onValueChange={(nextTipo) => {
            onTipoChange(nextTipo as DespesaCredorTipo | '');
            onChange('');
            setSearch('');
            setOpen(false);
          }} ariaLabel={tipoLabel} placeholder={required ? 'Selecionar tipo...' : 'Selecionar tipo (opcional)...'}
            options={[{ value: '', label: required ? 'Selecionar tipo...' : 'Selecionar tipo (opcional)...' },
              ...credorTipos.map((option) => ({ value: option.value, label: option.label }))]} className="w-full" />
        </div>
      </div>

      <div
        ref={pickerRef}
        className="relative"
      >
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-400">
          {tipoConfig ? tipoConfig.shortLabel : pessoaLabel}{required ? ' *' : ''}
        </label>
        <div className="flex items-stretch gap-2">
          <button
            ref={triggerRef}
            type="button"
            disabled={!tipo}
            onClick={() => setOpen((current) => !current)}
            className={`flex min-w-0 flex-1 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold outline-none transition-all focus:ring-2 ${accentClasses.focus} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {selected ? (
                <CredorAvatar
                  key={selected.id}
                  parceiro={selected}
                  tipo={tipo}
                  Icon={tipoConfig?.Icon}
                  selected
                  compact
                  accent={accent}
                />
              ) : null}
              <span className="truncate">
                {selected?.nome || (tipo ? `Selecionar entre ${parceirosDoTipo.length}...` : 'Selecione o tipo primeiro...')}
              </span>
            </span>
            <ChevronDown size={15} className="ml-2 shrink-0 text-slate-400" />
          </button>
          {onNovo ? <button type="button" disabled={!tipo}
            onClick={() => { setOpen(false); onNovo(); }}
            aria-label="Cadastrar novo credor"
            className="flex shrink-0 items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus size={14} />Novo
          </button> : null}
        </div>

        {open && tipo ? (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
            <div className="border-b border-slate-100 p-2.5">
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  autoFocus
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Buscar ${tipoConfig?.shortLabel.toLocaleLowerCase('pt-BR')} por nome ou documento...`}
                  className={`w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-semibold outline-none focus:ring-2 ${accentClasses.focus}`}
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto p-1.5 overscroll-contain">
              {!required ? (
                <button
                  type="button"
                  onClick={() => selectCredor('')}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-slate-400 transition-colors hover:bg-slate-50"
                >
                  {emptyLabel}
                </button>
              ) : null}
              {filtered.map((parceiro) => (
                <button
                  key={parceiro.id}
                  type="button"
                  onClick={() => selectCredor(parceiro.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    parceiro.id === value ? accentClasses.selectedBackground : 'hover:bg-slate-50'
                  }`}
                >
                  <CredorAvatar
                    parceiro={parceiro}
                    tipo={tipo}
                    Icon={tipoConfig?.Icon}
                    selected={parceiro.id === value}
                    accent={accent}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-black text-slate-700">{parceiro.nome}</p>
                    <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400">
                      {formatDocument(parceiro.cpf_cnpj)}
                    </p>
                  </div>
                  {parceiro.id === value ? <Check size={15} className={`shrink-0 ${accentClasses.selectedIcon}`} /> : null}
                </button>
              ))}
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-xs font-bold text-slate-500">Nenhum cadastro encontrado</p>
                  <p className="mt-1 text-[10px] text-slate-400">Revise a busca ou escolha outro tipo.</p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DespesaCredorPicker;
