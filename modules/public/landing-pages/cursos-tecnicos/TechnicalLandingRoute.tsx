import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getTechnicalLandingConfig } from './technicalLanding.registry';
import { technicalLandingService } from './technicalLanding.service';
import { technicalLandingKeys } from './technicalLanding.keys';
import type { TechnicalEnrollmentPayload } from './technicalLanding.types';
import { useTechnicalEnrollmentController } from './useTechnicalEnrollmentController';
import TechnicalLandingLayout from './shared/TechnicalLandingLayout';

interface TechnicalLandingRouteProps {
  isAuthenticated?: boolean;
  isSubmitting?: boolean;
  onSubmitEnrollment?: (payload: TechnicalEnrollmentPayload) => Promise<void> | void;
  onRequireAuthentication?: (returnPath: string) => void;
}

const LoadingState = () => (
  <div className="flex min-h-[65vh] items-center justify-center bg-slate-50">
    <div className="text-center">
      <Loader2 className="mx-auto animate-spin text-blue-600" size={40} />
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-slate-500">
        Carregando turma técnica
      </p>
    </div>
  </div>
);

const TechnicalLandingRoute: React.FC<TechnicalLandingRouteProps> = ({
  isAuthenticated = false,
  isSubmitting = false,
  onSubmitEnrollment,
  onRequireAuthentication,
}) => {
  const { turmaId } = useParams<{ turmaId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const internalEnrollment = useTechnicalEnrollmentController();
  const returnPath = `${location.pathname}${location.search}`;
  const query = useQuery({
    queryKey: technicalLandingKeys.detail(turmaId),
    queryFn: () => technicalLandingService.getPublishedClass(turmaId || ''),
    enabled: Boolean(turmaId),
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
  const loadedTurmaId = query.data?.turma.id;

  React.useEffect(() => {
    if (!loadedTurmaId || internalEnrollment.isCheckingAuth) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('technical-landing-title')?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [internalEnrollment.isCheckingAuth, loadedTurmaId]);

  if (query.isLoading || (!isAuthenticated && internalEnrollment.isCheckingAuth)) {
    return <><Header /><LoadingState /><Footer /></>;
  }

  if (query.isError || !query.data) {
    const message = query.error instanceof Error
      ? query.error.message
      : 'Não foi possível abrir esta turma técnica.';
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <Header />
        <main className="flex flex-1 items-center justify-center px-6 py-20">
          <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl">
            <AlertCircle className="mx-auto text-red-500" size={42} />
            <h1 className="mt-4 text-2xl font-black text-[#001a33]">Turma indisponível</h1>
            <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">{message}</p>
            <button
              type="button"
              onClick={() => navigate('/cursos-tecnicos')}
              className="mt-6 rounded-xl bg-[#001a33] px-6 py-3 text-xs font-black uppercase tracking-widest text-white"
            >
              Ver cursos técnicos
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const landingConfig = getTechnicalLandingConfig(
    query.data.course.name,
    query.data.course.landingTemplateKey,
  );
  const requireAuthentication = () => {
    if (onRequireAuthentication) {
      onRequireAuthentication(returnPath);
      return;
    }
    navigate(`/login?mode=cadastro&redirect=${encodeURIComponent(returnPath)}`);
  };

  return (
    <TechnicalLandingLayout
      data={query.data}
      config={landingConfig}
      enrollment={{
        isAuthenticated: isAuthenticated || internalEnrollment.isAuthenticated,
        isSubmitting: isSubmitting || internalEnrollment.isSubmitting,
        onRequireAuthentication: requireAuthentication,
        onSubmit: onSubmitEnrollment || internalEnrollment.submit,
      }}
    />
  );
};

export default TechnicalLandingRoute;
