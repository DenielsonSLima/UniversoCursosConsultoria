import React from 'react';
import { Calendar, Clock, Layers, Loader2, Plus, Receipt } from 'lucide-react';
import { Curso } from '../cadastros.types';
import { parseBRLPrice } from './cursoGradeCurricular.helpers';
import { useCursoPublication } from './useCursoPublication';

interface CursoPublicoTabProps {
  curso: Curso;
  publication: ReturnType<typeof useCursoPublication>;
}

interface ImageInputProps {
  imageUrl: string;
  uploading: boolean;
  label: string;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}

const DetailImageInput: React.FC<ImageInputProps> = ({ imageUrl, uploading, label, onUpload, onRemove }) => (
  <div className="space-y-2">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50 flex flex-col items-center justify-center gap-2 h-44 relative overflow-hidden group hover:bg-slate-100/50 transition-colors">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt={label} className="h-20 rounded-xl object-cover border border-slate-200 shadow-sm animate-fadeIn" />
          <div className="flex gap-1.5 mt-2">
            <label className="px-2.5 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all">
              {uploading ? 'Upload...' : 'Trocar'}
              <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} className="hidden" />
            </label>
            <button onClick={onRemove} className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all border border-red-200">Remover</button>
          </div>
        </>
      ) : (
        <>
          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center border border-slate-200 shadow-inner"><Plus size={16} /></div>
          <label className="px-3 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all mt-2">
            {uploading ? 'Upload...' : 'Adicionar Foto'}
            <input type="file" accept="image/*" onChange={onUpload} disabled={uploading} className="hidden" />
          </label>
        </>
      )}
    </div>
  </div>
);

const CursoPublicoTab: React.FC<CursoPublicoTabProps> = ({ curso, publication }) => {
  const {
    publicarSite,
    imagemUrl,
    imagemDetalhe1,
    imagemDetalhe2,
    isUploading,
    isUploadingD1,
    isUploadingD2,
    valorCurso,
    isSavingValor,
    usesTurmaFinanceiro,
    setValorCurso,
    handleTogglePublicarSite,
    handleSaveValorCurso,
    handleUploadImagem,
    handleUploadImagemD1,
    handleUploadImagemD2,
    handleRemoverImagem,
    handleRemoverImagemD1,
    handleRemoverImagemD2
  } = publication;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20 animate-fadeIn">
      <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-8">
        <h4 className="font-bold text-[#001a33] text-lg border-b border-slate-100 pb-4">Configurações de Publicação</h4>

        <div className="flex items-start justify-between gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200">
          <div className="space-y-1">
            <span className="font-bold text-sm text-slate-800 block">Exibir no Site Público</span>
            <span className="text-xs text-slate-400 font-medium block leading-relaxed">Permite que visitantes do site visualizem a grade, duração e se pré-inscrevam no curso.</span>
          </div>
          <button onClick={handleTogglePublicarSite} className={`w-14 h-8 rounded-full p-1 transition-colors shrink-0 flex items-center ${publicarSite ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <div className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${publicarSite ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>

        {usesTurmaFinanceiro ? (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
            <span className="text-xs font-black uppercase tracking-widest text-amber-800">Valor definido na turma</span>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-amber-800">O cadastro do curso não define preço. Cada turma informa seus valores, parcelas, descontos, juros e multa, e o site deve usar a turma disponível para exibir/gerar o checkout correto.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Valor do Curso (Preço Comercial)</label>
            <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              <span className="text-slate-500 font-black text-sm">R$</span>
              <input
                type="text"
                placeholder="Ex: 299,90 (Deixe em branco para 'Sob Consulta')"
                className="w-full bg-transparent border-none outline-none text-sm font-bold text-slate-800 placeholder-slate-400 py-2.5"
                value={valorCurso}
                onChange={(event) => setValorCurso(event.target.value)}
                onBlur={() => {
                  const parsed = parseBRLPrice(valorCurso);
                  setValorCurso(parsed !== null && !isNaN(parsed) ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
                }}
                onKeyDown={(event) => event.key === 'Enter' && handleSaveValorCurso(valorCurso)}
              />
              <button type="button" disabled={isSavingValor} onClick={() => handleSaveValorCurso(valorCurso)} className="px-4 py-2 bg-[#001a33] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-sm shrink-0 disabled:opacity-70 flex items-center gap-1.5">
                {isSavingValor ? <><Loader2 className="animate-spin" size={12} /><span>Salvando...</span></> : 'Salvar'}
              </button>
            </div>
            <p className="text-[9px] text-slate-400 font-medium leading-normal">Insira o preço comercial para divulgação pública no site. Digite o valor com duas casas decimais e clique em Salvar (ex: 299,90).</p>
          </div>
        )}

        {['LIVRE', 'ESPECIALIZACAO'].includes(curso.modalidade) && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-800"><Receipt size={14} /> Checkout individual do aluno</span>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-emerald-800">Na compra pelo site, o checkout Asaas é gerado individualmente para cada aluno usando as regras financeiras do curso e fica vinculado à matrícula. Não é necessário gerar link de pagamento fixo.</p>
          </div>
        )}

        <div className="space-y-4">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Imagem de Capa do Curso</label>
          <div className="border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center bg-slate-50 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:bg-slate-100/50 transition-colors">
            {imagemUrl ? (
              <>
                <img src={imagemUrl} alt="Capa do Curso" className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm animate-fadeIn" />
                <div className="flex gap-2">
                  <label className="px-4 py-2 bg-[#001a33] hover:bg-blue-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                    {isUploading ? 'Fazendo Upload...' : 'Alterar Imagem'}
                    <input type="file" accept="image/*" onChange={handleUploadImagem} disabled={isUploading} className="hidden" />
                  </label>
                  <button onClick={handleRemoverImagem} className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200">Remover</button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner"><Layers size={24} /></div>
                <div><p className="text-sm font-bold text-slate-700">Selecione a imagem de capa</p><p className="text-xs text-slate-400 mt-1 font-medium">Formato recomendado 16:9</p></div>
                <label className="px-5 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                  {isUploading ? 'Fazendo Upload...' : 'Selecionar Imagem'}
                  <input type="file" accept="image/*" onChange={handleUploadImagem} disabled={isUploading} className="hidden" />
                </label>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-slate-100">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Fotos Adicionais (Galeria na Página Pública)</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailImageInput imageUrl={imagemDetalhe1} uploading={isUploadingD1} label="Foto Adicional 1" onUpload={handleUploadImagemD1} onRemove={handleRemoverImagemD1} />
            <DetailImageInput imageUrl={imagemDetalhe2} uploading={isUploadingD2} label="Foto Adicional 2" onUpload={handleUploadImagemD2} onRemove={handleRemoverImagemD2} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Visualização Prévia (Site Público)</label>
        <div className="max-w-sm mx-auto w-full bg-white border border-slate-200 rounded-[2rem] p-6 shadow-md flex flex-col justify-between min-h-[380px]">
          <div>
            <div className="h-40 w-full bg-slate-50 rounded-2xl overflow-hidden mb-4 border border-slate-100 shrink-0 flex items-center justify-center">
              {imagemUrl ? <img src={imagemUrl} alt={curso.nome} className="w-full h-full object-cover" /> : <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sem Imagem de Capa</span>}
            </div>
            <div className="flex justify-between items-center gap-4 mb-4">
              <div className="h-9 w-24 bg-slate-50 border border-slate-100 rounded-xl p-1.5 flex items-center justify-center overflow-hidden shrink-0"><img src="/LogoUniverso.png" alt="Universo" className="h-full w-full object-contain" /></div>
              <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md uppercase tracking-wider">{curso.area || 'Saúde'}</span>
            </div>
            <h3 className="text-base font-black text-[#001a33] leading-snug mb-1">{curso.nome}</h3>
            <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-medium">{curso.descricao || 'Formação profissionalizante de alto nível.'}</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl mt-4">
            <Clock size={14} className="text-emerald-500" /><span className="font-bold">{curso.carga_horaria}h</span><span className="text-slate-300">|</span>
            <Calendar size={14} className="text-blue-500" /><span className="font-bold">{(curso as any).duracao_meses || (curso.carga_horaria >= 1200 ? 24 : 18)} Meses</span>
          </div>
          {!usesTurmaFinanceiro && (() => {
            const normalized = valorCurso.replace(/\./g, '').replace(',', '.').trim();
            const parsedVal = normalized === '' ? 0 : parseFloat(normalized);
            return parsedVal > 0 ? (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Investimento</span>
                <div className="bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                  <span className="text-[8px] text-emerald-800 font-bold uppercase tracking-wider">A partir de</span>
                  <span className="text-xs font-black text-emerald-600">R$ {parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </div>
  );
};

export default CursoPublicoTab;
