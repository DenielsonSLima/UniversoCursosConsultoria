import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building, Loader2, Plus, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import CategoriaForm from '../../../../configuracoes/categorias/components/CategoriaForm';
import TipoParceriaForm from '../../../../configuracoes/tipos-parceria/components/TipoParceriaForm';
import { categoriasQueryKeys, categoriasService, type Categoria } from '../../../../configuracoes/categorias/categorias.service';
import { tiposParceriaQueryKeys, tiposParceriaService, type TipoParceria } from '../../../../configuracoes/tipos-parceria/tipos-parceria.service';
import { formatCnpj } from '../../../../../../lib/documentFormatters';
import { Field, PartnerLogo, inputCls, labelCls } from './pj-details.presentation';

type ChangeHandler = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
interface Props {
  data: any;
  isEditing: boolean;
  isUploadingLogo: boolean;
  onChange: ChangeHandler;
  onLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  toast: { success: (title: string, message?: string) => void; error: (title: string, message?: string) => void };
}

const AuxiliaryPortal: React.FC<{ onClose: () => void; busy: boolean; children: React.ReactNode }> = ({ onClose, busy, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    rootRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !document.querySelector('[role="listbox"]')) onClose();
      if (event.key !== 'Tab' || document.querySelector('[role="listbox"]')) return;
      const controls = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), textarea:not(:disabled)') || []) as HTMLElement[];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
      if (focused instanceof HTMLElement) focused.focus();
    };
  }, [onClose, busy]);
  return createPortal(<div ref={rootRef} className="pj-details-auxiliary">{children}</div>, document.body);
};

const PJIdentification: React.FC<Props> = ({ data: d, isEditing, isUploadingLogo, onChange, onLogoUpload, setEditData, toast }) => {
  const queryClient = useQueryClient();
  const [auxiliary, setAuxiliary] = useState<'categoria' | 'tipo' | null>(null);
  const closeAuxiliary = useCallback(() => setAuxiliary(null), []);
  const categoriasQuery = useQuery({ queryKey: categoriasQueryKeys.all, queryFn: categoriasService.getAll });
  const tiposQuery = useQuery({ queryKey: tiposParceriaQueryKeys.all, queryFn: tiposParceriaService.getAll });
  const selectCategoria = (categoria?: Categoria) => setEditData((previous: any) => ({
    ...previous, categoriaId: categoria?.id || null, categoriaNome: categoria?.nome || null, tipoPj: categoria?.nome || null,
  }));
  const selectTipo = (tipo?: TipoParceria) => setEditData((previous: any) => ({
    ...previous, tipoParceriaId: tipo?.id || null, tipoParceriaNome: tipo?.nome || null, tipoConvenio: tipo?.nome || null,
  }));
  const createCategoria = useMutation({
    mutationFn: categoriasService.create,
    onSuccess: (created) => {
      queryClient.setQueryData<Categoria[]>(categoriasQueryKeys.all, (previous = []) => [...previous.filter((item) => item.id !== created.id), created]);
      selectCategoria(created);
      setAuxiliary(null);
      void queryClient.invalidateQueries({ queryKey: categoriasQueryKeys.all });
      toast.success('Categoria cadastrada', 'A nova categoria foi selecionada neste parceiro.');
    },
    onError: (error: Error) => toast.error('Erro ao cadastrar categoria', error.message),
  });
  const createTipo = useMutation({
    mutationFn: tiposParceriaService.create,
    onSuccess: (created) => {
      queryClient.setQueryData<TipoParceria[]>(tiposParceriaQueryKeys.all, (previous = []) => [...previous.filter((item) => item.id !== created.id), created]);
      selectTipo(created);
      setAuxiliary(null);
      void queryClient.invalidateQueries({ queryKey: tiposParceriaQueryKeys.all });
      toast.success('Tipo de parceria cadastrado', 'O novo tipo foi selecionado neste parceiro.');
    },
    onError: (error: Error) => toast.error('Erro ao cadastrar tipo de parceria', error.message),
  });
  const busy = createCategoria.isPending || createTipo.isPending;
  const plusClass = 'pj-details-plus flex shrink-0 items-center justify-center border border-slate-200 bg-white text-blue-700 hover:bg-blue-50';

  return <section className="bg-white p-7 rounded-[2rem] border border-slate-100 shadow-sm">
    <div className="flex items-center gap-2 text-slate-700 border-b border-slate-100 pb-3 mb-6">
      <Building size={16} /><h4 className="text-xs font-black uppercase tracking-wider">Identificação da Empresa</h4>
      {isEditing && <span className="ml-auto text-xs text-blue-600">Modo edição</span>}
    </div>
    {!isEditing ? <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <div className="md:col-span-2"><Field label="Razão social" value={d.razaoSocial || d.nome} /></div>
      <Field label="CNPJ" value={formatCnpj(d.cnpj)} mono />
      <Field label="Nome fantasia" value={d.nomeFantasia} />
      <Field label="Categoria da empresa" value={d.categoriaNome} />
      <Field label="Tipo de parceria / convênio" value={d.tipoParceriaNome || d.tipoConvenio} />
      <Field label="Status" value={d.status} /><Field label="Polo vinculado" value={d.poloNome} />
      {d.foto && <div className="md:col-span-3"><PartnerLogo src={d.foto} alt={`Logo de ${d.nome}`} className="h-16 w-28 rounded-lg border border-slate-200 bg-white object-contain p-2" /></div>}
    </div> : <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <label htmlFor="pj-razao-social" className={labelCls}>Razão social *</label>
        <input id="pj-razao-social" name="nomeCompleto" value={d.nome || ''} onChange={onChange} className={inputCls} placeholder="Razão social da empresa" required />
      </div>
      <div>
        <label htmlFor="pj-cnpj" className={labelCls}>CNPJ</label>
        <input id="pj-cnpj" name="cnpj" value={d.cnpj || ''} onChange={onChange} className={`${inputCls} font-mono`} placeholder="00.000.000/0000-00" maxLength={18} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="pj-nome-fantasia" className={labelCls}>Nome fantasia</label>
        <input id="pj-nome-fantasia" name="nomeFantasia" value={d.nomeFantasia || ''} onChange={onChange} className={inputCls} placeholder="Nome fantasia da empresa" />
      </div>
      <div>
        <label className={labelCls}>Status</label>
        <InstitutionalSelect value={d.status || 'ATIVO'} onValueChange={(status) => setEditData((previous: any) => ({ ...previous, status }))}
          ariaLabel="Status do parceiro" options={['ATIVO', 'INATIVO', 'SUSPENSO'].map((status) => ({ value: status, label: status }))} />
      </div>
      <div>
        <label className={labelCls}>Categoria da empresa</label>
        <div className="flex gap-2">
          <InstitutionalSelect value={d.categoriaId || ''} onValueChange={(id) => selectCategoria(categoriasQuery.data?.find((item) => item.id === id))}
            ariaLabel="Categoria da empresa" className="min-w-0 flex-1" loading={categoriasQuery.isPending}
            error={categoriasQuery.isError ? 'Não foi possível carregar as categorias.' : undefined}
            options={[{ value: '', label: 'Sem categoria definida' }, ...(categoriasQuery.data || []).filter((item) => item.tipo === 'pj').map((item) => ({
              value: item.id || '', label: `${item.nome}${item.status === 'inativo' ? ' (inativa)' : ''}`, disabled: item.status === 'inativo' && item.id !== d.categoriaId,
            }))]} />
          <button type="button" className={plusClass} aria-label="Nova categoria da empresa" onClick={() => setAuxiliary('categoria')}><Plus size={16} /></button>
        </div>
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Tipo de parceria / convênio</label>
        <div className="flex gap-2">
          <InstitutionalSelect value={d.tipoParceriaId || ''} onValueChange={(id) => selectTipo(tiposQuery.data?.find((item) => item.id === id))}
            ariaLabel="Tipo de parceria / convênio" className="min-w-0 flex-1" loading={tiposQuery.isPending}
            error={tiposQuery.isError ? 'Não foi possível carregar os tipos de parceria.' : undefined}
            options={[{ value: '', label: 'Sem tipo definido' }, ...(tiposQuery.data || []).map((item) => ({
              value: item.id || '', label: `${item.nome}${item.status === 'inativo' ? ' (inativo)' : ''}`, disabled: item.status === 'inativo' && item.id !== d.tipoParceriaId,
            }))]} />
          <button type="button" className={plusClass} aria-label="Novo tipo de parceria ou convênio" onClick={() => setAuxiliary('tipo')}><Plus size={16} /></button>
        </div>
      </div>
      <div className="md:col-span-3">
        <label className={labelCls}>Logo / imagem da empresa</label>
        <div className="flex items-center gap-3">
          <PartnerLogo src={d.foto} alt={`Logo de ${d.nome}`} className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-contain p-2" />
          <div className="min-w-0 flex-1 space-y-2">
            <label className="flex items-center justify-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm cursor-pointer">
              {isUploadingLogo ? <><Loader2 size={14} className="animate-spin" />Enviando…</> : <><Upload size={14} />Fazer upload da logo</>}
              <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} disabled={isUploadingLogo} />
            </label>
            <input name="foto" aria-label="URL da logo" value={d.foto || ''} onChange={onChange} className={inputCls} placeholder="Ou cole a URL da imagem aqui…" />
            {d.foto && <button type="button" onClick={() => setEditData((previous: any) => ({ ...previous, foto: '' }))} className="text-xs text-red-600">Remover logo</button>}
          </div>
        </div>
      </div>
    </div>}
    {auxiliary && <AuxiliaryPortal busy={busy} onClose={closeAuxiliary}>
      {auxiliary === 'categoria' ? <CategoriaForm tipoFixo="pj" statusFixo="ativo" isSaving={createCategoria.isPending}
        onClose={() => { if (!busy) closeAuxiliary(); }} onSave={(value) => { if (!busy) createCategoria.mutate({ ...value, tipo: 'pj' }); }} />
        : <TipoParceriaForm statusFixo="ativo" isSaving={createTipo.isPending}
          onClose={() => { if (!busy) closeAuxiliary(); }} onSave={(value) => { if (!busy) createTipo.mutate(value); }} />}
    </AuxiliaryPortal>}
  </section>;
};

export default PJIdentification;
