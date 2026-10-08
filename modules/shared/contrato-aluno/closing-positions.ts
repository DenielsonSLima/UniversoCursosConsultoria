import { parseContratoAlunoClosingLayout } from './closing-layout';

export const CONTRACT_CLOSING_ELEMENT_IDS = [
  'qr', 'contratante', 'contratada', 'testemunha1', 'testemunha2',
] as const;
export type ContractClosingElementId = typeof CONTRACT_CLOSING_ELEMENT_IDS[number];
/** Caixa em milímetros, a partir do canto superior esquerdo do A4. */
export interface ContractClosingPosition { x: number; y: number; width: number }
export interface ContractClosingPositions {
  version: 1;
  elements: Record<ContractClosingElementId, ContractClosingPosition>;
}
export const CONTRACT_CLOSING_LABELS: Record<ContractClosingElementId, string> = {
  qr: 'QR Code', contratante: 'Contratante', contratada: 'Contratada',
  testemunha1: 'Testemunha 1', testemunha2: 'Testemunha 2',
};
export const CONTRACT_CLOSING_BOUNDS = { left: 18, right: 192, top: 210.5, bottom: 281 };

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

export const getContractClosingElementHeight = (
  id: ContractClosingElementId, position: ContractClosingPosition,
) => id === 'qr' ? position.width + 7 : 11;

export const getActiveContractClosingElementIds = (footer: string, hasQr = true) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const ids: ContractClosingElementId[] = hasQr ? ['qr'] : [];
  layout.parties.slice(0, 2).forEach((party) => {
    const id = party.label.toLowerCase() as ContractClosingElementId;
    if ((id === 'contratante' || id === 'contratada') && !ids.includes(id)) ids.push(id);
  });
  layout.witnesses.forEach((_, index) => ids.push(index === 0 ? 'testemunha1' : 'testemunha2'));
  return ids;
};

const getDefaultPositions = (footer: string, hasQr: boolean): ContractClosingPositions => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const width = hasQr ? 132 : 174;
  const partyY = 214 + (layout.location ? 7 : 0);
  const witnessY = partyY + (layout.parties.length ? 12 : 0);
  const elements: ContractClosingPositions['elements'] = {
    qr: { x: 172, y: 210.5, width: 20 },
    contratante: { x: 18, y: partyY, width: (width - 8) / 2 },
    contratada: { x: 18 + (width + 8) / 2, y: partyY, width: (width - 8) / 2 },
    testemunha1: { x: 18, y: witnessY, width: (width - 8) / 2 },
    testemunha2: { x: 18 + (width + 8) / 2, y: witnessY, width: (width - 8) / 2 },
  };
  layout.parties.slice(0, 2).forEach((party, index) => {
    const id = party.label.toLowerCase();
    if (id !== 'contratante' && id !== 'contratada') return;
    const columnWidth = layout.parties.length === 1 ? width : (width - 8) / 2;
    elements[id] = { x: 18 + index * (columnWidth + 8), y: partyY, width: columnWidth };
  });
  if (layout.witnesses.length === 1) elements.testemunha1.width = width;
  return { version: 1, elements };
};

export const getContractClosingTextLayout = (footer: string, hasQr = true) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const defaults = getDefaultPositions(footer, hasQr);
  return {
    x: 18, width: hasQr ? 132 : 174, locationY: 214, fallbackY: 213,
    additionalY: layout.witnesses.length ? defaults.elements.testemunha1.y + 12
      : defaults.elements.contratante.y + 13,
  };
};

/** Ausência usa o modelo anterior; uma configuração inválida não é descartada. */
export const normalizeContractClosingPositions = (
  value: unknown, footer: string, hasQr = true,
): ContractClosingPositions => {
  const result = getDefaultPositions(footer, hasQr);
  if (value == null) return result;
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.elements)) {
    throw new Error('A configuração de posições do contrato é inválida.');
  }
  for (const key of Object.keys(value.elements)) {
    if (!(CONTRACT_CLOSING_ELEMENT_IDS as readonly string[]).includes(key)) {
      throw new Error('O modelo contém um elemento de assinatura desconhecido.');
    }
    const id = key as ContractClosingElementId;
    const position = value.elements[id];
    if (!isRecord(position) || !['x', 'y', 'width'].every((field) => (
      typeof position[field] === 'number' && Number.isFinite(position[field])
    ))) throw new Error(`A posição de ${CONTRACT_CLOSING_LABELS[id]} é inválida.`);
    result.elements[id] = { x: position.x as number, y: position.y as number, width: position.width as number };
  }
  return result;
};

/** Restrição só na edição; ler um snapshot nunca altera as coordenadas salvas. */
export const clampContractClosingPosition = (
  id: ContractClosingElementId, position: ContractClosingPosition,
): ContractClosingPosition => {
  const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const width = Math.min(id === 'qr' ? 40 : 174, Math.max(id === 'qr' ? 18 : 25, finite(position.width, id === 'qr' ? 20 : 62)));
  const height = getContractClosingElementHeight(id, { ...position, width });
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    x: round(Math.min(192 - width, Math.max(18, finite(position.x, 18)))),
    y: round(Math.min(281 - height, Math.max(210.5, finite(position.y, 221)))),
    width: round(width),
  };
};

type Box = ContractClosingPosition & { height: number; label: string };
const intersects = (a: Box, b: Box) => (
  a.x < b.x + b.width - 0.05 && a.x + a.width > b.x + 0.05
  && a.y < b.y + b.height - 0.05 && a.y + a.height > b.y + 0.05
);

export const validateContractClosingPositions = (value: unknown, footer: string, hasQr = true): string[] => {
  let positions: ContractClosingPositions;
  try { positions = normalizeContractClosingPositions(value, footer, hasQr); }
  catch (error) { return [error instanceof Error ? error.message : 'Posições inválidas.']; }
  const errors: string[] = [];
  const boxes: Box[] = getActiveContractClosingElementIds(footer, hasQr).map((id) => {
    const position = positions.elements[id];
    const height = getContractClosingElementHeight(id, position);
    const label = CONTRACT_CLOSING_LABELS[id];
    if (position.width < (id === 'qr' ? 18 : 25) || position.width > (id === 'qr' ? 40 : 174)
      || position.x < 18 || position.x + position.width > 192.01
      || position.y < 210.5 || position.y + height > 281.01) {
      errors.push(`${label} deve ficar dentro da área de assinaturas da última página.`);
    }
    return { ...position, height, label };
  });
  const layout = parseContratoAlunoClosingLayout(footer);
  const textLayout = getContractClosingTextLayout(footer, hasQr);
  if (layout.location) boxes.push({ x: textLayout.x, y: textLayout.locationY, width: textLayout.width, height: 7, label: 'Local e data' });
  if (layout.fallbackText) boxes.push({ x: textLayout.x, y: textLayout.fallbackY, width: textLayout.width, height: 40, label: 'Texto de encerramento' });
  if (layout.additionalLines.length) {
    boxes.push({ x: textLayout.x, y: textLayout.additionalY, width: textLayout.width, height: 13, label: 'Texto complementar' });
  }
  boxes.forEach((box, index) => boxes.slice(index + 1).forEach((other) => {
    if (intersects(box, other)) errors.push(`${box.label} está sobre ${other.label}. Afaste os elementos antes de salvar.`);
  }));
  return errors;
};
