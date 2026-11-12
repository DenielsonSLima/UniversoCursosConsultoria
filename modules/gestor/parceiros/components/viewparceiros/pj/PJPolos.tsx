import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { parceirosService } from '../../../parceiros.service';
import { pjPoloSelection } from '../../../utils/pj-polo-scope';

export default function PJPolos({ data, isEditing, canManage, onChange }: {
  data: any; isEditing: boolean; canManage: boolean;
  onChange: React.Dispatch<React.SetStateAction<any>>;
}) {
  const polos = useQuery({ queryKey: ['parceiros-polos'], queryFn: parceirosService.getPolos });
  const selected: string[] = Array.from(new Set([data.poloId, ...(data.poloIds || [])].filter(Boolean)));
  const update = (ids: string[]) => onChange((previous: any) => ({
    ...previous, ...pjPoloSelection(ids, previous.poloId),
  }));
  const editable = isEditing && canManage;
  return <section className="bg-white p-5 rounded-2xl border border-slate-200">
    <h4 className="text-sm font-semibold text-slate-800 mb-3">Polos de atuação</h4>
    {polos.isPending ? <p role="status" className="text-sm">Carregando polos…</p> : polos.isError ?
      <p role="alert" className="text-sm text-red-700">Não foi possível carregar os polos. O vínculo atual será preservado.</p> :
      <div className="space-y-2">
        {editable && <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={Boolean(polos.data?.length) && polos.data!.every((polo) => selected.includes(polo.id))}
            onChange={(event) => update(event.target.checked ? polos.data!.map((polo) => polo.id) : [data.poloId || selected[0]])} />
          Todos os polos
        </label>}
        {(polos.data || []).filter((polo) => editable || selected.includes(polo.id)).map((polo) =>
          <label key={polo.id} className="flex items-center gap-2 text-sm text-slate-700">
            {editable && <input type="checkbox" checked={selected.includes(polo.id)}
              disabled={selected.length === 1 && selected.includes(polo.id)}
              onChange={(event) => update(event.target.checked ? [...selected, polo.id] : selected.filter((id) => id !== polo.id))} />}
            {[polo.nome, [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
          </label>)}
      </div>}
    {!canManage && isEditing && <p className="text-xs text-slate-500 mt-2">A alteração dos polos é reservada à gestão com acesso global.</p>}
  </section>;
}
