
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { XCircle, QrCode } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { validatorService } from './validator.service';
import { DocumentValidationResult } from './validator.types';
import { PUBLIC_VALIDATION_ERROR_MESSAGE } from './validator.errors';
import ValidationResultContent from './ValidationResultContent';
import {
  createLatestValidationRequestGuard,
  normalizePublicValidationCode,
  resolvePublicValidationCodeFromSearchParams,
} from './validator-page.flow';

const ValidatorPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  const [result, setResult] = useState<DocumentValidationResult | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [failureKind, setFailureKind] = useState<'not_found' | 'service' | null>(null);
  const [requestGuard] = useState(createLatestValidationRequestGuard);
  const resultRegionRef = useRef<HTMLDivElement>(null);
  const urlCode = resolvePublicValidationCodeFromSearchParams(searchParams);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    requestGuard.activate();

    return () => {
      requestGuard.deactivate();
    };
  }, [requestGuard]);

  const validateCode = useCallback(async (inputCode: string) => {
    const normalizedCode = normalizePublicValidationCode(inputCode);
    if (normalizedCode.length < 5) {
      requestGuard.cancel();
      setStatus('idle');
      setResult(null);
      setValidationMessage('');
      setFailureKind(null);
      return;
    }

    const requestId = requestGuard.begin();
    setStatus('loading');
    setResult(null);
    setValidationMessage('');
    setFailureKind(null);

    try {
      const validationResult = await validatorService.validate(normalizedCode);
      if (!requestGuard.canCommit(requestId)) return;

      if (!validationResult) {
        setStatus('invalid');
        setFailureKind('not_found');
        setValidationMessage(
          'Não localizamos nenhum documento ativo com o código informado.',
        );
        return;
      }

      setResult(validationResult);
      setStatus('valid');
    } catch {
      if (!requestGuard.canCommit(requestId)) return;

      console.error('[ValidatorPage] Não foi possível validar o documento.');
      setStatus('invalid');
      setFailureKind('service');
      setValidationMessage(PUBLIC_VALIDATION_ERROR_MESSAGE);
    }
  }, [requestGuard]);

  useEffect(() => {
    requestGuard.cancel();
    setCode(urlCode);
    setStatus('idle');
    setResult(null);
    setValidationMessage('');
    setFailureKind(null);
    if (urlCode.length < 5) return;

    void validateCode(urlCode);
  }, [requestGuard, urlCode, validateCode]);

  useEffect(() => {
    if (status === 'valid' || status === 'invalid') {
      resultRegionRef.current?.focus();
    }
  }, [status]);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = normalizePublicValidationCode(code);
    if (normalizedCode.length < 5) return;

    if (normalizedCode !== code) setCode(normalizedCode);
    void validateCode(normalizedCode);
  };

  const handleCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const normalizedCode = normalizePublicValidationCode(event.target.value);
    if (normalizedCode === code) return;

    requestGuard.cancel();
    setCode(normalizedCode);
    setStatus('idle');
    setResult(null);
    setValidationMessage('');
    setFailureKind(null);
  };

  const isLoading = status === 'loading';
  const canSubmit = code.length >= 5 && !isLoading;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <Header />
      
      <main className="flex-grow">
        {/* Banner */}
        <div className="bg-[#001a33] py-20 text-white relative overflow-hidden">
           {/* Background decor */}
           <div className="absolute top-0 right-0 p-10 opacity-5">
              <QrCode size={300} aria-hidden="true" />
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
                  <label htmlFor="document-validation-code" className="sr-only">
                    Código de validação do documento
                  </label>
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <QrCode size={24} aria-hidden="true" />
                  </div>
                  <input 
                    id="document-validation-code"
                    name="document-validation-code"
                    type="text" 
                    placeholder="Digite o código ou hash do documento"
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    enterKeyHint="search"
                    aria-describedby="document-validation-code-help document-validation-status"
                    aria-invalid={failureKind === 'not_found'}
                    aria-busy={isLoading}
                    aria-controls="document-validation-outcome"
                    className="w-full pl-16 pr-6 py-5 bg-slate-50 border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:bg-white text-lg font-mono text-slate-700 font-bold transition-all shadow-sm uppercase placeholder:normal-case placeholder:font-sans placeholder:text-slate-400"
                    value={code}
                    onChange={handleCodeChange}
                  />
                </div>
                <button 
                  type="submit"
                  disabled={!canSubmit}
                  aria-busy={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-black px-8 py-5 rounded-2xl transition-all shadow-lg shadow-blue-900/20 uppercase tracking-widest disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? 'Verificando...' : 'Verificar'}
                </button>
              </div>
              <p id="document-validation-code-help" className="text-center text-slate-400 text-xs font-bold mt-4 uppercase tracking-wider">
                O código encontra-se no QR Code ou no rodapé do documento.
              </p>
              <p
                id="document-validation-status"
                className="sr-only"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {isLoading
                  ? 'Verificando o código informado.'
                  : status === 'valid'
                    ? 'Documento localizado. Resultado da validação disponível.'
                    : ''}
              </p>
            </form>

            {isLoading && (
              <div
                id="document-validation-outcome"
                aria-hidden="true"
                className="mt-10 text-center text-sm font-bold text-blue-700"
              >
                Consultando o registro oficial do documento...
              </div>
            )}

            {/* Resultado Válido */}
            {status === 'valid' && result && (
              <div
                id="document-validation-outcome"
                ref={resultRegionRef}
                tabIndex={-1}
                role="region"
                aria-label="Resultado da validação do documento"
                className="outline-none"
              >
                <ValidationResultContent result={result} />
              </div>
            )}

            {/* Resultado Inválido */}
            {status === 'invalid' && (
              <div
                id="document-validation-outcome"
                ref={resultRegionRef}
                tabIndex={-1}
                role="alert"
                className="mt-12 animate-fadeIn outline-none"
              >
                <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center">
                  <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border-4 border-white">
                    <XCircle size={40} aria-hidden="true" />
                  </div>
                  <h3 className="text-2xl font-black text-red-800 uppercase tracking-tight mb-2">
                    {failureKind === 'service' ? 'Validação indisponível' : 'Código não encontrado'}
                  </h3>
                  <p className="text-red-700 font-medium max-w-md mx-auto">
                    {validationMessage ||
                      'Não localizamos nenhum documento ativo com o código informado.'}
                  </p>
                  <p className="text-xs text-red-500 mt-4 max-w-xs mx-auto">
                    {failureKind === 'service'
                      ? 'Tente novamente mais tarde ou entre em contato com a secretaria da unidade emissora.'
                      : 'Verifique se digitou corretamente ou entre em contato com a secretaria da unidade emissora.'}
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
