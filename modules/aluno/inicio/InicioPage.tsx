import React from 'react';
import AlunoMobileHome from './components/AlunoMobileHome';
import AlunoDesktopHome from './components/AlunoDesktopHome';
import { useAlunoHomeData, type InicioPageProps } from './useAlunoHomeData';

const InicioPage: React.FC<InicioPageProps> = (props) => {
  const { canViewCalendar, onNavigate } = props;
  const data = useAlunoHomeData(props);
  const { bibliotecaCount, bibliotecaCountError, chatsCount, chatsCountError, enrollmentSummaryError, financeiroError, financeiroResumo, handleOpenQuickAccessCourse, hasHomeDataError, isMobileLayout, loadingFinanceiro, loadingProximosEventos, matriculasCount, matriculasError, proximosEventos, proximosEventosError, quickAccessCourses, retryHomeData } = data;
  return (
    <>
      {isMobileLayout ? <AlunoMobileHome
        bibliotecaCount={bibliotecaCountError ? null : bibliotecaCount}
        canViewCalendar={canViewCalendar}
        chatsCount={chatsCountError ? null : chatsCount}
        loadingCourses={data.loadingMatriculas}
        courseDataError={matriculasError || enrollmentSummaryError}
        financeDataError={financeiroError}
        hasDataError={hasHomeDataError}
        financeiroResumo={financeiroResumo}
        loadingFinanceiro={loadingFinanceiro}
        loadingProximosEventos={loadingProximosEventos}
        matriculasCount={data.loadingEnrollmentSummary ? null : matriculasCount}
        pendingTechnical={data.enrollmentSummary.pendingTechnical}
        primaryCourse={quickAccessCourses[0]}
        proximosEventos={proximosEventos}
        onNavigate={onNavigate}
        onOpenCourse={handleOpenQuickAccessCourse}
        onRetry={retryHomeData}
        scheduleDataError={proximosEventosError}
      /> : null}

      {!isMobileLayout ? <AlunoDesktopHome data={data} canViewCalendar={canViewCalendar} onNavigate={onNavigate} /> : null}
    </>
  );
};

export default InicioPage;
