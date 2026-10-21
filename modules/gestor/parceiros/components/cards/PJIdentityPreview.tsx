import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCnpj } from '../../../../../lib/documentFormatters';

interface Identity {
  nome: string;
  nomeCompleto?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
  uf?: string;
  responsavelNome?: string;
  poloNome?: string;
}

export function PJIdentityPreview({ data }: { data: Identity }) {
  const id = useId();
  const anchor = useRef<React.ElementRef<'h3'>>(null);
  const card = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); hovered.current = false; setOpen(false); };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!hovered.current && document.activeElement !== anchor.current) setOpen(false);
    }, 160);
  };
  const enterPointer = () => { hovered.current = true; show(); };
  const leavePointer = () => { hovered.current = false; leave(); };

  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !card.current) return;
    const trigger = anchor.current.getBoundingClientRect();
    const popup = card.current.getBoundingClientRect();
    const below = trigger.bottom + 8;
    setPosition({
      left: Math.max(12, Math.min(trigger.left, window.innerWidth - popup.width - 12)),
      top: below + popup.height <= window.innerHeight - 12
        ? below : Math.max(12, trigger.top - popup.height - 8),
    });
  }, [open, data]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (!card.current?.contains(event.target as Node)) hide();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', hide);
    document.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', hide);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const fields = [
    ['Razão social', data.razaoSocial || data.nomeCompleto || data.nome],
    ['Nome fantasia', data.nomeFantasia],
    ['CNPJ', data.cnpj ? formatCnpj(data.cnpj) : undefined],
    ['Telefone', data.telefone],
    ['E-mail', data.email],
    ['Cidade', [data.cidade, data.uf].filter(Boolean).join('/')],
    ['Contato', data.responsavelNome],
    ['Polo', data.poloNome],
  ];

  return <>
    <h3 ref={anchor} tabIndex={0} aria-describedby={open ? id : undefined}
      onMouseEnter={enterPointer} onMouseLeave={leavePointer} onFocus={show} onBlur={leave}
      className="line-clamp-1 rounded text-[12px] font-bold text-slate-800 transition-colors group-hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
      {data.nome}
    </h3>
    {open && createPortal(
      <div ref={card} id={id} role="tooltip" onMouseEnter={enterPointer} onMouseLeave={leavePointer}
        onClick={event => event.stopPropagation()} style={position}
        className="fixed z-[200] max-h-[calc(100dvh-24px)] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl">
        <p className="mb-3 break-words text-sm font-bold text-[#001a33]">{data.nomeCompleto || data.nome}</p>
        <dl className="space-y-2">
          {fields.filter(([, value]) => value).map(([label, value]) => <div key={label}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="break-words text-xs text-slate-700">{value}</dd>
          </div>)}
        </dl>
      </div>, document.body)}
  </>;
}
