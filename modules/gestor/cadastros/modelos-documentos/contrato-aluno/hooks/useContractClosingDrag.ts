import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  clampContractClosingPosition,
  type ContractClosingElementId,
  type ContractClosingPosition,
  type ContractClosingPositions,
} from '../../../../../shared/contrato-aluno/closing-positions';
import { CONTRACT_CLOSING_LABELS } from '../../../../../shared/contrato-aluno/ContractClosingPreview';

export const moveContractClosingPosition = (
  id: ContractClosingElementId, position: ContractClosingPosition,
  deltaX: number, deltaY: number, pageWidth: number, pageHeight: number,
) => clampContractClosingPosition(id, {
  ...position,
  x: position.x + deltaX * 210 / pageWidth,
  y: position.y + deltaY * 297 / pageHeight,
});

type DragSession = {
  id: ContractClosingElementId; pointerId: number; clientX: number; clientY: number;
  position: ContractClosingPosition; pageWidth: number; pageHeight: number;
};

export const useContractClosingDrag = (
  positions: ContractClosingPositions,
  onChange: ((positions: ContractClosingPositions) => void) | undefined,
  onSelect: ((id: ContractClosingElementId) => void) | undefined,
) => {
  const drag = useRef<DragSession | null>(null);
  const update = (id: ContractClosingElementId, position: ContractClosingPosition) => {
    onChange?.({ ...positions, elements: { ...positions.elements, [id]: position } });
  };
  const pointerDown = (event: PointerEvent<HTMLDivElement>, id: ContractClosingElementId) => {
    if (!onChange || event.button !== 0 || event.isPrimary === false) return;
    const page = event.currentTarget.closest('[data-contract-page]');
    const rect = page?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    event.preventDefault(); event.stopPropagation();
    onSelect?.(id);
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      position: positions.elements[id], pageWidth: rect.width, pageHeight: rect.height };
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    update(current.id, moveContractClosingPosition(current.id, current.position,
      event.clientX - current.clientX, event.clientY - current.clientY, current.pageWidth, current.pageHeight));
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>, id: ContractClosingElementId) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta || !onChange) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 5 : 0.5;
    const position = positions.elements[id];
    update(id, clampContractClosingPosition(id, {
      ...position, x: position.x + delta[0] * step, y: position.y + delta[1] * step,
    }));
  };
  return onChange ? (id: ContractClosingElementId) => ({
    role: 'button', tabIndex: 0, 'aria-label': `Mover ${CONTRACT_CLOSING_LABELS[id]}`,
    onFocus: () => onSelect?.(id), onPointerDown: (event: PointerEvent<HTMLDivElement>) => pointerDown(event, id),
    onPointerMove: pointerMove, onPointerUp: pointerEnd, onPointerCancel: pointerEnd,
    onLostPointerCapture: () => { drag.current = null; },
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => keyDown(event, id),
  }) : undefined;
};
