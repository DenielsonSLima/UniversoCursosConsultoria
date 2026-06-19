// File: modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx

import React, { useState, useEffect } from 'react';
import { CreditCard, Users, Search, Printer, Image, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import CarteirinhaPreview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import { carteirinhaService } from '../../cadastros/modelos-documentos/carteirinha/carteirinha.service';
import { parceirosService } from '../../parceiros/parceiros.service';

interface Aluno {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  matricula: string;
  curso: string;
  instituicao: string;
  validade: string;
  fotoUrl?: string | null;
  tipoDocumento?: string;
  tipo_documento?: string;
  turmaIds?: string[];
}

const TEMPLATE_DEFAULT = {
  corPrimaria: '#0284c7', // Sky 600
  corSecundaria: '#e0f2fe',
  textoFrente: 'DOCUMENTO DO ESTUDANTE',
  textoVerso: 'Este documento é padronizado nacionalmente nos termos da Lei nº 12.933/2013 e garante o direito de meia-entrada em eventos artísticos-culturais e esportivos.\n\nUso pessoal e intransferível.\nVerifique a validade via QR Code.',
  tipoCurso: 'Cursos Técnicos',
  hasVerso: true,
  startNumber: 1000,
  bgFrenteUrl: '',
  bgVersoUrl: '',
  ocultarDesignPadrao: false
};

const SecretariaCarteirinhasPage: React.FC = () => {
  const [mode, setMode] = useState<'individual' | 'lote'>('individual');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Real Database Data
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAluno, setSelectedAluno] = useState<Aluno | null>(null);
  const [templateConfig, setTemplateConfig] = useState<any>(TEMPLATE_DEFAULT);
  
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('todos');
  const [validadeGeral, setValidadeGeral] = useState('2027-03-31');
  
  // Opção de Layout: 'dobra' (5 por folha) ou 'espelhado' (10 por folha duplex)
  const [layoutType, setLayoutType] = useState<'dobra' | 'espelhado'>('dobra');
  
  // Controle do Visualizador de Impressão A4
  const [isPrinting, setIsPrinting] = useState(false);

  // Carrega os alunos e turmas reais do banco de dados (Supabase)
  const loadAcademicoData = async () => {
    try {
      setLoading(true);
      const allAlunos = await parceirosService.getAll('alunos');
      const allTurmas = await parceirosService.getTurmasDisponiveis();
      setTurmas(allTurmas);

      const mapped = await Promise.all(
        allAlunos.map(async (p) => {
          const matriculas = await parceirosService.getMatriculas(p.id);
          const activeMat = matriculas.find(m => m.status === 'ativo') || matriculas[0];
          const turmaIds = matriculas.map(m => m.turma_id);
          
          return {
            id: p.id,
            nome: p.nome.toUpperCase(),
            cpf: p.cpf || '',
            rg: p.rg || '',
            nascimento: p.dataNascimento || '',
            matricula: activeMat ? `CIE-${activeMat.id.substring(0, 6).toUpperCase()}` : 'CIE-PENDENTE',
            curso: activeMat?.turmas?.cursos?.nome || 'Curso Geral',
            instituicao: 'Universo Cursos e Consultoria',
            validade: '31/03/2027',
            fotoUrl: p.foto || null,
            tipoDocumento: p.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
            turmaIds
          };
        })
      );

      setAlunos(mapped);
      if (mapped.length > 0) {
        setSelectedAluno(mapped[0]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados acadêmicos do banco:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAcademicoData();
  }, []);

  // Carrega o template configurado ativamente no editor
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const savedTemplate = await carteirinhaService.getTemplate();
        if (savedTemplate) {
          setTemplateConfig({
            ...TEMPLATE_DEFAULT,
            ...savedTemplate,
            startNumber: savedTemplate.startNumber || TEMPLATE_DEFAULT.startNumber,
            bgFrenteUrl: savedTemplate.bgFrenteUrl || '',
            bgVersoUrl: savedTemplate.bgVersoUrl || '',
            ocultarDesignPadrao: !!savedTemplate.ocultarDesignPadrao
          });
        }
      } catch (err) {
        console.error('Erro ao carregar template do serviço:', err);
      }
    };
    loadTemplate();
  }, [isPrinting]); // Recarrega ao abrir o visualizador de impressão

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const query = searchQuery.toUpperCase();
    const result = alunos.find(a => a.nome.includes(query) || a.cpf.includes(query) || a.rg.includes(query));
    if (result) {
      setSelectedAluno(result);
    } else {
      alert('Nenhum aluno encontrado com essa busca.');
    }
  };

  const handlePrintAction = () => {
    setIsPrinting(true);
  };

  const triggerBrowserPrint = () => {
    window.print();
  };

  // Divide um array de alunos em páginas contendo no máximo N elementos
  const chunkArray = (array: any[], size: number) => {
    const chunked = [];
    for (let i = 0; i < array.length; i += size) {
      chunked.push(array.slice(i, i + size));
    }
    return chunked;
  };

  const rawAlunosParaImprimir = mode === 'individual' 
    ? (selectedAluno ? [selectedAluno] : (alunos.length > 0 ? [alunos[0]] : []))
    : (selectedTurmaId === 'todos' 
        ? alunos 
        : alunos.filter(a => a.turmaIds && a.turmaIds.includes(selectedTurmaId)));

  // Processa os alunos adicionando o número sequencial inicial e a validade geral
  const startNum = templateConfig.startNumber || 1000;
  const alunosParaImprimir = rawAlunosParaImprimir.map((aluno, index) => {
    const parts = validadeGeral.split('-');
    const validadeFormatada = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : aluno.validade;
    return {
      ...aluno,
      // Gera matrícula sequencial a partir do número inicial configurado no template
      matricula: `CIE-${startNum + index}`,
      validade: validadeFormatada
    };
  });

  // Lógica de Renderização do Lote 10 por Folha Espelhado
  const renderEspelhadoPages = () => {
    const lotes = chunkArray(alunosParaImprimir, 10);

    return lotes.map((loteAlunos, indexLote) => {
      const gridAlunos = [...loteAlunos];
      while (gridAlunos.length < 10) {
        gridAlunos.push(null as any);
      }

      const linhasFrentes = [];
      for (let l = 0; l < 5; l++) {
        linhasFrentes.push([gridAlunos[l * 2], gridAlunos[l * 2 + 1]]);
      }

      const linhasVersos = [];
      for (let l = 0; l < 5; l++) {
        linhasVersos.push([gridAlunos[l * 2 + 1], gridAlunos[l * 2]]);
      }

      return (
        <React.Fragment key={indexLote}>
          {/* PÁGINA DE FRENTES */}
          <div className="print-page w-[210mm] h-[297mm] bg-white text-black p-[10mm] mx-auto shadow-2xl mb-8 flex flex-col justify-between box-border border border-slate-200 relative">
            <div className="grid grid-cols-2 gap-y-[3mm] gap-x-[3mm] justify-items-center items-center flex-1 py-[5mm]">
              {gridAlunos.map((aluno, i) => (
                <div 
                  key={`frente-${i}`} 
                  className="w-[85.6mm] h-[54mm] relative overflow-hidden border border-slate-200 rounded-[2.5mm] shadow-sm flex items-center justify-center bg-slate-50"
                >
                  {aluno ? (
                    <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                  ) : (
                    <div className="text-[10px] text-slate-350 font-bold uppercase tracking-widest">Espaço Vazio</div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Lote de Impressão #{indexLote + 1} — FRENTES (Começando em {startNum})</span>
              <span>Padrão CR80 (2 colunas x 5 linhas)</span>
            </div>
          </div>

          {/* PÁGINA DE VERSOS (ESPELHADO) */}
          <div className="print-page w-[210mm] h-[297mm] bg-white text-black p-[10mm] mx-auto shadow-2xl mb-8 flex flex-col justify-between box-border border border-slate-200 relative">
            <div className="grid grid-cols-2 gap-y-[3mm] gap-x-[3mm] justify-items-center items-center flex-1 py-[5mm]">
              {linhasVersos.flatMap((par) => par).map((aluno, i) => (
                <div 
                  key={`verso-${i}`} 
                  className="w-[85.6mm] h-[54mm] relative overflow-hidden border border-slate-200 rounded-[2.5mm] shadow-sm flex items-center justify-center bg-slate-50"
                >
                  {aluno ? (
                    <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                  ) : (
                    <div className="text-[10px] text-slate-350 font-bold uppercase tracking-widest">Espaço Vazio</div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
              <span>Lote de Impão #{indexLote + 1} — VERSOS ESPELHADOS</span>
              <span>Posicionamento invertido horizontalmente para alinhamento duplex</span>
            </div>
          </div>
        </React.Fragment>
      );
    });
  };

  // Lógica de Renderização do Lote Dobra Manual
  const renderDobraPages = () => {
    const lotes = chunkArray(alunosParaImprimir, 5);

    return lotes.map((loteAlunos, indexLote) => {
      return (
        <div key={indexLote} className="print-page w-[210mm] h-[297mm] bg-white text-black p-[10mm] mx-auto shadow-2xl mb-8 flex flex-col justify-between box-border border border-slate-200">
          <div className="flex-1 flex flex-col justify-around py-4">
            {loteAlunos.map((aluno, i) => (
              <div 
                key={`dobra-${i}`} 
                className="flex items-center justify-center w-full my-1 relative"
              >
                {/* Par Frente e Verso conectado */}
                <div className="flex border border-slate-300 rounded-[2.5mm] overflow-hidden shadow-sm relative">
                  {/* Frente */}
                  <div className="w-[85.6mm] h-[54mm] relative border-r border-dashed border-slate-455">
                    <CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={aluno} />
                    {/* Guia de Dobra vertical */}
                    <div className="absolute top-0 bottom-0 right-0 w-px border-r border-dashed border-slate-400 z-20 pointer-events-none"></div>
                  </div>
                  {/* Verso */}
                  <div className="w-[85.6mm] h-[54mm] relative">
                    <CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={aluno} />
                  </div>
                </div>

                <div className="absolute left-4 text-[7px] font-bold text-slate-400 uppercase tracking-widest pointer-events-none print:hidden flex items-center gap-1">
                  <span># {i + 1} (CIE-{startNum + (indexLote * 5) + i})</span>
                  <span className="text-[5px] bg-slate-100 text-slate-500 rounded px-1">Dobra</span>
                </div>
              </div>
            ))}

            {/* Espaços vazios complementares se o lote tiver menos de 5 */}
            {loteAlunos.length < 5 && Array.from({ length: 5 - loteAlunos.length }).map((_, emptyIndex) => (
              <div 
                key={`empty-${emptyIndex}`}
                className="flex items-center justify-center w-[171.2mm] h-[54mm] border-2 border-dashed border-slate-150 rounded-[2.5mm] mx-auto my-1 bg-slate-50/50 text-[10px] text-slate-300 font-bold uppercase tracking-widest animate-fadeIn"
              >
                Espaço Disponível
              </div>
            ))}
          </div>

          <div className="text-center text-[8px] text-slate-400 font-bold uppercase tracking-widest border-t border-slate-100 pt-2 flex justify-between print:hidden">
            <span>Lote de Impressão #{indexLote + 1} — DOBRA MANUAL (Início: {startNum})</span>
            <span>Rendimento: 5 conjuntos Frente + Verso por folha A4</span>
          </div>
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-purple-600 mb-4" size={48} />
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando alunos e turmas...</p>
      </div>
    );
  }

  if (isPrinting) {
    return (
      <div className="fixed inset-0 bg-slate-900 z-[9999] overflow-y-auto custom-scrollbar flex flex-col" id="print-layout">
        
        {/* Barra superior de Ações (Oculta na Impressão Física) */}
        <div className="bg-slate-800 text-white p-4 shadow-md sticky top-0 flex justify-between items-center z-[10000] print:hidden">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsPrinting(false)}
              className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div>
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Visualizador de Impressão A4</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Layout: {layoutType === 'dobra' ? 'Dobra Lateral (5 por Folha)' : 'Frente e Verso Espelhado (10 por Folha)'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={triggerBrowserPrint}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-xs transition-all shadow-lg shadow-purple-900/30"
          >
            <Printer size={16} /> Confirmar Impressão
          </button>
        </div>

        <div className="flex-1 bg-slate-900 p-8 overflow-y-auto flex flex-col items-center">
          <div className="bg-purple-950/70 border border-purple-800 p-4 rounded-2xl max-w-[210mm] w-full text-white mb-8 flex items-center justify-between gap-4 print:hidden animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-900 text-purple-300 rounded-lg">
                <Printer size={20} />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">Dica de Configuração de Impressão</h4>
                <p className="text-[10px] text-purple-300 leading-normal font-medium mt-1">
                  Na janela que abrir, defina o **Tamanho do papel** como **A4**, configure as **Margens** como **Nenhuma** e marque a opção para imprimir os **Gráficos de plano de fundo** para preservar a imagem de fundo do Photoshop.
                </p>
              </div>
            </div>
          </div>

          <div className="print-content flex flex-col items-center">
            {layoutType === 'dobra' ? renderDobraPages() : renderEspelhadoPages()}
          </div>
        </div>

        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden;
            }
            #print-layout, #print-layout * {
              visibility: visible;
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
              padding: 10mm !important;
              box-shadow: none !important;
              border: none !important;
              background: white !important;
              box-sizing: border-box !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
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
      {/* Seletor de Modo na secretaria */}
      <div className="flex justify-center mb-8">
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm inline-flex">
            <button
                onClick={() => setMode('individual')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'individual' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Search size={16} /> Individual
            </button>
            <button
                onClick={() => setMode('lote')}
                className={`px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all ${mode === 'lote' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
            >
                <Users size={16} /> Em Lote (Turma)
            </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white p-6 sm:p-10 rounded-[2.5rem] border border-slate-100 shadow-xl">
        
        {mode === 'individual' ? (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Carteirinha Individual</h3>
                
                <div className="flex gap-4 mb-8">
                    <input 
                        type="text" 
                        placeholder="Buscar aluno por nome, CPF ou RG..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 text-slate-750 font-medium"
                    />
                    <button 
                      onClick={handleSearch}
                      className="bg-purple-600 text-white px-8 rounded-2xl hover:bg-purple-700 transition-colors shadow-lg shadow-purple-900/20"
                    >
                        <Search size={20} />
                    </button>
                </div>

                {/* Exibição do Aluno Encontrado */}
                {selectedAluno ? (
                  <div className="border border-slate-150 rounded-3xl p-6 mb-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/40 animate-fadeIn">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-black text-xl overflow-hidden border border-purple-200">
                        {selectedAluno.fotoUrl ? (
                          <img src={selectedAluno.fotoUrl} alt="Foto do Aluno" className="w-full h-full object-cover" />
                        ) : (
                          selectedAluno.nome[0]
                        )}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-sm uppercase">{selectedAluno.nome}</h4>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">Matrícula Sequencial: CIE-{startNum}</p>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">{selectedAluno.curso}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-black ${selectedAluno.fotoUrl ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'} px-3 py-1 rounded-md uppercase tracking-wider flex items-center gap-1`}>
                      {selectedAluno.fotoUrl ? (
                        <>
                          <CheckCircle size={12} /> Foto Cadastrada
                        </>
                      ) : (
                        'Sem Foto Cadastrada'
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="border border-slate-150 rounded-3xl p-6 mb-8 text-center text-slate-450 font-bold uppercase text-xs">
                    Nenhum Aluno Encontrado. Cadastre alunos na tela de Alunos.
                  </div>
                )}

                {/* Seleção do Layout de Impressão */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Escolha o Layout de Impressão</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'dobra' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('dobra')}
                    >
                      <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Dobra Lateral (5 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Imprime frentes e versos colados na mesma página A4. Excelente para recorte e dobra ao meio.</span>
                      </div>
                    </label>

                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'espelhado' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('espelhado')}
                    >
                      <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Frente / Verso Real (10 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Gera uma folha de Frentes e outra de Versos espelhados. Ideal para impressora frente/verso (duplex).</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="border-2 border-dashed border-slate-200 rounded-[2.5rem] p-8 flex flex-col items-center justify-center text-center bg-slate-50/50">
                    <div className="w-[85.6mm] h-[54mm] bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg mb-6 relative overflow-hidden flex items-center justify-center text-white shrink-0">
                      <CreditCard size={48} className="opacity-20 absolute -right-4 -bottom-4 rotate-12 scale-150" />
                      <div className="text-center z-10 p-4">
                        <p className="text-[7px] font-black uppercase tracking-widest opacity-80">Visualização do Modelo</p>
                        <h4 className="text-[10px] font-black uppercase tracking-wider mt-1">{selectedAluno?.nome || 'SELECIONE UM ALUNO'}</h4>
                        <p className="text-[8px] font-bold opacity-90 mt-0.5">CIE-{startNum}</p>
                      </div>
                    </div>
                    <button 
                      onClick={handlePrintAction}
                      disabled={!selectedAluno}
                      className="px-8 py-4 bg-[#001a33] text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-900 transition-colors shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Printer size={16} /> Abrir Visualização de Impressão A4
                    </button>
                </div>
            </div>
        ) : (
            <div className="animate-fadeIn">
                <h3 className="text-xl font-black text-[#001a33] mb-6 uppercase tracking-tight">Emissão em Lote</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione a Turma</label>
                        <select 
                          value={selectedTurmaId}
                          onChange={(e) => setSelectedTurmaId(e.target.value)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 cursor-pointer font-bold text-slate-700"
                        >
                            <option value="todos">Todos os Alunos Cadastrados</option>
                            {turmas.map(t => (
                              <option key={t.id} value={t.id}>{t.nome} ({t.codigo})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Validade Geral</label>
                        <input 
                          type="date" 
                          value={validadeGeral}
                          onChange={(e) => setValidadeGeral(e.target.value)}
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-purple-500 font-bold text-slate-700" 
                        />
                    </div>
                </div>

                {/* Seleção do Layout de Impressão */}
                <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl mb-8">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Escolha o Layout de Impressão</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'dobra' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('dobra')}
                    >
                      <input type="radio" checked={layoutType === 'dobra'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Dobra Lateral (5 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Imprime frentes e versos colados na mesma página. Ideal para corte e dobra.</span>
                      </div>
                    </label>

                    <label 
                      className={`p-4 rounded-2xl border-2 flex items-start gap-3 cursor-pointer transition-all ${layoutType === 'espelhado' ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-50/50 border-slate-200 hover:bg-white hover:border-slate-350'}`}
                      onClick={() => setLayoutType('espelhado')}
                    >
                      <input type="radio" checked={layoutType === 'espelhado'} readOnly className="mt-1 accent-purple-600" />
                      <div>
                        <span className="block text-xs font-black text-[#001a33] uppercase">Frente / Verso Real (10 por Folha)</span>
                        <span className="block text-[10px] text-slate-500 leading-normal font-medium mt-1">Gera páginas separadas de Frentes e Versos com espelhamento. Perfeito para impressoras duplex.</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="bg-purple-50 p-6 rounded-2xl border border-purple-100 mb-8 flex items-start gap-4">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-lg shrink-0 mt-0.5">
                      <Image size={20} />
                    </div>
                    <div>
                        <h4 className="font-black text-purple-900 text-sm uppercase">Verificação de Fotos da Turma</h4>
                        <p className="text-xs text-purple-700 leading-relaxed font-semibold mt-1">
                            O lote selecionado possui {alunosParaImprimir.length} alunos cadastrados ativos. Destes, {alunosParaImprimir.filter(a => a.fotoUrl).length} possuem foto de perfil cadastrada e validada no sistema.
                        </p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                    <button 
                      onClick={() => {
                        const nomes = alunosParaImprimir.map(a => `${a.nome} (${a.fotoUrl ? 'COM FOTO' : 'SEM FOTO'})`).join('\n');
                        alert(`Alunos no lote para impressão:\n\n${nomes}`);
                      }}
                      className="flex-1 py-4 border border-slate-200 text-slate-600 rounded-2xl font-bold uppercase text-xs tracking-wider hover:bg-slate-50 transition-colors"
                    >
                        Ver Lista de Alunos ({alunosParaImprimir.length})
                    </button>
                    <button 
                      onClick={handlePrintAction}
                      disabled={alunosParaImprimir.length === 0}
                      className="flex-1 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-900/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Printer size={18} /> Visualizar Lote Completo
                    </button>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default SecretariaCarteirinhasPage;
