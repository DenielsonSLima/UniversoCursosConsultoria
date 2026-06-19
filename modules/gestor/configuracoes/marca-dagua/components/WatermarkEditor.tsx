
import React, { useState, useRef } from 'react';
import { Upload, Save, X, ZoomIn, Sun, Move, Trash2, RotateCw } from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';

interface WatermarkEditorProps {
  company: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}

const WatermarkEditor: React.FC<WatermarkEditorProps> = ({ company, onSave, onCancel, isSaving }) => {
  const [opacity, setOpacity] = useState(company.watermarkOpacity || 0.1);
  const [scale, setScale] = useState(company.watermarkScale || 50); // Porcentagem
  const [image, setImage] = useState<string | null>(company.watermarkUrl || null);
  const [rotate, setRotate] = useState(company.watermarkRotate !== false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estado Modal Remoção
  const [removeModalOpen, setRemoveModalOpen] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onSave({
      ...company,
      watermarkUrl: image,
      watermarkOpacity: opacity,
      watermarkScale: scale,
      watermarkRotate: rotate
    });
  };

  const confirmRemove = () => {
    setRemoveModalOpen(true);
  };

  const handleRemove = () => {
    setImage(null);
    // Podemos salvar imediatamente ou deixar o usuário clicar em Salvar. 
    // Para UX consistente com o editor, apenas limpamos o estado visual.
    // O usuário precisa clicar em "Salvar Configuração" para persistir a remoção.
  };

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 shadow-xl overflow-hidden animate-fadeIn flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">
            Configurar Marca D'água
          </h3>
          <p className="text-slate-500 text-sm font-medium">
            Editando: <span className="text-blue-600 font-bold">{company.nomeFantasia}</span>
          </p>
        </div>
        <button 
          onClick={onCancel}
          className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-col lg:flex-row h-full">
        {/* Painel de Controles (Esquerda) */}
        <div className="lg:w-1/3 p-8 border-r border-slate-100 flex flex-col gap-8 bg-white z-10">
          
          {/* Upload */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-[#001a33] uppercase tracking-wider block">Imagem da Marca</label>
              {image && (
                <button 
                  onClick={confirmRemove}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase flex items-center gap-1"
                >
                  <Trash2 size={12} /> Remover
                </button>
              )}
            </div>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-video border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all group relative overflow-hidden"
            >
              {image ? (
                <img src={image} alt="Preview" className="w-full h-full object-contain p-4 opacity-80" />
              ) : (
                <div className="text-center p-4">
                  <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-200 group-hover:text-blue-600 transition-colors">
                    <Upload size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-500 group-hover:text-blue-600">Carregar Imagem</p>
                </div>
              )}
              {image && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-bold uppercase">Trocar Imagem</span>
                </div>
              )}
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/png, image/jpeg" 
              onChange={handleImageUpload}
            />
            <p className="text-[10px] text-slate-400">Recomendado: PNG com fundo transparente.</p>
          </div>

          {/* Slider Opacidade */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-[#001a33] uppercase tracking-wider">
                <Sun size={14} /> Opacidade
              </label>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={opacity} 
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              disabled={!image}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Slider Tamanho */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-[#001a33] uppercase tracking-wider">
                <ZoomIn size={14} /> Tamanho
              </label>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                {scale}%
              </span>
            </div>
            <input 
              type="range" 
              min="10" 
              max="100" 
              step="5" 
              value={scale} 
              onChange={(e) => setScale(parseInt(e.target.value))}
              disabled={!image}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Rotação (Toggle) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-[#001a33] uppercase tracking-wider">
                <RotateCw size={14} /> Rotacionar Marca (-45°)
              </label>
              <button
                type="button"
                onClick={() => setRotate(!rotate)}
                disabled={!image}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  rotate ? 'bg-blue-600' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    rotate ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-[10px] text-slate-400">Rotaciona diagonalmente a marca d'água no centro da folha.</p>
          </div>

          <div className="mt-auto pt-6 border-t border-slate-100">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-4 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Save size={16} /> {isSaving ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </div>
        </div>

        {/* Preview A4 (Direita) */}
        <div className="lg:w-2/3 bg-slate-100 p-8 flex items-center justify-center overflow-auto relative">
           
           <div className="absolute top-4 right-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm z-20">
             Pré-visualização A4
           </div>

           {/* Folha A4 - Aspect Ratio A4 é 1 : 1.414 */}
           <div 
            className="bg-white shadow-2xl relative overflow-hidden transition-all duration-300"
            style={{ 
              width: '400px', 
              height: '565px', // Proporção aproximada A4 para visualização
              transform: 'scale(1)', // Pode ser usado para zoom futuro
            }}
           >
              {/* Conteúdo Simulado do Documento */}
              <div className="absolute inset-0 p-8 z-10 flex flex-col gap-4">
                <div className="w-full flex justify-between items-start border-b-2 border-slate-800 pb-4">
                   <div className="w-16 h-16 bg-slate-200 rounded-lg"></div>
                   <div className="text-right">
                     <div className="h-4 w-48 bg-slate-800 rounded mb-2 ml-auto"></div>
                     <div className="h-2 w-32 bg-slate-400 rounded ml-auto"></div>
                   </div>
                </div>

                <div className="space-y-3 mt-8">
                  <div className="h-2 w-full bg-slate-200 rounded"></div>
                  <div className="h-2 w-full bg-slate-200 rounded"></div>
                  <div className="h-2 w-3/4 bg-slate-200 rounded"></div>
                </div>

                <div className="space-y-3 mt-4">
                  <div className="h-2 w-full bg-slate-200 rounded"></div>
                  <div className="h-2 w-full bg-slate-200 rounded"></div>
                  <div className="h-2 w-5/6 bg-slate-200 rounded"></div>
                  <div className="h-2 w-full bg-slate-200 rounded"></div>
                </div>

                <div className="mt-auto pt-8 border-t border-slate-300 flex justify-between">
                   <div className="h-2 w-32 bg-slate-400 rounded"></div>
                   <div className="h-2 w-10 bg-slate-400 rounded"></div>
                </div>
              </div>

              {/* Marca D'agua Aplicada */}
              {image && (
                <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
                  <img 
                    src={image} 
                    alt="Watermark" 
                    style={{
                      width: `${scale}%`,
                      opacity: opacity,
                      transform: rotate ? 'rotate(-45deg)' : 'none'
                    }}
                    className="object-contain transition-all duration-200"
                  />
                </div>
              )}
           </div>
        </div>
      </div>

      {/* Modal de Confirmação para Remoção */}
      <ConfirmModal 
        isOpen={removeModalOpen}
        onClose={() => setRemoveModalOpen(false)}
        onConfirm={handleRemove}
        title="Remover Marca D'água?"
        message="Deseja remover a imagem da marca d'água? Lembre-se de clicar em 'Salvar Configuração' após confirmar."
        confirmText="Sim, Remover"
        variant="warning"
      />
    </div>
  );
};

export default WatermarkEditor;
