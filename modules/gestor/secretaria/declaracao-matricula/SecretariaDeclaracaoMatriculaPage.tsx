// File: modules/gestor/secretaria/declaracao-matricula/SecretariaDeclaracaoMatriculaPage.tsx

import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Users, Search, Printer, Image, ArrowLeft, CheckCircle, Loader2, Download, Trash2, X, ChevronRight, FileBadge } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from '../../../../lib/supabase';
import { declaracaoService } from '../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { marcaDaguaService } from '../../configuracoes/marca-dagua/marca-dagua.service';
import { academicosService } from '../../configuracoes/academicos/academicos.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import { parceirosService } from '../../parceiros/parceiros.service';
import { documentValidationService } from '../../../shared/document-validation/document-validation.service';
import { formatMatricula } from '../../../../lib/academicUtils';
import DocumentHeader from '../../components/DocumentHeader';

interface Aluno {
  id: string;
  enrollmentId?: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  matricula: string;
  curso: string;
  turmaNome: string;
  instituicao: string;
  fotoUrl?: string | null;
  tipoDocumento?: string;
  turmaIds?: string[];
  poloNome: string;
  cidadePolo: string;
}

const TEMPLATE_DEFAULT = {
  textContent: `<p>Declaramos para os devidos fins que, <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº {{ALUNO_CPF}}, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, nesta instituição de ensino.</p><br><p>O referido curso é realizado na modalidade presencial no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.</p>`,
  absoluteFields: [],
  validityDays: 30,
  v: 2
};

const SecretariaDeclaracaoMatriculaPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote' | 'custom'>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchQueryCustom, setSearchQueryCustom] = useState('');
  const [loading, setLoading] = useState(true);
  const [poloId, setPoloId] = useState('44444444-4444-4444-4444-444444444444');
  const [poloInfo, setPoloInfo] = useState<any>(null);
  
  // Real Database Data
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [customSelectedAlunos, setCustomSelectedAlunos] = useState<Aluno[]>([]);
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('todos');
  
  // Model Configs
  const [templateConfig, setTemplateConfig] = useState<any>(TEMPLATE_DEFAULT);
  const [watermark, setWatermark] = useState<any>(null);
  const [qrConfig, setQrConfig] = useState<any>(null);
  const [academicConfigs, setAcademicConfigs] = useState<any>(null);

  // States for printing visualizer
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreparingValidation, setIsPreparingValidation] = useState(false);
  const [validationCodes, setValidationCodes] = useState<Record<string, string>>({});
  const printContentRef = useRef<HTMLDivElement>(null);

  const loadAcademicoData = async (activePoloId: string) => {
    try {
      setLoading(true);
      
      // Load polo info
      const poloData = await polosService.getById(activePoloId);
      setPoloInfo(poloData);
      
      // Load students of active polo or Geral (polo_id IS NULL)
      const { data: dbAlunos, error: errorAlunos } = await supabase
        .from('parceiros')
        .select('*')
        .eq('tipo', 'Aluno')
        .or(`polo_id.eq.${activePoloId},polo_id.is.null`)
        .order('nome', { ascending: true });
        
      if (errorAlunos) throw errorAlunos;

      const allTurmas = await parceirosService.getTurmasDisponiveis();
      // Filter turmas by polo or load all
      const filteredTurmas = allTurmas.filter((t: any) => t.poloId === activePoloId || !t.poloId);
      setTurmas(filteredTurmas);
      
      const mapped = await Promise.all(
        (dbAlunos || []).map(async (p) => {
          const matriculas = await parceirosService.getMatriculas(p.id);
          const activeMat = matriculas.find(m => m.status?.toUpperCase() === 'ATIVO') || matriculas[0];
          const turmaIds = matriculas.map(m => m.turma_id);
          
          return {
            id: p.id,
            enrollmentId: activeMat?.id,
            nome: p.nome.toUpperCase(),
            cpf: p.cpf_cnpj || '',
            rg: p.rg || '',
            nascimento: p.data_nascimento || '',
            matricula: activeMat ? formatMatricula(activeMat.id, activeMat.data_matricula, activeMat.polo_id) : 'PENDENTE',
            curso: activeMat?.turmas?.cursos?.nome || 'Curso Geral',
            turmaNome: activeMat?.turmas?.nome || '',
            instituicao: 'Universo Cursos e Consultoria',
            fotoUrl: p.foto_url || null,
            tipoDocumento: p.tipo_documento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
            turmaIds,
            poloNome: activeMat?.turmas?.polos?.nome || poloData?.nome || 'Universo Cursos e Consultoria',
            cidadePolo: activeMat?.turmas?.polos?.cidade || poloData?.cidade || 'Aracaju',
          };
        })
      );

      setAlunos(mapped);
    } catch (err) {
      console.error('Erro ao carregar dados acadêmicos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initConfigs = async () => {
      try {
        const activePoloId = sessionStorage.getItem('current_polo_id') || '44444444-4444-4444-4444-444444444444';
        setPoloId(activePoloId);

        // Load document template
        const template = await declaracaoService.getTemplate(activePoloId);
        setTemplateConfig(template);

        // Load watermark
        const watermarks = await marcaDaguaService.getCompaniesWithWatermark();
        const wm = watermarks.find(w => w.id === activePoloId);
        setWatermark(wm);

        // Load QR pattern config
        const qrData = await declaracaoService.getQrConfig();
        setQrConfig(qrData);

        // Load global academic configs
        const academicData = await academicosService.getConfigs();
        setAcademicConfigs(academicData);
        
        await loadAcademicoData(activePoloId);
      } catch (err) {
        console.error('Erro ao carregar configurações de declaração:', err);
      }
    };
    initConfigs();
  }, []);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.toUpperCase();
    const result = alunos.find(a => a.nome.includes(query) || a.cpf.includes(query) || a.rg.includes(query));
    if (result) {
      setSelectedAluno(result);
      setSearchQuery('');
    } else {
      alert('Nenhum aluno encontrado.');
    }
  };

  const handlePrintAction = async () => {
    const targets = mode === 'individual'
      ? (selectedAluno ? [selectedAluno] : [])
      : mode === 'lote'
        ? (selectedTurmaId === 'todos'
            ? alunos
            : alunos.filter((aluno) => aluno.turmaIds?.includes(selectedTurmaId)))
        : customSelectedAlunos;

    const eligibleTargets = targets.filter((aluno) => aluno.enrollmentId);
    if (!eligibleTargets.length) {
      alert('Nenhuma matrícula válida foi encontrada para gerar os códigos de autenticação.');
      return;
    }

    setIsPreparingValidation(true);
    try {
      const validityDays = templateConfig.validityDays || 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validityDays);
      const expiresAtISO = expiresAt.toISOString();

      const issues = await Promise.all(
        eligibleTargets.map(async (aluno) => ({
          alunoId: aluno.id,
          issue: await documentValidationService.issue({
            type: 'declaracao_matricula',
            enrollmentId: aluno.enrollmentId!,
            expiresAt: expiresAtISO,
            registerReissue: true,
          }),
        }))
      );

      setValidationCodes((current) => ({
        ...current,
        ...Object.fromEntries(issues.map(({ alunoId, issue }) => [alunoId, issue.code])),
      }));
      setIsPrinting(true);
    } catch (error) {
      console.error('Erro ao registrar emissão de declaração:', error);
      alert('Não foi possível gerar os códigos de validação das declarações.');
    } finally {
      setIsPreparingValidation(false);
    }
  };

  const handleDownload = async () => {
    const pages = Array.from(
      printContentRef.current?.querySelectorAll<HTMLElement>('.print-page') || []
    ) as HTMLElement[];
    if (!pages.length) return;

    setIsDownloading(true);
    try {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      for (let index = 0; index < pages.length; index += 1) {
        const canvas = await html2canvas(pages[index], {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: false,
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (index > 0) pdf.addPage('a4', 'portrait');
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }

      pdf.save(`declaracoes-matricula-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Erro ao baixar declaração:', error);
      alert('Não foi possível gerar o PDF da declaração.');
    } finally {
      setIsDownloading(false);
    }
  };

  const triggerBrowserPrint = () => {
    window.print();
  };

  const rawAlunosParaImprimir = mode === 'individual'
    ? (selectedAluno ? [selectedAluno] : [])
    : mode === 'lote'
      ? (selectedTurmaId === 'todos'
          ? alunos
          : alunos.filter(a => a.turmaIds && a.turmaIds.includes(selectedTurmaId)))
      : customSelectedAlunos;

  const parseTemplate = (htmlText: string, aluno: Aluno, validationCode: string) => {
    if (!htmlText) return '';
    let parsed = htmlText;

    const today = new Date();
    const meses = [
      'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
      'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const dataExtenso = `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;
    const horaAtual = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;

    const validityDays = templateConfig.validityDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validityDays);
    const validadeFormatada = `${String(expiresAt.getDate()).padStart(2, '0')}/${String(expiresAt.getMonth() + 1).padStart(2, '0')}/${expiresAt.getFullYear()}`;

    parsed = parsed.replace(/{{ALUNO_NOME}}/g, aluno.nome.toUpperCase());
    parsed = parsed.replace(/{{ALUNO_CPF}}/g, aluno.cpf || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_RG}}/g, aluno.rg || 'Não informado');
    parsed = parsed.replace(/{{ALUNO_MATRICULA}}/g, aluno.matricula || 'Não gerada');
    parsed = parsed.replace(/{{CURSO_NOME}}/g, aluno.curso || '');
    parsed = parsed.replace(/{{TURMA_NOME}}/g, aluno.turmaNome || '');
    parsed = parsed.replace(/{{POLO_NOME}}/g, aluno.poloNome || 'Universo Cursos e Consultoria');
    parsed = parsed.replace(/{{CIDADE_POLO}}/g, aluno.cidadePolo || 'Aracaju');
    parsed = parsed.replace(/{{DATA_ATUAL}}/g, dataExtenso);
    parsed = parsed.replace(/{{HORA_ATUAL}}/g, horaAtual);
    parsed = parsed.replace(/{{VALIDADE_DIAS}}/g, String(validityDays));
    parsed = parsed.replace(/{{VALIDADE_DATA}}/g, validadeFormatada);

    return parsed;
  };

  const renderA4Pages = () => {
    return rawAlunosParaImprimir.map((aluno, index) => {
      const code = validationCodes[aluno.id] || 'VALIDACAO-PENDENTE';
      const parsedText = parseTemplate(templateConfig.textContent, aluno, code);

      return (
        <div
          key={aluno.id}
          className="print-page w-[210mm] min-h-[297mm] bg-white text-black p-[20mm] mx-auto shadow-2xl mb-8 box-border border border-slate-200 relative overflow-hidden text-left"
          style={{ fontFamily: '"Times New Roman", Times, serif' }}
        >
          {/* 1. Marca D'água */}
          {watermark?.watermarkUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <img
                src={watermark.watermarkUrl}
                alt="Watermark"
                style={{
                  opacity: watermark.watermarkOpacity || 0.1,
                  width: `${watermark.watermarkScale || 50}%`,
                  transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
                }}
              />
            </div>
          )}

          {/* 2. Cabeçalho */}
          <DocumentHeader polo={poloInfo} orientation="portrait" />

          {/* Título */}
          <div className="text-center mb-12 relative z-10 mt-6">
            <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
              DECLARAÇÃO DE MATRÍCULA
            </h2>
          </div>

          {/* 3. Corpo do Texto */}
          <div className="relative z-20 mb-20 text-justify leading-loose text-lg text-black" dangerouslySetInnerHTML={{ __html: parsedText }} />

          {/* 4. Campos Absolutos */}
          {templateConfig.absoluteFields?.map((field: any) => {
            const parsedVal = parseTemplate(field.value, aluno, code);
            return (
              <div
                key={field.id}
                className="absolute z-30"
                style={{
                  left: field.x,
                  top: field.y,
                  color: '#000',
                  width: field.width ? `${field.width}px` : 'auto',
                  height: 'auto',
                  ...field.style
                }}
              >
                {field.type === 'qrcode' && (
                  <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                    <div className="w-full aspect-square bg-white flex items-center justify-center mb-1" style={{ width: field.width ? `${field.width}px` : '100px' }}>
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${academicConfigs?.validacaoUrl || 'https://www.universocc.com.br/validador'}?q=${code}`)}`}
                        alt="QR Code"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    </div>
                    <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5 select-all">
                      <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
                      <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
                        {code}
                      </p>
                    </div>
                  </div>
                )}

                {field.type === 'image' && (
                  <img
                    src={field.value}
                    alt="Assinatura"
                    className="w-full h-auto object-contain pointer-events-none"
                    style={{ width: field.width ? `${field.width}px` : '200px' }}
                  />
                )}

                {field.type === 'text' && (
                  <>{parsedVal}</>
                )}
              </div>
            );
          })}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando dados acadêmicos...</p>
      </div>
    );
  }

  if (isPrinting) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[9999] overflow-y-auto custom-scrollbar flex flex-col" id="print-layout">
        {/* Barra superior de Ações */}
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Visualizador de Documentos</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Emissão: Declaração de Matrícula ({rawAlunosParaImprimir.length} pág.)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-5 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all border border-white/15 disabled:opacity-60"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {isDownloading ? 'Gerando...' : 'Fazer Download PDF'}
            </button>
            <button
              onClick={triggerBrowserPrint}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg"
            >
              <Printer size={16} /> Confirmar Impressão
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div ref={printContentRef} className="print-content flex flex-col items-center">
            {renderA4Pages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #print-layout, #print-layout * {
              visibility: visible;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #print-layout {
              position: absolute;
              left: 0;
              top: 0;
              width: 210mm !important;
              height: auto !important;
              background: white !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              box-shadow: none !important;
            }
            .print-page {
              width: 210mm !important;
              height: 297mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              margin: 0 !important;
              padding: 20mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
            .print-page img {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
        `}} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Seletor de Modo */}
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm inline-flex flex-wrap justify-center gap-1">
          <button
            onClick={() => setMode('individual')}
            className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'individual' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Search size={16} /> Individual
          </button>
          <button
            onClick={() => setMode('lote')}
            className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'lote' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Users size={16} /> Em Lote (Turma)
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'custom' ? 'bg-[#001a33] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <CreditCard size={16} /> Personalizado (Misto)
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
        {mode === 'individual' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declaração Individual</h3>

            <div className="relative mb-8">
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Buscar aluno por nome, CPF ou RG..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-slate-450 hover:text-slate-650 text-xs font-bold uppercase tracking-wider px-3 transition-colors"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={handleSearch}
                  className="bg-[#001a33] text-white px-8 rounded-2xl hover:bg-blue-900 transition-colors shadow-lg"
                >
                  <Search size={20} />
                </button>
              </div>

              {searchQuery.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                  {alunos
                    .filter(a =>
                      a.nome.toUpperCase().includes(searchQuery.toUpperCase()) ||
                      (a.cpf && a.cpf.includes(searchQuery)) ||
                      (a.rg && a.rg.includes(searchQuery))
                    )
                    .slice(0, 15)
                    .map((aluno) => (
                      <button
                        key={aluno.id}
                        onClick={() => {
                          setSelectedAluno(aluno);
                          setSearchQuery('');
                        }}
                        className="w-full text-left px-6 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                      >
                        <div>
                          <span className="block font-black text-slate-800 text-xs uppercase">{aluno.nome}</span>
                          <span className="block text-[10px] text-slate-450 font-semibold uppercase mt-0.5">
                            CPF: {aluno.cpf} | RG: {aluno.rg} | Curso: {aluno.curso}
                          </span>
                        </div>
                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                          Selecionar
                        </span>
                      </button>
                    ))}
                  {alunos.filter(a =>
                    a.nome.toUpperCase().includes(searchQuery.toUpperCase()) ||
                    (a.cpf && a.cpf.includes(searchQuery)) ||
                    (a.rg && a.rg.includes(searchQuery))
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                      Nenhum aluno encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedAluno ? (
              <div className="border border-slate-150 rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/40 animate-fadeIn animate-duration-300">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-lg overflow-hidden border border-blue-200">
                    {selectedAluno.fotoUrl ? (
                      <img src={selectedAluno.fotoUrl} alt="Foto" className="w-full h-full object-cover" />
                    ) : (
                      selectedAluno.nome[0]
                    )}
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm uppercase">{selectedAluno.nome}</h4>
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">
                      Matrícula: {selectedAluno.matricula}
                    </p>
                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{selectedAluno.curso} · {selectedAluno.turmaNome}</p>
                  </div>
                </div>
                <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-md uppercase tracking-wider flex items-center gap-1">
                  Ativo
                </span>
              </div>
            ) : (
              <div className="border border-slate-150 rounded-3xl p-6 mb-8 text-center text-slate-450 font-bold uppercase text-xs">
                Busque um aluno acima para visualizar seus dados e emitir a declaração.
              </div>
            )}

            <div className="flex flex-col items-center">
              <button
                onClick={handlePrintAction}
                disabled={!selectedAluno || isPreparingValidation}
                className="px-8 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                {isPreparingValidation ? 'Registrando código...' : 'Visualizar Declaração de Matrícula'}
              </button>
            </div>
          </div>
        )}

        {mode === 'lote' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote (Turma)</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                <select
                  value={selectedTurmaId}
                  onChange={(e) => setSelectedTurmaId(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 cursor-pointer font-bold text-slate-700 text-sm"
                >
                  <option value="todos">Todos os Alunos Cadastrados</option>
                  {turmas.map(t => (
                    <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Validade do Lote</label>
                <input
                  type="text"
                  value={`${templateConfig.validityDays || 30} dias`}
                  disabled
                  className="w-full p-4 bg-slate-100 border border-slate-200 rounded-2xl font-bold text-slate-500 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  const nomes = rawAlunosParaImprimir.map(a => `${a.nome} (${a.curso})`).join('\n');
                  alert(`Alunos no lote para impressão:\n\n${nomes}`);
                }}
                className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors"
              >
                Ver Lista de Alunos ({rawAlunosParaImprimir.length})
              </button>
              <button
                onClick={handlePrintAction}
                disabled={rawAlunosParaImprimir.length === 0 || isPreparingValidation}
                className="flex-1 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Completo'}
              </button>
            </div>
          </div>
        )}

        {mode === 'custom' && (
          <div className="animate-fadeIn">
            <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Declarações Personalizadas (Misto)</h3>

            <div className="relative mb-8">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Buscar e Adicionar Alunos</label>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Buscar aluno por nome, CPF ou RG..."
                  value={searchQueryCustom}
                  onChange={(e) => setSearchQueryCustom(e.target.value)}
                  className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-blue-500 text-slate-750 font-medium text-sm"
                />
                {searchQueryCustom && (
                  <button
                    onClick={() => setSearchQueryCustom('')}
                    className="text-slate-450 hover:text-slate-655 text-xs font-bold uppercase tracking-wider px-3 transition-colors"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {searchQueryCustom.trim().length > 0 && (
                <div className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto custom-scrollbar">
                  {alunos
                    .filter(a =>
                      a.nome.toUpperCase().includes(searchQueryCustom.toUpperCase()) ||
                      (a.cpf && a.cpf.includes(searchQueryCustom)) ||
                      (a.rg && a.rg.includes(searchQueryCustom))
                    )
                    .slice(0, 15)
                    .map((aluno) => {
                      const isAdded = customSelectedAlunos.some(x => x.id === aluno.id);
                      return (
                        <button
                          key={aluno.id}
                          disabled={isAdded}
                          onClick={() => {
                            setCustomSelectedAlunos(prev => [...prev, aluno]);
                            setSearchQueryCustom('');
                          }}
                          className={`w-full text-left px-6 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0 ${isAdded ? 'opacity-50 cursor-not-allowed bg-slate-50/30' : ''}`}
                        >
                          <div>
                            <span className="block font-black text-slate-800 text-xs uppercase">{aluno.nome}</span>
                            <span className="block text-[10px] text-slate-450 font-semibold uppercase mt-0.5">
                              CPF: {aluno.cpf} | RG: {aluno.rg} | Curso: {aluno.curso}
                            </span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase tracking-wider ${isAdded ? 'bg-slate-150 text-slate-400' : 'bg-blue-50 text-blue-600'}`}>
                            {isAdded ? 'Adicionado' : 'Adicionar'}
                          </span>
                        </button>
                      );
                    })}
                  {alunos.filter(a =>
                    a.nome.toUpperCase().includes(searchQueryCustom.toUpperCase()) ||
                    (a.cpf && a.cpf.includes(searchQueryCustom)) ||
                    (a.rg && a.rg.includes(searchQueryCustom))
                  ).length === 0 && (
                    <div className="p-4 text-center text-xs font-bold text-slate-400 uppercase">
                      Nenhum aluno encontrado
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected students list */}
            <div className="border border-slate-200 rounded-3xl p-6 mb-8 bg-slate-50/20 animate-fadeIn">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Alunos Selecionados ({customSelectedAlunos.length})
                </h4>
                {customSelectedAlunos.length > 0 && (
                  <button
                    onClick={() => setCustomSelectedAlunos([])}
                    className="text-red-500 hover:text-red-700 font-black uppercase text-[10px] tracking-wider transition-colors flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Esvaziar Lista
                  </button>
                )}
              </div>

              {customSelectedAlunos.length > 0 ? (
                <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {customSelectedAlunos.map((aluno) => (
                    <div
                      key={aluno.id}
                      className="flex items-center justify-between p-4 bg-white border border-slate-150 rounded-2xl shadow-sm hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-black text-sm overflow-hidden border border-blue-100">
                          {aluno.fotoUrl ? (
                            <img src={aluno.fotoUrl} alt="Foto" className="w-full h-full object-cover" />
                          ) : (
                            aluno.nome[0]
                          )}
                        </div>
                        <div>
                          <span className="block font-black text-slate-800 text-xs uppercase leading-tight">{aluno.nome}</span>
                          <span className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mt-0.5">
                            Matrícula: {aluno.matricula} | {aluno.curso}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => setCustomSelectedAlunos(prev => prev.filter(x => x.id !== aluno.id))}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Remover aluno"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border border-slate-200 border-dashed rounded-2xl p-8 text-center text-slate-450 font-bold uppercase text-xs">
                  Nenhum aluno adicionado à lista. Busque alunos acima para começar a montar o lote de impressão personalizado.
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handlePrintAction}
                disabled={customSelectedAlunos.length === 0 || isPreparingValidation}
                className="w-full py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-900 transition-all shadow-xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPreparingValidation ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
                {isPreparingValidation ? 'Registrando códigos...' : 'Visualizar Lote Personalizado'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecretariaDeclaracaoMatriculaPage;
