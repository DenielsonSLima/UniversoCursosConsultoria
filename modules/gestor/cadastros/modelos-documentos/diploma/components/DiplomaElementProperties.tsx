import React from 'react';
import { Check, Copy, Loader2, Sliders, Trash2, Upload } from 'lucide-react';

interface DiplomaElementPropertiesProps {
  selectedBlock: any;
  formData: any;
  isUploading: boolean;
  copiedVar: string | null;
  signatureSourceOptions: Array<{ value: string; label: string }>;
  onUpdate: (blockId: string, key: string, value: any) => void;
  onRemove: (blockId: string) => void;
  onUploadSignature: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCopy: (token: string) => void;
}

const VariableToken = ({ token, label, copied, onCopy }: { token: string; label?: string; copied: boolean; onCopy: () => void }) => (
  <div onClick={onCopy} className="bg-white px-2 py-1 rounded border border-purple-100 shadow-sm cursor-pointer hover:bg-purple-50 flex items-center justify-between gap-1.5 text-purple-700 transition-colors group" title="Clique para copiar">
    <div className="flex flex-col">
      {label && <span className="text-[7px] text-purple-500 uppercase tracking-widest">{label}</span>}
      <span className="font-mono text-[9px]">{token}</span>
    </div>
    {copied ? <Check size={10} className="text-emerald-500 shrink-0" /> : <Copy size={10} className="opacity-0 group-hover:opacity-100 shrink-0" />}
  </div>
);

const DiplomaElementProperties: React.FC<DiplomaElementPropertiesProps> = ({
  selectedBlock,
  formData,
  isUploading,
  copiedVar,
  signatureSourceOptions,
  onUpdate,
  onRemove,
  onUploadSignature,
  onCopy,
}) => {
  const token = (value: string, label: string) => (
    <VariableToken token={value} label={label} copied={copiedVar === value} onCopy={() => onCopy(value)} />
  );
  const renderSignatureSourceEditor = () => (
    <>
      <div>
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Origem da Assinatura</label>
        <select value={selectedBlock.signatureSource || 'none'} onChange={(event) => onUpdate(selectedBlock.id, 'signatureSource', event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-500 transition-all cursor-pointer">
          {signatureSourceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {selectedBlock.signatureSource === 'manual' && (
        <div className="space-y-2">
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload da Assinatura PNG</label>
          <div className="flex gap-2">
            <input type="text" value={selectedBlock.signatureImageUrl || ''} onChange={(event) => onUpdate(selectedBlock.id, 'signatureImageUrl', event.target.value)} className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-500 focus:bg-white transition-all" placeholder="URL da assinatura digitalizada (.png)" />
            <label className="flex items-center justify-center p-2.5 bg-white hover:bg-purple-50 hover:text-purple-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shrink-0">
              <input type="file" accept="image/*" onChange={onUploadSignature} className="absolute inset-0 opacity-0 cursor-pointer" disabled={isUploading} />
              {isUploading ? <Loader2 size={16} className="animate-spin text-purple-600" /> : <Upload size={16} />}
            </label>
          </div>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">PNG com fundo transparente (preferencial)</p>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-purple-50/10 border border-purple-100 rounded-3xl p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-purple-100/50 pb-3">
        <span className="p-1.5 bg-purple-100 text-purple-700 rounded-lg"><Sliders size={14} /></span>
        <span className="text-xs font-black text-[#001a33] uppercase tracking-wider">Propriedades do Elemento</span>
      </div>
      {!selectedBlock ? (
        <div className="text-center py-6 text-slate-400 text-xs font-semibold italic leading-relaxed">Clique em qualquer elemento do diploma no painel à direita para selecioná-lo e abrir suas configurações individuais.</div>
      ) : (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center bg-purple-50 border border-purple-100 rounded-lg px-3 py-1.5 text-xs text-purple-800 font-black uppercase tracking-wider">
            <span>{selectedBlock.label}</span>
            <button onClick={() => onRemove(selectedBlock.id)} className="text-red-500 hover:text-red-700 flex items-center gap-0.5 text-[9px] uppercase font-bold" title="Remover do Documento"><Trash2 size={12} /> Remover</button>
          </div>

          {['text', 'validationLink'].includes(selectedBlock.type) && (
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Conteúdo Textual</label>
              <textarea rows={selectedBlock.id === 'texto' ? 6 : 3} value={selectedBlock.content || ''} onChange={(event) => onUpdate(selectedBlock.id, 'content', event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-500 outline-none transition-all resize-y custom-scrollbar" />
            </div>
          )}
          {selectedBlock.type === 'table' && (
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Conteúdo do Histórico / Grade</label>
              <textarea rows={6} value={selectedBlock.content || ''} onChange={(event) => onUpdate(selectedBlock.id, 'content', event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-medium text-slate-800 focus:border-purple-500 outline-none transition-all resize-y custom-scrollbar" />
            </div>
          )}

          {['text', 'table', 'validationLink'].includes(selectedBlock.type) && (
            <div className="space-y-3">
              <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5"><span>Tamanho da Fonte</span><span className="font-mono">{selectedBlock.fontSize || 14}px</span></label>
              <input type="range" min={selectedBlock.id === 'titulo' ? '20' : '8'} max={selectedBlock.id === 'titulo' ? '90' : selectedBlock.type === 'table' ? '22' : '40'} step="1" value={selectedBlock.fontSize || 14} onChange={(event) => onUpdate(selectedBlock.id, 'fontSize', parseInt(event.target.value))} className="w-full accent-purple-600" />
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cor do texto</label><input type="color" value={selectedBlock.color || formData.corTexto || '#1e293b'} onChange={(event) => onUpdate(selectedBlock.id, 'color', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1" /></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Alinhamento</label><select value={selectedBlock.textAlign || 'center'} onChange={(event) => onUpdate(selectedBlock.id, 'textAlign', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold"><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option><option value="justify">Justificado</option></select></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Fonte</label><select value={selectedBlock.fontFamily || 'serif'} onChange={(event) => onUpdate(selectedBlock.id, 'fontFamily', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold"><option value="serif">Serifada</option><option value="sans-serif">Sem serifa</option><option value="monospace">Monoespaçada</option><option value="'Playfair Display', serif">Clássica</option></select></div>
                <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Peso</label><select value={selectedBlock.fontWeight || 'normal'} onChange={(event) => onUpdate(selectedBlock.id, 'fontWeight', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-bold"><option value="400">Normal</option><option value="700">Negrito</option><option value="900">Extra forte</option></select></div>
              </div>
            </div>
          )}

          {['text', 'table', 'validationLink'].includes(selectedBlock.type) && (
            <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100/50 space-y-2">
              <span className="block text-[8px] font-black text-purple-700 uppercase tracking-widest">Variáveis Suportadas</span>
              <div className="grid grid-cols-1 gap-1 text-[8px]">
                {token('{{nome_aluno}}', 'Nome do Aluno')}{token('{{cpf}}', 'CPF')}{token('{{curso_nome}}', 'Curso')}{token('{{carga_horaria}}', 'Carga')}{token('{{data_inicio}}', 'Início')}{token('{{data_fim}}', 'Fim')}{token('{{periodo}}', 'Período')}{token('{{data_conclusao}}', 'Data')}{token('{{codigo_certificado}}', 'Código')}{token('{{url_validacao}}', 'Link de Validação')}
              </div>
            </div>
          )}

          {['logo', 'qrcode', 'signature', 'signatureImage', 'image', 'text', 'table', 'validationLink', 'line'].includes(selectedBlock.type) && (
            <div><label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5"><span>Largura</span><span className="font-mono">{selectedBlock.width || 120}px</span></label><input type="range" min="40" max={selectedBlock.type === 'qrcode' ? '650' : '900'} step="5" value={selectedBlock.width || 120} onChange={(event) => onUpdate(selectedBlock.id, 'width', parseInt(event.target.value))} className="w-full accent-purple-600" /></div>
          )}

          {selectedBlock.type === 'image' && (
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">URL da imagem</label>
              <input type="text" value={selectedBlock.imageUrl || ''} onChange={(event) => onUpdate(selectedBlock.id, 'imageUrl', event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-500" />
              <label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5"><span>Opacidade</span><span className="font-mono">{Math.round((selectedBlock.opacity ?? 1) * 100)}%</span></label>
              <input type="range" min="0.05" max="1" step="0.05" value={selectedBlock.opacity ?? 1} onChange={(event) => onUpdate(selectedBlock.id, 'opacity', Number(event.target.value))} className="w-full accent-purple-600" />
            </div>
          )}

          {selectedBlock.type === 'signatureImage' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 text-[10px] font-bold uppercase tracking-widest text-purple-800">Arraste esta imagem no certificado para mover somente a assinatura, sem mover a linha ou o cargo.</div>
              {renderSignatureSourceEditor()}
              {selectedBlock.signatureSource && selectedBlock.signatureSource !== 'none' && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={selectedBlock.signatureBlend !== false} onChange={(event) => onUpdate(selectedBlock.id, 'signatureBlend', event.target.checked)} className="w-4 h-4 text-purple-600 rounded" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Modo mesclagem (multiplicar)</span></label>}
            </div>
          )}

          {selectedBlock.type === 'signature' && (
            <div className="space-y-3">
              <div><label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo / Identificação da Assinatura</label><input type="text" value={selectedBlock.title || ''} onChange={(event) => onUpdate(selectedBlock.id, 'title', event.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-500" placeholder="Ex: Diretor Geral" /></div>
              {renderSignatureSourceEditor()}
              {selectedBlock.signatureSource && selectedBlock.signatureSource !== 'none' && <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={selectedBlock.signatureBlend !== false} onChange={(event) => onUpdate(selectedBlock.id, 'signatureBlend', event.target.checked)} className="w-4 h-4 text-purple-600 rounded" /><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mesclar assinatura no documento (modo multiply)</span></label>}
              <div><label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5"><span>Ajuste vertical da imagem</span><span className="font-mono">{selectedBlock.signatureImageOffsetY || 0}px</span></label><input type="range" min="-40" max="40" step="1" value={selectedBlock.signatureImageOffsetY || 0} onChange={(event) => onUpdate(selectedBlock.id, 'signatureImageOffsetY', parseInt(event.target.value, 10))} className="w-full accent-purple-600" /></div>
              <div><label className="flex justify-between text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5"><span>Tamanho da Fonte do Identificador</span><span className="font-mono">{selectedBlock.signatureLabelFontSize || 10}px</span></label><input type="range" min="8" max="20" step="1" value={selectedBlock.signatureLabelFontSize || 10} onChange={(event) => onUpdate(selectedBlock.id, 'signatureLabelFontSize', parseInt(event.target.value, 10))} className="w-full accent-purple-600" /></div>
              <div><label className="block text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Cor da linha e do cargo</label><input type="color" value={selectedBlock.color || formData.corTexto || '#1e293b'} onChange={(event) => onUpdate(selectedBlock.id, 'color', event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white p-1" /></div>
            </div>
          )}

          {selectedBlock.type === 'table' && (
            <div className="bg-purple-50/50 p-3 rounded-xl border border-purple-100/50 space-y-2">
              <span className="block text-[8px] font-black text-purple-700 uppercase tracking-widest">Blocos do Verso</span>
              <div className="grid grid-cols-1 gap-1 text-[8px]">
                {token('{{grade_curricular}}', 'Estrutura de Disciplinas')}{token('{{livro_registro}}', 'Dados de Registro Geral')}{token('{{ensino_medio_estabelecimento}}', 'Estabelecimento do Ensino Médio')}{token('{{ensino_medio_localidade_uf}}', 'Localidade / UF')}{token('{{ensino_medio_ano_conclusao}}', 'Ano de Conclusão')}{token('{{certificado_numero}}', 'Número do Certificado')}{token('{{pagina_livro}}', 'Página do Livro')}{token('{{livro}}', 'Livro')}{token('{{validacao_sistec}}', 'Validação SISTEC')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiplomaElementProperties;
