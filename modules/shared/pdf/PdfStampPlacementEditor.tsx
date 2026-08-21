import React, { useEffect, useRef, useState } from 'react';

import type {
  ElectronicSignatureStampRole,
  ElectronicSignatureStampSlot,
} from '../assinatura-eletronica/assinatura-eletronica.contract';
import {
  SIGNATURE_STAMP_COORDINATE_SCALE,
  clampSignatureStampPlacement,
  moveSignatureStampPlacement,
  signatureStampPlacementsOverlap,
} from '../assinatura-eletronica/signature-stamp-placement';
import PdfPagePreview from './PdfPagePreview';

interface PdfStampPlacementEditorProps {
  blob: Blob;
  slots: readonly [ElectronicSignatureStampSlot, ElectronicSignatureStampSlot];
  selectedRole: ElectronicSignatureStampRole;
  disabled?: boolean;
  onSelect: (role: ElectronicSignatureStampRole) => void;
  onCommit: (role: ElectronicSignatureStampRole, placement: ElectronicSignatureStampSlot) => void;
}

interface DragState {
  pointerId: number;
  role: ElectronicSignatureStampRole;
  startClientX: number;
  startClientY: number;
  startPlacement: ElectronicSignatureStampSlot;
  containerWidth: number;
  containerHeight: number;
}

const roleLabel: Record<ElectronicSignatureStampRole, string> = {
  PROFESSOR: 'Professor',
  COORDENADOR: 'Coordenador',
};

const PdfStampPlacementEditor: React.FC<PdfStampPlacementEditorProps> = ({
  blob,
  slots,
  selectedRole,
  disabled = false,
  onSelect,
  onCommit,
}) => {
  const dragRef = useRef<DragState | null>(null);
  const transientRef = useRef<ElectronicSignatureStampSlot | null>(null);
  const [transient, setTransient] = useState<ElectronicSignatureStampSlot | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setTransient(null);
    transientRef.current = null;
    dragRef.current = null;
  }, [blob]);

  const commitIfValid = (
    role: ElectronicSignatureStampRole,
    placement: ElectronicSignatureStampSlot,
  ) => {
    const other = slots.find((slot) => slot.role !== role);
    if (other && signatureStampPlacementsOverlap(placement, other)) {
      setAnnouncement('Posição não aplicada porque os carimbos não podem se sobrepor.');
      transientRef.current = null;
      setTransient(null);
      return;
    }
    onCommit(role, placement);
    setAnnouncement(`Posição do carimbo de ${roleLabel[role]} atualizada.`);
    transientRef.current = null;
    setTransient(null);
  };

  const visibleSlots = slots.map((slot) => (
    transient?.role === slot.role ? transient : slot
  )) as [ElectronicSignatureStampSlot, ElectronicSignatureStampSlot];

  const overlay = (
    <div className="relative h-full w-full touch-none">
      {visibleSlots.map((slot) => {
        const selected = slot.role === selectedRole;
        return (
          <button
            key={slot.role}
            type="button"
            disabled={disabled}
            aria-label={`Posicionar carimbo de ${roleLabel[slot.role]} na última página do documento original`}
            aria-pressed={selected}
            onPointerDown={(event) => {
              if (disabled) return;
              const container = event.currentTarget.parentElement?.getBoundingClientRect();
              if (!container?.width || !container.height) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              onSelect(slot.role);
              dragRef.current = {
                pointerId: event.pointerId,
                role: slot.role,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startPlacement: slot,
                containerWidth: container.width,
                containerHeight: container.height,
              };
              transientRef.current = slot;
              setTransient(slot);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || drag.role !== slot.role) return;
              const deltaXBp = (event.clientX - drag.startClientX)
                * SIGNATURE_STAMP_COORDINATE_SCALE / drag.containerWidth;
              const deltaYBp = (event.clientY - drag.startClientY)
                * SIGNATURE_STAMP_COORDINATE_SCALE / drag.containerHeight;
              const nextPlacement = {
                ...drag.startPlacement,
                ...moveSignatureStampPlacement(drag.startPlacement, deltaXBp, deltaYBp),
              };
              transientRef.current = nextPlacement;
              setTransient(nextPlacement);
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || drag.role !== slot.role) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              dragRef.current = null;
              commitIfValid(slot.role, transientRef.current || slot);
            }}
            onPointerCancel={(event) => {
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId || drag.role !== slot.role) return;
              const finalPlacement = transientRef.current;
              dragRef.current = null;
              if (finalPlacement) {
                commitIfValid(slot.role, finalPlacement);
              } else {
                transientRef.current = null;
                setTransient(null);
              }
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 1_000 : 250;
              const deltas: Partial<Record<typeof event.key, readonly [number, number]>> = {
                ArrowLeft: [-step, 0],
                ArrowRight: [step, 0],
                ArrowUp: [0, -step],
                ArrowDown: [0, step],
              };
              const delta = deltas[event.key];
              if (!delta) return;
              event.preventDefault();
              onSelect(slot.role);
              const moved = clampSignatureStampPlacement(moveSignatureStampPlacement(slot, delta[0], delta[1]));
              commitIfValid(slot.role, { ...slot, ...moved });
            }}
            className={`absolute cursor-move rounded border-2 bg-transparent outline-none transition focus-visible:ring-4 focus-visible:ring-blue-300/70 ${selected
              ? 'border-blue-600 shadow-[0_0_0_2px_rgba(255,255,255,0.9)]'
              : 'border-slate-400/70 hover:border-blue-500'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            style={{
              left: `${slot.xBp / 1_000}%`,
              top: `${slot.yBp / 1_000}%`,
              width: `${slot.widthBp / 1_000}%`,
              height: `${slot.heightBp / 1_000}%`,
            }}
          >
            <span className="absolute -top-6 left-0 rounded bg-[#001a33] px-2 py-1 text-[8px] font-black uppercase tracking-wide text-white shadow">
              {roleLabel[slot.role]}
            </span>
            <span className="sr-only">Use as setas para mover; Shift mais seta move em passos maiores.</span>
          </button>
        );
      })}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );

  return (
    <PdfPagePreview
      blob={blob}
      pageNumber={1}
      title="posicionamento do carimbo na última página do documento original"
      overlay={overlay}
    />
  );
};

export default PdfStampPlacementEditor;
