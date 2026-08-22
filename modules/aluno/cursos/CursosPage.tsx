import React, { useEffect, useState } from 'react';
import { waitForDocumentAssets } from '../../shared/qrcode/document-assets';
import {
  buildSelectablePdfBlobFromElements,
  downloadPdfBlob,
} from '../../shared/pdf/dom-to-selectable-pdf';
import { ZoomIn, ZoomOut } from 'lucide-react';
import CertificadoPreview from '../../gestor/secretaria/certificados/components/CertificadoPreview';
import { defaultEadCheckoutMethod, resolveEadCheckoutOptions } from './eadCheckoutOptions';
import CourseCatalogView from './components/CourseCatalogView';
import EadCourseRoom from './components/EadCourseRoom';
import { useAlunoCoursesCatalog } from './hooks/useAlunoCoursesCatalog';
import { useCourseCheckout } from './hooks/useCourseCheckout';
import { useEadLearning } from './hooks/useEadLearning';
import type { CursosPageProps } from './cursosPage.types';
import { getCertificateFileName, hasEadAccess } from './cursosPage.utils';

const A4_LANDSCAPE_PREVIEW_WIDTH_PX = 1123;
const A4_LANDSCAPE_PREVIEW_HEIGHT_PX = 794;
const CERTIFICATE_PREVIEW_GAP_PX = 24;
const CERTIFICATE_PDF_PAGE_SELECTOR = '[data-certificate-pdf-page="true"]';
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
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);
  const [certificateZoom, setCertificateZoom] = useState(65);
  const [selectedTurmaByCourse, setSelectedTurmaByCourse] = useState<Record<string, string>>({});
  const certificatePdfSourceRef = React.useRef<HTMLDivElement>(null);
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
    eadGradeCurricular,
    alunoCertificado,
    certificateStatusTitle,
    certificateStatusMessage,
    eadCertificateModel,
    isProgressReady,
    isProgressLoading,
    isProgressRefreshing,
    progressQueryError,
    retryProgress,
    isUpdatingProgress,
  } = eadLearning;

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

  const buildCertificatePdfBlob = async () => {
    if (!certificatePdfSourceRef.current || !alunoCertificado) return null;

    await waitForDocumentAssets(certificatePdfSourceRef.current);
    const pages = Array.from(
      certificatePdfSourceRef.current.querySelectorAll<HTMLElement>(CERTIFICATE_PDF_PAGE_SELECTOR),
    );
    const captureTargets = pages.length ? pages : [certificatePdfSourceRef.current];
    return buildSelectablePdfBlobFromElements(captureTargets, {
      orientation: 'landscape',
      artworkFormat: 'PNG',
      artworkScale: 2,
      title: `Certificado - ${alunoCertificado.curso?.nome || selectedCourse?.nome || 'Curso'}`,
      subject: 'Certificado acadêmico',
    });
  };

  const downloadCertificatePdf = async () => {
    if (!alunoCertificado) return;

    setIsDownloadingCertificate(true);
    try {
      const pdfBlob = await buildCertificatePdfBlob();
      if (!pdfBlob) return;
      downloadPdfBlob(
        pdfBlob,
        getCertificateFileName(alunoCertificado.curso?.nome || selectedCourse?.nome),
      );
    } catch (error) {
      console.error('Erro ao baixar certificado em PDF:', error);
      alert('Não foi possível baixar o certificado em PDF agora.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  const printCertificate = async () => {
    if (!alunoCertificado) return;

    setIsDownloadingCertificate(true);
    try {
      const pdfBlob = await buildCertificatePdfBlob();
      if (!pdfBlob) return;
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = pdfUrl;
      iframe.onload = () => {
        window.setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        }, 250);
      };
      document.body.appendChild(iframe);
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(pdfUrl);
      }, 60000);
    } catch (error) {
      console.error('Erro ao imprimir certificado em PDF:', error);
      alert('Não foi possível preparar a impressão do certificado agora.');
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  const renderCertificatePdfSource = () => {
    if (!alunoCertificado) return null;

    return (
      <div className="fixed left-[-20000px] top-0 z-[-1] bg-white" aria-hidden="true">
        <div ref={certificatePdfSourceRef}>
          <CertificadoPreview certificado={alunoCertificado} modelo={eadCertificateModel} gradeCurricular={eadGradeCurricular} pdfMode />
        </div>
      </div>
    );
  };

  const renderCertificatePreview = () => {
    if (!alunoCertificado) return null;

    const certificatePageCount = eadCertificateModel?.hasVerso !== false || alunoCertificado.modalidade === 'TECNICO' ? 2 : 1;
    const previewScale = certificateZoom / 100;
    const previewWidth = A4_LANDSCAPE_PREVIEW_WIDTH_PX * previewScale;
    const previewHeight = (
      A4_LANDSCAPE_PREVIEW_HEIGHT_PX * certificatePageCount
      + CERTIFICATE_PREVIEW_GAP_PX * Math.max(0, certificatePageCount - 1)
    ) * previewScale;

    return (
      <div id="ead-certificate-print-area" className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-100 bg-slate-100">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Prévia PDF</p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-500">A4 horizontal, mesmo arquivo usado no download e impressão.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCertificateZoom((value) => Math.max(35, value - 10))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600"
              title="Diminuir zoom"
            >
              <ZoomOut size={16} />
            </button>
            <input
              aria-label="Zoom da prévia do certificado"
              type="range"
              min="35"
              max="120"
              step="5"
              value={certificateZoom}
              onChange={(event) => setCertificateZoom(Number(event.target.value))}
              className="h-2 w-28 accent-blue-600"
            />
            <button
              type="button"
              onClick={() => setCertificateZoom((value) => Math.min(120, value + 10))}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600"
              title="Aumentar zoom"
            >
              <ZoomIn size={16} />
            </button>
            <span className="min-w-12 text-right text-[10px] font-black tabular-nums tracking-widest text-slate-500">{certificateZoom}%</span>
          </div>
        </div>

        <div className="max-h-[78vh] overflow-auto bg-slate-200/70 p-4">
          <div
            className="relative mx-auto"
            style={{ width: `${previewWidth}px`, height: `${previewHeight}px` }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: '297mm',
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}
            >
              <CertificadoPreview certificado={alunoCertificado} modelo={eadCertificateModel} gradeCurricular={eadGradeCurricular} pdfMode />
            </div>
          </div>
        </div>
      </div>
    );
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
      isDownloadingCertificate,
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
        isDownloadingCertificate,
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
