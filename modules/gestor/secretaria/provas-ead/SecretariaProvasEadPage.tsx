import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { getSecretariaErrorMessage } from '../shared/secretaria-error';
import { ProvasEadReleaseForm } from './ProvasEadReleaseForm';
import { useProvasEad } from './useProvasEad';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Maceio',
});

const actionClass = 'min-h-11 rounded-lg border border-[#dbe3ed] bg-white px-3 text-[13px] font-medium text-[#122b42] hover:border-blue-300 disabled:opacity-50 sm:min-h-[38px]';

interface Props {
  poloId: string;
  contextId: string;
}

export default function SecretariaProvasEadPage({ poloId, contextId }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState({ search: '', page: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const { toasts, removeToast, toast } = useToast();
  const { list, release } = useProvasEad(contextId, poloId, filter.search, filter.page);

  useEffect(() => {
    const nextSearch = search.trim();
    const timer = window.setTimeout(() => {
      setFilter(current => current.search === nextSearch ? current : { search: nextSearch, page: 1 });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const page = list.data?.page ?? filter.page;
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / (list.data?.pageSize ?? 1)));
  const changePage = (nextPage: number) => {
    setSelected(null);
    setFilter(current => ({ ...current, page: nextPage }));
  };

  return (
    <section aria-label="Matrículas aguardando a prova EAD" className="space-y-3">
      <label className="flex min-h-11 w-full max-w-sm items-center gap-2 rounded-lg border border-[#dbe3ed] bg-white px-3 text-[#607286] focus-within:outline focus-within:outline-2 focus-within:outline-blue-600 sm:min-h-[38px]">
        <Search size={15} aria-hidden="true" className="shrink-0" />
        <span className="sr-only">Buscar por aluno, curso ou turma</span>
        <input
          ref={searchInput}
          type="search"
          maxLength={80}
          value={search}
          placeholder="Buscar aluno, curso ou turma"
          onChange={event => { setSelected(null); setSearch(event.target.value); }}
          className="min-w-0 flex-1 bg-transparent text-base text-[#122b42] outline-none sm:text-[13px]"
        />
      </label>
      {list.isPending && <p role="status" className="text-xs text-[#607286]">Consultando provas…</p>}
      {list.error && <p role="alert" className="text-xs text-red-700">
        {getSecretariaErrorMessage(list.error, 'Não foi possível consultar as provas EAD.')}
      </p>}
      {!list.error && list.data?.items.length === 0 && <p className="rounded-xl border border-[#e3e9ee] bg-white px-4 py-5 text-[13px] text-[#607286]">
        {filter.search ? 'Nenhuma matrícula encontrada para esta busca.' : 'Nenhuma prova aguardando o prazo de sete dias neste polo.'}
      </p>}
      {!list.error && Boolean(list.data?.items.length) && (
        <ul className="divide-y divide-[#e3e9ee] overflow-hidden rounded-xl border border-[#e3e9ee] bg-white">
          {list.data?.items.map(item => (
            <li key={item.matriculaId}>
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0 break-words">
                  <p className="text-[13px] font-semibold text-[#122b42]">{item.alunoNome}</p>
                  <p className="text-xs text-[#607286]">{item.cursoNome} · {item.turmaNome}</p>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs text-[#607286]">
                  <div><dt>Início do estudo</dt><dd className="font-medium text-[#122b42]">
                    <time dateTime={item.iniciadoEm}>{dateTime.format(new Date(item.iniciadoEm))}</time>
                  </dd></div>
                  <div><dt>Liberação automática</dt><dd className="font-medium text-[#122b42]">
                    <time dateTime={item.liberaEm}>{dateTime.format(new Date(item.liberaEm))}</time>
                  </dd></div>
                </dl>
                <button type="button" className={`${actionClass} justify-self-start lg:justify-self-end`}
                  aria-label={`Liberar prova antes do prazo para ${item.alunoNome}`}
                  aria-expanded={selected === item.matriculaId}
                  disabled={release.isPending}
                  onClick={event => {
                    trigger.current = event.currentTarget;
                    release.reset();
                    setSelected(item.matriculaId);
                  }}>
                  Liberar antes do prazo
                </button>
              </div>
              {selected === item.matriculaId && (
                <ProvasEadReleaseForm
                  alunoNome={item.alunoNome}
                  pending={release.isPending}
                  error={release.error ? getSecretariaErrorMessage(release.error) : undefined}
                  onCancel={() => {
                    setSelected(null);
                    release.reset();
                    trigger.current?.focus();
                  }}
                  onSubmit={reason => release.mutate({ matriculaId: item.matriculaId, reason }, {
                    onSuccess: () => {
                      setSelected(null);
                      searchInput.current?.focus();
                      toast.success('Prazo da prova antecipado.');
                    },
                  })}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {!list.error && (pages > 1 || page > 1) && (
        <nav aria-label="Paginação de provas EAD" className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#607286]">
          <span>Página {page} de {pages} · {total} matrículas</span>
          <div className="flex gap-2">
            <button type="button" className={actionClass} disabled={page <= 1 || list.isFetching}
              onClick={() => changePage(Math.min(page - 1, pages))}>Anterior</button>
            <button type="button" className={actionClass} disabled={page >= pages || list.isFetching}
              onClick={() => changePage(page + 1)}>Próxima</button>
          </div>
        </nav>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </section>
  );
}
