import { useEffect, useState } from 'react';
import { Move, RotateCcw } from 'lucide-react';
import {
  clampContractClosingPosition,
  normalizeContractClosingPositions,
  type ContractClosingElementId,
  type ContractClosingPosition,
  type ContractClosingPositions,
} from '../../../../../shared/contrato-aluno/closing-positions';
import {
  CONTRACT_CLOSING_LABELS,
  getContractClosingPreviewElements,
} from '../../../../../shared/contrato-aluno/ContractClosingPreview';

const CoordinateInput = ({ label, value, onCommit, onDraft }: {
  label: string; value: number; onCommit: (value: number) => void; onDraft: (value: number) => void;
}) => {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const next = Number(text.replace(',', '.'));
    setText(String(value));
    if (text.trim() && Number.isFinite(next)) onCommit(next);
  };
  return <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase text-slate-600">{label} (mm)</span>
    <input type="text" inputMode="decimal" value={text} onChange={(event) => {
      const raw = event.target.value;
      setText(raw);
      const next = Number(raw.replace(',', '.'));
      if (raw.trim() && Number.isFinite(next)) onDraft(next);
    }}
      onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-[#001a33] focus:border-blue-500 focus:outline-none" />
  </label>;
};

interface ContratoAlunoClosingControlsProps {
  footer: string;
  hasQr: boolean;
  positions?: ContractClosingPositions;
  selected: ContractClosingElementId;
  onSelect: (id: ContractClosingElementId) => void;
  onChange: (positions: ContractClosingPositions) => void;
  errors: string[];
}

export const ContratoAlunoClosingControls = ({
  footer, hasQr, positions: configuredPositions, selected, onSelect, onChange, errors,
}: ContratoAlunoClosingControlsProps) => {
  const positions = normalizeContractClosingPositions(configuredPositions, footer, hasQr);
  const elements = getContractClosingPreviewElements(footer, hasQr);
  const selectedId = elements.some(({ id }) => id === selected) ? selected : elements[0]?.id;
  if (!selectedId) return null;
  const position = positions.elements[selectedId];
  const updatePosition = (patch: Partial<ContractClosingPosition>, clamp = true) => onChange({
    ...positions, elements: { ...positions.elements,
      [selectedId]: clamp ? clampContractClosingPosition(selectedId, { ...position, ...patch }) : { ...position, ...patch } },
  });

  return <section className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
    <div className="flex items-center gap-2 text-[#001a33]">
      <Move size={17} /><h5 className="text-xs font-black uppercase tracking-wider">Posição do QR e assinaturas</h5>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">
      Arraste os campos na última página. Use as setas para mover 0,5 mm ou Shift + seta para mover 5 mm.
    </p>
    <div className="my-3 flex flex-wrap gap-1.5" aria-label="Campo do encerramento">
      {elements.map(({ id }) => <button key={id} type="button" onClick={() => onSelect(id)}
        aria-pressed={selectedId === id}
        className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-bold ${selectedId === id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>
        {CONTRACT_CLOSING_LABELS[id]}
      </button>)}
    </div>
    <div className="grid grid-cols-3 gap-2" key={selectedId}>
      <CoordinateInput label="Horizontal" value={position.x} onDraft={(x) => updatePosition({ x }, false)} onCommit={(x) => updatePosition({ x })} />
      <CoordinateInput label="Vertical" value={position.y} onDraft={(y) => updatePosition({ y }, false)} onCommit={(y) => updatePosition({ y })} />
      <CoordinateInput label={selectedId === 'qr' ? 'Tamanho' : 'Largura'} value={position.width}
        onDraft={(width) => updatePosition({ width }, false)} onCommit={(width) => updatePosition({ width })} />
    </div>
    <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700"
      onClick={() => updatePosition(normalizeContractClosingPositions(undefined, footer, hasQr).elements[selectedId])}>
      <RotateCcw size={12} /> Restaurar posição de {CONTRACT_CLOSING_LABELS[selectedId]}
    </button>
    {errors.length > 0 && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
      <p className="font-bold">Ajuste as posições antes de salvar.</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">{errors.map((error) => <li key={error}>{error}</li>)}</ul>
    </div>}
  </section>;
};
