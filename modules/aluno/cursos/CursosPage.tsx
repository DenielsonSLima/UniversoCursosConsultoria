import React, { useEffect, useState } from 'react';
import { EadCertificatePdfView, useEadCertificatePdf } from '../../gestor/secretaria/certificados/useEadCertificatePdf';
import { defaultEadCheckoutMethod, resolveEadCheckoutOptions } from './eadCheckoutOptions';
import CourseCatalogView from './components/CourseCatalogView';
import EadCourseRoom from './components/EadCourseRoom';
import { useAlunoCoursesCatalog } from './hooks/useAlunoCoursesCatalog';
import { useCourseCheckout } from './hooks/useCourseCheckout';
import { useEadLearning } from './hooks/useEadLearning';
import type { CursosPageProps } from './cursosPage.types';
import { hasEadAccess } from './cursosPage.utils';

const CursosPage: React.FC<CursosPageProps> = ({
  alunoId,
  initialCourseId,
  onExitCourse,
  onRequireTechnicalProfile,
  onOpenEnrollment,
}) => {
  const catalog = useAlunoCoursesCatalog(alunoId);
  const {
    queryClient,
    hasAlunoContext,
    courses,
    invalidateStudentCourseAccess,
    loadingTechnicalEnrollmentProfile,
    technicalEnrollmentMissingFields,
    setActiveTab,
  } = catalog;
  const selectedCourseOwnerId = alunoId || '';
  const [selectedCourseContext, setSelectedCourseContext] = useState<{
    alunoId: string;
    course: any;
  } | null>(null);
  const selectedCourse = selectedCourseContext?.alunoId === selectedCourseOwnerId
    ? selectedCourseContext.course
    : null;
  const setSelectedCourse = React.useCallback((course: any | null) => {
    setSelectedCourseContext(course ? { alunoId: selectedCourseOwnerId, course } : null);
  }, [selectedCourseOwnerId]);
  const [selectedTurmaByCourse, setSelectedTurmaByCourse] = useState<Record<string, string>>({});
  const initialCheckoutCourseRef = React.useRef<string | null>(null);

  useEffect(() => {
    setSelectedCourseContext(null);
    initialCheckoutCourseRef.current = null;
  }, [selectedCourseOwnerId]);

  const checkout = useCourseCheckout({
    alunoId,
    hasAlunoContext,
    queryClient,
    loadingTechnicalEnrollmentProfile,
    technicalEnrollmentMissingFields,
    invalidateStudentCourseAccess,
  });
  const {
    eadCheckoutReview,
    setEadCheckoutReview,
    setEadPaymentMethod,
    setEadInstallments,
  } = checkout;

  const eadLearning = useEadLearning({ alunoId, hasAlunoContext, selectedCourse, queryClient });
  const {
    activeLearningTab,
    setActiveLearningTab,
    quizError,
    flushActivityAnswerDrafts,
    showCompletedLessons,
    setShowCompletedLessons,
    conteudos,
    summary,
    quizPassed,
    progressPercent,
    completedAtDate,
    startedAtDate,
    completedLessonCount,
    alunoCertificado,
    certificateStatusTitle,
    certificateStatusMessage,
    eadCertificateModel,
    certificateModelLoading,
    certificateModelError,
    isProgressReady,
    isProgressLoading,
    isProgressRefreshing,
    progressQueryError,
    retryProgress,
    isUpdatingProgress,
  } = eadLearning;
  const certificateModelUnavailable = certificateModelLoading || Boolean(certificateModelError);
  const certificatePdf = useEadCertificatePdf(alunoCertificado || null, eadCertificateModel,
    Boolean(alunoCertificado && !certificateModelUnavailable));
  const isDownloadingCertificate = !certificatePdf.ready || certificatePdf.printing;
  const downloadCertificatePdf = certificatePdf.download;
  const printCertificate = certificatePdf.print;


  useEffect(() => {
    if (!initialCourseId || courses.length === 0) return;
    const course = courses.find(item => item.id === initialCourseId);
    if (!course) return;

    const modality = String(course.modalidade || '').toUpperCase();
    if (modality === 'EAD') {
      setActiveTab('ead');
      if (hasEadAccess(course)) {
        if (selectedCourse?.id !== initialCourseId) setSelectedCourse(course);
        return;
      }
      if (initialCheckoutCourseRef.current !== initialCourseId && eadCheckoutReview?.course?.id !== initialCourseId) {
        const options = resolveEadCheckoutOptions(course);
        const initialMethod = defaultEadCheckoutMethod(options);
        setEadPaymentMethod(initialMethod);
        setEadInstallments(initialMethod === 'CREDIT_CARD' ? options.parcelasPadrao : 1);
        setEadCheckoutReview({ course });
        initialCheckoutCourseRef.current = initialCourseId;
      }
      return;
    }

    if (modality === 'LIVRE') setActiveTab('live');
    if (modality === 'ESPECIALIZACAO') setActiveTab('especializacao');
    if (modality === 'TECNICO') setActiveTab('tecnico');
  }, [courses, eadCheckoutReview?.course?.id, initialCourseId, selectedCourse?.id, setSelectedCourse]);

  useEffect(() => {
    if (!selectedCourse?.id || courses.length === 0) return;
    const updatedCourse = courses.find(item => item.id === selectedCourse.id);
    if (updatedCourse && String(updatedCourse.modalidade || '').toUpperCase() === 'EAD'
      && !hasEadAccess(updatedCourse)) {
      setSelectedCourse(null);
      return;
    }
    if (updatedCourse && updatedCourse !== selectedCourse) {
      setSelectedCourse(updatedCourse);
    }
  }, [courses, selectedCourse, setSelectedCourse]);

  const renderCertificatePdfSource = () => certificatePdf.source;
  const renderCertificatePreview = () => {
    if (!alunoCertificado) return null;
    if (certificateModelUnavailable) return (
      <p role={certificateModelError ? 'alert' : 'status'} className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-700">
        {certificateModelError || 'Atualizando o modelo do certificado...'}
      </p>
    );
    return <div className="mt-5"><EadCertificatePdfView {...certificatePdf} /></div>;
  };

  const closeSelectedCourse = async () => {
    if (isUpdatingProgress) return;
    if (!await flushActivityAnswerDrafts()) return;
    setSelectedCourse(null);
    onExitCourse?.();
  };

  if (selectedCourse) {
    const learningView = {
      ...eadLearning,
      selectedCourse,
      isDownloadingCertificate: isDownloadingCertificate || certificateModelUnavailable,
      printCertificate,
      downloadCertificatePdf,
      renderCertificatePreview,
    };

    return (
      <EadCourseRoom view={{
        selectedCourse,
        alunoCertificado,
        startedAtDate,
        completedAtDate,
        quizPassed,
        showCompletedLessons,
        renderCertificatePdfSource,
        closeSelectedCourse,
        setActiveLearningTab,
        setShowCompletedLessons,
        summary,
        certificateStatusTitle,
        certificateStatusMessage,
        printCertificate,
        downloadCertificatePdf,
        isDownloadingCertificate: isDownloadingCertificate || certificateModelUnavailable,
        renderCertificatePreview,
        progressPercent,
        completedLessonCount,
        conteudos,
        activeLearningTab,
        isProgressReady,
        isProgressLoading,
        isProgressRefreshing,
        progressQueryError,
        retryProgress,
        progressMutationError: quizError,
        isUpdatingProgress,
        learningView,
      }} />
    );
  }

  return (
    <CourseCatalogView view={{
      ...catalog,
      ...checkout,
      onRequireTechnicalProfile,
      selectedTurmaByCourse,
      setSelectedTurmaByCourse,
      setSelectedCourse,
      onOpenEnrollment,
    }} />
  );
};

export default CursosPage;

