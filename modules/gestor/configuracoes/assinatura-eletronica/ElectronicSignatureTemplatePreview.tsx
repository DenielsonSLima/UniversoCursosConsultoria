import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

import PdfPagePreview from "../../../shared/pdf/PdfPagePreview";
import SignatureStampTemplateEditor from "../../../shared/pdf/SignatureStampTemplateEditor";
import type {
  ElectronicSignatureAdministrationDraft,
  ElectronicSignatureStampTemplateElementId,
  ElectronicSignatureStampTemplateV1,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract";
import {
  createElectronicSignatureTemplatePreviewPdf,
  type ElectronicSignatureTemplatePreviewPayload,
} from "../../secretaria/assinatura-eletronica/comprovante-assinatura-eletronica.pdf";

interface ElectronicSignatureTemplatePreviewProps {
  draft: ElectronicSignatureAdministrationDraft;
  versionLabel: string;
  activePage: 1 | 2;
  mode?: "RECEIPT" | "SIGNATURE_STAMP";
  selectedStampElementId?: ElectronicSignatureStampTemplateElementId;
  disabled?: boolean;
  onSelectStampElement?: (
    elementId: ElectronicSignatureStampTemplateElementId,
  ) => void;
  onCommitStampTemplate?: (
    template: ElectronicSignatureStampTemplateV1,
  ) => void;
  identity:
    | Pick<
      ElectronicSignatureTemplatePreviewPayload,
      "institution" | "logo" | "institutionalWatermark" | "signatureStampAssets"
    >
    | null;
}

const ElectronicSignatureTemplatePreview: React.FC<
  ElectronicSignatureTemplatePreviewProps
> = ({
  draft,
  versionLabel,
  activePage,
  mode = "RECEIPT",
  selectedStampElementId = "seal",
  disabled = false,
  onSelectStampElement,
  onCommitStampTemplate,
  identity,
}) => {
  const generationRef = useRef(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!identity) return undefined;
    if (mode === "SIGNATURE_STAMP") {
      setBlob(null);
      setError(null);
      setIsGenerating(false);
      return undefined;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setIsGenerating(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void createElectronicSignatureTemplatePreviewPdf({
        ...identity,
        presentation: {
          policyName: draft.name,
          policyVersionLabel: versionLabel,
          confirmationMessage: draft.confirmationMessage,
          receiptTitle: draft.receiptTitle,
          receiptMessage: draft.receiptMessage,
          editor: draft.editor,
        },
      })
        .then((result) => {
          if (generationRef.current === generation) setBlob(result.blob);
        })
        .catch((failure) => {
          if (generationRef.current === generation) {
            setBlob(null);
            setError(
              failure instanceof Error
                ? failure.message
                : "Não foi possível gerar a prévia do modelo.",
            );
          }
        })
        .finally(() => {
          if (generationRef.current === generation) setIsGenerating(false);
        });
    }, 320);

    return () => {
      window.clearTimeout(timer);
      if (generationRef.current === generation) generationRef.current += 1;
    };
  }, [draft, identity, mode, versionLabel]);

  if (!identity) {
    return (
      <div className="flex min-h-[620px] items-center justify-center rounded-[2rem] bg-slate-100 p-8 text-center text-slate-500">
        <div>
          <Loader2 className="mx-auto animate-spin text-blue-600" size={30} />
          <p className="mt-3 text-xs font-black uppercase tracking-[0.16em]">
            Carregando identidade institucional
          </p>
        </div>
      </div>
    );
  }

  if (mode === "SIGNATURE_STAMP") {
    const assetId = draft.editor.signatureStamp.assetId;
    return (
      <div className="min-h-[620px] overflow-auto rounded-[2rem] bg-slate-200/80 p-4 sm:p-6">
        <SignatureStampTemplateEditor
          template={draft.editor.signatureStamp.template}
          selectedElementId={selectedStampElementId}
          assetPreview={assetId
            ? identity.signatureStampAssets[assetId]?.dataUrl ?? null
            : null}
          disabled={disabled}
          onSelect={(elementId) => onSelectStampElement?.(elementId)}
          onCommit={(template) => onCommitStampTemplate?.(template)}
        />
      </div>
    );
  }

  if (error && !blob) {
    return (
      <div
        className="flex min-h-[620px] items-center justify-center rounded-[2rem] bg-slate-100 p-8 text-center text-rose-700"
        role="alert"
      >
        <div className="max-w-md">
          <AlertTriangle className="mx-auto" size={30} />
          <p className="mt-3 text-sm font-black">
            A prévia ultrapassou a área segura
          </p>
          <p className="mt-2 text-xs font-medium leading-relaxed text-rose-600">
            {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[620px] overflow-auto rounded-[2rem] bg-slate-200/80 p-4 sm:p-6">
      {blob
        ? (
          <PdfPagePreview
            blob={blob}
            pageNumber={activePage}
            title="modelo do comprovante de assinatura eletrônica"
          />
        )
        : (
          <div
            className="flex min-h-[620px] items-center justify-center text-slate-500"
            role="status"
          >
            <Loader2 className="animate-spin text-blue-600" size={30} />
          </div>
        )}
      {isGenerating && blob && (
        <div className="pointer-events-none absolute right-6 top-6 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-blue-700 shadow-lg">
          <Loader2 size={13} className="animate-spin" /> Atualizando PDF
        </div>
      )}
      {error && blob && (
        <div
          className="absolute inset-x-6 bottom-6 rounded-xl border border-rose-200 bg-white p-3 text-xs font-semibold text-rose-700 shadow-lg"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default ElectronicSignatureTemplatePreview;
