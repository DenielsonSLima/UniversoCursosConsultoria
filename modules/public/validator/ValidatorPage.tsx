
// File: modules/public/validator/ValidatorPage.tsx

import React, { useState, useEffect } from 'react';
import { XCircle, QrCode } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { validatorService } from './validator.service';
import { DocumentValidationResult } from './validator.types';
import CarteirinhaValidationResult from './carteirinha/CarteirinhaValidationResult';
import DeclaracaoValidationResult from './declaracao/DeclaracaoValidationResult';
import BoletimValidationResult from './boletim/BoletimValidationResult';
import IrpfValidationResult from './irpf/IrpfValidationResult';
import HistoricoValidationResult from './historico/HistoricoValidationResult';
import EstagioValidationResult from './estagio/EstagioValidationResult';
import RematriculaValidationResult from './rematricula/RematriculaValidationResult';
import TransferenciaValidationResult from './transferencia/TransferenciaValidationResult';
import CertificadoValidationResult from './certificado/CertificadoValidationResult';
import { AcademicDocumentValidationResult } from './validator.types';

const ValidatorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [result, setResult] = useState<DocumentValidationResult | null>(null);

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

  const validateCode = async (inputCode: string) => {
    setStatus('loading');
    setResult(null);

    try {
      const validationResult = await validatorService.validate(inputCode);
      if (!validationResult) {
        setStatus('invalid');
        return;
      }

      setResult(validationResult);
      setStatus('valid');
    } catch (error) {
      console.error('[ValidatorPage] Erro ao consultar código:', error);
      setStatus('invalid');
    }
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
            {status === 'valid' && result?.type === 'carteirinha' && (
              <CarteirinhaValidationResult result={result} />
            )}
            {status === 'valid' && result && ['declaracao_matricula', 'declaracao_frequencia'].includes(result.type) && (
              <DeclaracaoValidationResult result={result as AcademicDocumentValidationResult} />
            )}
            {status === 'valid' && result?.type === 'boletim' && (
              <BoletimValidationResult result={result} />
            )}
            {status === 'valid' && result?.type === 'declaracao_irpf' && (
              <IrpfValidationResult result={result} />
            )}
            {status === 'valid' && result?.type === 'historico_escolar' && (
              <HistoricoValidationResult result={result} />
            )}
            {status === 'valid' && result?.type === 'transferencia' && (
              <TransferenciaValidationResult result={result} />
            )}
            {status === 'valid' && result && ['cracha_estagio', 'termo_estagio'].includes(result.type) && (
              <EstagioValidationResult result={result as AcademicDocumentValidationResult} />
            )}
            {status === 'valid' && result?.type === 'rematricula' && (
              <RematriculaValidationResult result={result} />
            )}
            {status === 'valid' &&
              result &&
              ['certificado_tecnico', 'certificado_livre', 'certificado_ead', 'certificado_especializacao'].includes(result.type) && (
                <CertificadoValidationResult result={result as AcademicDocumentValidationResult} />
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
