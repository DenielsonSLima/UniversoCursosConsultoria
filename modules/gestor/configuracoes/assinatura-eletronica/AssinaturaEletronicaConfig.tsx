import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileEdit,
  FileSignature,
  Loader2,
  LockKeyhole,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Stamp,
  Upload,
} from "lucide-react";

import ToastNotification, {
  useToast,
} from "../../components/ToastNotification";
import {
  ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS,
  type ElectronicSignatureAdministrationDraft,
  type ElectronicSignatureDocumentEditor,
  type ElectronicSignatureLegalSection,
  type ElectronicSignaturePolicyPresentation,
  type ElectronicSignatureStampEditor,
  type ElectronicSignatureStampTemplateElementId,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract";
import {
  ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT,
  electronicSignatureService,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.service";
import { electronicSignatureQueryKeys } from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract";
import {
  isCanonicalInstitutionalWatermarkDataUri,
} from "../../../shared/assinatura-eletronica/canonical-institutional-watermark";
import { cloneElectronicSignatureStampTemplate } from "../../../shared/assinatura-eletronica/signature-stamp-template";
import {
  type CanonicalPdfImage,
  getCanonicalPdfInlineImage,
  resolveCanonicalPdfPhoto,
} from "../../secretaria/shared/canonical-document-vector-pdf";
import type { CanonicalInstitutionalHeader } from "../../secretaria/shared/canonical-institutional-header-pdf";
import ElectronicSignatureTemplatePreview from "./ElectronicSignatureTemplatePreview";
import { getElectronicSignatureStampLockedFields } from "./signature-stamp-editor-fields";

interface PresentationSaveInput {
  draft: ElectronicSignatureAdministrationDraft;
  expectedVersion: number;
  requestId: string;
}

interface PreviewIdentity {
  institution: CanonicalInstitutionalHeader;
  logo: CanonicalPdfImage | null;
  institutionalWatermark: CanonicalPdfImage | null;
  signatureStampAssets: Readonly<Record<string, CanonicalPdfImage>>;
}

interface AssetCleanupItem {
  assetId: string;
  status: "PENDING" | "FAILED";
}

type EditableTextField = Exclude<
  keyof ElectronicSignatureAdministrationDraft,
  "editor"
>;
type EditorTab = "PAGE_1" | "PAGE_2" | "SIGNATURE_STAMP";

const cloneEditor = (
  editor: ElectronicSignatureDocumentEditor,
): ElectronicSignatureDocumentEditor => ({
  schemaVersion: 5,
  pages: [
    {
      ...editor.pages[0],
    },
    {
      ...editor.pages[1],
      sections: editor.pages[1].sections.map((section) => ({ ...section })),
    },
  ],
  signatureStamp: {
    ...editor.signatureStamp,
    template: cloneElectronicSignatureStampTemplate(
      editor.signatureStamp.template,
    ),
    autoLayout: { ...editor.signatureStamp.autoLayout },
  },
});

const toDraft = (
  policy: ElectronicSignaturePolicyPresentation,
): ElectronicSignatureAdministrationDraft => ({
  name: policy.name,
  confirmationMessage: policy.confirmationMessage,
  receiptTitle: policy.receiptTitle,
  receiptMessage: policy.receiptMessage,
  editor: cloneEditor(policy.editor),
});

const CharacterCount = (
  { value, maximum }: { value: string; maximum: number },
) => (
  <span
    className={`text-[10px] font-bold ${
      value.length > maximum ? "text-rose-600" : "text-slate-400"
    }`}
  >
    {value.length}/{maximum}
  </span>
);

const InstitutionalIdentityNotice = () => (
  <section
    className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"
    aria-labelledby="assinatura-identidade-institucional"
  >
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm">
        <LockKeyhole size={17} aria-hidden="true" />
      </span>
      <div>
        <h5
          id="assinatura-identidade-institucional"
          className="text-xs font-black uppercase tracking-wider text-blue-950"
        >
          Identidade institucional protegida
        </h5>
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-blue-800/75">
          O cabeçalho, o logotipo e a marca-d&apos;água seguem automaticamente o
          padrão oficial da instituição. Esses elementos são congelados com o
          documento e não podem ser alterados neste editor.
        </p>
      </div>
    </div>
  </section>
);

interface SignatureStampEditorProps {
  stamp: ElectronicSignatureStampEditor;
  selectedElementId: ElectronicSignatureStampTemplateElementId;
  disabled: boolean;
  assetPreview: CanonicalPdfImage | null;
  onSelectElement: (
    elementId: ElectronicSignatureStampTemplateElementId,
  ) => void;
  onAssetUploaded: (assetId: string) => void;
  onUploadError: (failure: unknown) => void;
  onUploadStarted: () => void;
  onUploadFinished: () => void;
}

const SignatureStampEditor: React.FC<SignatureStampEditorProps> = ({
  stamp,
  selectedElementId,
  disabled,
  assetPreview,
  onSelectElement,
  onAssetUploaded,
  onUploadError,
  onUploadStarted,
  onUploadFinished,
}) => {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const assetUploadMutation = useMutation({
    mutationFn: (file: File) =>
      electronicSignatureService.uploadModelAsset(file),
    onMutate: onUploadStarted,
    onSuccess: (asset) => onAssetUploaded(asset.assetId),
    onError: onUploadError,
    onSettled: onUploadFinished,
  });
  const isBusy = disabled || assetUploadMutation.isPending;
  const chooseImage = () => uploadInputRef.current?.click();
  const lockedFields = getElectronicSignatureStampLockedFields(
    stamp.canonicalLabel,
  );
  const selectedElement = stamp.template.elements.find((element) =>
    element.id === selectedElementId
  );

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <LockKeyhole size={17} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <p className="text-xs font-black text-[#001a33]">
              Modelo global do carimbo · ainda desabilitado
            </p>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">
              Um único desenho é aplicado automaticamente a cada signatário na
              última página do PDF original. A ordem e as provas individuais vêm
              do serviço autorizado; esta aba não cria uma terceira página nem
              habilita assinaturas.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
              Imagem própria do carimbo
            </p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              PNG obrigatório usado somente dentro do selo. Não altera o
              cabeçalho, o logotipo nem a marca-d&apos;água institucionais.
            </p>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {assetPreview
              ? (
                <img
                  src={assetPreview.dataUrl}
                  alt="Miniatura da imagem própria do carimbo"
                  className="h-full w-full object-contain"
                />
              )
              : (
                <Stamp
                  size={20}
                  className="text-slate-400"
                  aria-label="Carimbo padrão sem imagem"
                />
              )}
          </div>
        </div>
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/png"
          className="sr-only"
          disabled={isBusy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) assetUploadMutation.mutate(file);
          }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={chooseImage}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-[9px] font-black uppercase tracking-wide text-blue-800 hover:border-blue-400 disabled:cursor-wait disabled:opacity-60"
          >
            {assetUploadMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Upload size={14} />}
            {stamp.assetId ? "Trocar imagem" : "Enviar imagem obrigatória"}
          </button>
        </div>
        {!stamp.assetId && (
          <p className="mt-3 text-[10px] font-semibold leading-relaxed text-rose-700">
            Envie a imagem antes de salvar. Um modelo sem ativo de carimbo não
            pode ser finalizado com segurança.
          </p>
        )}
      </section>

      <section
        aria-labelledby="signature-stamp-global-layout-heading"
        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-700" />
          <div>
            <p
              id="signature-stamp-global-layout-heading"
              className="text-[10px] font-black uppercase tracking-wide text-slate-600"
            >
              Distribuição automática e neutra
            </p>
            <p className="mt-1 max-w-md text-[11px] font-medium leading-relaxed text-slate-500">
              O mesmo template é repetido para todos os signatários autorizados
              (até{" "}
              {stamp.autoLayout.maxSigners}) sem separar Professor e
              Coordenador. Os blocos são distribuídos em{" "}
              {stamp.autoLayout.columns} colunas na última página.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
          Elemento selecionado na prévia
        </p>
        <p className="mt-1 text-xs font-black text-[#001a33]">
          {selectedElement
            ? selectedElement.id === "seal"
              ? "Imagem do carimbo"
              : selectedElement.id === "verificationQr"
              ? "QR individual"
              : selectedElement.id === "divider"
              ? "Linha decorativa"
              : selectedElement.style.label || selectedElement.id
            : "Selecione um elemento"}
        </p>
        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-500">
          Arraste qualquer imagem, texto, linha ou QR na prévia. Use o canto
          inferior direito para redimensionar. O valor associado a cada campo
          continua bloqueado pelo backend.
        </p>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onSelectElement("seal")}
          className="mt-3 min-h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 text-[9px] font-black uppercase tracking-wide text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-60"
        >
          Selecionar imagem
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-[#001a33]">
          <LockKeyhole size={15} />
          <p className="text-[10px] font-black uppercase tracking-wide">
            Campos canônicos bloqueados
          </p>
        </div>
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-slate-500">
          O CPF mascarado fica logo abaixo do nome; depois entram data, hora e
          hash individual. O QR próprio desta assinatura permanece à direita do
          carimbo.
        </p>
        <div className="mt-3 space-y-2">
          {lockedFields.map((field) => (
            <div
              key={field.id}
              className={`rounded-xl border px-3 py-2.5 ${
                field.kind === "DERIVED_QR"
                  ? "border-blue-100 bg-blue-50/70"
                  : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                {field.kind === "DERIVED_QR"
                  ? (
                    <QrCode
                      size={15}
                      className="mt-0.5 shrink-0 text-blue-700"
                      aria-hidden="true"
                    />
                  )
                  : (
                    <LockKeyhole
                      size={13}
                      className="mt-0.5 shrink-0 text-slate-400"
                      aria-hidden="true"
                    />
                  )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[9px] font-black uppercase tracking-wide ${
                      field.kind === "DERIVED_QR"
                        ? "text-blue-800"
                        : "text-slate-500"
                    }`}
                  >
                    {field.label}
                  </p>
                  <p
                    className={`mt-1 break-all font-mono text-[10px] font-semibold ${
                      field.kind === "DERIVED_QR"
                        ? "text-blue-700"
                        : "text-slate-600"
                    }`}
                  >
                    {field.value}
                  </p>
                  {field.description && (
                    <p
                      className={`mt-1 text-[10px] font-medium leading-relaxed ${
                        field.kind === "DERIVED_QR"
                          ? "text-blue-600"
                          : "text-slate-500"
                      }`}
                    >
                      {field.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const AssinaturaEletronicaConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [draft, setDraft] = useState<
    ElectronicSignatureAdministrationDraft | null
  >(null);
  const [activeTab, setActiveTab] = useState<EditorTab>("PAGE_1");
  const [selectedStampElementId, setSelectedStampElementId] = useState<
    ElectronicSignatureStampTemplateElementId
  >("seal");
  const [saveRequestId, setSaveRequestId] = useState(() => crypto.randomUUID());
  const [versionConflict, setVersionConflict] = useState(false);
  const [assetUploadsInFlight, setAssetUploadsInFlight] = useState(0);
  const [assetCleanupItems, setAssetCleanupItems] = useState<
    Readonly<Record<string, AssetCleanupItem>>
  >({});
  const transientAssetIdsRef = useRef<Set<string>>(new Set());
  const cleanupAssetIdsRef = useRef<Set<string>>(new Set());
  const savedAssetIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const normalizedPoloId = null;
  const documentType = ELECTRONIC_SIGNATURE_DEFAULT_DOCUMENT;

  const administrationQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.administration(
      normalizedPoloId,
      documentType,
    ),
    queryFn: () =>
      electronicSignatureService.getAdministration({
        poloId: normalizedPoloId,
        documentType,
      }),
    staleTime: 30_000,
    retry: false,
  });

  const presentation = administrationQuery.data;
  const baselineDraft = useMemo(
    () => presentation ? toDraft(presentation.policy) : null,
    [presentation],
  );
  const currentDraft = draft || baselineDraft;
  const savedAssetIds = useMemo(() =>
    new Set([
      ...(baselineDraft?.editor.signatureStamp.assetId
        ? [baselineDraft.editor.signatureStamp.assetId]
        : []),
    ]), [baselineDraft]);
  useEffect(() => {
    savedAssetIdsRef.current = savedAssetIds;
  }, [savedAssetIds]);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const transientAssetIds: string[] = Array.from(
        transientAssetIdsRef.current as Iterable<string>,
      )
        .filter((assetId) => !savedAssetIdsRef.current.has(assetId));
      const cleanupAssetIds: string[] = Array.from(
        cleanupAssetIdsRef.current as Iterable<string>,
      );
      transientAssetIdsRef.current.clear();
      cleanupAssetIdsRef.current.clear();
      new Set([...transientAssetIds, ...cleanupAssetIds]).forEach((assetId) => {
        void electronicSignatureService.cleanupModelAsset(assetId).catch(() =>
          undefined
        );
      });
    };
  }, []);
  const modelAssetIds = useMemo(() =>
    Array.from(
      new Set([
        ...(currentDraft?.editor.signatureStamp.assetId
          ? [currentDraft.editor.signatureStamp.assetId]
          : []),
      ]),
    ).sort(), [currentDraft]);
  const canonicalPreviewIdentity = administrationQuery.data?.previewIdentity;
  const previewIdentityQuery = useQuery({
    queryKey: [
      "assinatura-eletronica",
      "preview-assets",
      canonicalPreviewIdentity?.logoUrl ?? null,
      canonicalPreviewIdentity?.watermarkUrl ?? null,
      ...modelAssetIds,
    ],
    enabled: Boolean(canonicalPreviewIdentity),
    queryFn: async (): Promise<PreviewIdentity> => {
      if (!canonicalPreviewIdentity) {
        throw new Error(
          "A identidade institucional canônica não foi informada pelo serviço.",
        );
      }
      if (
        !isCanonicalInstitutionalWatermarkDataUri(
          canonicalPreviewIdentity.watermarkUrl,
        )
      ) {
        throw new Error(
          "A marca-d’água canônica watermark_landscape_<polo_id> não foi informada pelo serviço como data URI.",
        );
      }
      const [logo, institutionalWatermark, preparedModelAssets] = await Promise
        .all([
          resolveCanonicalPdfPhoto(canonicalPreviewIdentity.logoUrl),
          resolveCanonicalPdfPhoto(canonicalPreviewIdentity.watermarkUrl),
          Promise.all(
            modelAssetIds.map(
              async (
                assetId,
              ): Promise<readonly [string, CanonicalPdfImage]> => {
                const asset = await electronicSignatureService
                  .getVerifiedModelAsset(assetId);
                const image = getCanonicalPdfInlineImage(asset.dataUrl);
                if (!image) {
                  throw new Error(
                    `A imagem personalizada ${assetId} não pôde ser preparada para a prévia.`,
                  );
                }
                return [assetId, image];
              },
            ),
          ),
        ]);
      if (canonicalPreviewIdentity.logoUrl && !logo) {
        throw new Error(
          "O logotipo canônico da matriz não pôde ser preparado para a prévia.",
        );
      }
      if (!institutionalWatermark) {
        throw new Error(
          "A marca-d’água canônica watermark_landscape_<polo_id> não pôde ser preparada para a prévia.",
        );
      }
      return {
        institution: canonicalPreviewIdentity.institution,
        logo,
        institutionalWatermark,
        signatureStampAssets: Object.fromEntries(preparedModelAssets),
      };
    },
    staleTime: 60_000,
    retry: false,
  });
  const isDirty = Boolean(
    draft && baselineDraft &&
      JSON.stringify(draft) !== JSON.stringify(baselineDraft),
  );

  const saveDraftMutation = useMutation({
    mutationFn: (
      { draft: nextDraft, expectedVersion, requestId }: PresentationSaveInput,
    ) =>
      electronicSignatureService.saveAdministration({
        poloId: normalizedPoloId,
        documentType,
        draft: nextDraft,
        expectedVersion,
        requestId,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        electronicSignatureQueryKeys.administration(
          normalizedPoloId,
          documentType,
        ),
        updated,
      );
      setDraft(null);
      transientAssetIdsRef.current.clear();
      setVersionConflict(false);
      setSaveRequestId(crypto.randomUUID());
      toast.success(
        "Nova versão salva",
        "O banco versionou o modelo sem habilitar documentos ou assinaturas.",
      );
    },
    onError: (failure) => {
      const code = failure && typeof failure === "object" && "code" in failure
        ? String(failure.code || "")
        : "";
      if (code === "40001") {
        setVersionConflict(true);
        toast.error(
          "Modelo atualizado em outra sessão",
          "Suas alterações foram preservadas nesta tela. Recarregue a versão atual antes de continuar.",
        );
        return;
      }
      toast.error(
        "Não foi possível salvar o modelo",
        failure instanceof Error
          ? failure.message
          : "Tente novamente em alguns instantes.",
      );
    },
  });

  const changeDraft = (
    updater: (
      current: ElectronicSignatureAdministrationDraft,
    ) => ElectronicSignatureAdministrationDraft,
  ) => {
    if (!currentDraft || saveDraftMutation.isPending) return;
    const next = updater(currentDraft);
    if (JSON.stringify(next) === JSON.stringify(currentDraft)) return;
    setDraft(next);
    setSaveRequestId(crypto.randomUUID());
  };

  const updateText = (field: EditableTextField, value: string) => {
    changeDraft((current) => ({ ...current, [field]: value }));
  };

  const attemptTransientAssetCleanup = (assetId: string) => {
    cleanupAssetIdsRef.current.add(assetId);
    setAssetCleanupItems((current) => ({
      ...current,
      [assetId]: { assetId, status: "PENDING" },
    }));
    void electronicSignatureService.cleanupModelAsset(assetId)
      .then(() => {
        cleanupAssetIdsRef.current.delete(assetId);
        if (!isMountedRef.current) return;
        setAssetCleanupItems((current) => {
          const { [assetId]: _removed, ...remaining } = current;
          return remaining;
        });
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setAssetCleanupItems((current) => ({
          ...current,
          [assetId]: { assetId, status: "FAILED" },
        }));
      });
  };

  const releaseTransientAsset = (assetId: string | null) => {
    if (
      !assetId || savedAssetIds.has(assetId) ||
      !transientAssetIdsRef.current.delete(assetId)
    ) {
      return;
    }
    attemptTransientAssetCleanup(assetId);
  };

  const releaseAllTransientAssets = () => {
    Array.from(transientAssetIdsRef.current).forEach((assetId: string) =>
      releaseTransientAsset(assetId)
    );
  };

  const updateLegalSection = (
    index: number,
    field: "title" | "body",
    value: string,
  ) => {
    changeDraft((current) => {
      const [page1, page2] = current.editor.pages;
      const sections = page2.sections.map((
        section,
        sectionIndex,
      ): ElectronicSignatureLegalSection => (
        sectionIndex === index ? { ...section, [field]: value } : section
      ));
      return {
        ...current,
        editor: {
          schemaVersion: 5,
          pages: [page1, { ...page2, sections }],
          signatureStamp: current.editor.signatureStamp,
        },
      };
    });
  };

  const updateSignatureStamp = (stamp: ElectronicSignatureStampEditor) => {
    const previousAssetId = currentDraft?.editor.signatureStamp.assetId ?? null;
    if (previousAssetId && previousAssetId !== stamp.assetId) {
      releaseTransientAsset(previousAssetId);
    }
    changeDraft((current) => ({
      ...current,
      editor: {
        ...current.editor,
        schemaVersion: 5,
        signatureStamp: stamp,
      },
    }));
  };

  const updateSignatureStampTemplate = (
    template: ElectronicSignatureStampEditor["template"],
  ) => {
    const currentStamp = currentDraft?.editor.signatureStamp;
    if (!currentStamp) return;
    updateSignatureStamp({ ...currentStamp, template });
  };

  const handleSignatureStampAssetUploaded = (assetId: string) => {
    const currentStamp = currentDraft?.editor.signatureStamp;
    if (!currentStamp) {
      transientAssetIdsRef.current.add(assetId);
      releaseTransientAsset(assetId);
      return;
    }
    transientAssetIdsRef.current.add(assetId);
    updateSignatureStamp({ ...currentStamp, assetId });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentDraft?.editor.signatureStamp.assetId) {
      toast.error(
        "Imagem do carimbo obrigatória",
        "Envie uma imagem PNG antes de salvar o modelo global.",
      );
      return;
    }
    if (
      !currentDraft || !presentation || !isDirty || versionConflict ||
      assetUploadsInFlight > 0
    ) return;
    saveDraftMutation.mutate({
      draft: currentDraft,
      expectedVersion: presentation.version,
      requestId: saveRequestId,
    });
  };

  const handleReloadModel = async () => {
    const result = await administrationQuery.refetch();
    if (result.error) {
      toast.error(
        "Não foi possível recarregar o modelo",
        "Tente novamente em alguns instantes.",
      );
      return;
    }
    releaseAllTransientAssets();
    setDraft(null);
    setVersionConflict(false);
    setSaveRequestId(crypto.randomUUID());
    toast.success(
      "Versão atual carregada",
      "Revise o modelo antes de fazer novas alterações.",
    );
  };

  const identity = previewIdentityQuery.data;
  const handleAssetUploadError = (failure: unknown) => {
    toast.error(
      "Não foi possível enviar a imagem",
      failure instanceof Error
        ? failure.message
        : "Selecione um PNG de até 1 MiB, 4096 px por lado e 12 MP.",
    );
  };
  const legalBodyCharacters = currentDraft?.editor.pages[1].sections.reduce(
    (total, section) => total + section.body.length,
    0,
  ) ?? 0;
  const disabled = saveDraftMutation.isPending || assetUploadsInFlight > 0;
  const hasRequiredStampAsset = Boolean(
    currentDraft?.editor.signatureStamp.assetId,
  );
  const cleanupEntries = Object.values(assetCleanupItems) as AssetCleanupItem[];
  const previewPage: 1 | 2 = activeTab === "PAGE_2" ? 2 : 1;
  const isStampTab = activeTab === "SIGNATURE_STAMP";

  return (
    <div className="animate-fadeIn">
      <ToastNotification toasts={toasts} onRemove={removeToast} />

      <header className="flex flex-col justify-between gap-5 border-b border-slate-100 pb-6 lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <FileSignature size={24} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
              Editor do modelo
            </p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-[#001a33]">
              Assinatura Eletrônica
            </h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">
              Edite as duas páginas do comprovante e o único modelo de carimbo
              aplicado automaticamente a todos os signatários autorizados.
            </p>
          </div>
        </div>

        {presentation && currentDraft && (
          <div className="flex shrink-0 lg:justify-end">
            {versionConflict
              ? (
                <button
                  type="button"
                  onClick={() => void handleReloadModel()}
                  disabled={administrationQuery.isFetching ||
                    assetUploadsInFlight > 0}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-700 px-5 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-amber-900/15 hover:bg-amber-800 disabled:cursor-wait disabled:bg-amber-300 sm:w-auto"
                >
                  {administrationQuery.isFetching
                    ? <Loader2 size={15} className="animate-spin" />
                    : <RefreshCw size={15} />}
                  Recarregar versão atual
                </button>
              )
              : (
                <button
                  type="submit"
                  form="assinatura-eletronica-model-form"
                  disabled={!isDirty || disabled || !hasRequiredStampAsset}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-blue-950/15 hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:w-auto"
                >
                  {disabled
                    ? <Loader2 size={15} className="animate-spin" />
                    : <Save size={15} />}
                  {disabled ? "Salvando..." : "Salvar nova versão"}
                </button>
              )}
          </div>
        )}
      </header>

      {administrationQuery.isPending
        ? (
          <div
            className="flex min-h-[620px] items-center justify-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500"
            role="status"
          >
            <Loader2 size={22} className="animate-spin text-blue-600" />{" "}
            Carregando modelo versionado...
          </div>
        )
        : administrationQuery.isError || !presentation || !currentDraft
        ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-5"
          >
            <p className="text-sm font-black text-rose-800">
              Não foi possível carregar o editor de assinatura eletrônica.
            </p>
            <p className="mt-1 text-xs font-medium text-rose-600">
              Não foi possível obter o modelo versionado. Atualize a página e
              tente novamente; se o problema persistir, confira a conexão e as
              permissões do módulo.
            </p>
            <button
              type="button"
              onClick={() => void administrationQuery.refetch()}
              className="mt-3 min-h-10 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-rose-700 shadow-sm"
            >
              Tentar novamente
            </button>
          </div>
        )
        : (
          <form
            id="assinatura-eletronica-model-form"
            onSubmit={handleSubmit}
            className="mt-6"
          >
            {cleanupEntries.length > 0 && (
              <section
                aria-live="polite"
                className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"
              >
                <p className="text-xs font-black text-amber-900">
                  {cleanupEntries.some((item) => item.status === "FAILED")
                    ? "Uma imagem temporária ainda não pôde ser liberada."
                    : "Liberando imagem temporária que não será usada no modelo..."}
                </p>
                <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">
                  O modelo salvo não é alterado por esta limpeza. Você pode
                  tentar novamente sem sair da tela.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {cleanupEntries.map((item, index) => (
                    item.status === "PENDING"
                      ? (
                        <span
                          key={item.assetId}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-white px-3 text-[9px] font-black uppercase tracking-wide text-amber-800"
                        >
                          <Loader2 size={13} className="animate-spin" />{" "}
                          Liberando imagem {index + 1}
                        </span>
                      )
                      : (
                        <button
                          key={item.assetId}
                          type="button"
                          onClick={() =>
                            attemptTransientAssetCleanup(item.assetId)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-[9px] font-black uppercase tracking-wide text-amber-900 hover:border-amber-500"
                        >
                          <RefreshCw size={13} /> Tentar liberar imagem{" "}
                          {index + 1}
                        </button>
                      )
                  ))}
                </div>
              </section>
            )}
            <nav
              aria-label="Editor do modelo de assinatura eletrônica"
              className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-2"
            >
              <div className="grid gap-2 md:grid-cols-3" role="tablist">
                {([
                  {
                    id: "PAGE_1",
                    badge: "1",
                    title: "Página 1",
                    description: "Comprovante e evidências",
                  },
                  {
                    id: "PAGE_2",
                    badge: "2",
                    title: "Página 2",
                    description: "Política e textos legais",
                  },
                  {
                    id: "SIGNATURE_STAMP",
                    badge: null,
                    title: "Editor livre do carimbo",
                    description: "Um modelo global · última página",
                  },
                ] as const).map((item) => {
                  const selected = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      id={`signature-editor-tab-${item.id.toLowerCase()}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="signature-editor-panel"
                      onClick={() => setActiveTab(item.id)}
                      className={`group flex min-h-[4.5rem] items-center gap-3 rounded-xl border px-3 py-3 text-left transition sm:px-4 ${
                        selected
                          ? "border-blue-200 bg-white text-[#001a33] shadow-sm ring-1 ring-blue-100"
                          : "border-transparent text-slate-500 hover:border-slate-200 hover:bg-white/80 hover:text-slate-700"
                      }`}
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black transition ${
                          selected
                            ? "bg-blue-600 text-white shadow-sm shadow-blue-900/15"
                            : "bg-white text-slate-400 ring-1 ring-slate-200 group-hover:text-blue-600"
                        }`}
                      >
                        {item.badge || <Stamp size={17} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black uppercase tracking-[0.12em]">
                          {item.title}
                        </span>
                        <span
                          className={`mt-0.5 block text-[10px] font-semibold leading-snug sm:text-[11px] ${
                            selected ? "text-blue-600" : "text-slate-400"
                          }`}
                        >
                          {item.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="mb-5 flex flex-col justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 lg:flex-row lg:items-center">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-blue-700"
                  size={19}
                />
                <div>
                  <p className="text-xs font-black text-[#001a33]">
                    Modelo global · {presentation.policy.versionLabel}
                  </p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">
                    {presentation.legalStatusLabel}. Cabeçalho, versão, QR,
                    status e evidências permanecem bloqueados e são fornecidos
                    pelo serviço.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wide text-blue-700 shadow-sm">
                  {presentation.enabled
                    ? "Habilitado pelo serviço"
                    : "Documento não habilitado"}
                </span>
              </div>
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(22rem,0.78fr)_minmax(0,1.5fr)]">
              <section
                id="signature-editor-panel"
                role="tabpanel"
                aria-labelledby={`signature-editor-tab-${activeTab.toLowerCase()}`}
                className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5"
              >
                <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
                    {activeTab === "SIGNATURE_STAMP"
                      ? <Stamp size={17} />
                      : <FileEdit size={17} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-[#001a33]">
                      {activeTab === "SIGNATURE_STAMP"
                        ? "Editor livre do carimbo global"
                        : `Página ${activeTab === "PAGE_1" ? 1 : 2} de 2`}
                    </h4>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                      {activeTab === "SIGNATURE_STAMP"
                        ? "Arraste e redimensione elementos; o conteúdo probatório é bloqueado"
                        : activeTab === "PAGE_1"
                        ? "Documento e evidências"
                        : "Política e textos institucionais"}
                    </p>
                  </div>
                </div>

                {activeTab !== "SIGNATURE_STAMP" && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start gap-2.5">
                      <LockKeyhole
                        size={15}
                        className="mt-0.5 shrink-0 text-slate-500"
                      />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Cabeçalho institucional · bloqueado
                        </p>
                        <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                          Logo, CNPJ, endereço e unidade seguem o mesmo
                          cabeçalho canônico dos documentos oficiais.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "SIGNATURE_STAMP"
                  ? (
                    <SignatureStampEditor
                      stamp={currentDraft.editor.signatureStamp}
                      selectedElementId={selectedStampElementId}
                      disabled={disabled}
                      assetPreview={currentDraft.editor.signatureStamp.assetId
                        ? identity
                          ?.signatureStampAssets[
                            currentDraft.editor.signatureStamp.assetId
                          ] ?? null
                        : null}
                      onSelectElement={setSelectedStampElementId}
                      onAssetUploaded={handleSignatureStampAssetUploaded}
                      onUploadError={handleAssetUploadError}
                      onUploadStarted={() =>
                        setAssetUploadsInFlight((count) => count + 1)}
                      onUploadFinished={() =>
                        setAssetUploadsInFlight((count) =>
                          Math.max(0, count - 1)
                        )}
                    />
                  )
                  : activeTab === "PAGE_1"
                  ? (
                    <>
                      <label className="block">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Título do comprovante
                          <CharacterCount
                            value={currentDraft.receiptTitle}
                            maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                              .receiptTitle}
                          />
                        </span>
                        <input
                          value={currentDraft.receiptTitle}
                          maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                            .receiptTitle}
                          disabled={disabled}
                          onChange={(event) =>
                            updateText("receiptTitle", event.target.value)}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-[#001a33] outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="block">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Mensagem de apoio
                          <CharacterCount
                            value={currentDraft.receiptMessage}
                            maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                              .receiptMessage}
                          />
                        </span>
                        <textarea
                          value={currentDraft.receiptMessage}
                          maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                            .receiptMessage}
                          disabled={disabled}
                          rows={3}
                          onChange={(event) =>
                            updateText("receiptMessage", event.target.value)}
                          className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium leading-relaxed text-[#001a33] outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        />
                      </label>

                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wide text-emerald-800">
                          Campos inseridos pelo serviço
                        </p>
                        <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                          {presentation.policy.receiptFields.map((field) => (
                            <li
                              key={field.id}
                              className="flex gap-2 text-[11px]"
                            >
                              <CheckCircle2
                                size={14}
                                className="mt-0.5 shrink-0 text-emerald-600"
                              />
                              <span>
                                <strong className="block font-black text-[#001a33]">
                                  {field.label}
                                </strong>
                                <span className="font-medium text-slate-500">
                                  {field.description}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <InstitutionalIdentityNotice />
                    </>
                  )
                  : (
                    <>
                      <label className="block">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Nome de apresentação da política
                          <CharacterCount
                            value={currentDraft.name}
                            maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                              .name}
                          />
                        </span>
                        <input
                          value={currentDraft.name}
                          maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                            .name}
                          disabled={disabled}
                          onChange={(event) =>
                            updateText("name", event.target.value)}
                          className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-[#001a33] outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                            Versão probatória
                          </p>
                          <p className="mt-1 text-sm font-black text-[#001a33]">
                            {presentation.policy.versionLabel}
                          </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">
                            Paginação
                          </p>
                          <p className="mt-1 text-sm font-black text-[#001a33]">
                            2 páginas fixas
                          </p>
                        </div>
                      </div>
                      <label className="block">
                        <span className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-slate-600">
                          Declaração de confirmação
                          <CharacterCount
                            value={currentDraft.confirmationMessage}
                            maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                              .confirmationMessage}
                          />
                        </span>
                        <textarea
                          value={currentDraft.confirmationMessage}
                          maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                            .confirmationMessage}
                          disabled={disabled}
                          rows={4}
                          onChange={(event) =>
                            updateText(
                              "confirmationMessage",
                              event.target.value,
                            )}
                          className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium leading-relaxed text-[#001a33] outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                        />
                      </label>

                      <div className="space-y-3">
                        <div
                          className={`flex items-center justify-between rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wide ${
                            legalBodyCharacters >
                                ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                                  .legalSectionsBodyTotal
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          <span>Total dos textos jurídicos</span>
                          <span>
                            {legalBodyCharacters}/{ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                              .legalSectionsBodyTotal}
                          </span>
                        </div>
                        {currentDraft.editor.pages[1].sections.map((
                          section,
                          index,
                        ) => (
                          <section
                            key={section.id}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                          >
                            <label className="block">
                              <span className="flex items-center justify-between text-[9px] font-black uppercase tracking-wide text-slate-500">
                                Título do bloco {index + 1}
                                <CharacterCount
                                  value={section.title}
                                  maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                                    .legalSectionTitle}
                                />
                              </span>
                              <input
                                value={section.title}
                                maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                                  .legalSectionTitle}
                                disabled={disabled}
                                onChange={(event) =>
                                  updateLegalSection(
                                    index,
                                    "title",
                                    event.target.value,
                                  )}
                                className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-[#001a33] outline-none focus:border-blue-500"
                              />
                            </label>
                            <label className="mt-3 block">
                              <span className="flex items-center justify-between text-[9px] font-black uppercase tracking-wide text-slate-500">
                                Texto simples
                                <CharacterCount
                                  value={section.body}
                                  maximum={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                                    .legalSectionBody}
                                />
                              </span>
                              <textarea
                                value={section.body}
                                maxLength={ELECTRONIC_SIGNATURE_PRESENTATION_LIMITS
                                  .legalSectionBody}
                                disabled={disabled}
                                rows={3}
                                onChange={(event) =>
                                  updateLegalSection(
                                    index,
                                    "body",
                                    event.target.value,
                                  )}
                                className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium leading-relaxed text-slate-700 outline-none focus:border-blue-500"
                              />
                            </label>
                          </section>
                        ))}
                      </div>

                      <InstitutionalIdentityNotice />
                    </>
                  )}
              </section>

              <aside className="min-w-0 rounded-[2rem] border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 pt-1">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">
                      {isStampTab
                        ? "Editor visual do template"
                        : "Prévia real do PDF"}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {isStampTab
                        ? "Um desenho global aplicado automaticamente a todos os signatários"
                        : `Página ${previewPage} de 2 · PDF vetorial gerado pelo compositor`}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-wide text-slate-600">
                    Prévia · sem validade
                  </span>
                </div>
                {previewIdentityQuery.isPending
                  ? (
                    <div
                      className="flex min-h-[460px] items-center justify-center gap-3 rounded-2xl bg-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500"
                      role="status"
                    >
                      <Loader2
                        size={18}
                        className="animate-spin text-blue-600"
                      />{" "}
                      Preparando identidade canônica...
                    </div>
                  )
                  : previewIdentityQuery.isError || !identity
                  ? (
                    <div
                      role="alert"
                      className="flex min-h-[460px] flex-col items-center justify-center rounded-2xl border border-amber-100 bg-amber-50 p-6 text-center"
                    >
                      <LockKeyhole size={24} className="text-amber-700" />
                      <p className="mt-3 text-sm font-black text-amber-900">
                        Prévia do modelo indisponível
                      </p>
                      <p className="mt-1 max-w-sm text-[11px] font-semibold leading-relaxed text-amber-700">
                        O editor não inventa outro cabeçalho nem substitui uma
                        imagem própria por marca institucional. Confira os
                        ativos autorizados e tente novamente.
                      </p>
                      <button
                        type="button"
                        onClick={() => void previewIdentityQuery.refetch()}
                        className="mt-4 min-h-10 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-amber-800 shadow-sm"
                      >
                        Tentar novamente
                      </button>
                    </div>
                  )
                  : (
                    <ElectronicSignatureTemplatePreview
                      draft={currentDraft}
                      versionLabel={isDirty
                        ? "Rascunho não salvo"
                        : presentation.policy.versionLabel}
                      activePage={previewPage}
                      mode={isStampTab ? "SIGNATURE_STAMP" : "RECEIPT"}
                      selectedStampElementId={selectedStampElementId}
                      disabled={disabled}
                      onSelectStampElement={setSelectedStampElementId}
                      onCommitStampTemplate={updateSignatureStampTemplate}
                      identity={identity}
                    />
                  )}
              </aside>
            </div>
          </form>
        )}
    </div>
  );
};

export default AssinaturaEletronicaConfig;
