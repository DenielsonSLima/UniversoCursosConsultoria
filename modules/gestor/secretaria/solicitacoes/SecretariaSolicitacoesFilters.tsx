import { ArrowUpDown, Search } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';

interface SecretariaSolicitacoesFiltersProps {
  search: string;
  type: string;
  status?: string;
  sort: 'asc' | 'desc';
  onSearchChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onSort: () => void;
}

const documentOptions = [
  { value: 'todos', label: 'Todos os tipos' },
  { value: 'Histórico Escolar', label: 'Histórico Escolar' },
  { value: 'Declaração IRPF', label: 'Declaração IRPF' },
  { value: 'Transferência', label: 'Transferência' },
];
const statusOptions = [
  { value: 'todos', label: 'Todos os status' },
  { value: 'Deferido', label: 'Deferido' },
  { value: 'Indeferido', label: 'Indeferido' },
];

const SecretariaSolicitacoesFilters = ({
  search, type, status, sort, onSearchChange, onTypeChange, onStatusChange, onSort,
}: SecretariaSolicitacoesFiltersProps) => (
  <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/40 p-4 sm:flex-row sm:flex-wrap sm:items-center">
    <label className="relative min-w-0 flex-1 sm:max-w-72">
      <span className="sr-only">Buscar solicitações por nome ou matrícula</span>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
      <input
        type="search"
        placeholder="Buscar por nome ou matrícula..."
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        className="h-[38px] w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[13px] font-normal text-slate-700 outline-none focus:border-blue-400"
      />
    </label>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
      {status !== undefined && onStatusChange ? (
        <InstitutionalSelect
          ariaLabel="Status das solicitações"
          value={status}
          onValueChange={onStatusChange}
          options={statusOptions}
          className="sm:w-44"
        />
      ) : null}
      <InstitutionalSelect
        ariaLabel="Tipo das solicitações"
        value={type}
        onValueChange={onTypeChange}
        options={documentOptions}
        className="sm:w-48"
      />
      <button
        type="button"
        onClick={onSort}
        className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 transition-colors hover:border-blue-300"
      >
        <ArrowUpDown size={14} />
        {sort === 'asc' ? 'Mais antigos' : 'Mais recentes'}
      </button>
    </div>
  </div>
);

export default SecretariaSolicitacoesFilters;
