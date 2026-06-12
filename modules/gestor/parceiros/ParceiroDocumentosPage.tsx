// File: modules/gestor/parceiros/ParceiroDocumentosPage.tsx

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  GraduationCap, 
  Eye, 
  RefreshCw,
  Building,
  Sparkles
} from 'lucide-react';
import { parceirosService } from './parceiros.service';

interface AlunoDocumentoData {
  id: string;
  nome: string;
  tipo: string;
  email: string;
  telefone: string;
  poloNome: string;
  status: string;
  documentos: any[];
  matriculas: any[];
}

const ParceiroDocumentosPage: React.FC = () => {
  const [alunos, setAlunos] = useState<AlunoDocumentoData[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAlunoId, setExpandedAlunoId] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'pendentes' | 'regulares'>('todos');
  const [selectedTurmaId, setSelectedTurmaId] = useState('todos');

  // Load Alunos and their Document status
  const loadData = async () => {
    try {
      setLoading(true);
      const allAlunos = await parceirosService.getAll('alunos');
      const allTurmas = await parceirosService.getTurmasDisponiveis();
      setTurmas(allTurmas);

      // Fetch docs for each student
      const alunosComDocs = await Promise.all(
        allAlunos.map(async (aluno) => {
          const docs = await parceirosService.getDocumentos(aluno.id);
          const matriculas = await parceirosService.getMatriculas(aluno.id);
          return {
            ...aluno,
            documentos: docs,
            matriculas
          };
        })
      );
      setAlunos(alunosComDocs);
    } catch (err) {
      console.error('Erro ao carregar dados de documentos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUpload = async (alunoId: string, docName: string, file: File) => {
    try {
      await parceirosService.uploadDocumento(alunoId, docName, file);
      // Reload checklists
      const updatedDocs = await parceirosService.getDocumentos(alunoId);
      setAlunos(prev => prev.map(aluno => 
        aluno.id === alunoId ? { ...aluno, documentos: updatedDocs } : aluno
      ));
    } catch (err) {
      alert('Falha no upload do documento. Tente novamente.');
      console.error(err);
    }
  };

  // Filter Alunos
  const filteredAlunos = alunos.filter(aluno => {
    // 1. Search term
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      const matchName = aluno.nome.toLowerCase().includes(lower);
      const matchCpf = (aluno.cpf || '').includes(lower);
      if (!matchName && !matchCpf) return false;
    }

    // 2. Class/Turma filter
    if (selectedTurmaId !== 'todos') {
      const isEnrolled = aluno.matriculas.some(m => m.turma_id === selectedTurmaId);
      if (!isEnrolled) return false;
    }

    // 3. Status filter
    const totalDocs = aluno.documentos.length;
    const deliveredDocs = aluno.documentos.filter(d => d.status === 'entregue').length;
    const hasPendency = deliveredDocs < totalDocs;

    if (statusFilter === 'pendentes' && !hasPendency) return false;
    if (statusFilter === 'regulares' && hasPendency) return false;

    return true;
  });

  // Calculate KPIs
  const totalAlunos = alunos.length;
  const alunosComPendencias = alunos.filter(aluno => 
    aluno.documentos.filter(d => d.status === 'entregue').length < aluno.documentos.length
  ).length;
  const alunosRegulares = totalAlunos - alunosComPendencias;

  return (
    <div className="animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-[#4169E1]" />
            <span className="text-xs font-bold text-[#4169E1] uppercase tracking-[0.2em]">Secretaria Acadêmica</span>
          </div>
          <h2 className="text-4xl font-black text-[#001a33] uppercase tracking-tighter">
            Controle de <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4169E1] to-[#003366]">Documentos</span>
          </h2>
          <p className="text-slate-500 font-medium mt-2 max-w-lg">
            Monitore a entrega de documentação obrigatória dos alunos e realize uploads diretos para os arquivos em nuvem.
          </p>
        </div>
        
        <button 
          onClick={loadData}
          className="flex items-center justify-center gap-2 bg-white text-slate-700 px-5 py-3.5 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-slate-50 border border-slate-200 shadow-sm transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1">Total de Alunos</span>
            <span className="text-3xl font-black text-[#001a33]">{totalAlunos}</span>
          </div>
          <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <GraduationCap size={28} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1">Documentação Regular</span>
            <span className="text-3xl font-black text-emerald-600">{alunosRegulares}</span>
          </div>
          <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <CheckCircle2 size={28} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest block mb-1">Com Pendência</span>
            <span className="text-3xl font-black text-orange-500">{alunosComPendencias}</span>
          </div>
          <div className="w-14 h-14 bg-orange-50 text-orange-500 rounded-2xl flex items-center justify-center">
            <AlertCircle size={28} />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm mb-8 flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="flex-1 w-full lg:max-w-md relative">
          <div className="flex items-center bg-slate-100 rounded-xl px-4 py-2.5 border border-transparent focus-within:border-blue-500 focus-within:bg-white transition-all">
            <Search size={18} className="text-slate-400 mr-3" />
            <input 
              type="text"
              placeholder="Buscar aluno por nome ou CPF..."
              className="bg-transparent border-none outline-none w-full text-sm text-slate-700 placeholder-slate-400 font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
          {/* Status Select */}
          <select 
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-bold uppercase tracking-wider outline-none cursor-pointer focus:border-blue-500"
          >
            <option value="todos">Todos Status</option>
            <option value="pendentes">Com Pendência</option>
            <option value="regulares">Regularizados</option>
          </select>

          {/* Turma Select */}
          <select 
            value={selectedTurmaId}
            onChange={(e) => setSelectedTurmaId(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-xs font-bold uppercase tracking-wider outline-none cursor-pointer focus:border-blue-500"
          >
            <option value="todos">Todas Turmas</option>
            {turmas.map(turma => (
              <option key={turma.id} value={turma.id}>
                {turma.nome} ({turma.codigo})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Alunos list */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-20">
            <RefreshCw className="animate-spin text-blue-600 mx-auto mb-4" size={36} />
            <p className="text-slate-500 font-medium">Carregando documentação dos alunos...</p>
          </div>
        ) : filteredAlunos.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <AlertCircle className="mx-auto mb-4 text-slate-300" size={48} />
            <p className="font-medium">Nenhum aluno encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAlunos.map((aluno) => {
              const total = aluno.documentos.length;
              const delivered = aluno.documentos.filter(d => d.status === 'entregue').length;
              const isExpanded = expandedAlunoId === aluno.id;

              return (
                <div key={aluno.id} className="transition-colors hover:bg-slate-50/30">
                  {/* Summary Bar */}
                  <div 
                    onClick={() => setExpandedAlunoId(isExpanded ? null : aluno.id)}
                    className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm border-2 border-slate-200 shadow-sm">
                        {aluno.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-[#001a33] text-base">{aluno.nome}</h4>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">
                          Polo: {aluno.poloNome} • CPF: {aluno.cpf || 'Não cadastrado'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                      {/* Enrolled class */}
                      <span className="hidden md:inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider">
                        <Building size={12} />
                        {aluno.matriculas?.[0]?.turmas?.nome || 'Sem Turma'}
                      </span>

                      {/* Documents Status */}
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-700 block">
                            {delivered} de {total} Entregues
                          </span>
                          <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold mt-0.5">
                            Checklist
                          </span>
                        </div>
                        
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center relative">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${delivered === total ? 'bg-emerald-500' : 'bg-orange-500'}`}>
                            {delivered === total ? '✓' : total - delivered}
                          </div>
                        </div>

                        <div>
                          {isExpanded ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Checklist */}
                  {isExpanded && (
                    <div className="bg-slate-50/50 p-8 border-t border-slate-100 animate-fadeIn space-y-6">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-200/50">
                        <h5 className="text-xs font-black text-[#001a33] uppercase tracking-wider">Documentos Obrigatórios</h5>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Histórico de envio de arquivos</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {aluno.documentos.map((doc) => (
                          <div 
                            key={doc.id}
                            className="bg-white border border-slate-150 p-5 rounded-2xl flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-xl mt-0.5 ${doc.status === 'entregue' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                                  <FileText size={20} />
                                </div>
                                <div>
                                  <span className="text-sm font-bold text-slate-800 block leading-tight">{doc.nome}</span>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1 block">
                                    {doc.status === 'entregue' ? 'Entregue em formato PDF' : 'Aguardando envio'}
                                  </span>
                                </div>
                              </div>

                              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                                doc.status === 'entregue' 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-orange-100 text-orange-850'
                              }`}>
                                {doc.status}
                              </span>
                            </div>

                            {/* Actions bar */}
                            <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                              <div>
                                {doc.arquivoUrl ? (
                                  <a 
                                    href={doc.arquivoUrl}
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline hover:text-blue-800"
                                  >
                                    <Eye size={12} /> Ver Documento
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">Nenhum arquivo enviado</span>
                                )}
                              </div>

                              {/* Upload Button */}
                              <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#001a33] bg-slate-100 hover:bg-[#001a33] hover:text-white px-4 py-2.5 rounded-xl transition-all cursor-pointer">
                                <Upload size={12} />
                                {doc.status === 'entregue' ? 'Reenviar' : 'Enviar'}
                                <input 
                                  type="file"
                                  accept="application/pdf,image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(aluno.id, doc.nome, file);
                                  }}
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParceiroDocumentosPage;
