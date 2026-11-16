import React, { useEffect, useState } from 'react';
import { Plus, Search, Ticket } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { isEadCouponsEnvironmentAllowed } from '../../../ead/cupons/coupons-environment';
import { useEadCouponsAvailability } from '../../../ead/cupons/hooks/useEadCouponsAvailability';
import type { EadCoupon, EadCouponDraft } from '../../../ead/cupons/coupons-management.types';
import { CuponsEadList } from './components/CuponsEadList';
import { CuponsPagination } from './components/CuponsPagination';
import { CupomHistoryDialog } from './components/CupomHistoryDialog';
import { CupomEadForm } from './formularios/CupomEadForm';
import { useCuponsEadCourses, useCuponsEadHistory, useCuponsEadList } from './hooks/useCuponsEadQueries';
import { useSaveCupomEad } from './hooks/useCuponsEadMutations';
import { useCuponsEadRealtime } from './hooks/useCuponsEadRealtime';
import './cupons-ead.css';

export interface CuponsEadPageProps { poloId?: string | null; canManage: boolean; contextId?: string; showHeading?: boolean }

function useDebouncedSearch(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), 250); return () => window.clearTimeout(timer); }, [value]);
  return debounced;
}

const CuponsEadWorkspace: React.FC<{ poloId: string; contextId: string; showHeading: boolean }> = ({ poloId, contextId, showHeading }) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ coupon: EadCoupon | null } | null>(null);
  const [history, setHistory] = useState<EadCoupon | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [courseSearch, setCourseSearch] = useState('');
  const { toasts, removeToast, toast } = useToast();
  const list = useCuponsEadList(poloId, contextId, useDebouncedSearch(search), page, true);
  const courses = useCuponsEadCourses(poloId, contextId, useDebouncedSearch(courseSearch), Boolean(form));
  const usages = useCuponsEadHistory(poloId, contextId, history?.id || '', historyPage, Boolean(history));
  const save = useSaveCupomEad(poloId, contextId);
  useCuponsEadRealtime(poloId, contextId, true);
  const openForm = (coupon: EadCoupon | null) => { save.reset(); setCourseSearch(''); setForm({ coupon }); };
  const submit = (coupon: EadCouponDraft, requestId: string) => save.mutate({ poloId, coupon, requestId }, {
    onSuccess: () => { setForm(null); toast.success('Cupom salvo'); },
  });
  const createAction = <button type="button" className="cupom-primary" onClick={() => openForm(null)}><Plus size={16} />Novo cupom</button>;
  return <section className="cupons-ead" aria-label="Cupons EAD">
    {showHeading && <header className="cupons-ead-header"><div><h2><Ticket size={20} />Cupons EAD</h2><p>Gerencie benefícios, disponibilidade e utilizações por aluno.</p></div>
      {createAction}</header>}
    <div className="cupons-ead-toolbar"><label className="cupons-search"><Search size={16} /><span className="sr-only">Buscar cupom</span>
      <input type="search" value={search} maxLength={80} placeholder="Buscar pelo código do cupom" onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {!showHeading && createAction}
      {list.isFetching && <span role="status" className="cupom-help">Carregando cupons…</span>}</div>
    {list.error && <p role="alert" className="cupom-error">{list.error.message}</p>}
    {!list.isPending && !list.error && list.data?.items.length === 0 && <div className="cupons-empty">{search ? 'Nenhum cupom encontrado para esta busca.' : 'Nenhum cupom cadastrado neste polo.'}</div>}
    {!list.error && list.data && <>
      <CuponsEadList items={list.data.items} onEdit={openForm} onHistory={coupon => { setHistory(coupon); setHistoryPage(1); }} />
      <CuponsPagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} pending={list.isFetching} onChange={setPage} />
    </>}
    {form && <CupomEadForm key={form.coupon?.id || 'new'} coupon={form.coupon} courses={courses.data || []} coursesLoading={courses.isFetching}
      coursesError={courses.error?.message} pending={save.isPending} error={save.error?.message} onCourseSearch={setCourseSearch}
      onClose={() => { if (!save.isPending) setForm(null); }} onSubmit={submit} />}
    {history && <CupomHistoryDialog coupon={history} data={usages.data} loading={usages.isFetching} error={usages.error?.message}
      onClose={() => setHistory(null)} onPage={setHistoryPage} />}
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </section>;
}

export default function CuponsEadPage({ poloId, canManage, contextId = 'gestor', showHeading = true }: CuponsEadPageProps) {
  const available = useEadCouponsAvailability(contextId, canManage && Boolean(poloId));
  if (!canManage) return <p role="alert" className="cupom-error">É necessário acesso à Secretaria e ao Financeiro para administrar cupons.</p>;
  if (!isEadCouponsEnvironmentAllowed()) return <p role="status">Cupons EAD indisponíveis nesta conexão.</p>;
  if (!poloId) return <p role="status">Selecione um polo para administrar os cupons EAD.</p>;
  if (!available) return <p role="status">Cupons EAD indisponíveis no momento.</p>;
  return <CuponsEadWorkspace key={`${contextId}:${poloId}`} poloId={poloId} contextId={contextId} showHeading={showHeading} />;
}
