import React, { useState, useEffect } from 'react';
import { Upload, Trash2, Loader2, Save, FileSignature, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { assinaturasService, AssinaturasData } from './assinaturas.service';
import ToastNotification, { useToast } from '../../components/ToastNotification';

const AssinaturasConfig: React.FC = () => {
  const { toasts, removeToast, toast } = useToast();
  const [signatures, setSignatures] = useState<AssinaturasData>({
    diretoriaGeral: '',
    secretaria: '',
    coordenacao: '',
    financeiro: '',
    diretoriaGeralNome: '',
    diretoriaGeralCargo: '',
    secretariaNome: '',
    secretariaCargo: '',
    coordenacaoNome: '',
    coordenacaoCargo: '',
    financeiroNome: '',
    financeiroCargo: '',
  });

  const [isUploading, setIsUploading] = useState<Record<string, boolean>>({
    diretoriaGeral: false,
    secretaria: false,
    coordenacao: false,
    financeiro: false,
  });

  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const data = await assinaturasService.getSignatures();
      // Safely default any undefined metadata properties to empty strings
      setSignatures({
        diretoriaGeral: data.diretoriaGeral || '',
        secretaria: data.secretaria || '',
        coordenacao: data.coordenacao || '',
        financeiro: data.financeiro || '',
        diretoriaGeralNome: data.diretoriaGeralNome || '',
        diretoriaGeralCargo: data.diretoriaGeralCargo || '',
        secretariaNome: data.secretariaNome || '',
        secretariaCargo: data.secretariaCargo || '',
        coordenacaoNome: data.coordenacaoNome || '',
        coordenacaoCargo: data.coordenacaoCargo || '',
        financeiroNome: data.financeiroNome || '',
        financeiroCargo: data.financeiroCargo || '',
      });
    };
    loadData();
  }, []);

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>, role: keyof AssinaturasData) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(prev => ({ ...prev, [role]: true }));
    try {
      const filePath = `signatures/${role}_${Date.now()}.png`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      setSignatures(prev => ({ ...prev, [role]: urlData.publicUrl }));
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      toast.error('Erro no Upload', 'Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(prev => ({ ...prev, [role]: false }));
    }
  };

  const handleDelete = (role: keyof AssinaturasData) => {
    setSignatures(prev => ({ ...prev, [role]: '' }));
  };

  const handleSave = async () => {
    const signaturesToSave = {
      ...signatures,
      diretoriaGeralCargo: 'Diretor(a) Geral',
      secretariaCargo: 'Secretária Acadêmica',
      coordenacaoCargo: 'Coordenador(a) Pedagógico(a)',
      financeiroCargo: 'Setor Financeiro',
    };
    const success = await assinaturasService.saveSignatures(signaturesToSave);
    if (success) {
      toast.success('Assinaturas Salvas', 'Configurações de assinaturas salvas com sucesso!');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      toast.error('Erro ao Salvar', 'Não foi possível salvar as assinaturas no banco de dados.');
    }
  };

  const renderSignatureInput = (role: 'diretoriaGeral' | 'secretaria' | 'coordenacao' | 'financeiro', title: string) => {
    const url = signatures[role] || '';
    const nomeKey = `${role}Nome` as keyof AssinaturasData;
    const cargoKey = `${role}Cargo` as keyof AssinaturasData;
    const nome = (signatures[nomeKey] as string) || '';
    const cargo = (signatures[cargoKey] as string) || '';
    const loading = isUploading[role];

    return (
      <div className="bg-slate-50 border border-slate-200/60 p-5 rounded-3xl flex flex-col justify-between h-full group hover:border-pink-300 hover:shadow-md transition-all">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-1">{title}</h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-4">Assinatura digitalizada em formato PNG</p>
            
            <div className="min-h-[90px] border border-dashed border-slate-200 rounded-2xl bg-white flex items-center justify-center p-3 relative overflow-hidden group/img">
              {url ? (
                <div className="flex flex-col items-center justify-center w-full">
                  <img 
                    src={url} 
                    alt={title} 
                    className="max-h-[75px] max-w-full object-contain mix-blend-multiply" 
                  />
                  <button
                    type="button"
                    onClick={() => handleDelete(role)}
                    className="absolute top-2 right-2 p-2 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 border border-red-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : (
                <div className="text-center text-slate-400">
                  <FileSignature size={28} className="mx-auto mb-1.5 opacity-60" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Nenhuma Assinatura</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block">
              <span className="block mb-1 text-[9px] font-black text-slate-400 uppercase tracking-widest text-left">Nome do Assinante</span>
              <input 
                type="text"
                placeholder="Ex: Prof. Denielson S. Lima"
                value={nome}
                onChange={(e) => setSignatures(prev => ({ ...prev, [nomeKey]: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 transition-all"
              />
            </label>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input 
            type="text"
            placeholder="Cole a URL da assinatura (.png)"
            value={url}
            onChange={(e) => setSignatures(prev => ({ ...prev, [role]: e.target.value }))}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500 focus:bg-white transition-all text-ellipsis overflow-hidden"
          />
          <label className="flex items-center justify-center p-2.5 bg-white hover:bg-pink-50 hover:text-pink-600 rounded-xl border border-slate-200 cursor-pointer transition-colors relative shrink-0">
            <input 
              type="file" 
              accept="image/*" 
              onChange={(e) => handleUploadFile(e, role)} 
              className="absolute inset-0 opacity-0 cursor-pointer" 
              disabled={loading}
            />
            {loading ? <Loader2 size={16} className="animate-spin text-pink-600" /> : <Upload size={16} />}
          </label>
        </div>
      </div>
    );
  };

  return (
    <>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <div className="max-w-7xl mx-auto animate-fadeIn">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-6 mb-8 gap-4">
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
              <FileSignature size={26} className="text-pink-600" />
              Central de Assinaturas
            </h3>
            <p className="text-slate-500 text-sm mt-1">Carregue as assinaturas da diretoria, secretaria e coordenação para usar em todos os modelos de documentos.</p>
          </div>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-all shadow-lg shadow-blue-900/20 w-full sm:w-auto justify-center"
          >
            <Save size={16} /> Salvar Assinaturas
          </button>
        </div>

        {saveSuccess && (
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl mb-8 flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-widest">Configurações de assinaturas salvas com sucesso na base de dados!</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {renderSignatureInput('diretoriaGeral', 'Diretoria Geral')}
          {renderSignatureInput('secretaria', 'Secretaria')}
          {renderSignatureInput('coordenacao', 'Coordenação')}
          {renderSignatureInput('financeiro', 'Financeiro')}
        </div>
      </div>
    </>
  );
};

export default AssinaturasConfig;
