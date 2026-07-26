import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  FileSignature,
  Loader2,
  Move,
  Plus,
  Save,
  Settings2,
  Trash2,
} from 'lucide-react';
import { polosService } from '../../../configuracoes/polos/polos.service';
import DeclaracaoEditor from '../../modelos-documentos/declaracao/components/DeclaracaoEditor';
import { fichaCadastralService } from '../../modelos-documentos/ficha-cadastral/ficha-cadastral.service';
import {
  FICHA_ALUNO_VARIABLES,
  fichaMatriculaDefaultTemplate,
} from '../document-layouts';
import {
  fichasMatriculaService,
  type FichaMatriculaCourseOption,
  type FichaMatriculaModel,
} from '../fichas-matricula.service';

interface FichaEditorProps {
  ficha: FichaMatriculaModel | null;
  onSave: (ficha: FichaMatriculaModel) => Promise<void>;
  onCancel: () => void;
}

const createDraft = (): FichaMatriculaModel => ({
  id: `draft-${Date.now()}`,
  nome: '',
  tipoCurso: 'TODOS',
  status: 'ATIVO',
  requerAssinatura: true,
  textoContrato:
    'Solicito minha matrícula no curso acima identificado e declaro que os dados informados são verdadeiros. '
    + 'Estou ciente das normas acadêmicas e administrativas da unidade.',
  camposCustomizados: [],
  camposCount: 0,
  cursoEspecificoId: null,
  templateConfig: JSON.parse(JSON.stringify(fichaMatriculaDefaultTemplate)),
});

const FichaEditor: React.FC<FichaEditorProps> = ({ ficha, onSave, onCancel }) => {
  const [draft, setDraft] = useState<FichaMatriculaModel>(() => ficha || createDraft());
  const [isLayoutOpen, setIsLayoutOpen] = useState(false);
  const [editorPolo, setEditorPolo] = useState<any>(null);
  const [courses, setCourses] = useState<FichaMatriculaCourseOption[]>([]);

  useEffect(() => {
    let active = true;
    polosService.getAll().then((polos) => {
      if (!active) return;
      setEditorPolo(polos.find((polo: any) => polo.is_matriz) || polos[0] || {
        id: 'matriz',
        nomeFantasia: 'Universo Cursos e Consultoria',
      });
    });
    fichasMatriculaService.getAvailableCourses()
      .then((items) => {
        if (active) setCourses(items);
      })
      .catch(() => {
        if (active) setCourses([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const service = useMemo(() => ({
    async getTemplate() {
      return JSON.parse(JSON.stringify({
        ...(draft.templateConfig || fichaMatriculaDefaultTemplate),
        enrollmentFormTerm: draft.textoContrato,
        enrollmentFormCustomFields: draft.camposCustomizados,
        enrollmentFormRequiresSignature: draft.requerAssinatura,
      }));
    },
    async saveTemplate(_poloId: string, templateConfig: any) {
      await onSave({
        ...draft,
        templateConfig: {
          ...templateConfig,
          enrollmentFormTerm: draft.textoContrato,
          enrollmentFormCustomFields: draft.camposCustomizados,
          enrollmentFormRequiresSignature: draft.requerAssinatura,
        },
      });
      return true;
    },
    getQrConfig: fichaCadastralService.getQrConfig,
  }), [draft, onSave]);

  if (isLayoutOpen) {
    if (!editorPolo) {
      return (
        <div className="flex min-h-[420px] items-center justify-center gap-3 rounded-[2rem] border border-slate-200 bg-white text-xs font-black uppercase tracking-widest text-slate-500">
          <Loader2 className="animate-spin text-blue-600" size={24} /> Preparando editor visual...
        </div>
      );
    }
    return (
      <DeclaracaoEditor
        polo={editorPolo}
        onBack={() => setIsLayoutOpen(false)}
        service={service}
        editorTitle={`Editor da Ficha de Matrícula — ${draft.nome}`}
        documentTitle="Ficha de Matrícula"
        variables={FICHA_ALUNO_VARIABLES}
        validationPrefix="FICHA-MAT"
        showValidity={false}
        migrateDeclarationDefaults={false}
        scopeLabel="Modelo geral • dados dinâmicos por polo"
      />
    );
  }

  return (
    <div className="animate-fadeIn rounded-[2.5rem] border border-slate-200 bg-white p-7 shadow-sm">
      <div className="mb-8 flex flex-col gap-5 border-b border-slate-100 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <button type="button" onClick={onCancel} className="rounded-xl bg-slate-50 p-3 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight text-[#001a33]">
              <FileSignature className="text-blue-600" size={23} />
              {ficha ? 'Configurar modelo' : 'Novo modelo'}
            </h3>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              Defina o uso e continue para o editor de arrastar e posicionar
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 self-start rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-blue-700">
          <Move size={12} /> Editor visual completo
        </span>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1.4fr_.8fr]">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Nome do modelo
            </label>
            <input
              value={draft.nome}
              onChange={(event) => setDraft((current) => ({ ...current, nome: event.target.value }))}
              placeholder="Ex.: Ficha de Matrícula Geral"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-800 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Aplicação</label>
              <select
                value={draft.tipoCurso}
                onChange={(event) => setDraft((current) => {
                  const tipoCurso = event.target.value;
                  const selectedCourse = courses.find(item => item.id === current.cursoEspecificoId);
                  return {
                    ...current,
                    tipoCurso,
                    cursoEspecificoId:
                      selectedCourse
                      && tipoCurso !== 'TODOS'
                      && selectedCourse.modalidade !== tipoCurso
                        ? null
                        : current.cursoEspecificoId,
                  };
                })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="TODOS">Todos os cursos</option>
                <option value="TECNICO">Cursos técnicos</option>
                <option value="LIVRE">Cursos livres</option>
                <option value="EAD">Cursos EAD</option>
                <option value="ESPECIALIZACAO">Especialização</option>
                <option value="SUPERIOR">Ensino superior</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Status</label>
              <select
                value={draft.status}
                onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as 'ATIVO' | 'INATIVO' }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
              >
                <option value="ATIVO">Ativo para emissão</option>
                <option value="INATIVO">Rascunho / inativo</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Curso específico (opcional)
            </label>
            <select
              value={draft.cursoEspecificoId || ''}
              onChange={(event) => setDraft((current) => ({
                ...current,
                cursoEspecificoId: event.target.value || null,
              }))}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="">Todos os cursos compatíveis com a aplicação</option>
              {courses
                .filter(course => draft.tipoCurso === 'TODOS' || course.modalidade === draft.tipoCurso)
                .map(course => (
                  <option key={course.id} value={course.id}>
                    {course.nome} — {course.modalidade}
                  </option>
                ))}
            </select>
            <p className="mt-2 text-[10px] font-medium text-slate-400">
              Se escolhido, o modelo só poderá ser emitido para matrículas desse curso.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
            <input
              type="checkbox"
              checked={draft.requerAssinatura}
              onChange={(event) => setDraft((current) => ({ ...current, requerAssinatura: event.target.checked }))}
              className="h-5 w-5 rounded text-blue-600"
            />
            <div>
              <span className="block text-xs font-black uppercase text-[#001a33]">Usar área de assinatura</span>
              <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">Assinaturas podem ser movidas ou substituídas no editor.</span>
            </div>
          </label>

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">
              Termo da matrícula
            </label>
            <textarea
              value={draft.textoContrato}
              onChange={(event) => setDraft((current) => ({
                ...current,
                textoContrato: event.target.value,
              }))}
              rows={5}
              placeholder="Texto que o aluno ou responsável declara e assina."
              className="w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-medium leading-relaxed text-slate-700 outline-none transition-colors focus:border-blue-500 focus:bg-white"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Campos extras
                </p>
                <p className="mt-1 text-[10px] font-medium text-slate-400">
                  Cada campo será impresso com uma linha para preenchimento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft((current) => {
                  const fields = [
                    ...current.camposCustomizados,
                    { id: `campo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '' },
                  ];
                  return { ...current, camposCustomizados: fields, camposCount: fields.length };
                })}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-blue-700 hover:bg-blue-100"
              >
                <Plus size={13} /> Adicionar
              </button>
            </div>
            <div className="space-y-2">
              {draft.camposCustomizados.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <input
                    value={field.label}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      camposCustomizados: current.camposCustomizados.map((item, itemIndex) => (
                        itemIndex === index ? { ...item, label: event.target.value } : item
                      )),
                    }))}
                    placeholder={`Nome do campo ${index + 1}`}
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <button
                    type="button"
                    aria-label={`Remover campo ${index + 1}`}
                    onClick={() => setDraft((current) => {
                      const fields = current.camposCustomizados.filter((_, itemIndex) => itemIndex !== index);
                      return { ...current, camposCustomizados: fields, camposCount: fields.length };
                    })}
                    className="rounded-xl border border-rose-100 bg-rose-50 p-2.5 text-rose-500 hover:bg-rose-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!draft.camposCustomizados.length && (
                <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-[10px] font-bold text-slate-400">
                  Nenhum campo extra configurado.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-[2rem] border border-blue-100 bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/15">
          <div>
            <Settings2 className="mb-5 text-blue-300" size={28} />
            <h4 className="text-lg font-black uppercase tracking-tight">Próxima etapa</h4>
            <p className="mt-2 text-xs font-medium leading-relaxed text-blue-100">
              No editor você poderá arrastar campos, mover elementos, alterar tamanho, fonte e cor, inserir QR Code, foto, imagens e assinaturas configuradas.
            </p>
          </div>
          <button
            type="button"
            disabled={!draft.nome.trim()}
            onClick={() => setIsLayoutOpen(true)}
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-[#001a33] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save size={15} /> Abrir editor visual
          </button>
        </div>
      </div>
    </div>
  );
};

export default FichaEditor;
