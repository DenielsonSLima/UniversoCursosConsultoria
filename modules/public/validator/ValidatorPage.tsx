
// File: modules/public/validator/ValidatorPage.tsx

import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, FileText, QrCode, CreditCard, Award, Calendar } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

const ValidatorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [result, setResult] = useState<any>(null);

  // Rola para o topo e verifica URL ao montar
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    
    // Auto-validação se vier pela URL (QR Code)
    const urlCode = searchParams.get('q') || searchParams.get('code');
    if (urlCode) {
        setCode(urlCode);
        validateCode(urlCode);
    }
  }, [searchParams]);

  const validateCode = (inputCode: string) => {
    setStatus('loading');
    
    setTimeout(() => {
      // Mock de Validação Inteligente
      if (inputCode.length > 5 && inputCode !== 'INVALIDO') {
        
        let docType = 'Declaração de Matrícula';
        let icon = <FileText size={20} className="text-blue-500" />;
        
        // Simulação de detecção do tipo pelo prefixo
        if (inputCode.startsWith('CART') || inputCode.includes('CARTEIRINHA') || inputCode.includes('CIE')) {
            docType = 'Carteira de Identificação Estudantil (CIE)';
            icon = <CreditCard size={20} className="text-pink-500" />;
        } else if (inputCode.startsWith('CERT') || inputCode.startsWith('DIP') || inputCode.includes('DIPLOMA')) {
            docType = 'Certificado / Diploma';
            icon = <Award size={20} className="text-amber-500" />;
        }

        setStatus('valid');
        setResult({
          aluno: 'Ana Clara Souza',
          cpf: '***.456.789-**',
          curso: 'Técnico em Enfermagem',
          documento: docType,
          icon: icon,
          emissao: new Date().toLocaleDateString('pt-BR'),
          validade: '31/12/2025',
          autenticidade: 'Verificada Digitalmente',
          statusMatricula: 'Ativo'
        });
      } else {
        setStatus('invalid');
        setResult(null);
      }
    }, 1500);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) return;
    validateCode(code);
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      
      <main className="flex-grow">
        {/* Banner */}
        <div className="bg-[#001a33] py-20 text-white relative overflow-hidden">
           {/* Background decor */}
           <div className="absolute top-0 right-0 p-10 opacity-5">
              <QrCode size={300} />
           </div>
           <div className="container mx-auto px-6 text-center relative z-10">
             <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4">
               Validador de <span className="text-blue-400">Documentos</span>
             </h1>
             <p className="text-blue-100 max-w-2xl mx-auto text-lg font-light">
               Garanta a autenticidade de carteirinhas (CIE), certificados, diplomas e declarações emitidos pelas nossas instituições afiliadas.
             </p>
           </div>
        </div>

        {/* Seção Principal */}
        <div className="container mx-auto px-6 -mt-10 relative z-20 pb-20">
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-8 md:p-12 max-w-4xl mx-auto">
            
            <form onSubmit={handleVerify} className="max-w-2xl mx-auto">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative group">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <QrCode size={24} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Digite o código ou hash do documento"
                    className="w-full pl-16 pr-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:bg-white text-lg font-mono text-slate-700 font-bold transition-all shadow-sm uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={status === 'loading' || !code}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-5 rounded-2xl transition-all shadow-lg shadow-blue-900/20 uppercase tracking-widest disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {status === 'loading' ? 'Verificando...' : 'Verificar'}
                </button>
              </div>
              <p className="text-center text-slate-400 text-xs font-bold mt-4 uppercase tracking-wider">
                O código encontra-se no QR Code ou no rodapé do documento.
              </p>
            </form>

            {/* Resultado Válido */}
            {status === 'valid' && result && (
              <div className="mt-12 animate-fadeIn">
                <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 text-center mb-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <CheckCircle size={150} />
                  </div>
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border-4 border-white relative z-10">
                    <CheckCircle size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-emerald-800 uppercase tracking-tight mb-2 relative z-10">Documento Autêntico</h3>
                  <p className="text-emerald-700 font-medium relative z-10">
                    O código <strong>{code}</strong> é válido e consta em nossa base de dados.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Aluno(a)</p>
                    <p className="text-lg font-bold text-[#001a33]">{result.aluno}</p>
                    <p className="text-xs text-slate-500 mt-1 font-mono">CPF: {result.cpf}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Tipo de Documento</p>
                    <div className="flex items-center gap-2 text-[#001a33]">
                      {result.icon}
                      <p className="text-lg font-bold">{result.documento}</p>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Curso / Vínculo</p>
                    <p className="text-lg font-bold text-[#001a33]">{result.curso}</p>
                    <p className="text-xs text-emerald-600 font-bold uppercase mt-1 bg-emerald-50 inline-block px-2 py-0.5 rounded">
                        Situação: {result.statusMatricula}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Detalhes da Emissão</p>
                    <div className="flex items-center gap-4 mt-1">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase">Emitido em</p>
                            <p className="font-bold text-[#001a33]">{result.emissao}</p>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase">Válido até</p>
                            <p className="font-bold text-[#001a33] flex items-center gap-1">
                                <Calendar size={12} className="text-blue-500" /> {result.validade}
                            </p>
                        </div>
                    </div>
                  </div>
                </div>
                
                <div className="text-center mt-10 p-4 bg-blue-50 rounded-xl border border-blue-100 inline-block w-full">
                    <p className="text-xs text-blue-800 uppercase tracking-widest font-bold">
                        Universo Cursos e Consultoria • Validação Oficial
                    </p>
                </div>
              </div>
            )}

            {/* Resultado Inválido */}
            {status === 'invalid' && (
              <div className="mt-12 animate-fadeIn">
                <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center">
                  <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border-4 border-white">
                    <XCircle size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-red-800 uppercase tracking-tight mb-2">Código Não Encontrado</h3>
                  <p className="text-red-700 font-medium max-w-md mx-auto">
                    Não localizamos nenhum documento ativo com o código <strong>{code}</strong>.
                  </p>
                  <p className="text-xs text-red-500 mt-4 max-w-xs mx-auto">
                    Verifique se digitou corretamente ou entre em contato com a secretaria da unidade emissora.
                  </p>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ValidatorPage;
