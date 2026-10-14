import React, { useEffect, useRef } from 'react';

export function OtherCreditSelectionCheckbox({ checked, mixed = false, disabled = false, label, onChange }: {
  checked: boolean; mixed?: boolean; disabled?: boolean; label: string; onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed && !checked; }, [mixed, checked]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange}
    aria-label={label} aria-checked={mixed && !checked ? 'mixed' : checked}
    className="h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" />;
}
