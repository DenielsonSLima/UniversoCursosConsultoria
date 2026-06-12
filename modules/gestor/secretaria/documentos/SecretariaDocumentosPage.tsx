
// File: modules/gestor/secretaria/documentos/SecretariaDocumentosPage.tsx

import React, { useState } from 'react';
import { FileText, ArrowRightLeft, Search, Printer, CheckCircle2 } from 'lucide-react';

interface SecretariaDocumentosPageProps {
  initialType: string;
}

const SecretariaDocumentosPage: React.FC<SecretariaDocumentosPageProps> = ({ initialType }) => {
  const [docType, setDocType] = useState<'declaracao' | 'transferencia'>(
    initialType === 'transferencia' ? 'transferencia' : 'declaracao'
  );
  const [step, setStep] = useState(1); // 1: Busca Aluno, 2: Configuração, 3: Impressão
  const [selectedAluno, setSelectedAluno] = useState<string>('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Simula encontrar aluno
    setStep(2);
  };

  const handleGenerate = () => {
    // Simula geração
    setStep(3);
  };

  return (
    <div className="animate-fadeIn">
      {/* Tab Switcher */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 inline-flex mb-8 shadow-sm">
        <button
          onClick={() => { setDocType('declaracao'); setStep(1); }}
          className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${docType === 'declaracao' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <FileText size={16} /> Declarações
        </button>
        <button
          onClick={() => { setDocType('transferencia'); setStep(1); }}
          className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${docType === 'transferencia' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
        >
          <ArrowRightLeft size={16} /> Transferência
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl max-w-3xl mx-auto min-h-[400px]">
        
        {/* Step 1: Seleção do Aluno */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">
              {docType === 'declaracao' ? 'Emitir Declaração' : 'Iniciar Transferência'}
            </h3>
            <p className="text-slate-500 mb-6 text-sm">Busque o aluno para iniciar o processo de emissão do documento.</p>
            
            <form onSubmit={handleSearch} className="relative">
                <input 
                    type="text" 
                    placeholder="Nome, CPF ou Matrícula..."
                    className="w-full pl-6 pr-14 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-700 font-medium"
                    onChange={(e) => setSelectedAluno(e.target.value)}
                    required
                />
                <button type="submit" className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20">
                    <Search size={20} />
                </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-4">Documentos Disponíveis</p>
                <div className="flex flex-wrap justify-center gap-3">
                    <span className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600 border border-slate-100">Declaração de Matrícula</span>
                    <span className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600 border border-slate-100">Declaração de Frequência</span>
                    <span className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600 border border-slate-100">Histórico Parcial</span>
                    <span className="px-3 py-1 bg-slate-50 rounded-lg text-xs font-medium text-slate-600 border border-slate-100">Guia de Transferência</span>
                </div>
            </div>
          </div>
        )}

        {/* Step 2: Configuração */}
        {step === 2 && (
          <div className="animate-fadeIn">
             <h3 className="text-xl font-black text-[#001a33] mb-2 uppercase tracking-tight">Confirmar Dados</h3>
             <p className="text-slate-500 mb-6 text-sm">Aluno selecionado: <strong className="text-[#001a33]">João Pedro Alves</strong></p>

             <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-6">
                <div className="mb-4">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Tipo de Documento</label>
                    <select className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500">
                        {docType === 'declaracao' ? (
                            <>
                                <option>Declaração de Cursando (Simples)</option>
                                <option>Declaração para Estágio</option>
                                <option>Declaração de Conclusão</option>
                            </>
                        ) : (
                            <>
                                <option>Guia de Transferência Externa</option>
                                <option>Memorando de Solicitação de Vaga</option>
                            </>
                        )}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Observações (Opcional)</label>
                    <textarea 
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 h-24 resize-none"
                        placeholder="Adicione notas ao documento..."
                    ></textarea>
                </div>
             </div>

             <div className="flex gap-3">
                <button 
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50"
                >
                    Voltar
                </button>
                <button 
                    onClick={handleGenerate}
                    className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 shadow-lg shadow-blue-900/20"
                >
                    Gerar Documento
                </button>
             </div>
          </div>
        )}

        {/* Step 3: Sucesso / Impressão */}
        {step === 3 && (
            <div className="animate-fadeIn text-center py-10">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border-4 border-emerald-50">
                    <CheckCircle2 size={40} />
                </div>
                <h3 className="text-2xl font-black text-[#001a33] mb-2">Documento Gerado!</h3>
                <p className="text-slate-500 text-sm mb-8">O documento foi gerado com sucesso e está pronto para impressão.</p>
                
                <div className="flex justify-center gap-4">
                    <button className="flex items-center gap-2 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-700 shadow-lg">
                        <Printer size={16} /> Imprimir PDF
                    </button>
                    <button 
                        onClick={() => setStep(1)}
                        className="px-8 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50"
                    >
                        Novo Documento
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default SecretariaDocumentosPage;
