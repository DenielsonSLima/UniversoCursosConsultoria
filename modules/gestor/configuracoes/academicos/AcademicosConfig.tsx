import React, { useState, useEffect } from 'react';
import { GraduationCap, Landmark, Settings, Sparkles, Check, Save, FileSpreadsheet, BadgeCheck, FileCode, QrCode } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { academicosService } from './academicos.service';

const AcademicosConfig: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'matricula' | 'carteirinha' | 'certificados' | 'validacao'>('matricula');
  const { toasts, removeToast, toast } = useToast();

  // Matrícula Settings States — iniciados com defaults, carregados do Supabase no useEffect
  const [matriculaPrefix, setMatriculaPrefix] = useState('UNIV-');
  const [matriculaDigits, setMatriculaDigits] = useState(4);
  const [usePoloCode, setUsePoloCode] = useState(false);
  const [yearFormat, setYearFormat] = useState('yy');

  // Endereço de Validação State
  const [validacaoUrl, setValidacaoUrl] = useState('https://www.universocc.com.br/validador');

  // Carteirinha Settings States
  const [carteirinhaPrimaryColor, setCarteirinhaPrimaryColor] = useState('#001a33');
  const [carteirinhaSecondaryColor, setCarteirinhaSecondaryColor] = useState('#4169E1');
  const [validityMonths, setValidityMonths] = useState(12);

  // Certificados & Validação States
  const [validacaoPrefix, setValidacaoPrefix] = useState('VAL-');
  const [templateTecnico, setTemplateTecnico] = useState('Certificamos que o aluno concluiu com êxito o curso Técnico em {CURSO} ministrado no polo {POLO}.');
  const [templateEad, setTemplateEad] = useState('Certificamos que o aluno concluiu via plataforma digital EAD o curso livre de {CURSO}.');
  const [templateLivres, setTemplateLivres] = useState('Certificamos a participação do aluno no curso livre de {CURSO} com carga horária de {CARGA}h.');
  const [templateEspecializacao, setTemplateEspecializacao] = useState('Certificamos que o especialista concluiu a Pós-Graduação Latu Sensu em {CURSO}.');

  const [saving, setSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega configs do Supabase — NUNCA do localStorage
  useEffect(() => {
    const loadConfigs = async () => {
      setIsLoading(true);
      try {
        const configs = await academicosService.getConfigs();
        setMatriculaPrefix(configs.matriculaPrefix);
        setMatriculaDigits(configs.matriculaDigits);
        setUsePoloCode(configs.usePoloCode);
        setYearFormat(configs.yearFormat);
        setCarteirinhaPrimaryColor(configs.carteirinhaPrimaryColor);
        setCarteirinhaSecondaryColor(configs.carteirinhaSecondaryColor);
        setValidityMonths(configs.validityMonths);
        setValidacaoPrefix(configs.validacaoPrefix);
        setTemplateTecnico(configs.templateTecnico);
        setTemplateEad(configs.templateEad);
        setTemplateLivres(configs.templateLivres);
        setTemplateEspecializacao(configs.templateEspecializacao);
        setValidacaoUrl(configs.validacaoUrl || 'https://www.universocc.com.br/validador');
      } catch (err) {
        console.error('[AcademicosConfig] Erro ao carregar configurações:', err);
      } finally {
        setIsLoading(false);
      }
    };
    loadConfigs();
  }, []);

  // Generate a live preview of the matrícula number
  const getMatriculaPreview = () => {
    let year = '26'; // Default 2026
    if (yearFormat === 'yyyy') year = '2026';

    const poloCode = usePoloCode ? '01' : '';
    const seq = '0002'.substring(4 - matriculaDigits);
    
    return `${matriculaPrefix}${year}${poloCode}${seq}`;
  };

  const handleSave = async () => {
    setSaving(true);
    
    const success = await academicosService.saveConfigs({
      matriculaPrefix,
      matriculaDigits,
      usePoloCode,
      yearFormat,
      carteirinhaPrimaryColor,
      carteirinhaSecondaryColor,
      validityMonths,
      validacaoPrefix,
      templateTecnico,
      templateEad,
      templateLivres,
      templateEspecializacao,
      validacaoUrl,
    });

    setSaving(false);
    if (success) {
      toast.success('Configurações Salvas', 'Configurações Acadêmicas salvas com sucesso!');
    } else {
      toast.error('Erro ao Salvar', 'Não foi possível salvar as configurações acadêmicas no banco de dados.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
            <GraduationCap size={22} />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Parâmetros Acadêmicos</h3>
            <p className="text-xs text-slate-450 font-medium">Configure matrículas, carteirinhas, certificados e chaves de validação</p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-3 bg-[#001a33] hover:bg-purple-650 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
        >
          <Save size={15} />
          <span>{saving ? 'Gravando...' : 'Salvar Ajustes'}</span>
        </button>
      </div>

      {/* Sub tabs Selector */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-full sm:w-max">
        <button
          onClick={() => setActiveSubTab('matricula')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'matricula' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-purple-650'
          }`}
        >
          <FileSpreadsheet size={15} /> Matrícula
        </button>
        <button
          onClick={() => setActiveSubTab('carteirinha')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'carteirinha' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-purple-650'
          }`}
        >
          <QrCode size={15} /> Carteirinha
        </button>
        <button
          onClick={() => setActiveSubTab('certificados')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'certificados' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-purple-650'
          }`}
        >
          <BadgeCheck size={15} /> Certificados
        </button>
        <button
          onClick={() => setActiveSubTab('validacao')}
          className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
            activeSubTab === 'validacao' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-purple-650'
          }`}
        >
          <Settings size={15} /> Endereço de Validação
        </button>
      </div>

      {/* Forms Section */}
      <div className="p-2 text-xs">
        {activeSubTab === 'matricula' && (
          <div className="space-y-6 max-w-xl animate-fadeIn">
            {/* Live Preview Card */}
            <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50/40 border border-purple-100 rounded-3xl space-y-2">
              <p className="text-[10px] text-purple-650 font-black uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={11} className="text-yellow-500" /> Prévia da Matrícula Gerada
              </p>
              <p className="text-2xl font-mono font-black text-[#001a33] tracking-widest">{getMatriculaPreview()}</p>
              <p className="text-[10px] text-slate-550 leading-relaxed font-medium">
                Este formato será gerado automaticamente para todos os novos alunos vinculados e listados nos portais acadêmicos.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Prefixo da Matrícula</label>
                <input 
                  type="text" 
                  value={matriculaPrefix}
                  onChange={(e) => setMatriculaPrefix(e.target.value.toUpperCase())}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                  placeholder="Ex: UNIV-"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Dígitos Sequenciais</label>
                <select
                  value={matriculaDigits}
                  onChange={(e) => setMatriculaDigits(Number(e.target.value))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700 cursor-pointer"
                >
                  <option value={3}>3 dígitos (ex: 002)</option>
                  <option value={4}>4 dígitos (ex: 0002)</option>
                  <option value={5}>5 dígitos (ex: 00002)</option>
                  <option value={6}>6 dígitos (ex: 000002)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Formato do Ano</label>
                <select
                  value={yearFormat}
                  onChange={(e) => setYearFormat(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700 cursor-pointer"
                >
                  <option value="yy">Apenas 2 dígitos (ex: 26)</option>
                  <option value="yyyy">Completo 4 dígitos (ex: 2026)</option>
                  <option value="none">Não incluir ano</option>
                </select>
              </div>

              <div className="flex items-center gap-2.5 pt-6 pl-2">
                <input 
                  type="checkbox" 
                  id="usePoloCode"
                  checked={usePoloCode}
                  onChange={(e) => setUsePoloCode(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-slate-300 rounded focus:ring-purple-500 cursor-pointer"
                />
                <label htmlFor="usePoloCode" className="font-bold text-slate-600 uppercase tracking-wide cursor-pointer text-[10px]">
                  Incluir Código do Polo (ex: 01, 02)
                </label>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'carteirinha' && (
          <div className="space-y-6 max-w-xl animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Cor Primária do Layout</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={carteirinhaPrimaryColor}
                    onChange={(e) => setCarteirinhaPrimaryColor(e.target.value)}
                    className="w-12 h-10 bg-slate-50 border border-slate-200 outline-none rounded-xl cursor-pointer"
                  />
                  <input 
                    type="text" 
                    value={carteirinhaPrimaryColor}
                    onChange={(e) => setCarteirinhaPrimaryColor(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700 font-mono text-center"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Cor Secundária do Layout</label>
                <div className="flex gap-2">
                  <input 
                    type="color" 
                    value={carteirinhaSecondaryColor}
                    onChange={(e) => setCarteirinhaSecondaryColor(e.target.value)}
                    className="w-12 h-10 bg-slate-50 border border-slate-200 outline-none rounded-xl cursor-pointer"
                  />
                  <input 
                    type="text" 
                    value={carteirinhaSecondaryColor}
                    onChange={(e) => setCarteirinhaSecondaryColor(e.target.value)}
                    className="flex-1 p-2.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700 font-mono text-center"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Validade do Documento (Meses)</label>
                <input 
                  type="number" 
                  min={1}
                  max={48}
                  value={validityMonths}
                  onChange={(e) => setValidityMonths(Number(e.target.value))}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                />
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'certificados' && (
          <div className="space-y-5 max-w-2xl animate-fadeIn">
            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl flex items-start gap-2.5">
              <FileCode size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-550 leading-relaxed font-medium">
                Você pode utilizar chaves dinâmicas nos templates como: <strong className="text-[#001a33]">{`{CURSO}`}</strong>, <strong className="text-[#001a33]">{`{POLO}`}</strong>, <strong className="text-[#001a33]">{`{CARGA}`}</strong>. O sistema irá substituí-las na emissão do certificado.
              </p>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Prefixo do Código de Validação</label>
                  <input 
                    type="text" 
                    value={validacaoPrefix}
                    onChange={(e) => setValidacaoPrefix(e.target.value.toUpperCase())}
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                    placeholder="Ex: VAL-"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Template de Certificado: Técnico</label>
                <textarea 
                  rows={2}
                  value={templateTecnico}
                  onChange={(e) => setTemplateTecnico(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-medium text-slate-700 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Template de Certificado: EAD</label>
                <textarea 
                  rows={2}
                  value={templateEad}
                  onChange={(e) => setTemplateEad(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-medium text-slate-700 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Template de Certificado: Cursos Livres</label>
                <textarea 
                  rows={2}
                  value={templateLivres}
                  onChange={(e) => setTemplateLivres(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-medium text-slate-700 resize-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Template de Certificado: Especialização</label>
                <textarea 
                  rows={2}
                  value={templateEspecializacao}
                  onChange={(e) => setTemplateEspecializacao(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-medium text-slate-700 resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'validacao' && (
          <div className="space-y-6 max-w-xl animate-fadeIn">
            {/* Live Preview Card */}
            <div className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50/40 border border-purple-100 rounded-3xl space-y-2">
              <p className="text-[10px] text-purple-650 font-black uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={11} className="text-yellow-500" /> Link de Autenticidade Digital
              </p>
              <p className="text-sm font-bold text-slate-700">URL Base de Validação: <span className="text-blue-600 font-mono select-all">{validacaoUrl}</span></p>
              <p className="text-[10px] text-slate-550 leading-relaxed font-medium">
                Esta URL é utilizada para gerar o QR Code de autenticação inserido nos documentos oficiais (ex: declarações e certificados). Os validadores acadêmicos apontarão para este endereço.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">URL do Validador no Site</label>
                <input 
                  type="url" 
                  value={validacaoUrl}
                  onChange={(e) => setValidacaoUrl(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                  placeholder="Ex: https://www.universocc.com.br/validador"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Certifique-se de incluir o protocolo (http:// ou https://) para que os QR Codes funcionem perfeitamente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default AcademicosConfig;
