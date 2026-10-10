import React, { useEffect, useState } from 'react';
import { formatExternalTransferDecimal, parseExternalTransferDecimal } from './external-transfer-presentation';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  percentage?: boolean;
  disabled?: boolean;
}
const ExternalTransferDecimalInput: React.FC<Props> = ({ label, value, onChange, percentage = false, disabled = false }) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(() => formatExternalTransferDecimal(value, percentage));
  useEffect(() => { if (!editing) setText(formatExternalTransferDecimal(value, percentage)); }, [value, editing, percentage]);
  return <label className="block space-y-1 text-xs text-slate-600">
    <span>{label}</span>
    <span className="relative block">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{percentage ? '%' : 'R$'}</span>
      <input type="text" inputMode="decimal" aria-label={label} disabled={disabled} value={text}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setText(event.target.value);
          onChange(parseExternalTransferDecimal(event.target.value, percentage) ?? '');
        }}
        onBlur={() => {
          const parsed = parseExternalTransferDecimal(text, percentage);
          setEditing(false);
          if (parsed !== null) {
            if (parsed !== value) onChange(parsed);
            setText(formatExternalTransferDecimal(parsed, percentage));
          }
        }}
        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-2 text-sm outline-none focus:border-blue-400 disabled:bg-slate-100 disabled:opacity-60" />
    </span>
  </label>;
};
export default ExternalTransferDecimalInput;
