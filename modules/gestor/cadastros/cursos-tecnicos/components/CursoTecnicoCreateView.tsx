import React from "react";
import {
  ArrowLeft,
  Banknote,
  Briefcase,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  Receipt,
  Save,
} from "lucide-react";

type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

interface CursoTecnicoCreateViewProps {
  areasDisponiveis: string[];
  financeiroBoleto: boolean;
  financeiroCartao: boolean;
  financeiroMaxParcelas: number;
  financeiroPix: boolean;
  isCreatingCurso: boolean;
  isUploading: boolean;
  newAreaName: string;
  newCursoArea: string;
  newCursoCargaHoraria: number;
  newCursoDesc: string;
  newCursoDuracaoMeses: number;
  newCursoImagemUrl: string;
  newCursoNome: string;
  newCursoPublicarSite: boolean;
  newCursoVersao: string;
  showNewAreaInput: boolean;
  onAddArea: () => void;
  onBack: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onUploadImage: (event: React.ChangeEvent<HTMLInputElement>) => void;
  setFinanceiroBoleto: Setter<boolean>;
  setFinanceiroCartao: Setter<boolean>;
  setFinanceiroMaxParcelas: Setter<number>;
  setFinanceiroPix: Setter<boolean>;
  setNewAreaName: Setter<string>;
  setNewCursoArea: Setter<string>;
  setNewCursoCargaHoraria: Setter<number>;
  setNewCursoDesc: Setter<string>;
  setNewCursoDuracaoMeses: Setter<number>;
  setNewCursoImagemUrl: Setter<string>;
  setNewCursoNome: Setter<string>;
  setNewCursoPublicarSite: Setter<boolean>;
  setNewCursoVersao: Setter<string>;
  setShowNewAreaInput: Setter<boolean>;
}

const CursoTecnicoCreateView: React.FC<CursoTecnicoCreateViewProps> = ({
  areasDisponiveis,
  financeiroBoleto,
  financeiroCartao,
  financeiroMaxParcelas,
  financeiroPix,
  isCreatingCurso,
  isUploading,
  newAreaName,
  newCursoArea,
  newCursoCargaHoraria,
  newCursoDesc,
  newCursoDuracaoMeses,
  newCursoImagemUrl,
  newCursoNome,
  newCursoPublicarSite,
  newCursoVersao,
  showNewAreaInput,
  onAddArea,
  onBack,
  onSubmit,
  onUploadImage,
  setFinanceiroBoleto,
  setFinanceiroCartao,
  setFinanceiroMaxParcelas,
  setFinanceiroPix,
  setNewAreaName,
  setNewCursoArea,
  setNewCursoCargaHoraria,
  setNewCursoDesc,
  setNewCursoDuracaoMeses,
  setNewCursoImagemUrl,
  setNewCursoNome,
  setNewCursoPublicarSite,
  setNewCursoVersao,
  setShowNewAreaInput,
}) => (
  <div className="flex min-w-0 flex-col h-full animate-fadeIn bg-slate-50 min-h-screen overflow-x-hidden">
    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white px-4 py-5 sm:px-6 border-b border-slate-200">
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          onClick={onBack}
          className="flex-shrink-0 p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-emerald-600 hover:border-emerald-200 transition-colors bg-white shadow-sm"
          aria-label="Voltar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2.5 py-1 rounded-md">
            Curso Técnico
          </span>
          <h3 className="truncate text-lg sm:text-xl font-black text-[#001a33] mt-1.5 uppercase tracking-tight">
            Novo Curso Técnico
          </h3>
        </div>
      </div>

      <button
        type="submit"
        form="create-curso-tecnico-form"
        disabled={isCreatingCurso || isUploading}
        className="flex w-full sm:w-auto items-center justify-center gap-2 bg-[#001a33] hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-all disabled:opacity-70 shadow-lg shadow-emerald-900/20"
      >
        {isCreatingCurso
          ? <Loader2 className="animate-spin" size={16} />
          : <Save size={16} />}
        Criar Curso Técnico
      </button>
    </div>

    <div className="bg-white border-b border-slate-200 px-3 py-3 sm:px-6 sm:py-4">
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1">
        <div className="group relative flex min-w-0 flex-col items-center gap-2 px-1">
          <span className="relative z-10 w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition-all border bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-600/20">
            1
          </span>
          <span className="block w-full truncate text-center text-[10px] font-black uppercase tracking-wide text-emerald-600">
            Informações Básicas
          </span>
        </div>
      </div>
    </div>

    <div className="flex-1 min-w-0 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8">
      <form
        id="create-curso-tecnico-form"
        onSubmit={onSubmit}
        className="bg-white border border-slate-200 rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <span className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <Briefcase size={20} />
          </span>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">
            Informações Principais do Curso
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Nome do Curso *
            </label>
            <input
              required
              type="text"
              value={newCursoNome}
              onChange={(event) => setNewCursoNome(event.target.value)}
              placeholder="Ex: Técnico em Enfermagem"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-semibold text-slate-800 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Área de Formação
              </label>
              <button
                type="button"
                onClick={() => setShowNewAreaInput((current) => !current)}
                className="text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700"
              >
                + Nova área
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <select
                value={newCursoArea}
                onChange={(event) => setNewCursoArea(event.target.value)}
                className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-bold text-slate-800 transition-all cursor-pointer"
              >
                {areasDisponiveis.map((area) => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
              {showNewAreaInput && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(event) => setNewAreaName(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Enter" &&
                      (event.preventDefault(), onAddArea())}
                    placeholder="Nome da nova área"
                    className="min-w-0 flex-1 px-4 py-2.5 text-xs bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-100 outline-none font-bold text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={onAddArea}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700"
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Carga Horária (Horas) *
            </label>
            <input
              required
              type="number"
              min="1"
              value={newCursoCargaHoraria}
              onChange={(event) =>
                setNewCursoCargaHoraria(Number(event.target.value))}
              placeholder="Ex: 1200"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-semibold text-slate-800 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Versão do Curso
            </label>
            <input
              required
              type="text"
              value={newCursoVersao}
              onChange={(event) => setNewCursoVersao(event.target.value)}
              placeholder="Ex: 1.0"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-semibold text-slate-800 transition-all"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Duração (Meses)
            </label>
            <input
              required
              type="number"
              min="1"
              value={newCursoDuracaoMeses}
              onChange={(event) =>
                setNewCursoDuracaoMeses(Number(event.target.value))}
              placeholder="Ex: 24"
              className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-semibold text-slate-800 transition-all"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Resumo do Curso (Exibido no Catálogo)
          </label>
          <textarea
            value={newCursoDesc}
            onChange={(event) => setNewCursoDesc(event.target.value)}
            rows={4}
            placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais."
            className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-semibold text-slate-800 transition-all resize-none"
          />
        </div>

        <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
          <div className="flex items-center gap-2">
            <Banknote size={18} className="text-emerald-600" />
            <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">
              Opções Financeiras do Curso
            </h5>
          </div>
          <p className="text-xs font-semibold leading-relaxed text-slate-500">
            Aqui ficam apenas os meios aceitos e o limite do cartão. Valor,
            número de parcelas, desconto, juros e multa serão definidos na
            turma.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                label: "Pix",
                icon: Banknote,
                enabled: financeiroPix,
                onToggle: () => setFinanceiroPix((current) => !current),
              },
              {
                label: "Boleto",
                icon: Receipt,
                enabled: financeiroBoleto,
                onToggle: () => setFinanceiroBoleto((current) => !current),
              },
              {
                label: "Cartão",
                icon: CreditCard,
                enabled: financeiroCartao,
                onToggle: () => setFinanceiroCartao((current) => !current),
              },
            ].map((method) => {
              const Icon = method.icon;
              return (
                <button
                  type="button"
                  key={method.label}
                  onClick={method.onToggle}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all ${
                    method.enabled
                      ? "border-emerald-200 bg-white text-emerald-700 shadow-sm"
                      : "border-slate-200 bg-white/70 text-slate-400"
                  }`}
                >
                  <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide">
                    <Icon size={16} />
                    {method.label}
                  </span>
                  <span
                    className={`h-5 w-5 rounded-full border ${
                      method.enabled
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-slate-300 bg-white"
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <label className="flex flex-col gap-2 md:max-w-xs">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Máximo de parcelas no cartão
            </span>
            <input
              type="number"
              min={1}
              max={12}
              disabled={!financeiroCartao}
              value={financeiroMaxParcelas}
              onChange={(event) =>
                setFinanceiroMaxParcelas(
                  Math.max(1, Math.min(12, Number(event.target.value) || 1)),
                )}
              className="w-full px-4 py-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500 outline-none font-black text-slate-800 disabled:opacity-50"
            />
          </label>
        </div>

        <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50/60 space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-emerald-600" />
            <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">
              Imagem de Capa do Curso
            </h5>
          </div>
          <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-white flex flex-col items-center justify-center gap-4">
            {newCursoImagemUrl
              ? (
                <>
                  <img
                    src={newCursoImagemUrl}
                    alt="Capa do curso técnico"
                    className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setNewCursoImagemUrl("")}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200"
                  >
                    Remover
                  </button>
                </>
              )
              : (
                <>
                  <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner">
                    <ImageIcon size={24} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      Selecione a imagem de capa do curso
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-medium">
                      Recomendado formato horizontal (16:9)
                    </p>
                  </div>
                </>
              )}
            <label className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-emerald-600/15">
              {isUploading
                ? "Enviando..."
                : newCursoImagemUrl
                ? "Alterar Imagem"
                : "Carregar Foto"}
              <input
                type="file"
                accept="image/*"
                onChange={onUploadImage}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <input
            type="checkbox"
            id="newCursoTecnicoPublicarSitePage"
            checked={newCursoPublicarSite}
            onChange={(event) => setNewCursoPublicarSite(event.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          <label
            htmlFor="newCursoTecnicoPublicarSitePage"
            className="cursor-pointer select-none text-xs font-bold text-slate-700"
          >
            Publicar no site público
          </label>
        </div>
      </form>
    </div>
  </div>
);

export default CursoTecnicoCreateView;
