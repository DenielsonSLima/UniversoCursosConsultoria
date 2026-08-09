import React, { useEffect, useRef, useState } from 'react';
import { getSecretariaContext } from '../shared/secretaria-documentos.service';
import {
  createDocumentReissueKey,
  documentValidationService,
} from '../../../shared/document-validation/document-validation.service';
import type { ValidatableDocumentType } from '../../../shared/document-validation/document-validation.types';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import EmissionsToolbar from './components/EmissionsToolbar';
import EmissionsTable from './components/EmissionsTable';
import ReprintModal from './components/ReprintModal';
import { isOfficialVectorDocument, PAGE_SIZE } from './historico-emissoes.constants';
import { historicoEmissoesService } from './historico-emissoes.service';
import {
  downloadEmissionPdf,
  saveEmissionPdfBlob,
} from './preview-utils';
import { createEmissionDocumentsPdf } from './emission-document.pdf';
import type {
  AcademicPreviewData,
  EmissionLog,
  PreviewResources,
  TurmaFilter,
} from './historico-emissoes.types';
import type { CertificadoAcademico } from '../certificados/certificados.types';
import { waitForDocumentAssets } from '../../../shared/qrcode/document-assets';
import {
  assertEmissionAlignedWithIssue,
  getEmissionRenderKey,
  waitForCanonicalEmissionRender,
} from './reissue-flow';
import { printPdfBlob } from '../shared/pdf-blob-print';
import { normalizeCanonicalDocumentRenderPayload } from '../shared/canonical-document-render.utils';
import { isContratoAlunoRenderPayloadReady } from '../contratos-aluno/components/ContratoAlunoDocumentRenderer';
import type { ContratoAlunoPreparedDocument } from '../contratos-aluno/types/contratos-aluno.types';

interface VectorPreviewPdf {
  blob: Blob;
  url: string;
  emissionKey: string;
}

const isContractDocument = (documento: string) => documento === 'contrato_aluno';
const getEmissionPreviewKey = (emission: EmissionLog) => (
  `${emission.documento}:${emission.codigo || emission.id}`
);

const toContractPreparedDocument = (emission: EmissionLog): ContratoAlunoPreparedDocument => {
  const frozen = emission.dados_emissao || {};
  const renderPayload = normalizeCanonicalDocumentRenderPayload({
    template: frozen.templateSnapshot ?? frozen.template_snapshot,
    template_revision: frozen.templateRevision ?? frozen.template_revision,
    snapshot: frozen.contractSnapshot ?? frozen.contract_snapshot,
    rendered: frozen.renderedDocument ?? frozen.rendered_document,
  });

  const document: ContratoAlunoPreparedDocument = {
    emissionId: emission.codigo || emission.id,
    documentId: emission.id,
    title: String(
      frozen.templateSnapshot?.tituloDocumento
      || frozen.template_snapshot?.tituloDocumento
      || 'Contrato do Aluno'
    ),
    targetName: String(
      frozen.contractSnapshot?.aluno?.nome
      || frozen.contract_snapshot?.aluno?.nome
      || emission.aluno?.nome
      || 'Aluno'
    ),
    validationCode: emission.codigo || null,
    validationUrl: emission.codigo ? `/validador?code=${emission.codigo}` : null,
    validUntil: emission.validade_ate,
    fileUrl: null,
    statusLabel: emission.status,
    renderPayload,
  };

  if (!isContratoAlunoRenderPayloadReady(document)) {
    throw new Error(
      'O contrato histórico não possui template, snapshot e páginas canônicas congeladas para reimpressão.'
    );
  }
  return document;
};

const createContractHistoryPdf = async (emission: EmissionLog) => {
  const { createContratosAlunoPdf } = await import('../contratos-aluno/contratos-aluno.pdf');
  return createContratosAlunoPdf([toContractPreparedDocument(emission)]);
};

const SecretariaHistoricoEmissoesPage: React.FC = () => {
  const context = getSecretariaContext();
  const { toasts, removeToast, toast } = useToast();
  const printContentRef = useRef<HTMLDivElement>(null);
  const reissueOperationRef = useRef(false);
  const reissueRequestRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const vectorPreviewPdfRef = useRef<VectorPreviewPdf | null>(null);
  const previewLoadTokenRef = useRef(0);

  const [activeTab, setActiveTab] = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');
  const [turmas, setTurmas] = useState<TurmaFilter[]>([]);
  const [systemUsers, setSystemUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [emissions, setEmissions] = useState<EmissionLog[]>([]);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [selectedEmission, setSelectedEmission] = useState<EmissionLog | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isReissuing, setIsReissuing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [templateConfig, setTemplateConfig] = useState<any>(null);
  const [certificatePreview, setCertificatePreview] = useState<CertificadoAcademico | null>(null);
  const [watermark, setWatermark] = useState<any>(null);
  const [poloInfo, setPoloInfo] = useState<any>(null);
  const [academicPreviewData, setAcademicPreviewData] = useState<AcademicPreviewData | null>(null);
  const [vectorPreviewPdf, setVectorPreviewPdf] = useState<VectorPreviewPdf | null>(null);

  const replaceVectorPreviewPdf = (blob: Blob | null, emissionKey = '') => {
    if (vectorPreviewPdfRef.current) {
      URL.revokeObjectURL(vectorPreviewPdfRef.current.url);
    }
    const next = blob
      ? { blob, url: URL.createObjectURL(blob), emissionKey }
      : null;
    vectorPreviewPdfRef.current = next;
    setVectorPreviewPdf(next);
  };

  useEffect(() => () => {
    previewLoadTokenRef.current += 1;
    if (vectorPreviewPdfRef.current) {
      URL.revokeObjectURL(vectorPreviewPdfRef.current.url);
      vectorPreviewPdfRef.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    historicoEmissoesService.loadFilters(context.poloId)
      .then((filters) => {
        if (!active) return;
        setTurmas(filters.turmas);
        setSystemUsers(filters.systemUsers);
      })
      .catch((error) => {
        console.error('Erro ao inicializar filtros do histórico:', error);
        toast.error('Erro Supabase', error?.message || String(error));
      });
    return () => { active = false; };
  }, [context.poloId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    historicoEmissoesService.loadEmissions({
      poloId: context.poloId,
      activeTab,
      turmaId: selectedTurmaId,
      search: appliedSearch,
      page,
    })
      .then((result) => {
        if (!active) return;
        setEmissions(result.emissions);
        setTotalRecords(result.total);
      })
      .catch((error) => {
        console.error('Erro ao carregar histórico de emissões:', error);
        toast.error('Erro Supabase', error?.message || String(error));
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [activeTab, appliedSearch, context.poloId, page, reloadVersion, selectedTurmaId]);

  const clearPreview = () => {
    if (reissueOperationRef.current) return;
    previewLoadTokenRef.current += 1;
    setIsPreviewOpen(false);
    setIsLoadingPreview(false);
    setSelectedEmission(null);
    setTemplateConfig(null);
    setCertificatePreview(null);
    setAcademicPreviewData(null);
    setPreviewError(null);
    setWatermark(null);
    setPoloInfo(null);
    replaceVectorPreviewPdf(null);
  };

  const applyPreview = (resources: PreviewResources) => {
    setTemplateConfig(resources.template);
    setCertificatePreview(resources.certificate);
    setAcademicPreviewData(resources.academicData);
    setWatermark(resources.watermark);
    setPoloInfo(resources.polo);
  };

  const handleOpenPreview = async (emission: EmissionLog) => {
    const loadToken = previewLoadTokenRef.current + 1;
    previewLoadTokenRef.current = loadToken;
    const emissionKey = getEmissionPreviewKey(emission);
    setSelectedEmission(emission);
    setIsPreviewOpen(true);
    setIsLoadingPreview(true);
    setTemplateConfig(null);
    setCertificatePreview(null);
    setAcademicPreviewData(null);
    setPreviewError(null);
    replaceVectorPreviewPdf(null);
    try {
      const resources = isContractDocument(emission.documento)
        ? {
            template: null,
            certificate: null,
            academicData: null,
            watermark: null,
            polo: null,
          }
        : await historicoEmissoesService.loadPreview(emission, context.poloId);
      if (previewLoadTokenRef.current !== loadToken) return;
      applyPreview(resources);
      if (isContractDocument(emission.documento)) {
        const pdf = await createContractHistoryPdf(emission);
        if (previewLoadTokenRef.current !== loadToken) return;
        replaceVectorPreviewPdf(pdf.blob, emissionKey);
      } else if (isOfficialVectorDocument(emission.documento)) {
        const pdf = await createEmissionDocumentsPdf([{ emission, preview: resources }]);
        if (previewLoadTokenRef.current !== loadToken) return;
        replaceVectorPreviewPdf(pdf.blob, emissionKey);
      }
    } catch (error) {
      if (previewLoadTokenRef.current !== loadToken) return;
      console.error('Erro ao carregar templates para segunda via:', error);
      setPreviewError(error instanceof Error ? error.message : 'Não foi possível carregar o documento.');
      toast.error('Erro ao carregar modelo', 'Não foi possível abrir o modelo oficial deste documento.');
    } finally {
      if (previewLoadTokenRef.current === loadToken) {
        setIsLoadingPreview(false);
      }
    }
  };

  const getReissueRequest = (emission: EmissionLog) => {
    const fingerprint = JSON.stringify([
      emission.documento,
      emission.matricula_id,
      emission.periodo_referencia || null,
      emission.referencia_externa || null,
      context.userId || null,
    ]);
    if (reissueRequestRef.current?.fingerprint !== fingerprint) {
      reissueRequestRef.current = {
        fingerprint,
        idempotencyKey: createDocumentReissueKey(),
      };
    }
    return {
      type: emission.documento as ValidatableDocumentType,
      enrollmentId: emission.matricula_id,
      referencePeriod: emission.periodo_referencia || undefined,
      sourceReference: emission.referencia_externa || undefined,
      issuedBy: context.userId,
      idempotencyKey: reissueRequestRef.current.idempotencyKey,
    };
  };

  const prepareReissueOutput = async (emission: EmissionLog) => {
    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const prepared = await documentValidationService.prepareReissue(
        getReissueRequest(emission),
      );
      const canonicalEmission =
        await historicoEmissoesService.loadEmissionByCode(prepared.code);
      const preparedEmission: EmissionLog = {
        ...canonicalEmission,
        ultima_emissao_em:
          prepared.lastIssuedAt || canonicalEmission.ultima_emissao_em,
        validade_ate: prepared.expiresAt,
        validacao_publica: prepared.validationPublic,
        quantidade_emissoes:
          prepared.issueCount || canonicalEmission.quantidade_emissoes + 1,
        dados_emissao: {
          ...(canonicalEmission.dados_emissao || {}),
          validationPublic: prepared.validationPublic,
        },
      };
      const resources = isContractDocument(preparedEmission.documento)
        ? {
            template: null,
            certificate: null,
            academicData: null,
            watermark: null,
            polo: null,
          }
        : await historicoEmissoesService.loadPreviewFresh(
            preparedEmission,
            context.poloId,
          );

      setSelectedEmission(preparedEmission);
      applyPreview(resources);
      if (isContractDocument(preparedEmission.documento)) {
        const preparedEmissionKey = getEmissionPreviewKey(preparedEmission);
        const previewBlob = vectorPreviewPdfRef.current?.emissionKey === preparedEmissionKey
          ? vectorPreviewPdfRef.current.blob
          : null;
        const pdfBlob = previewBlob
          || (await createContractHistoryPdf(preparedEmission)).blob;
        if (!previewBlob) replaceVectorPreviewPdf(pdfBlob, preparedEmissionKey);
        setIsLoadingPreview(false);
        return {
          canonicalEmission: preparedEmission,
          container: null,
          pdfBlob,
        };
      }
      if (isOfficialVectorDocument(preparedEmission.documento)) {
        const preparedEmissionKey = getEmissionPreviewKey(preparedEmission);
        const previewBlob = vectorPreviewPdfRef.current?.emissionKey === preparedEmissionKey
          ? vectorPreviewPdfRef.current.blob
          : null;
        const pdfBlob = previewBlob || (await createEmissionDocumentsPdf([{
          emission: preparedEmission,
          preview: resources,
        }])).blob;
        if (!previewBlob) replaceVectorPreviewPdf(pdfBlob, preparedEmissionKey);
        setIsLoadingPreview(false);
        return {
          canonicalEmission: preparedEmission,
          container: null,
          pdfBlob,
        };
      }

      setIsLoadingPreview(false);
      const container = await waitForCanonicalEmissionRender(
        () => printContentRef.current,
        getEmissionRenderKey(preparedEmission),
      );
      await waitForDocumentAssets(container);
      const pdfBlob = await downloadEmissionPdf(
        container,
        canonicalEmission,
        '2-via',
        undefined,
        undefined,
        false,
      );
      if (!pdfBlob) {
        throw new Error('A captura de segurança da segunda via não foi concluída.');
      }
      return { canonicalEmission: preparedEmission, container, pdfBlob };
    } catch (error) {
      if (
        isContractDocument(emission.documento)
        || isOfficialVectorDocument(emission.documento)
      ) {
        replaceVectorPreviewPdf(null);
      }
      setIsLoadingPreview(false);
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a segunda via sem alterar o registro.',
      );
      throw error;
    }
  };

  const confirmCanonicalReissue = async (emission: EmissionLog) => {
    const issued = await documentValidationService.reissue(
      getReissueRequest(emission),
    );
    assertEmissionAlignedWithIssue(emission, issued);
    setReloadVersion((version) => version + 1);
    return issued;
  };

  const beginReissueOperation = (): boolean => {
    if (reissueOperationRef.current) return false;
    reissueOperationRef.current = true;
    return true;
  };

  const endReissueOperation = () => {
    reissueOperationRef.current = false;
  };

  const finishReissueRequest = () => {
    reissueRequestRef.current = null;
  };

  const discardStalePreparedRequest = (error: unknown) => {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === '40001'
    ) {
      finishReissueRequest();
    }
  };

  const handlePrint = async () => {
    const isVectorPdf = Boolean(
      selectedEmission && (
        isContractDocument(selectedEmission.documento)
        || isOfficialVectorDocument(selectedEmission.documento)
      )
    );
    if (
      !selectedEmission
      || (!isVectorPdf && !printContentRef.current)
      || previewError
      || !beginReissueOperation()
    ) return;
    setIsReissuing(true);
    try {
      const { canonicalEmission, pdfBlob } = await prepareReissueOutput(selectedEmission);
      await confirmCanonicalReissue(canonicalEmission);
      if (isVectorPdf) {
        await printPdfBlob(pdfBlob, { title: `${canonicalEmission.documento} - segunda via` });
      } else {
        window.print();
      }
      finishReissueRequest();
    } catch (error) {
      discardStalePreparedRequest(error);
      console.error('Erro ao preparar segunda via:', error);
      toast.error(
        'Erro ao preparar impressão',
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar a segunda via para impressão.',
      );
    } finally {
      setIsReissuing(false);
      endReissueOperation();
    }
  };

  const handleDownload = async () => {
    const isVectorPdf = Boolean(
      selectedEmission && (
        isContractDocument(selectedEmission.documento)
        || isOfficialVectorDocument(selectedEmission.documento)
      )
    );
    if (
      !selectedEmission
      || (!isVectorPdf && !printContentRef.current)
      || previewError
      || !beginReissueOperation()
    ) return;
    setIsDownloading(true);
    try {
      const { canonicalEmission, pdfBlob } =
        await prepareReissueOutput(selectedEmission);
      await confirmCanonicalReissue(canonicalEmission);
      saveEmissionPdfBlob(pdfBlob, canonicalEmission);
      finishReissueRequest();
    } catch (error) {
      discardStalePreparedRequest(error);
      console.error('Erro ao gerar PDF da segunda via:', error);
      toast.error('Erro ao Processar', 'Erro ao processar o PDF.');
    } finally {
      setIsDownloading(false);
      endReissueOperation();
    }
  };

  const handleSearch = () => {
    setPage(1);
    if (appliedSearch === searchQuery) setReloadVersion((version) => version + 1);
    else setAppliedSearch(searchQuery);
  };

  const pagesCount = Math.ceil(totalRecords / PAGE_SIZE);

  return (
    <div className="space-y-6 text-xs font-sans animate-fadeIn">
      <EmissionsToolbar
        activeTab={activeTab}
        searchQuery={searchQuery}
        selectedTurmaId={selectedTurmaId}
        turmas={turmas}
        onTabChange={(tab) => { setActiveTab(tab); setPage(1); }}
        onSearchChange={setSearchQuery}
        onTurmaChange={(turmaId) => { setSelectedTurmaId(turmaId); setPage(1); }}
        onSearch={handleSearch}
      />
      <EmissionsTable
        emissions={emissions}
        loading={loading}
        page={page}
        pagesCount={pagesCount}
        totalRecords={totalRecords}
        systemUsers={systemUsers}
        onPageChange={setPage}
        onOpenPreview={handleOpenPreview}
      />
      {isPreviewOpen && selectedEmission && (
        <ReprintModal
          emission={selectedEmission}
          templateConfig={templateConfig}
          certificatePreview={certificatePreview}
          watermark={watermark}
          poloInfo={poloInfo}
          academicPreviewData={academicPreviewData}
          pdfUrl={(
            isContractDocument(selectedEmission.documento)
            || isOfficialVectorDocument(selectedEmission.documento)
          )
            ? vectorPreviewPdf?.url || null
            : null}
          error={previewError}
          isLoading={isLoadingPreview}
          isDownloading={isDownloading}
          isReissuing={isReissuing}
          fullscreenViewer
          printContentRef={printContentRef}
          onClose={clearPreview}
          onDownload={handleDownload}
          onPrint={handlePrint}
        />
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default SecretariaHistoricoEmissoesPage;
