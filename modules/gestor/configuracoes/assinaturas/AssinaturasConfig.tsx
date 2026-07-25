import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileSignature,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRoundCheck,
  UsersRound,
  X,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import {
  assinaturasRegistryService,
  SignatureCategory,
  SignatureProfessorOption,
  SignatureRegistryItem,
} from './assinaturas-registry.service';
import { assinaturasService } from './assinaturas.service';

type SignatureTab = 'secretaria' | 'coordenadores' | 'professores';

interface SignatureFormState {
  id?: string;
  name: string;
  role: string;
  active: boolean;
  file: File | null;
}

const EMPTY_FORM: SignatureFormState = {
  name: '',
  role: '',
  active: true,
  file: null,
};

const tabs: Array<{
  id: SignatureTab;
  label: string;
  description: string;
  category: SignatureCategory;
  icon: React.ReactNode;
}> = [
  {
    id: 'secretaria',
    label: 'Secretaria',
    description: 'Diretoria e equipe de secretaria',
    category: 'SECRETARIA',
    icon: <ShieldCheck size={17} />,
  },
  {
    id: 'coordenadores',
    label: 'Coordenadores',
    description: 'Coordenação dos cursos',
    category: 'COORDENADOR_CURSO',
    icon: <UsersRound size={17} />,
  },
  {
    id: 'professores',
    label: 'Professores',
    description: 'Vinculados ao cadastro docente',
    category: 'PROFESSOR',
    icon: <UserRoundCheck size={17} />,
  },
];

const activeStatus = (status: string) => {
  const normalized = status.trim().toUpperCase();
  return normalized === 'ATIVO' || normalized === 'ATIVA' || normalized === 'ACTIVE';
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'PR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const AssinaturasConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<SignatureTab>('secretaria');
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState<SignatureFormState>(EMPTY_FORM);
  const [editingItem, setEditingItem] = useState<SignatureRegistryItem | null>(null);

  const currentTab = tabs.find((tab) => tab.id === activeTab) || tabs[0];
  const category = currentTab.category;

  const signaturesQuery = useQuery({
    queryKey: ['signatures', 'list', category],
    queryFn: () => assinaturasRegistryService.list(category),
  });

  const professorsQuery = useQuery({
    queryKey: ['signatures', 'professor-options'],
    queryFn: () => assinaturasRegistryService.listProfessorOptions(),
    enabled: activeTab === 'professores' || editorOpen,
  });

  const signatures = signaturesQuery.data || [];
  const filteredSignatures = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return signatures;
    return signatures.filter((item) =>
      `${item.name} ${item.role} ${item.partner?.email || ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(term),
    );
  }, [search, signatures]);

  const activeProfessors = useMemo(
    () => (professorsQuery.data || []).filter((professor) => activeStatus(professor.status)),
    [professorsQuery.data],
  );

  const professorCards = useMemo(() => {
    const signatureByPartner = new Map(
      signatures
        .filter((item) => item.partnerId)
        .map((item) => [item.partnerId as string, item]),
    );
    const term = search.trim().toLocaleLowerCase('pt-BR');

    return activeProfessors
      .map((professor) => ({
        professor,
        signature: signatureByPartner.get(professor.id) || null,
      }))
      .filter(({ professor }) => (
        !term
        || `${professor.name} ${professor.email || ''}`
          .toLocaleLowerCase('pt-BR')
          .includes(term)
      ));
  }, [activeProfessors, search, signatures]);

  const uploadedProfessorSignatures = useMemo(
    () => signatures.filter((item) => Boolean(item.previewUrl)).length,
    [signatures],
  );

  const invalidateSignatures = async () => {
    assinaturasService.invalidateCache();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['signatures'] }),
      queryClient.invalidateQueries({ queryKey: ['central-signatures'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const saved = await assinaturasRegistryService.save({
        id: form.id,
        category,
        partnerId: null,
        name: form.name,
        role: form.role,
        active: form.active,
      });
      return form.file
        ? assinaturasRegistryService.uploadForRegistryItem(saved, form.file)
        : saved;
    },
    onSuccess: async (saved) => {
      await invalidateSignatures();
      setEditorOpen(false);
      setEditingItem(null);
      setForm(EMPTY_FORM);
      toast.success(
        editingItem ? 'Assinatura atualizada' : 'Assinante adicionado',
        `${saved.name} foi salvo na Central de Assinaturas.`,
      );
    },
    onError: (error) => {
      toast.error(
        'Não foi possível salvar',
        error instanceof Error ? error.message : 'Revise os dados e tente novamente.',
      );
    },
  });

  const professorUploadMutation = useMutation({
    mutationFn: async ({
      professor,
      signature,
      file,
    }: {
      professor: SignatureProfessorOption;
      signature: SignatureRegistryItem | null;
      file: File;
    }) => {
      assinaturasRegistryService.validateFile(file);
      const saved = await assinaturasRegistryService.save({
        id: signature?.id,
        category: 'PROFESSOR',
        partnerId: professor.id,
        name: professor.name,
        role: 'Professor(a)',
        active: true,
      });
      return assinaturasRegistryService.uploadForRegistryItem(saved, file);
    },
    onSuccess: async (saved) => {
      await invalidateSignatures();
      toast.success(
        'Assinatura salva',
        `A assinatura de ${saved.name} está vinculada ao cadastro do professor.`,
      );
    },
    onError: (error) => toast.error(
      'Não foi possível enviar a assinatura',
      error instanceof Error ? error.message : 'Revise a imagem e tente novamente.',
    ),
  });

  const activeMutation = useMutation({
    mutationFn: ({ item, active }: { item: SignatureRegistryItem; active: boolean }) =>
      assinaturasRegistryService.setActive(item.id, active),
    onSuccess: async (_, variables) => {
      await invalidateSignatures();
      toast.success(
        variables.active ? 'Assinatura ativada' : 'Assinatura inativada',
        `${variables.item.name} foi atualizado.`,
      );
    },
    onError: (error) => toast.error(
      'Status não alterado',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const removeMutation = useMutation({
    mutationFn: (item: SignatureRegistryItem) => assinaturasRegistryService.remove(item),
    onSuccess: async (_, item) => {
      await invalidateSignatures();
      toast.success('Assinatura excluída', `O registro de ${item.name} foi removido.`);
    },
    onError: (error) => toast.error(
      'Assinatura não excluída',
      error instanceof Error ? error.message : 'Tente novamente.',
    ),
  });

  const openNew = () => {
    setEditingItem(null);
    setForm({
      ...EMPTY_FORM,
      role: category === 'COORDENADOR_CURSO' ? 'Coordenador(a) de Curso' : '',
    });
    setEditorOpen(true);
  };

  const openEdit = (item: SignatureRegistryItem) => {
    setEditingItem(item);
    setForm({
      id: item.id,
      name: item.name,
      role: item.role,
      active: item.active,
      file: null,
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (saveMutation.isPending) return;
    setEditorOpen(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
  };

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="mx-auto max-w-7xl animate-fadeIn">
        <header className="mb-6 overflow-hidden rounded-[2rem] bg-[#001a33] text-white shadow-xl shadow-slate-900/10">
          <div className="relative px-6 py-7 md:px-8">
            <div className="absolute inset-y-0 right-0 w-96 bg-[radial-gradient(circle_at_center,rgba(236,72,153,.28),transparent_68%)]" />
            <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-pink-300">
                  <FileSignature size={23} />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Central de Assinaturas</h3>
                <p className="mt-1 max-w-2xl text-sm font-medium text-slate-300">
                  Assinaturas privadas, vinculadas às pessoas cadastradas e disponíveis para os documentos oficiais.
                </p>
              </div>
              {activeTab === 'professores' ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-pink-300">
                    Cadastro sincronizado
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-300">
                    Os professores aparecem automaticamente nesta aba.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openNew}
                  className="flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-pink-500"
                >
                  <Plus size={16} />
                  Adicionar assinante
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="mb-6 grid gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setSearch('');
              }}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                activeTab === tab.id
                  ? 'bg-[#001a33] text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                activeTab === tab.id ? 'bg-white/10 text-pink-300' : 'bg-pink-50 text-pink-600'
              }`}>
                {tab.icon}
              </span>
              <span>
                <span className="block text-xs font-black uppercase tracking-wide">{tab.label}</span>
                <span className={`block text-[10px] font-semibold ${
                  activeTab === tab.id ? 'text-slate-300' : 'text-slate-400'
                }`}>
                  {tab.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">{currentTab.label}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {activeTab === 'professores'
                  ? `${activeProfessors.length} professores • ${uploadedProfessorSignatures} assinaturas enviadas`
                  : `${signatures.length} ${signatures.length === 1 ? 'registro vinculado' : 'registros vinculados'}`}
              </p>
            </div>
            <label className="relative block w-full sm:w-80">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, cargo ou e-mail"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-pink-400 focus:bg-white"
              />
            </label>
          </div>

          {signaturesQuery.isLoading || (activeTab === 'professores' && professorsQuery.isLoading) ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm font-bold text-slate-500">
              <Loader2 size={20} className="animate-spin text-pink-600" />
              {activeTab === 'professores' ? 'Carregando professores...' : 'Carregando assinaturas...'}
            </div>
          ) : signaturesQuery.isError || (activeTab === 'professores' && professorsQuery.isError) ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center text-sm font-bold text-rose-700">
              {activeTab === 'professores'
                ? 'Não foi possível carregar os professores cadastrados.'
                : 'Não foi possível carregar a Central de Assinaturas.'}
              <button
                type="button"
                onClick={() => {
                  signaturesQuery.refetch();
                  if (activeTab === 'professores') professorsQuery.refetch();
                }}
                className="ml-2 underline"
              >
                Tentar novamente
              </button>
            </div>
          ) : activeTab === 'professores' ? (
            professorCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-14 text-center">
                <UsersRound size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-black text-slate-700">
                  {search ? 'Nenhum professor encontrado' : 'Nenhum professor ativo cadastrado'}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {search
                    ? 'Tente outro nome ou e-mail.'
                    : 'Cadastre o professor em Parceiros para ele aparecer automaticamente aqui.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {professorCards.map(({ professor, signature }) => (
                  <ProfessorSignatureCard
                    key={professor.id}
                    professor={professor}
                    signature={signature}
                    uploading={
                      professorUploadMutation.isPending
                      && professorUploadMutation.variables?.professor.id === professor.id
                    }
                    busy={
                      professorUploadMutation.isPending
                      || activeMutation.isPending
                      || removeMutation.isPending
                    }
                    onUpload={(file) => professorUploadMutation.mutate({
                      professor,
                      signature,
                      file,
                    })}
                    onToggle={() => {
                      if (signature) activeMutation.mutate({ item: signature, active: !signature.active });
                    }}
                    onRemove={() => {
                      if (
                        signature
                        && window.confirm(
                          `Excluir somente a assinatura de ${professor.name}? O cadastro do professor será preservado.`,
                        )
                      ) {
                        removeMutation.mutate(signature);
                      }
                    }}
                  />
                ))}
              </div>
            )
          ) : filteredSignatures.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-14 text-center">
              <FileSignature size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-black text-slate-700">
                {search ? 'Nenhum resultado encontrado' : 'Nenhuma assinatura nesta aba'}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {search ? 'Tente outro termo de busca.' : 'Use o botão Adicionar para criar o primeiro vínculo.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredSignatures.map((item) => (
                <SignatureCard
                  key={item.id}
                  item={item}
                  busy={activeMutation.isPending || removeMutation.isPending}
                  onEdit={() => openEdit(item)}
                  onToggle={() => activeMutation.mutate({ item, active: !item.active })}
                  onRemove={() => {
                    if (window.confirm(`Excluir a assinatura de ${item.name}? Esta ação só pode ser feita pelo gestor.`)) {
                      removeMutation.mutate(item);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {editorOpen && (
        <SignatureEditorModal
          category={category}
          editingItem={editingItem}
          form={form}
          saving={saveMutation.isPending}
          onChange={setForm}
          onClose={closeEditor}
          onSave={() => saveMutation.mutate()}
        />
      )}
    </>
  );
};

interface ProfessorSignatureCardProps {
  professor: SignatureProfessorOption;
  signature: SignatureRegistryItem | null;
  busy: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onToggle: () => void;
  onRemove: () => void;
}

const ProfessorSignatureCard: React.FC<ProfessorSignatureCardProps> = ({
  professor,
  signature,
  busy,
  uploading,
  onUpload,
  onToggle,
  onRemove,
}) => {
  const hasSignature = Boolean(signature?.previewUrl);
  const isActive = signature?.active ?? false;

  return (
    <article className={`group overflow-hidden rounded-2xl border bg-white transition ${
      signature && !isActive
        ? 'border-slate-200 opacity-70'
        : 'border-slate-200 hover:-translate-y-0.5 hover:border-pink-200 hover:shadow-lg hover:shadow-pink-950/5'
    }`}>
      <div className="relative min-h-32 overflow-hidden border-b border-slate-100 bg-[linear-gradient(145deg,#f8fafc_0%,#fff7fb_55%,#fdf2f8_100%)] p-4">
        <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full border-[18px] border-white/60" />
        <div className="relative flex min-h-24 items-center justify-center">
          {hasSignature ? (
            <img
              src={signature?.previewUrl || ''}
              alt={`Assinatura de ${professor.name}`}
              className="max-h-20 max-w-[90%] object-contain mix-blend-multiply"
            />
          ) : (
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#001a33] text-sm font-black tracking-wide text-white shadow-md">
                {getInitials(professor.name)}
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                Assinatura não enviada
              </p>
            </div>
          )}
        </div>
        <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-wider ${
          hasSignature
            ? isActive
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-slate-200 text-slate-600'
            : 'bg-amber-100 text-amber-700'
        }`}>
          {hasSignature ? (isActive ? 'Assinatura ativa' : 'Inativa') : 'Pendente'}
        </span>
      </div>

      <div className="p-4">
        <div className="mb-4 min-w-0">
          <h5 className="truncate text-sm font-black text-[#001a33]" title={professor.name}>
            {professor.name}
          </h5>
          <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
            {professor.email || 'E-mail não informado'}
          </p>
          <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-pink-600">
            Professor(a)
          </p>
        </div>

        <div className={`grid gap-2 ${signature ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-1'}`}>
          <label className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[9px] font-black uppercase tracking-wide transition ${
            busy
              ? 'cursor-not-allowed bg-slate-100 text-slate-400'
              : 'cursor-pointer bg-[#001a33] text-white hover:bg-pink-600'
          }`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Enviando' : hasSignature ? 'Substituir' : 'Enviar assinatura'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => {
                const input = event.currentTarget;
                const file = input.files?.[0];
                input.value = '';
                if (file) onUpload(file);
              }}
              className="sr-only"
            />
          </label>

          {signature ? (
            <>
              <button
                type="button"
                onClick={onToggle}
                disabled={busy}
                title={isActive ? 'Inativar assinatura' : 'Ativar assinatura'}
                className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
              >
                <CheckCircle2 size={15} />
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={busy}
                title="Excluir somente a assinatura"
                className="rounded-xl border border-rose-100 p-2.5 text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
};

interface SignatureCardProps {
  item: SignatureRegistryItem;
  busy: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

const SignatureCard: React.FC<SignatureCardProps> = ({
  item,
  busy,
  onEdit,
  onToggle,
  onRemove,
}) => (
  <article className={`overflow-hidden rounded-2xl border bg-white transition ${
    item.active ? 'border-slate-200 hover:border-pink-200 hover:shadow-md' : 'border-slate-200 opacity-65'
  }`}>
    <div className="flex h-28 items-center justify-center border-b border-slate-100 bg-[linear-gradient(135deg,#f8fafc,#fff1f7)] p-4">
      {item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={`Assinatura de ${item.name}`}
          className="max-h-20 max-w-full object-contain mix-blend-multiply"
        />
      ) : (
        <div className="text-center text-slate-400">
          <FileSignature size={28} className="mx-auto mb-1.5 opacity-50" />
          <span className="text-[9px] font-black uppercase tracking-widest">Imagem pendente</span>
        </div>
      )}
    </div>
    <div className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 className="truncate text-sm font-black text-[#001a33]">{item.name}</h5>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {item.role || 'Cargo não informado'}
          </p>
          {item.partner?.email && (
            <p className="mt-1 truncate text-[10px] font-semibold text-slate-500">{item.partner.email}</p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider ${
          item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {item.active ? 'Ativa' : 'Inativa'}
        </span>
      </div>

      {item.legacyKey && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-2 text-[9px] font-bold text-blue-700">
          <CheckCircle2 size={12} />
          Assinatura padrão nos modelos atuais
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[9px] font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <Pencil size={13} />
          Alterar
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={busy}
          title={item.active ? 'Inativar' : 'Ativar'}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
        >
          <CheckCircle2 size={15} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          title="Excluir"
          className="rounded-xl border border-rose-100 p-2 text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  </article>
);

interface SignatureEditorModalProps {
  category: SignatureCategory;
  editingItem: SignatureRegistryItem | null;
  form: SignatureFormState;
  saving: boolean;
  onChange: React.Dispatch<React.SetStateAction<SignatureFormState>>;
  onClose: () => void;
  onSave: () => void;
}

const SignatureEditorModal: React.FC<SignatureEditorModalProps> = ({
  category,
  editingItem,
  form,
  saving,
  onChange,
  onClose,
  onSave,
}) => {
  const canSave = Boolean(form.name.trim()) && !saving;
  const categoryDescription = category === 'COORDENADOR_CURSO'
    ? 'Informe o coordenador e o cargo exercido no curso.'
    : 'Informe a pessoa e o cargo institucional.';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-950/70 backdrop-blur-sm">
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="signature-editor-title"
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
        >
          <header className="flex shrink-0 items-center justify-between bg-[#001a33] px-6 py-5 text-white">
            <div>
              <h4 id="signature-editor-title" className="text-sm font-black uppercase tracking-wide">
                {editingItem ? 'Alterar assinatura' : 'Adicionar assinatura'}
              </h4>
              <p className="mt-1 text-xs font-medium text-slate-300">
                {categoryDescription}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl p-2 text-slate-300 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </header>

          <div className="space-y-4 overflow-y-auto p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Nome do assinante
                </span>
                <input
                  value={form.name}
                  onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-700 outline-none focus:border-pink-400 focus:bg-white"
                  placeholder="Nome completo"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-slate-500">
                  Cargo / função
                </span>
                <input
                  value={form.role}
                  onChange={(event) => onChange((current) => ({ ...current, role: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-700 outline-none focus:border-pink-400 focus:bg-white"
                  placeholder="Ex: Coordenadora do Curso"
                />
              </label>
            </div>

            <label className="block rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 transition hover:border-pink-300 hover:bg-pink-50/30">
              <span className="flex cursor-pointer items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-pink-600 shadow-sm">
                  <Upload size={18} />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-slate-700">
                    {form.file ? form.file.name : editingItem?.previewUrl ? 'Substituir imagem atual' : 'Enviar imagem da assinatura'}
                  </span>
                  <span className="block text-[10px] font-semibold text-slate-400">PNG, JPG ou WEBP • máximo 2 MB</span>
                </span>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => onChange((current) => ({
                  ...current,
                  file: event.target.files?.[0] || null,
                }))}
                className="sr-only"
              />
            </label>

            {editingItem?.previewUrl && !form.file && (
              <div className="flex h-24 items-center justify-center rounded-2xl border border-slate-100 bg-white p-3">
                <img
                  src={editingItem.previewUrl}
                  alt={`Assinatura atual de ${editingItem.name}`}
                  className="max-h-20 max-w-full object-contain mix-blend-multiply"
                />
              </div>
            )}

            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
              <span>
                <span className="block text-xs font-black text-slate-700">Registro ativo</span>
                <span className="block text-[10px] font-semibold text-slate-400">Disponível para uso nos documentos.</span>
              </span>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => onChange((current) => ({ ...current, active: event.target.checked }))}
                className="h-4 w-4 accent-pink-600"
              />
            </label>
          </div>

          <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="flex items-center gap-2 rounded-xl bg-pink-600 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-pink-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {saving ? 'Salvando' : 'Salvar'}
            </button>
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AssinaturasConfig;
