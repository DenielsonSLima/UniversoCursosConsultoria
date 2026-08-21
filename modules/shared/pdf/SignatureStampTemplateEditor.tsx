import React, { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Eye,
  GripVertical,
  Image as ImageIcon,
  Italic,
  Maximize2,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS,
  type ElectronicSignatureStampTemplateElement,
  type ElectronicSignatureStampTemplateElementId,
  type ElectronicSignatureStampTemplateFont,
  type ElectronicSignatureStampTemplateTextAlign,
  type ElectronicSignatureStampTemplateTextElement,
  type ElectronicSignatureStampTemplateV1,
} from "../assinatura-eletronica/assinatura-eletronica.contract";
import {
  cloneElectronicSignatureStampTemplate,
  getSignatureStampTemplateElementName,
  getSignatureStampTemplateElementVisualBounds,
  getSignatureStampTemplateQrCollisionElementIds,
  isSignatureStampTemplateElementOptionalVisual,
  isSignatureStampTemplateElementVisible,
  isSignatureStampTemplateFontBold,
  isSignatureStampTemplateFontOblique,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  placeSignatureStampVerificationBelowQr,
  resizeSignatureStampTemplateElement,
  resizeSignatureStampTemplateElementFromCenter,
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS,
  updateSignatureStampTemplateFontVariant,
} from "../assinatura-eletronica/signature-stamp-template";
import { LocalQrCodeImage } from "../qrcode/LocalQrCodeImage";
import { formatDocumentValidationUrlForDisplay } from "../document-validation/document-validation.url";

export interface SignatureStampTemplateEditorProps {
  /** Desenho global. Conteúdo, bindings, rótulos e cores não são editáveis. */
  template: ElectronicSignatureStampTemplateV1;
  selectedElementId: ElectronicSignatureStampTemplateElementId;
  /** Data URL ou URL temporária do ativo de imagem já autorizado. */
  assetPreview: string | null;
  disabled?: boolean;
  onSelect: (id: ElectronicSignatureStampTemplateElementId) => void;
  /** Só recebe mudanças válidas de geometria ou tipografia, sem colisão no QR. */
  onCommit: (template: ElectronicSignatureStampTemplateV1) => void;
}

type InteractionMode = "MOVE" | "RESIZE";

interface PointerInteraction {
  pointerId: number;
  mode: InteractionMode;
  elementId: ElectronicSignatureStampTemplateElementId;
  startClientX: number;
  startClientY: number;
  canvasWidth: number;
  canvasHeight: number;
  startTemplate: ElectronicSignatureStampTemplateV1;
  latestTemplate: ElectronicSignatureStampTemplateV1;
}

const SAMPLE_VALUES: Record<
  Exclude<
    ElectronicSignatureStampTemplateElement["binding"],
    "STAMP_ASSET" | "DECORATIVE"
  >,
  string
> = {
  SIGNER_ROLE: "Signatário",
  DISPLAY_TITLE: ELECTRONIC_SIGNATURE_STAMP_DISPLAY_TITLE,
  SIGNER_NAME: "Maria S. Lima",
  SIGNED_AT: "20/08/2026, 15:42",
  SIGNER_CPF_MASKED: "12*.***.**9-01",
  SIGNATURE_HASH: "a91f…5e7c",
  VERIFICATION_CODE: "SIG-00000000-0000-4000-8000-000000000001",
  VERIFICATION_URL:
    "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001",
};

/** Conteúdo público fictício: a prévia nunca reutiliza um código real. */
const SAMPLE_QR_URL =
  "https://universocc.com.br/validador?code=SIG-00000000-0000-4000-8000-000000000001";

const sameGeometry = (
  first: ElectronicSignatureStampTemplateV1,
  second: ElectronicSignatureStampTemplateV1,
) =>
  first.elements.length === second.elements.length &&
  first.elements.every((element, index) => {
    const candidate = second.elements[index];
    return candidate && element.id === candidate.id &&
      element.xBp === candidate.xBp && element.yBp === candidate.yBp &&
      element.widthBp === candidate.widthBp &&
      element.heightBp === candidate.heightBp;
  }) &&
  (first.hiddenElementIds || []).join("|") ===
    (second.hiddenElementIds || []).join("|");

const sameTemplate = (
  first: ElectronicSignatureStampTemplateV1,
  second: ElectronicSignatureStampTemplateV1,
) =>
  sameGeometry(first, second) && first.elements.every((element, index) => {
    const candidate = second.elements[index];
    return candidate && JSON.stringify(element.style) ===
        JSON.stringify(candidate.style);
  });

const replaceElement = (
  template: ElectronicSignatureStampTemplateV1,
  replacement: ElectronicSignatureStampTemplateElement,
): ElectronicSignatureStampTemplateV1 => ({
  ...template,
  elements: template.elements.map((element) => (
    element.id === replacement.id ? replacement : element
  )),
});

const findElement = (
  template: ElectronicSignatureStampTemplateV1,
  id: ElectronicSignatureStampTemplateElementId,
) => template.elements.find((element) => element.id === id) || null;

const fontFamilyFor = (font: ElectronicSignatureStampTemplateFont) => {
  if (font.startsWith("COURIER")) {
    return "ui-monospace, SFMono-Regular, Menlo, monospace";
  }
  return "ui-sans-serif, system-ui, sans-serif";
};

const alignmentClass = (align: "LEFT" | "CENTER" | "RIGHT") => {
  if (align === "CENTER") return "text-center";
  if (align === "RIGHT") return "text-right";
  return "text-left";
};

/**
 * Editor visual do único modelo global de carimbo.
 *
 * O componente altera geometria e a tipografia permitida. Os 11 elementos,
 * seus bindings, prefixos, conteúdo e cores permanecem fechados no contrato.
 */
const SignatureStampTemplateEditor: React.FC<
  SignatureStampTemplateEditorProps
> = ({
  template,
  selectedElementId,
  assetPreview,
  disabled = false,
  onSelect,
  onCommit,
}) => {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<PointerInteraction | null>(null);
  const [transientTemplate, setTransientTemplate] = useState<
    ElectronicSignatureStampTemplateV1 | null
  >(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    interactionRef.current = null;
    setTransientTemplate(null);
  }, [template]);

  const visibleTemplate = transientTemplate || template;
  const selectedElement = findElement(visibleTemplate, selectedElementId);
  const isElementHidden = (
    id: ElectronicSignatureStampTemplateElementId,
  ) => !isSignatureStampTemplateElementVisible(template, id);
  const selectedElementHidden = Boolean(
    selectedElement && isElementHidden(selectedElement.id),
  );

  const announceBlockedQrCollision = (
    candidate: ElectronicSignatureStampTemplateV1,
    elementId?: ElectronicSignatureStampTemplateElementId,
  ) => {
    const collisions = getSignatureStampTemplateQrCollisionElementIds(
      candidate,
    ).map(getSignatureStampTemplateElementName);
    const collisionDescription = collisions.length
      ? collisions.join(", ")
      : "outro item protegido";
    const elementName = elementId
      ? getSignatureStampTemplateElementName(elementId)
      : "este item";
    setAnnouncement(
      `Não foi possível alterar ${elementName}: a área protegida do QR ficaria sobre ${collisionDescription}. Mova ou reduza esses blocos; somente Papel, Título e Linha decorativa podem ser ocultados do visual.`,
    );
  };

  const beginInteraction = (
    event: React.PointerEvent,
    mode: InteractionMode,
    elementId: ElectronicSignatureStampTemplateElementId,
  ) => {
    if (disabled) return;
    const canvas = canvasRef.current?.getBoundingClientRect();
    if (!canvas?.width || !canvas.height) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(elementId);
    const startTemplate = cloneElectronicSignatureStampTemplate(template);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode,
      elementId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      startTemplate,
      latestTemplate: startTemplate,
    };
    setTransientTemplate(startTemplate);
  };

  const resizeFromDelta = (
    element: ElectronicSignatureStampTemplateElement,
    deltaXBp: number,
    deltaYBp: number,
    canvasAspectRatio = 1,
  ) => {
    if (element.kind === "QR") {
      // O QR visível é quadrado. Convertemos o deslocamento horizontal
      // para a escala vertical da superfície antes de escolher o maior gesto.
      const horizontalSizeDelta = Math.round(deltaXBp * canvasAspectRatio);
      const sizeDelta = Math.abs(horizontalSizeDelta) >= Math.abs(deltaYBp)
        ? horizontalSizeDelta
        : deltaYBp;
      const size = element.widthBp + sizeDelta;
      return resizeSignatureStampTemplateElement(element, size, size);
    }
    return resizeSignatureStampTemplateElement(
      element,
      element.widthBp + deltaXBp,
      element.heightBp + deltaYBp,
    );
  };

  const applyCandidate = (
    interaction: PointerInteraction,
    candidate: ElectronicSignatureStampTemplateElement,
  ) => {
    const nextTemplate = replaceElement(interaction.startTemplate, candidate);
    if (!isSignatureStampTemplateQrClear(nextTemplate)) {
      announceBlockedQrCollision(nextTemplate, interaction.elementId);
      return;
    }
    interaction.latestTemplate = nextTemplate;
    setTransientTemplate(nextTemplate);
  };

  const continueInteraction = (
    event: React.PointerEvent,
  ) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const element = findElement(
      interaction.startTemplate,
      interaction.elementId,
    );
    if (!element) return;
    const deltaXBp = Math.round(
      (event.clientX - interaction.startClientX) *
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE / interaction.canvasWidth,
    );
    const deltaYBp = Math.round(
      (event.clientY - interaction.startClientY) *
        SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE / interaction.canvasHeight,
    );
    const candidate = interaction.mode === "MOVE"
      ? moveSignatureStampTemplateElement(element, deltaXBp, deltaYBp)
      : resizeFromDelta(
        element,
        deltaXBp,
        deltaYBp,
        interaction.canvasWidth / interaction.canvasHeight,
      );
    applyCandidate(interaction, candidate);
  };

  const finishInteraction = (
    event: React.PointerEvent,
    cancelled = false,
  ) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
    setTransientTemplate(null);
    if (
      cancelled ||
      sameGeometry(interaction.startTemplate, interaction.latestTemplate)
    ) {
      return;
    }
    onCommit(cloneElectronicSignatureStampTemplate(interaction.latestTemplate));
    setAnnouncement(
      `${
        getSignatureStampTemplateElementName(interaction.elementId)
      } atualizado no modelo global.`,
    );
  };

  const commitElement = (
    candidate: ElectronicSignatureStampTemplateElement,
  ) => {
    const nextTemplate = replaceElement(template, candidate);
    if (!isSignatureStampTemplateQrClear(nextTemplate)) {
      announceBlockedQrCollision(nextTemplate, candidate.id);
      return false;
    }
    if (sameTemplate(template, nextTemplate)) return false;
    onCommit(nextTemplate);
    return true;
  };

  const adjustSelectedElementSize = (deltaBp: number) => {
    if (!selectedElement) return;
    const widthBp = selectedElement.widthBp + deltaBp;
    const heightBp = selectedElement.kind === "LINE"
      ? selectedElement.heightBp
      : selectedElement.kind === "TEXT"
      ? selectedElement.heightBp + Math.round(deltaBp / 2)
      : selectedElement.heightBp + deltaBp;
    const candidate = selectedElement.kind === "QR"
      ? resizeSignatureStampTemplateElement(
        selectedElement,
        widthBp,
        heightBp,
      )
      : resizeSignatureStampTemplateElementFromCenter(
        selectedElement,
        widthBp,
        heightBp,
      );
    if (
      candidate.widthBp === selectedElement.widthBp &&
      candidate.heightBp === selectedElement.heightBp
    ) {
      setAnnouncement(
        deltaBp > 0
          ? "Este elemento já atingiu o maior tamanho permitido nesta posição."
          : "Este elemento já atingiu o menor tamanho permitido.",
      );
      return;
    }
    if (commitElement(candidate)) {
      setAnnouncement(
        `Área de ${
          getSignatureStampTemplateElementName(selectedElement.id)
        } atualizada.`,
      );
    }
  };

  const commitSelectedTextStyle = (
    update: Partial<
      Pick<
        ElectronicSignatureStampTemplateTextElement["style"],
        "font" | "fontSizeBp" | "align"
      >
    >,
  ) => {
    if (
      !selectedElement || selectedElement.kind !== "TEXT" ||
      selectedElementHidden
    ) {
      return false;
    }
    const candidate: ElectronicSignatureStampTemplateTextElement = {
      ...selectedElement,
      style: { ...selectedElement.style, ...update },
    };
    return commitElement(candidate);
  };

  const adjustSelectedTextFontSize = (deltaBp: number) => {
    if (!selectedElement || selectedElement.kind !== "TEXT") return;
    const nextSize = Math.min(
      ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.maxBp,
      Math.max(
        ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS.minBp,
        selectedElement.style.fontSizeBp + deltaBp,
      ),
    );
    if (nextSize === selectedElement.style.fontSizeBp) {
      setAnnouncement(
        deltaBp > 0
          ? "A fonte já atingiu o maior tamanho permitido."
          : "A fonte já atingiu o menor tamanho permitido.",
      );
      return;
    }
    if (commitSelectedTextStyle({ fontSizeBp: nextSize })) {
      setAnnouncement(
        `Fonte de ${
          getSignatureStampTemplateElementName(selectedElement.id)
        } atualizada.`,
      );
    }
  };

  const toggleSelectedTextBold = () => {
    if (!selectedElement || selectedElement.kind !== "TEXT") return;
    const bold = !isSignatureStampTemplateFontBold(selectedElement.style.font);
    if (
      commitSelectedTextStyle({
        font: updateSignatureStampTemplateFontVariant(
          selectedElement.style.font,
          { bold },
        ),
      })
    ) {
      setAnnouncement(
        `Negrito ${bold ? "ativado" : "desativado"} em ${
          getSignatureStampTemplateElementName(selectedElement.id)
        }.`,
      );
    }
  };

  const toggleSelectedTextOblique = () => {
    if (!selectedElement || selectedElement.kind !== "TEXT") return;
    const oblique = !isSignatureStampTemplateFontOblique(
      selectedElement.style.font,
    );
    if (
      commitSelectedTextStyle({
        font: updateSignatureStampTemplateFontVariant(
          selectedElement.style.font,
          { oblique },
        ),
      })
    ) {
      setAnnouncement(
        `Itálico ${oblique ? "ativado" : "desativado"} em ${
          getSignatureStampTemplateElementName(selectedElement.id)
        }.`,
      );
    }
  };

  const alignSelectedText = (
    align: ElectronicSignatureStampTemplateTextAlign,
  ) => {
    if (
      selectedElement?.kind === "TEXT" &&
      commitSelectedTextStyle({ align })
    ) {
      setAnnouncement(
        `Alinhamento de ${
          getSignatureStampTemplateElementName(selectedElement.id)
        } atualizado.`,
      );
    }
  };

  const applyStandardVerificationLayout = () => {
    try {
      const candidate = placeSignatureStampVerificationBelowQr(template);
      if (!isSignatureStampTemplateQrClear(candidate)) {
        announceBlockedQrCollision(candidate);
        return;
      }
      if (sameGeometry(template, candidate)) {
        setAnnouncement("O código já está posicionado abaixo do QR.");
        return;
      }
      onCommit(candidate);
      setAnnouncement(
        "Código e endereço de verificação posicionados abaixo do QR.",
      );
    } catch (error) {
      setAnnouncement(
        error instanceof Error
          ? error.message
          : "Não foi possível posicionar o código abaixo do QR.",
      );
    }
  };

  const toggleSelectedElementVisibility = () => {
    if (
      !selectedElement ||
      !isSignatureStampTemplateElementOptionalVisual(selectedElement.id)
    ) {
      return;
    }
    const selectedId = selectedElement.id;
    const hiddenIds = template.hiddenElementIds || [];
    const isHidden = hiddenIds.includes(selectedId);
    const nextHiddenElementIds = isHidden
      ? hiddenIds.filter((id) => id !== selectedId)
      : [
        ...hiddenIds,
        selectedId,
      ].sort((left, right) => (
        ["signerRole", "title", "divider"].indexOf(left) -
        ["signerRole", "title", "divider"].indexOf(right)
      ));
    const candidate: ElectronicSignatureStampTemplateV1 = {
      schemaVersion: template.schemaVersion,
      coordinateSpace: template.coordinateSpace,
      elements: template.elements,
      ...(nextHiddenElementIds.length
        ? { hiddenElementIds: nextHiddenElementIds }
        : {}),
    };
    if (!isSignatureStampTemplateQrClear(candidate)) {
      announceBlockedQrCollision(candidate);
      return;
    }
    onCommit(candidate);
    setAnnouncement(
      isHidden
        ? `${
          getSignatureStampTemplateElementName(selectedId)
        } restaurado no carimbo.`
        : `${
          getSignatureStampTemplateElementName(selectedId)
        } ocultado somente no carimbo; as provas continuam preservadas.`,
    );
  };

  const handleMoveKeyDown = (
    event: React.KeyboardEvent,
    element: ElectronicSignatureStampTemplateElement,
  ) => {
    const step = event.shiftKey ? 2_000 : 500;
    const deltas: Partial<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onSelect(element.id);
    commitElement(
      moveSignatureStampTemplateElement(element, delta[0], delta[1]),
    );
  };

  const handleResizeKeyDown = (
    event: React.KeyboardEvent,
    element: ElectronicSignatureStampTemplateElement,
  ) => {
    const step = event.shiftKey ? 2_000 : 500;
    const deltas: Partial<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onSelect(element.id);
    commitElement(resizeFromDelta(element, delta[0], delta[1]));
  };

  const renderElement = (element: ElectronicSignatureStampTemplateElement) => {
    const selected = element.id === selectedElementId;
    const elementName = getSignatureStampTemplateElementName(element.id);
    const visualBounds = getSignatureStampTemplateElementVisualBounds(element);
    const sharedStyle: React.CSSProperties = {
      left: `${visualBounds.xBp / 1_000}%`,
      top: `${visualBounds.yBp / 1_000}%`,
      width: `${visualBounds.widthBp / 1_000}%`,
      height: `${visualBounds.heightBp / 1_000}%`,
    };

    let content: React.ReactNode;
    if (element.kind === "IMAGE") {
      content = assetPreview
        ? (
          <img
            src={assetPreview}
            alt=""
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
            style={{ opacity: element.style.opacityBp / 100_000 }}
          />
        )
        : (
          <span className="flex h-full w-full items-center justify-center rounded-md bg-slate-100 text-slate-400">
            <ImageIcon aria-hidden="true" size={18} />
          </span>
        );
    } else if (element.kind === "QR") {
      content = (
        <LocalQrCodeImage
          value={SAMPLE_QR_URL}
          size={320}
          margin={4}
          errorCorrectionLevel="M"
          alt="QR demonstrativo de validação"
          loadingLabel="Gerando QR demonstrativo"
          errorLabel="QR indisponível"
          className="pointer-events-none h-full w-full rounded-md border border-dashed border-slate-400 bg-white p-[3%]"
          imageClassName="h-full w-full object-contain [image-rendering:pixelated]"
        />
      );
    } else if (element.kind === "LINE") {
      content = (
        <span
          className="absolute inset-x-0 top-1/2 -translate-y-1/2"
          style={{
            height: `${Math.max(1, element.style.widthBp / 1_000)}px`,
            backgroundColor: element.style.color,
          }}
        />
      );
    } else {
      const sampleValue = SAMPLE_VALUES[element.binding];
      const visibleSampleValue = element.binding === "VERIFICATION_URL"
        ? formatDocumentValidationUrlForDisplay(sampleValue)
        : sampleValue;
      const visibleLabel = element.id === "signerName"
        ? ""
        : element.style.label;
      const stackedValidationText = element.binding === "VERIFICATION_CODE" ||
        element.binding === "VERIFICATION_URL";
      content = (
        <span
          className={`block h-full select-none overflow-hidden whitespace-normal leading-[1.12] ${
            stackedValidationText ? "break-all" : "break-words"
          } ${alignmentClass(element.style.align)}`}
          style={{
            color: element.style.color,
            fontFamily: fontFamilyFor(element.style.font),
            fontWeight: isSignatureStampTemplateFontBold(element.style.font)
              ? 700
              : 400,
            fontStyle: isSignatureStampTemplateFontOblique(element.style.font)
              ? "italic"
              : "normal",
            // A fonte no PDF é proporcional à altura física do selo. Usar cqw
            // aqui (quando o selo é horizontal) fazia cada texto parecer enorme.
            fontSize: `clamp(7px, ${
              element.style.fontSizeBp / 1_000
            }cqh, 64px)`,
          }}
        >
          {stackedValidationText
            ? (
              <>
                <span className="block font-semibold">
                  {element.binding === "VERIFICATION_CODE"
                    ? "CÓD. VALIDAÇÃO"
                    : element.style.label.trim()}
                </span>
                <span className="block">{visibleSampleValue}</span>
              </>
            )
            : (
              <>
                {visibleLabel}
                {sampleValue}
              </>
            )}
        </span>
      );
    }

    return (
      <div key={element.id} className="absolute" style={sharedStyle}>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Mover ${elementName}`}
          aria-pressed={selected}
          aria-describedby="signature-stamp-template-guidance"
          onClick={() => onSelect(element.id)}
          onPointerDown={(event) => beginInteraction(event, "MOVE", element.id)}
          onPointerMove={continueInteraction}
          onPointerUp={finishInteraction}
          onPointerCancel={(event) => finishInteraction(event, true)}
          onKeyDown={(event) => handleMoveKeyDown(event, element)}
          className={`absolute inset-0 min-h-0 min-w-0 cursor-move rounded border-2 bg-white/10 p-0 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
            selected
              ? "z-20 border-blue-600 shadow-[0_0_0_2px_rgba(255,255,255,0.92)]"
              : "z-10 border-transparent hover:border-slate-400/80"
          } disabled:cursor-not-allowed disabled:opacity-65`}
        >
          {content}
          <span className="sr-only">
            Valor probatório bloqueado. Use as setas para mover; Shift mais seta
            move em passos maiores.
          </span>
        </button>
        {selected && (
          <button
            type="button"
            disabled={disabled}
            aria-label={`Redimensionar ${elementName}`}
            aria-describedby="signature-stamp-template-guidance"
            onClick={() => onSelect(element.id)}
            onPointerDown={(event) =>
              beginInteraction(event, "RESIZE", element.id)}
            onPointerMove={continueInteraction}
            onPointerUp={finishInteraction}
            onPointerCancel={(event) => finishInteraction(event, true)}
            onKeyDown={(event) => handleResizeKeyDown(event, element)}
            className="absolute -bottom-5 -right-5 z-30 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border-2 border-blue-600 bg-white text-slate-700 shadow-md outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-65"
          >
            <Maximize2 aria-hidden="true" size={15} />
            <span className="sr-only">
              Use as setas para redimensionar; Shift mais seta altera em passos
              maiores.
            </span>
          </button>
        )}
      </div>
    );
  };

  return (
    <section
      className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      aria-label="Editor livre do modelo global de carimbo"
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-[#001a33]">
            <ShieldCheck aria-hidden="true" size={17} />
            <p className="text-xs font-black uppercase tracking-[0.13em]">
              Modelo global de carimbo
            </p>
          </div>
          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-slate-600">
            Arraste e redimensione os elementos; nos textos, ajuste tamanho,
            negrito, itálico e alinhamento. Conteúdo, rótulos e vínculos
            probatórios continuam protegidos.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-800">
          <ShieldCheck aria-hidden="true" size={13} /> 11 vínculos bloqueados
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            <span>Prévia na proporção do PDF</span>
            <span>1 modelo · N signatários</span>
          </div>
          <div
            ref={canvasRef}
            className="relative aspect-[19/7] w-full touch-none overflow-visible rounded-2xl border border-slate-300 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.24)_1px,transparent_0)] bg-[size:12px_12px] shadow-inner"
            style={{ containerType: "size" }}
          >
            {visibleTemplate.elements
              .filter((element) =>
                isSignatureStampTemplateElementVisible(
                  visibleTemplate,
                  element.id,
                )
              )
              .map(renderElement)}
          </div>
          <p
            id="signature-stamp-template-guidance"
            className="mt-3 text-[11px] leading-relaxed text-slate-500"
          >
            {selectedElementHidden
              ? "Este item está oculto somente na aparência. Selecione Restaurar no painel ao lado para exibi-lo novamente."
              : "Use os botões − e + no painel ao lado para alterar a área do bloco. Também é possível arrastar o item para mover e usar a alça azul grande para redimensionar."}
          </p>
        </div>

        <div className="flex flex-col rounded-2xl bg-slate-50 p-3">
          <p className="order-1 px-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Elementos do modelo
          </p>
          <div className="order-3 mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-1">
            {SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS.map((spec) => {
              const selected = spec.id === selectedElementId;
              return (
                <button
                  key={spec.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onSelect(spec.id)}
                  className={`flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-bold outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    selected
                      ? "bg-[#001a33] text-white shadow-sm"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  } disabled:cursor-not-allowed disabled:opacity-65`}
                >
                  <GripVertical
                    aria-hidden="true"
                    size={13}
                    className="shrink-0 opacity-65"
                  />
                  <span className="truncate">
                    {getSignatureStampTemplateElementName(spec.id)}
                  </span>
                  {isElementHidden(spec.id) && (
                    <span className="ml-auto shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-600">
                      Oculto
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {selectedElement && (
            <div className="order-2 mt-3 rounded-xl border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-600">
              <p className="font-black uppercase tracking-[0.1em] text-[#001a33]">
                {getSignatureStampTemplateElementName(selectedElement.id)}
              </p>
              <p className="mt-1">
                Vínculo canônico:{" "}
                <span className="font-mono font-bold">
                  {selectedElement.binding}
                </span>
              </p>
              <p className="mt-1 text-slate-500">
                {selectedElementHidden
                  ? "Este item está oculto na aparência do carimbo; os dados e as provas continuam preservados."
                  : selectedElement.kind === "TEXT"
                  ? "Conteúdo, vínculo, rótulo e cor ficam protegidos; você ajusta geometria e tipografia."
                  : "O conteúdo e o estilo canônicos ficam protegidos; você ajusta somente a área e a posição."}
              </p>
              {isSignatureStampTemplateElementOptionalVisual(
                  selectedElement.id,
                )
                ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={toggleSelectedElementVisibility}
                    className={`mt-3 flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-[10px] font-black uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedElementHidden
                        ? "border-blue-200 bg-white text-blue-800 hover:bg-blue-50"
                        : "border-red-200 bg-white text-red-700 hover:bg-red-50"
                    }`}
                  >
                    {selectedElementHidden
                      ? <Eye aria-hidden="true" size={15} />
                      : <Trash2 aria-hidden="true" size={15} />}
                    {selectedElementHidden
                      ? "Restaurar no carimbo"
                      : "Ocultar do carimbo"}
                  </button>
                )
                : (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-slate-600">
                    <ShieldCheck
                      aria-hidden="true"
                      size={14}
                      className="mr-1 inline-block text-blue-700"
                    />
                    Este item é obrigatório no carimbo e não pode ser excluído.
                  </p>
                )}
              <div className="mt-3 rounded-lg bg-blue-50 p-2 text-blue-900">
                {selectedElement.kind === "QR" && (
                  <p className="font-medium">
                    QR real de demonstração. O QR final apontará para a URL
                    individual desta assinatura.
                  </p>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-bold">
                    Área: {Math.round(selectedElement.widthBp / 1_000)}% ×{"  "}
                    {Math.round(selectedElement.heightBp / 1_000)}%
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => adjustSelectedElementSize(-2_000)}
                      className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-800 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Diminuir área de ${
                        getSignatureStampTemplateElementName(selectedElement.id)
                      }`}
                    >
                      <Minus aria-hidden="true" size={17} />
                    </button>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => adjustSelectedElementSize(2_000)}
                      className="inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-lg border border-blue-700 bg-blue-700 text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Aumentar área de ${
                        getSignatureStampTemplateElementName(selectedElement.id)
                      }`}
                    >
                      <Plus aria-hidden="true" size={17} />
                    </button>
                  </span>
                </div>
                <p className="mt-2 text-slate-600">
                  {selectedElement.kind === "QR"
                    ? "O QR mantém o formato quadrado e não pode cobrir itens visíveis."
                    : selectedElement.kind === "LINE"
                    ? "Na linha, os controles alteram apenas a largura."
                    : selectedElement.kind === "TEXT"
                    ? "Estes controles alteram a área do bloco. A tipografia possui controles próprios abaixo."
                    : "Nos elementos de imagem, os controles alteram largura e altura."}
                </p>
                {announcement && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-3 rounded-lg border border-blue-200 bg-white px-2 py-2 text-blue-950"
                  >
                    {announcement}
                  </p>
                )}
              </div>
              {selectedElement.kind === "TEXT" && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <p className="font-black uppercase tracking-[0.1em] text-[#001a33]">
                    Tipografia
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-700">
                      Tamanho: {selectedElement.style.fontSizeBp / 1_000}%
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={disabled || selectedElementHidden ||
                          selectedElement.style.fontSizeBp <=
                            ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS
                              .minBp}
                        onClick={() =>
                          adjustSelectedTextFontSize(
                            -ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS
                              .stepBp,
                          )}
                        aria-label={`Diminuir tamanho da fonte de ${
                          getSignatureStampTemplateElementName(
                            selectedElement.id,
                          )
                        }`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Minus aria-hidden="true" size={15} />
                      </button>
                      <button
                        type="button"
                        disabled={disabled || selectedElementHidden ||
                          selectedElement.style.fontSizeBp >=
                            ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS
                              .maxBp}
                        onClick={() =>
                          adjustSelectedTextFontSize(
                            ELECTRONIC_SIGNATURE_STAMP_TEMPLATE_FONT_SIZE_LIMITS
                              .stepBp,
                          )}
                        aria-label={`Aumentar tamanho da fonte de ${
                          getSignatureStampTemplateElementName(
                            selectedElement.id,
                          )
                        }`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-700 bg-blue-700 text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Plus aria-hidden="true" size={15} />
                      </button>
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={disabled || selectedElementHidden}
                      aria-label="Alternar negrito"
                      aria-pressed={isSignatureStampTemplateFontBold(
                        selectedElement.style.font,
                      )}
                      onClick={toggleSelectedTextBold}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition aria-pressed:border-blue-700 aria-pressed:bg-blue-700 aria-pressed:text-white hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Bold aria-hidden="true" size={15} /> Negrito
                    </button>
                    <button
                      type="button"
                      disabled={disabled || selectedElementHidden}
                      aria-label="Alternar itálico"
                      aria-pressed={isSignatureStampTemplateFontOblique(
                        selectedElement.style.font,
                      )}
                      onClick={toggleSelectedTextOblique}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition aria-pressed:border-blue-700 aria-pressed:bg-blue-700 aria-pressed:text-white hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Italic aria-hidden="true" size={15} /> Itálico
                    </button>
                  </div>

                  <div
                    className="mt-2 grid grid-cols-3 gap-1.5"
                    aria-label="Alinhamento do texto"
                  >
                    {([
                      ["LEFT", "Alinhar à esquerda", AlignLeft],
                      ["CENTER", "Centralizar", AlignCenter],
                      ["RIGHT", "Alinhar à direita", AlignRight],
                    ] as const).map(([align, label, Icon]) => (
                      <button
                        key={align}
                        type="button"
                        disabled={disabled || selectedElementHidden}
                        aria-label={label}
                        aria-pressed={selectedElement.style.align === align}
                        onClick={() => alignSelectedText(align)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition aria-pressed:border-blue-700 aria-pressed:bg-blue-700 aria-pressed:text-white hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Icon aria-hidden="true" size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(selectedElement.id === "verificationQr" ||
                selectedElement.id === "verificationCode" ||
                selectedElement.id === "verificationUrl") && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={applyStandardVerificationLayout}
                  className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-2 py-2 text-left text-[10px] font-black uppercase tracking-[0.08em] text-blue-800 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Posicionar código abaixo do QR
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!selectedElement && announcement && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium leading-relaxed text-blue-950"
        >
          {announcement}
        </p>
      )}
    </section>
  );
};

export default SignatureStampTemplateEditor;
