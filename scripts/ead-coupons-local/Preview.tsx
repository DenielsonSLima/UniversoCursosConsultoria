import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import CuponsEadPage from '../../modules/gestor/secretaria/cupons-ead/CuponsEadPage';
import EadCheckoutReviewModal from '../../modules/aluno/cursos/components/EadCheckoutReviewModal';
import { useCourseCheckout } from '../../modules/aluno/cursos/hooks/useCourseCheckout';
import { previewRequest, setPreviewIdentity, type PreviewIdentity } from './transport';
import '../../modules/aluno/cursos/components/aluno-courses-compact.css';
import './preview.css';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
interface State {
  poloId: string; alunoId: string | null;
  courses: { id: string; nome: string; valor: number; turmaId: string }[];
  enrollments: { id: string; status: string; courseId: string }[];
  payments: { id: string; status: string; amount: number; courseName: string; redemptionStatus: string }[];
}

const StudentPreview: React.FC<{ state: State; refresh: () => void }> = ({ state, refresh }) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const view = useCourseCheckout({ alunoId: state.alunoId!, hasAlunoContext: true, queryClient,
    loadingTechnicalEnrollmentProfile: false, technicalEnrollmentMissingFields: [], invalidateStudentCourseAccess: refresh });
  const simulate = async (id: string) => {
    setPending(id); setError('');
    try { await previewRequest('/api/simulate-payment', { receivableId: id }); refresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha na simulação local.'); }
    finally { setPending(''); }
  };
  return <section className="preview-student"><h2>Compra EAD · aluno fictício</h2>
    <p>Use <strong>LOCALGRATIS</strong> ou <strong>LOCAL50</strong> na confirmação. Os valores vêm do banco em memória.</p>
    {view.eadPaymentConfirmation && <p role="status" className="preview-success">{view.eadPaymentConfirmation}</p>}
    {view.checkoutError && <p role="alert" className="preview-error">{view.checkoutError}</p>}
    <div className="preview-courses">{state.courses.map(course => {
      const enrollment = state.enrollments.find(item => item.courseId === course.id);
      return <article key={course.id}><h3>{course.nome}</h3><p>{money(course.valor)}</p>
        <p>{enrollment ? `Matrícula: ${enrollment.status}` : 'Sem matrícula'}</p>
        <button type="button" disabled={Boolean(enrollment)} onClick={() => {
          view.openEadCheckoutReview({ ...course, modalidade: 'EAD' }); view.setEadPaymentMethod('PIX');
        }}>{enrollment?.status === 'ATIVO' ? 'Curso liberado' : enrollment ? 'Compra iniciada' : 'Comprar com cupom'}</button>
      </article>;
    })}</div>
    {state.payments.length > 0 && <div className="preview-payments"><h3>Cobranças fictícias · não pagáveis</h3>
      {state.payments.map(payment => <article key={payment.id}><div><strong>{payment.courseName}</strong>
        <p>{money(payment.amount)} · {payment.status} · utilização {payment.redemptionStatus}</p></div>
        {payment.redemptionStatus === 'RESERVED' && <button type="button" disabled={Boolean(pending)} onClick={() => simulate(payment.id)}>
          {pending === payment.id ? 'Simulando…' : 'Simular pagamento fictício'}</button>}</article>)}
    </div>}
    {error && <p role="alert" className="preview-error">{error}</p>}
    {view.eadCheckoutReview && <EadCheckoutReviewModal view={view} />}
  </section>;
};

function Preview() {
  const [identity, setIdentity] = useState<PreviewIdentity>('manager');
  const queryClient = useQueryClient();
  const query = useQuery<State>({ queryKey: ['preview-state', identity], queryFn: ({ signal }) => previewRequest('/api/state', undefined, signal) });
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: ['preview-state', identity] }); };
  useEffect(() => {
    const changed = () => { void queryClient.invalidateQueries({ queryKey: ['preview-state'] }); };
    window.addEventListener('local-coupons-changed', changed);
    return () => window.removeEventListener('local-coupons-changed', changed);
  }, [queryClient]);
  return <main className="preview-shell"><header className="preview-header"><h1>Cupons EAD · prévia local</h1>
    <p>Todos os alunos, cursos, cupons e pagamentos são fictícios. O banco é descartado ao encerrar esta prévia.</p></header>
    <nav className="preview-nav" aria-label="Perfil fictício">
      {(['manager', 'student-1', 'student-2', 'student-3', 'student-4'] as PreviewIdentity[]).map(value =>
        <button type="button" key={value} aria-pressed={identity === value} onClick={() => {
          setPreviewIdentity(value); setIdentity(value);
        }}>{value === 'manager' ? 'Secretaria' : `Aluno fictício ${value.split('-')[1]}`}</button>)}
    </nav>
    {query.isPending && <p role="status">Preparando dados fictícios…</p>}
    {query.error && <p role="alert" className="preview-error">{query.error.message}</p>}
    {query.data && (identity === 'manager'
      ? <CuponsEadPage poloId={query.data.poloId} contextId="local-preview-manager" canManage />
      : <StudentPreview key={identity} state={query.data} refresh={refresh} />)}
  </main>;
}

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><Preview /></QueryClientProvider>);
