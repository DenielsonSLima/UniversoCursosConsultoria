import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

interface Props {
  alunoNome: string;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
}

export function ProvasEadReleaseForm({ alunoNome, pending, error, onCancel, onSubmit }: Props) {
  const reasonId = useId();
  const helpId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const reason = value.trim();

  useEffect(() => { input.current?.focus(); }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && reason.length >= 5) onSubmit(reason);
  };

  return (
    <form aria-label={`Antecipar a prova de ${alunoNome}`} onSubmit={submit}
      className="space-y-2.5 border-t border-[#e3e9ee] bg-[#f9fbfc] px-4 py-3"
    >
      <label htmlFor={reasonId} className="block text-xs font-medium text-[#122b42]">Motivo da liberação antecipada</label>
      <p id={helpId} className="text-xs text-[#607286]">
        A prova abre assim que o aluno cumprir as atividades obrigatórias. Informe o motivo com pelo menos 5 caracteres.
      </p>
      <textarea
        ref={input}
        id={reasonId}
        aria-describedby={helpId}
        value={value}
        onChange={event => setValue(event.target.value)}
        rows={2}
        maxLength={500}
        required
        disabled={pending}
        className="block w-full rounded-lg border border-[#dbe3ed] bg-white px-3 py-2 text-base text-[#122b42] sm:text-[13px]"
      />
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={pending} onClick={onCancel}
          className="min-h-11 rounded-lg border border-[#dbe3ed] bg-white px-3 text-[13px] text-[#122b42] disabled:opacity-50 sm:min-h-[38px]">
          Cancelar
        </button>
        <button type="submit" disabled={pending || reason.length < 5}
          className="min-h-11 rounded-lg bg-blue-700 px-3 text-[13px] font-medium text-white hover:bg-blue-800 disabled:opacity-50 sm:min-h-[38px]">
          {pending ? 'Liberando…' : 'Confirmar liberação'}
        </button>
      </div>
    </form>
  );
}
