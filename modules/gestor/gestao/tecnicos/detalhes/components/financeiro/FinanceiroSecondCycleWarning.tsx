import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../../../../../lib/supabase';
import { useAccessibleDialog } from './hooks/useAccessibleDialog';
import { createSecondCycleWarning, readOpenCycleCharges, type SecondCycleWarningState } from './second-cycle-warning';

interface Props {
  matriculaId: string;
  alunoNome: string;
  matriculaExibicao: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

const money = (value: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
const date = (value: string) => value.split('-').reverse().join('/');

const FinanceiroSecondCycleWarning: React.FC<Props> = (props) => {
  const [state, setState] = useState<SecondCycleWarningState>({ charges: null, busy: true, error: null, changed: false });
  const controllerRef = useRef<ReturnType<typeof createSecondCycleWarning> | null>(null);
  const confirmRef = useRef(props.onConfirm);
  confirmRef.current = props.onConfirm;
  const cancel = () => {
    controllerRef.current?.dispose();
    props.onCancel();
  };
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, cancel);
  useLayoutEffect(() => {
    const controller = createSecondCycleWarning({
      read: async () => {
        const { data, error } = await supabase.rpc('get_aluno_extrato_financeiro', { p_matricula_id: props.matriculaId });
        if (error) throw new Error('Não foi possível consultar as parcelas em aberto. Tente novamente.');
        return readOpenCycleCharges(data, props.matriculaId);
      },
      onConfirm: () => confirmRef.current(),
      onChange: setState,
    });
    controllerRef.current = controller;
    void controller.load();
    return () => controller.dispose();
  }, [props.matriculaId]);
  const dialog = (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/60 p-4">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="second-cycle-warning-title" aria-describedby="second-cycle-warning-description" tabIndex={-1} className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 text-slate-900 shadow-xl outline-none">
        <h2 id="second-cycle-warning-title" className="text-xl font-black text-amber-900">Deseja realmente emitir o 2º ciclo?</h2>
        <p className="mt-2 font-bold">{props.alunoNome} · {props.matriculaExibicao}</p>
        <p id="second-cycle-warning-description" className="mt-3 text-sm">O 2º ciclo cria novas cobranças. Confira as parcelas em aberto abaixo. Ao continuar, você abrirá a tela para revisar datas e valores; a emissão será confirmada ao final.</p>
        <div className="mt-4 min-h-0 overflow-y-auto" aria-busy={state.busy}>
          {state.busy ? <p role="status">Conferindo parcelas em aberto...</p> : null}
          {state.error ? <p role="alert" className="text-rose-700">{state.error}</p> : null}
          {state.changed ? <p role="alert" className="mb-3 rounded-xl bg-amber-50 p-3 font-semibold">As parcelas mudaram. Confira a lista atualizada e confirme novamente.</p> : null}
          {state.charges?.length === 0 ? <p className="rounded-xl bg-slate-50 p-3">Nenhuma parcela em aberto foi encontrada nesta matrícula no sistema. Você pode continuar para revisar o 2º ciclo.</p> : null}
          {state.charges && state.charges.length > 0 ? (
            <ul aria-label="Parcelas em aberto" className="divide-y divide-slate-200 rounded-xl border border-slate-200">
              {state.charges.map((charge) => <li key={charge.id} className="p-3 text-sm">
                <p className="font-bold">{charge.descricao}</p>
                <p>Vencimento: {date(charge.vencimento)} · Valor nominal: {money(charge.valor)}</p>
                <p>Status: {charge.status}{charge.valorPago !== null && Number(charge.valorPago) > 0 ? ` · Valor pago informado: ${money(charge.valorPago)}` : ''}</p>
              </li>)}
            </ul>
          ) : null}
        </div>
        <div className="mt-5 flex shrink-0 flex-wrap justify-end gap-3">
          <button ref={(node) => { initialFocusRef.current = node; }} type="button" onClick={cancel} className="rounded-xl border border-slate-300 px-4 py-3 font-bold">Cancelar</button>
          {state.error || !state.charges ? <button type="button" disabled={state.busy} onClick={() => void controllerRef.current?.load()} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-40">Tentar novamente</button> : null}
          <button type="button" disabled={state.busy || Boolean(state.error) || !state.charges} onClick={() => void controllerRef.current?.confirm()} className="rounded-xl bg-amber-700 px-4 py-3 font-bold text-white disabled:opacity-40">Continuar</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
};

export default FinanceiroSecondCycleWarning;
