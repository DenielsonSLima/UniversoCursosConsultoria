import React, { useEffect, useRef, useState } from "react";
import {
  GripVertical,
  Image as ImageIcon,
  Maximize2,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import type {
  ElectronicSignatureStampTemplateElement,
  ElectronicSignatureStampTemplateElementId,
  ElectronicSignatureStampTemplateV1,
} from "../assinatura-eletronica/assinatura-eletronica.contract";
import {
  cloneElectronicSignatureStampTemplate,
  getSignatureStampTemplateElementName,
  isSignatureStampTemplateQrClear,
  moveSignatureStampTemplateElement,
  resizeSignatureStampTemplateElement,
  SIGNATURE_STAMP_TEMPLATE_COORDINATE_SCALE,
  SIGNATURE_STAMP_TEMPLATE_ELEMENT_SPECS,
} from "../assinatura-eletronica/signature-stamp-template";

export interface SignatureStampTemplateEditorProps {
  /** Desenho global. Os bindings e estilos canônicos não são editáveis aqui. */
  template: ElectronicSignatureStampTemplateV1;
  selectedElementId: ElectronicSignatureStampTemplateElementId;
  /** Data URL ou URL temporária do ativo de imagem já autorizado. */
  assetPreview: string | null;
  disabled?: boolean;
  onSelect: (id: ElectronicSignatureStampTemplateElementId) => void;
  /** Só é chamado com uma mudança geométrica válida e sem colisão no QR. */
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
  SIGNER_ROLE: "Signatário autorizado",
  DISPLAY_TITLE: "Assinatura eletrônica",
  SIGNER_NAME: "Nome do signatário",
  SIGNED_AT: "20/08/2026, 15:42 BRT",
  SIGNER_CPF_MASKED: "***.***.***-**",
  SIGNATURE_HASH: "a91f…5e7c",
  VERIFICATION_CODE: "VLD-8H2P-6KQ9",
  VERIFICATION_URL: "validar.universo.example/8H2P",
};

const sameGeometry = (
  first: ElectronicSignatureStampTemplateV1,
  second: ElectronicSignatureStampTemplateV1,
) =>
  first.elements.every((element, index) => {
    const candidate = second.elements[index];
    return candidate && element.id === candidate.id &&
      element.xBp === candidate.xBp && element.yBp === candidate.yBp &&
      element.widthBp === candidate.widthBp &&
      element.heightBp === candidate.heightBp;
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

const fontFamilyFor = (font: "HELVETICA" | "HELVETICA_BOLD" | "COURIER") => {
  if (font === "COURIER") {
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
 * O componente só altera x/y/largura/altura. Os 11 elementos, seus bindings,
 * prefixos e estilos permanecem fechados no contrato compartilhado.
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

  const announceBlockedQrCollision = () => {
    setAnnouncement(
      "A alteração foi bloqueada: a área protegida do QR não pode se sobrepor a outro elemento.",
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
  ) => {
    if (element.kind === "QR") {
      const sizeDelta = Math.abs(deltaXBp) >= Math.abs(deltaYBp)
        ? deltaXBp
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
      announceBlockedQrCollision();
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
      : resizeFromDelta(element, deltaXBp, deltaYBp);
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
      announceBlockedQrCollision();
      return;
    }
    if (!sameGeometry(template, nextTemplate)) onCommit(nextTemplate);
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
    const sharedStyle: React.CSSProperties = {
      left: `${element.xBp / 1_000}%`,
      top: `${element.yBp / 1_000}%`,
      width: `${element.widthBp / 1_000}%`,
      height: `${element.heightBp / 1_000}%`,
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
        <span className="flex h-full w-full items-center justify-center rounded-md border border-dashed border-slate-400 bg-white text-slate-700">
          <QrCode aria-hidden="true" size="58%" strokeWidth={1.65} />
        </span>
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
      content = (
        <span
          className={`block h-full overflow-hidden whitespace-nowrap leading-tight ${
            alignmentClass(element.style.align)
          }`}
          style={{
            color: element.style.color,
            fontFamily: fontFamilyFor(element.style.font),
            fontWeight: element.style.font === "HELVETICA_BOLD" ? 700 : 500,
            fontSize: `clamp(6px, ${
              element.style.fontSizeBp / 1_000
            }cqw, 20px)`,
          }}
        >
          {element.style.label}
          {SAMPLE_VALUES[element.binding]}
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
          className={`absolute inset-0 min-h-0 min-w-0 cursor-move rounded border-2 bg-white/20 p-0 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
            selected
              ? "z-20 border-blue-600 shadow-[0_0_0_2px_rgba(255,255,255,0.92)]"
              : "z-10 border-slate-400/70 hover:border-blue-500"
          } disabled:cursor-not-allowed disabled:opacity-65`}
        >
          {content}
          <span className="pointer-events-none absolute -top-5 left-0 hidden rounded bg-[#001a33] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-white shadow sm:block">
            {elementName}
          </span>
          <span className="sr-only">
            Valor probatório bloqueado. Use as setas para mover; Shift mais seta
            move em passos maiores.
          </span>
        </button>
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
          className={`absolute -bottom-2 -right-2 z-30 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-white text-slate-700 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${
            selected ? "border-blue-600" : "border-slate-400"
          } disabled:cursor-not-allowed disabled:opacity-65`}
        >
          <Maximize2 aria-hidden="true" size={10} />
          <span className="sr-only">
            Use as setas para redimensionar; Shift mais seta altera em passos
            maiores.
          </span>
        </button>
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
            Arraste ou redimensione apenas a posição dos elementos. Nome, data,
            CPF, hash, código, URL e QR são vinculados à prova individual no
            momento da assinatura.
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-800">
          <ShieldCheck aria-hidden="true" size={13} /> 11 vínculos bloqueados
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <div
            ref={canvasRef}
            className="relative aspect-square w-full touch-none overflow-visible rounded-2xl border border-slate-300 bg-[radial-gradient(circle_at_1px_1px,rgba(148,163,184,0.24)_1px,transparent_0)] bg-[size:12px_12px] p-2 shadow-inner"
            style={{ containerType: "inline-size" }}
          >
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
              <span>Prévia geométrica</span>
              <span>1 modelo • N signatários</span>
            </div>
            {visibleTemplate.elements.map(renderElement)}
          </div>
          <p
            id="signature-stamp-template-guidance"
            className="mt-3 text-[11px] leading-relaxed text-slate-500"
          >
            Clique em um elemento para selecioná-lo. Arraste-o para mover; use o
            canto inferior direito ou as setas para redimensionar. A área
            protegida do QR bloqueia sobreposições.
          </p>
        </div>

        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
            Elementos do modelo
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-1">
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
                </button>
              );
            })}
          </div>
          {selectedElement && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-600">
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
                Somente posição e dimensão podem ser alteradas.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
};

export default SignatureStampTemplateEditor;
