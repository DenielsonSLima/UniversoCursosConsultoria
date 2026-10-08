import React from 'react';
import { parseContratoAlunoClosingLayout } from './closing-layout';
import {
  getContractClosingElementHeight,
  getActiveContractClosingElementIds,
  getContractClosingTextLayout,
  normalizeContractClosingPositions,
  type ContractClosingElementId,
  type ContractClosingPositions,
} from './closing-positions';
export { CONTRACT_CLOSING_LABELS } from './closing-positions';

export const getContractClosingPreviewElements = (footer: string, hasQr: boolean) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  return getActiveContractClosingElementIds(footer, hasQr).map((id) => {
    const item = id === 'testemunha1' ? layout.witnesses[0]
      : id === 'testemunha2' ? layout.witnesses[1]
        : layout.parties.find((party) => party.label.toLowerCase() === id);
    return { id, label: item?.label || 'QR Code', value: item?.value || '' };
  });
};

interface ContractClosingPreviewProps {
  footer: string;
  positions?: ContractClosingPositions;
  hasQr: boolean;
  qrImage: React.ReactNode;
  qrLabel: string;
  validationCode: string;
  validityLabel?: string;
  pixelsPerMm?: number;
  selectedElement?: ContractClosingElementId | null;
  getInteractiveProps?: (id: ContractClosingElementId) => React.HTMLAttributes<HTMLDivElement>;
}

/** Same physical boxes as the PDF; editor interaction is an optional overlay. */
export const ContractClosingPreview = ({
  footer, positions: configuredPositions, hasQr, qrImage, qrLabel, validationCode,
  validityLabel, pixelsPerMm, selectedElement, getInteractiveProps,
}: ContractClosingPreviewProps) => {
  const layout = parseContratoAlunoClosingLayout(footer);
  const positions = normalizeContractClosingPositions(configuredPositions, footer, hasQr);
  const textLayout = getContractClosingTextLayout(footer, hasQr);
  const elements = getContractClosingPreviewElements(footer, hasQr);
  const unit = (mm: number) => pixelsPerMm === undefined ? `${mm}mm` : `${mm * pixelsPerMm}px`;
  const fontSize = (points: number) => unit(points * 25.4 / 72);
  const singleLine: React.CSSProperties = { overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' };
  const textStyle: React.CSSProperties = { fontSize: unit(2.5), lineHeight: 1.3 };

  return <footer className="pointer-events-none absolute inset-0 z-10 font-sans text-slate-600">
    <div className="absolute border-t border-slate-200" style={{ left: unit(18), top: unit(210), width: unit(174) }} />
    {(layout.location || layout.fallbackText) && <p
      className="absolute whitespace-pre-wrap"
      style={{ ...textStyle, left: unit(textLayout.x), top: unit(layout.fallbackText ? textLayout.fallbackY : textLayout.locationY), width: unit(textLayout.width) }}
    >{layout.fallbackText || layout.location}</p>}
    {elements.map(({ id, label, value }) => {
      const position = positions.elements[id];
      const interactive = getInteractiveProps?.(id);
      const selected = selectedElement === id;
      return <div
        key={id}
        {...interactive}
        data-contract-closing-element={id}
        className={`absolute text-center ${interactive ? 'pointer-events-auto cursor-move touch-none select-none rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600' : ''} ${selected ? 'outline outline-2 outline-[#ed1c4e]' : interactive ? 'hover:outline hover:outline-1 hover:outline-dashed hover:outline-[#ed1c4e]' : ''}`}
        style={{ left: unit(position.x), top: unit(position.y), width: unit(position.width),
          height: unit(getContractClosingElementHeight(id, position)) }}
      >
        {id === 'qr' ? <div className="h-full w-full rounded border border-slate-200 bg-white">
          <div className="absolute" style={{ left: unit(1.5), top: unit(1.5), width: unit(position.width - 3), height: unit(position.width - 3) }}>{qrImage}</div>
          <p className="absolute font-bold uppercase text-slate-500" title={qrLabel}
            style={{ ...singleLine, left: unit(0.5), right: unit(0.5), top: unit(position.width - 0.6), fontSize: fontSize(5.7), lineHeight: 1.1 }}>{qrLabel}</p>
          <p className="absolute font-bold text-blue-700" title={validationCode}
            style={{ ...singleLine, left: unit(0.5), right: unit(0.5), top: unit(position.width + 1.9), fontSize: fontSize(5.8), lineHeight: 1.1 }}>{validationCode}</p>
          {validityLabel && <p className="absolute font-medium text-slate-500" title={validityLabel}
            style={{ ...singleLine, left: unit(0.5), right: unit(0.5), top: unit(position.width + 4.3), fontSize: fontSize(5.4), lineHeight: 1.1 }}>{validityLabel}</p>}
        </div> : <>
          <p className="absolute" title={value} style={{ ...singleLine, left: unit(1), right: unit(1), top: unit(1),
            fontSize: fontSize(id.startsWith('testemunha') ? 6.8 : 7.2), lineHeight: 1.1 }}>{value}</p>
          <div className="absolute inset-x-0 border-b border-slate-500" style={{ top: unit(5) }} />
          <p className="absolute inset-x-0 font-bold uppercase text-slate-500"
            style={{ ...singleLine, top: unit(id.startsWith('testemunha') ? 7.8 : 8.2),
              fontSize: fontSize(id.startsWith('testemunha') ? 5.5 : 6.2), lineHeight: 1.1 }}>{label}</p>
        </>}
      </div>;
    })}
    {layout.additionalLines.length > 0 && <p className="absolute whitespace-pre-wrap"
      style={{ ...textStyle, left: unit(textLayout.x), top: unit(textLayout.additionalY), width: unit(textLayout.width) }}>
      {layout.additionalLines.join('\n')}
    </p>}
  </footer>;
};
