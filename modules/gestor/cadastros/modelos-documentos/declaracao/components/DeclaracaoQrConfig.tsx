
// File: modules/gestor/cadastros/modelos-documentos/declaracao/components/DeclaracaoQrConfig.tsx

import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, QrCode, Plus, X, GripHorizontal } from 'lucide-react';
import { declaracaoService } from '../declaracao.service';

interface DeclaracaoQrConfigProps {
  onBack: () => void;
  service?: {
    getQrConfig: () => Promise<any>;
    saveQrConfig: (config: any) => Promise<boolean>;
  };
}

const TOKENS = [
  { id: '{POLO_ID}', label: 'Cód. Polo', desc: 'Identificador único da unidade' },
  { id: '{CURSO_ID}', label: 'Cód. Curso', desc: 'Identificador do curso' },
  { id: '{ALUNO_MATRICULA}', label: 'Matrícula', desc: 'Matrícula do aluno' },
  { id: '{ALUNO_CPF}', label: 'CPF Aluno', desc: 'CPF sem pontuação' },
  { id: '{DATA_DIA}', label: 'Dia', desc: 'DD da emissão' },
  { id: '{DATA_MES}', label: 'Mês', desc: 'MM da emissão' },
  { id: '{ANO_ATUAL}', label: 'Ano', desc: 'AAAA da emissão' },
  { id: '{RANDOM_HASH}', label: 'Hash Aleatório', desc: 'String segura de 6 dígitos' },
];

const DeclaracaoQrConfig: React.FC<DeclaracaoQrConfigProps> = ({ onBack, service = declaracaoService }) => {
  const [pattern, setPattern] = useState<string[]>([]);
  const [separator, setSeparator] = useState('-');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    const config = await service.getQrConfig();
    if (config) {
      setPattern(config.pattern || []);
      setSeparator(config.separator || '-');
    }
  };

  const addToken = (tokenId: string) => {
    setPattern([...pattern, tokenId]);
  };

  const removeToken = (index: number) => {
    const newPattern = [...pattern];
    newPattern.splice(index, 1);
    setPattern(newPattern);
  };

  const handleSave = async () => {
    setLoading(true);
    await service.saveQrConfig({ pattern, separator });
    setLoading(false);
    alert('Padrão de validação salvo com sucesso!');
    onBack();
  };

  // Gera um exemplo visual baseado no padrão
  const examplePreview = pattern.map(token => {
    switch(token) {
        case '{POLO_ID}': return 'JAP';
        case '{CURSO_ID}': return 'ENF';
        case '{ALUNO_MATRICULA}': return '2024001';
        case '{ALUNO_CPF}': return '12345678900';
        case '{DATA_DIA}': return '25';
        case '{DATA_MES}': return '10';
        case '{ANO_ATUAL}': return '2024';
        case '{RANDOM_HASH}': return 'X9Z2A1';
        default: return token;
    }
  }).join(separator);

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4 w-full md:w-auto">
            <button 
                onClick={onBack}
                className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
            >
                <ArrowLeft size={20} />
            </button>
            <div>
                <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Configuração do Validador</h3>
                <p className="text-slate-500 text-sm font-medium">
                    Defina como o código único de validação (QR Code) será gerado.
                </p>
            </div>
        </div>
        
        <button 
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
            <Save size={16} /> {loading ? 'Salvando...' : 'Salvar Padrão'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Lado Esquerdo: Área de Construção */}
        <div className="space-y-6">
            
            {/* Tokens Disponíveis */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Tokens Disponíveis</h4>
                <div className="grid grid-cols-2 gap-3">
                    {TOKENS.map(token => (
                        <button
                            key={token.id}
                            onClick={() => addToken(token.id)}
                            className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-all group text-left"
                        >
                            <div>
                                <p className="text-xs font-black text-[#001a33] group-hover:text-blue-700">{token.label}</p>
                                <p className="text-[9px] text-slate-400">{token.desc}</p>
                            </div>
                            <Plus size={14} className="text-slate-300 group-hover:text-blue-500" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Separador */}
            <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                <label className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-2 block">Separador</label>
                <div className="flex gap-4">
                    {['-', '.', '/', '_', '|'].map(sep => (
                        <button
                            key={sep}
                            onClick={() => setSeparator(sep)}
                            className={`w-10 h-10 rounded-xl font-black text-lg transition-all ${
                                separator === sep 
                                ? 'bg-blue-600 text-white shadow-md' 
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                            }`}
                        >
                            {sep}
                        </button>
                    ))}
                </div>
            </div>

        </div>

        {/* Lado Direito: Preview e Resultado */}
        <div className="space-y-6">
            
            {/* Construção Visual */}
            <div className="bg-slate-100 p-8 rounded-[2rem] border border-slate-200 min-h-[200px] flex flex-col justify-center">
                <p className="text-center text-xs font-bold text-slate-400 uppercase mb-4 tracking-widest">Estrutura do Código</p>
                
                <div className="flex flex-wrap items-center justify-center gap-2">
                    {pattern.length === 0 && (
                        <span className="text-slate-400 text-sm italic">Adicione tokens para começar...</span>
                    )}
                    
                    {pattern.map((token, idx) => (
                        <div key={idx} className="flex items-center animate-fadeIn">
                            {idx > 0 && (
                                <span className="text-slate-400 font-black mx-1 text-lg">{separator}</span>
                            )}
                            <div className="bg-white px-3 py-2 rounded-lg border border-blue-200 text-blue-700 text-xs font-black shadow-sm flex items-center gap-2">
                                {TOKENS.find(t => t.id === token)?.label || token}
                                <button 
                                    onClick={() => removeToken(idx)}
                                    className="text-red-300 hover:text-red-500 transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Preview Final */}
            <div className="bg-gradient-to-br from-[#001a33] to-blue-900 p-8 rounded-[2rem] text-white shadow-xl flex flex-col items-center text-center relative overflow-hidden">
                <div className="relative z-10 w-full flex flex-col items-center">
                    <div className="bg-white p-2 rounded-xl mb-4">
                        <QrCode className="text-[#001a33]" size={64} />
                    </div>
                    <p className="text-blue-200 text-xs font-bold uppercase tracking-widest mb-2">Simulação do Código</p>
                    <div className="bg-white/10 px-4 py-2 rounded-xl w-full break-all font-mono text-sm border border-white/20">
                        {examplePreview || '...'}
                    </div>
                </div>
                {/* Background Decor */}
                <QrCode size={200} className="absolute -bottom-10 -right-10 text-white/5 rotate-12" />
            </div>

        </div>

      </div>
    </div>
  );
};

export default DeclaracaoQrConfig;
