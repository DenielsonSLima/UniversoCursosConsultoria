import React, { useState } from 'react';
import {
  Download,
  FileSignature,
  FolderKanban,
  IdCard,
} from 'lucide-react';
import {
  FICHA_CADASTRAL_VARIABLES,
  fichaCadastralService,
} from '../modelos-documentos/ficha-cadastral/ficha-cadastral.service';
import {
  FICHA_ALUNO_VARIABLES,
  pastaIdentificacaoService,
} from './document-layouts';
import DirectDocumentEditor from './components/DirectDocumentEditor';
import { fichaMatriculaTemplateService } from './ficha-matricula-template.service';

type DocumentModel = 'ficha-cadastral' | 'pasta-identificacao' | 'ficha-matricula';

const models = [
  {
    id: 'ficha-cadastral',
    title: 'Ficha Cadastral do Aluno',
    description: 'Cadastro completo do aluno com foto, dados pessoais, acadêmicos e assinaturas.',
    icon: IdCard,
    iconClass: 'bg-blue-600 shadow-blue-600/20',
    hoverClass: 'group-hover:text-blue-600',
  },
  {
    id: 'pasta-identificacao',
    title: 'Pasta de Identificação',
    description: 'Capa A4 da pasta ou envelope com foto e identificação cadastral do aluno.',
    icon: FolderKanban,
    iconClass: 'bg-cyan-700 shadow-cyan-700/20',
    hoverClass: 'group-hover:text-cyan-700',
  },
  {
    id: 'ficha-matricula',
    title: 'Ficha de Matrícula',
    description: 'Ficha geral com foto, dados acadêmicos, termo, campos extras e assinaturas.',
    icon: FileSignature,
    iconClass: 'bg-emerald-600 shadow-emerald-600/20',
    hoverClass: 'group-hover:text-emerald-600',
  },
] as const;

const FichaMatriculaPage: React.FC = () => {
  const [activeModel, setActiveModel] = useState<DocumentModel | null>(null);

  if (activeModel === 'ficha-cadastral') {
    return (
      <DirectDocumentEditor
        onBack={() => setActiveModel(null)}
        service={fichaCadastralService}
        editorTitle="Editor da Ficha Cadastral do Aluno"
        documentTitle="Ficha Cadastral do Aluno"
        variables={FICHA_CADASTRAL_VARIABLES}
        validationPrefix="FICHA"
      />
    );
  }

  if (activeModel === 'pasta-identificacao') {
    return (
      <DirectDocumentEditor
        onBack={() => setActiveModel(null)}
        service={pastaIdentificacaoService}
        editorTitle="Editor da Pasta de Identificação"
        documentTitle="Pasta de Identificação do Aluno"
        variables={FICHA_ALUNO_VARIABLES}
        validationPrefix="PASTA"
      />
    );
  }

  if (activeModel === 'ficha-matricula') {
    return (
      <DirectDocumentEditor
        onBack={() => setActiveModel(null)}
        service={fichaMatriculaTemplateService}
        editorTitle="Editor da Ficha de Matrícula"
        documentTitle="Ficha de Matrícula"
        variables={FICHA_ALUNO_VARIABLES}
        validationPrefix="FICHA-MAT"
        enableEnrollmentSettings
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn">
      <div className="mb-10">
        <div className="mb-2 flex items-center gap-2 text-blue-600">
          <IdCard size={20} />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Cadastros acadêmicos</span>
        </div>
        <h2 className="text-3xl font-black uppercase tracking-tight text-[#001a33]">
          Ficha Cadastral
        </h2>
        <p className="mt-1 font-medium text-slate-500">
          Configure os modelos cadastrais utilizados no cadastro e na matrícula do aluno.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {models.map((model) => {
          const Icon = model.icon;
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => setActiveModel(model.id)}
              className="group relative flex h-full min-h-72 flex-col items-start overflow-hidden rounded-3xl border border-slate-100 bg-white p-6 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/10"
            >
              <div className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg ${model.iconClass}`}>
                <Icon size={25} />
              </div>

              <h3 className={`mb-2 text-lg font-black text-[#001a33] transition-colors ${model.hoverClass}`}>
                {model.title}
              </h3>
              <p className="mb-6 text-sm font-medium leading-relaxed text-slate-500">
                {model.description}
              </p>

              <div className="mt-auto flex w-full items-center justify-between border-t border-slate-100 pt-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 transition-colors group-hover:text-blue-600">
                  Configurar
                </span>
                <Download size={16} className="text-slate-300 transition-colors group-hover:text-blue-600" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default FichaMatriculaPage;
