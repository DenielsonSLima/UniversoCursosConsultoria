// File: modules/gestor/gestao/tecnicos/detalhes/components/diarios/DiarioClasse.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ArrowLeft, Save, Printer, Calendar, BookOpen, Calculator, Loader2, AlertCircle, Download } from 'lucide-react';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import DiarioPrintDocument from './DiarioPrintDocument';
import {
  useDiarioAttendance,
  useDiarioAulas,
  useDiarioGrades,
  useDiarioObservacoes,
  useDiarioPraticas,
  useDiarioStudents,
  useDiarioTemplate,
  useSaveDiarioGradesMutation,
  useSaveDiarioObservacoesMutation,
  useSaveDiarioPraticaMutation,
  useToggleDiarioAttendanceMutation,
} from './hooks/useDiarioClasse';
import { useDiarioRealtime } from './hooks/useDiarioRealtime';
import { useQuery } from '@tanstack/react-query';
import { diariosService } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { assinaturasService } from '../../../../../configuracoes/assinaturas/assinaturas.service';
import { supabase } from '../../../../../../../lib/supabase';

interface DiarioClasseProps {
  disciplina: any;
  moduloNome: string;
  turma: any;
  onBack: () => void;
}

const DiarioClasse: React.FC<DiarioClasseProps> = ({ disciplina, moduloNome, turma, onBack }) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<'frequencia' | 'resultado' | 'conteudo' | 'observacoes'>('frequencia');
  const printDocumentRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data: diarioTemplate } = useDiarioTemplate(turma.cursoId);
  const { data: watermark } = useQuery({
    queryKey: ['polo-watermark', turma.poloId],
    queryFn: () => diariosService.getLandscapeWatermark(turma.poloId),
    enabled: Boolean(turma.poloId),
  });
  const { data: centralSignatures } = useQuery({
    queryKey: ['central-signatures'],
    queryFn: () => assinaturasService.getSignatures(),
  });
  const { data: students = [], isLoading: loadingStudents } = useDiarioStudents(turma.id);
  const { data: aulas = [], isLoading: loadingAulas } = useDiarioAulas(turma.id, disciplina.id);
  const { data: dbAttendance = [], isLoading: loadingAttendance } = useDiarioAttendance(turma.id, disciplina.id);
  const { data: dbGrades = [], isLoading: loadingGrades } = useDiarioGrades(turma.id, disciplina.id);
  const { data: dbPraticas = [], isLoading: loadingPraticas } = useDiarioPraticas(turma.id, disciplina.id);
  const { data: dbObservacoes = '', isLoading: loadingObservacoes } = useDiarioObservacoes(turma.id, disciplina.id);
  useDiarioRealtime(turma.id, disciplina.id);

  // Mapeamentos computados (Memo)
  const attendanceMap = useMemo(() => {
    const map: Record<string, Record<string, 'P' | 'F' | null>> = {};
    students.forEach(s => {
      map[s.id] = {};
      aulas.forEach(a => {
        map[s.id][a.id] = null;
      });
    });
    dbAttendance.forEach((f: any) => {
      if (map[f.aluno_id]) {
        map[f.aluno_id][f.aula_id] = f.status as 'P' | 'F';
      }
    });
    return map;
  }, [students, aulas, dbAttendance]);

  const gradesMap = useMemo(() => {
    const map: Record<string, any> = {};
    students.forEach(s => {
      map[s.id] = {
        p: null, ti: null, tg: null, s: null, cq: null, o: null, rec: null,
        total_aulas: aulas.length,
        total_faltas: 0,
        frequencia_percent: null,
        media_parcial: null,
        media_final: null,
        resultado_final: 'SEM_LANCAMENTO'
      };
    });
    dbGrades.forEach((g: any) => {
      if (map[g.aluno_id]) {
        map[g.aluno_id] = {
          p: g.nota_p === null ? null : parseFloat(g.nota_p),
          ti: g.nota_ti === null ? null : parseFloat(g.nota_ti),
          tg: g.nota_tg === null ? null : parseFloat(g.nota_tg),
          s: g.nota_s === null ? null : parseFloat(g.nota_s),
          cq: g.nota_cq === null ? null : parseFloat(g.nota_cq),
          o: g.nota_o === null ? null : parseFloat(g.nota_o),
          rec: g.nota_rec !== null ? parseFloat(g.nota_rec) : null,
          total_aulas: parseInt(g.total_aulas || 0),
          total_faltas: parseInt(g.total_faltas || 0),
          frequencia_percent: g.frequencia_percent === null ? null : parseFloat(g.frequencia_percent),
          media_parcial: g.media_parcial === null ? null : parseFloat(g.media_parcial),
          media_final: g.media_final === null ? null : parseFloat(g.media_final),
          resultado_final: g.resultado_final || 'SEM_LANCAMENTO'
        };
      }
    });

    return map;
  }, [students, aulas, dbGrades]);

  const praticasMap = useMemo(() => {
    const map: Record<string, string> = {};
    aulas.forEach(a => {
      map[a.id] = 'Aula expositiva / Prática padrão';
    });
    dbPraticas.forEach((p: any) => {
      map[p.aula_id] = p.pratica_pedagogica;
    });
    return map;
  }, [aulas, dbPraticas]);

  // Estados locais para inputs que necessitam de digitação livre (salvamento onBlur)
  const [localGrades, setLocalGrades] = useState<Record<string, any>>({});
  const [localPraticas, setLocalPraticas] = useState<Record<string, string>>({});
  const [localObservacoes, setLocalObservacoes] = useState('');

  useEffect(() => {
    if (Object.keys(gradesMap).length > 0) {
      setLocalGrades(prev => {
        const next = { ...gradesMap };
        return next;
      });
    }
  }, [gradesMap]);

  useEffect(() => {
    setLocalPraticas(praticasMap);
  }, [praticasMap]);

  useEffect(() => {
    if (dbObservacoes !== undefined) {
      setLocalObservacoes(dbObservacoes);
    }
  }, [dbObservacoes]);

  const toggleAttendanceMutation = useToggleDiarioAttendanceMutation(turma.id, disciplina.id);
  const saveStudentGradesMutation = useSaveDiarioGradesMutation(turma.id, disciplina.id);
  const savePraticaMutation = useSaveDiarioPraticaMutation(turma.id, disciplina.id);
  const saveObservacoesMutation = useSaveDiarioObservacoesMutation(turma.id, disciplina.id);

  // Funções controladoras locais
  const handleToggleAttendance = (studentId: string, classId: string) => {
    const current = attendanceMap[studentId]?.[classId] || null;
    const nextStatus = current === null ? 'P' : current === 'P' ? 'F' : 'P';
    toggleAttendanceMutation.mutate({ aulaId: classId, alunoId: studentId, nextStatus });
  };

  const handleLocalGradeChange = (studentId: string, field: string, value: string) => {
    setLocalGrades(prev => {
      const studentFields = prev[studentId] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
      
      let numeric: number | null = parseFloat(value);
      if (isNaN(numeric)) {
        numeric = field === 'rec' ? null : 0;
      } else {
        numeric = Math.min(10, Math.max(0, numeric)); // limita entre 0 e 10
      }
      
      return {
        ...prev,
        [studentId]: {
          ...studentFields,
          [field]: numeric
        }
      };
    });
  };

  const handleSaveGrade = (studentId: string) => {
    const fields = localGrades[studentId] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
    saveStudentGradesMutation.mutate({
      alunoId: studentId,
      fields: {
        ...fields,
        p: fields.p ?? 0,
        ti: fields.ti ?? 0,
        tg: fields.tg ?? 0,
        s: fields.s ?? 0,
        cq: fields.cq ?? 0,
        o: fields.o ?? 0,
      },
    });
  };

  const handleSave = () => {
    toast.success("Sucesso", "Todas as alterações foram sincronizadas em tempo real com o banco de dados.");
  };

  const handleDownloadPdf = async () => {
    const container = printDocumentRef.current;
    if (!container) return;

    setDownloadingPdf(true);
    try {
      if (diarioTemplate?.imprimirValidacaoContracapa) {
        const validationCode = `DIA-${(turma.codigo || turma.nome || 'TURMA').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase()}-${disciplina.id.slice(0, 8).toUpperCase()}`;
        await supabase
          .from('documentos_templates')
          .upsert({
            id: `validation_${validationCode}`,
            conteudo: {
              type: 'diario_classe',
              status: 'VALID',
              courseName: turma.cursoNome || 'Curso não informado',
              className: turma.nome || turma.codigo || 'Turma não informada',
              unitName: disciplina.nome,
              issuedAt: new Date().toISOString(),
              studentName: 'Diário de Classe Oficial',
              studentCpf: null,
              studentBirthDate: null,
              studentMotherName: null,
              enrollmentNumber: null,
            },
            updated_at: new Date().toISOString(),
          });
      }

      const images = Array.from(container.querySelectorAll('img')) as HTMLImageElement[];
      await Promise.all(images.map((image) => image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          })));

      const pages = Array.from(container.querySelectorAll('.diario-print-page')) as HTMLElement[];
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      for (let index = 0; index < pages.length; index += 1) {
        const canvas = await html2canvas(pages[index], {
          scale: 1.65,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
        });
        if (index > 0) pdf.addPage('a4', 'landscape');
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
      }

      const fileName = `diario-${turma.codigo || turma.nome || 'turma'}-${disciplina.nome}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9-_]+/g, '-')
        .toLowerCase();
      pdf.save(`${fileName}.pdf`);
    } catch (error: any) {
      console.error('Erro ao gerar PDF do diário:', error);
      toast.error('Erro no PDF', error.message || 'Não foi possível gerar o diário.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const calculateStudentStats = (studentId: string) => {
    const g = gradesMap[studentId] || {
      total_faltas: 0,
      frequencia_percent: null,
      media_parcial: null,
      media_final: null,
      resultado_final: 'SEM_LANCAMENTO'
    };
    return {
      faltas: g.total_faltas,
      frequencia: g.frequencia_percent,
      mediaParcial: g.media_parcial,
      mediaFinal: g.media_final,
      resultado: g.resultado_final
    };
  };

  const loading = loadingStudents || loadingAulas || loadingAttendance || loadingGrades || loadingPraticas || loadingObservacoes;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="animate-spin text-[#001a33]" size={32} />
        <span className="text-slate-500 font-bold ml-3">Carregando detalhes do diário...</span>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn max-w-[1400px] mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors bg-white shrink-0 shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Diário de Classe</h3>
            <p className="text-sm font-bold text-slate-500">{disciplina.nome} • {moduloNome}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 shadow-sm disabled:opacity-60">
             {downloadingPdf ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Baixar PDF
           </button>
           <button onClick={() => window.print()} className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 flex items-center gap-2 shadow-sm">
             <Printer size={16} /> Imprimir Diário
           </button>
           <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 flex items-center gap-2 shadow-md">
             <Save size={16} /> Salvar Alterações
           </button>
        </div>
      </div>

      {/* Diary Header Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Curso</p>
               <p className="font-bold text-slate-700">{turma.cursoNome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Módulo</p>
               <p className="font-bold text-slate-700">{moduloNome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Disciplina</p>
               <p className="font-bold text-slate-700">{disciplina.nome}</p>
            </div>
            <div>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Professor(a)</p>
               <p className={`font-bold ${disciplina.professor === 'Não atribuído' ? 'text-rose-500' : 'text-slate-700'}`}>
                 {disciplina.professor}
               </p>
            </div>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-6 bg-slate-200/50 p-1.5 rounded-2xl border border-slate-100">
         <button 
            onClick={() => setActiveTab('frequencia')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'frequencia' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calendar size={18} /> Frequência
         </button>
         <button 
            onClick={() => setActiveTab('resultado')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'resultado' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <Calculator size={18} /> Notas e Resultados
         </button>
         <button 
            onClick={() => setActiveTab('conteudo')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'conteudo' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Conteúdo das Aulas
         </button>
         <button 
            onClick={() => setActiveTab('observacoes')}
            className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider transition-all ${
               activeTab === 'observacoes' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
         >
            <BookOpen size={18} /> Observações
         </button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px] mb-8">
         <div className="flex-1">
          
          {/* Aba de Frequência */}
          {activeTab === 'frequencia' && (
            <div>
              {students.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
                  <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para registrar frequência.</p>
                </div>
              ) : aulas.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <Calendar size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
                  <p className="text-xs text-slate-500 mt-1 max-w-md">Adicione aulas no cronograma da disciplina na aba "Grade & Profs" para lançar a folha de presença.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr>
                            <th className="p-4 border-b border-slate-200 border-r w-12 text-center text-xs font-black text-slate-400">Nº</th>
                            <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase">Nome do Aluno</th>
                            <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 border-r" colSpan={aulas.length}>AULAS LANÇADAS</th>
                            <th className="p-4 border-b border-slate-200 text-center text-xs font-black text-slate-400 w-32">TOTAL FALTAS</th>
                         </tr>
                         <tr>
                            <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                            <th className="p-2 border-b border-slate-200 border-r bg-slate-50"></th>
                            {aulas.map((aula) => (
                               <th key={aula.id} className="p-2 border-b border-slate-200 border-r bg-slate-50 text-center text-[10px] font-bold text-slate-600 min-w-[65px] truncate" title={aula.titulo}>
                                 {aula.dataLabel}
                               </th>
                            ))}
                            <th className="p-2 border-b border-slate-200 bg-slate-50 text-center"></th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {students.map((aluno, idx) => {
                            const stats = calculateStudentStats(aluno.id);
                            return (
                               <tr key={aluno.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="p-3 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                  <td className="p-3 border-r border-slate-100 font-bold text-sm text-[#001a33] truncate max-w-[250px]">{aluno.nome}</td>
                                  {aulas.map((aula) => {
                                  const attendanceStatus = attendanceMap[aluno.id]?.[aula.id] || null;
                                  const foiFalta = attendanceStatus === 'F';
                                  const foiPresente = attendanceStatus === 'P';
                                     return (
                                        <td key={aula.id} className="p-2 border-r border-slate-100 text-center">
                                           <button 
                                             onClick={() => handleToggleAttendance(aluno.id, aula.id)}
                                             className={`w-8 h-8 rounded-lg flex items-center justify-center mx-auto text-xs font-bold transition-all ${
                                                foiFalta
                                                   ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                                                   : foiPresente
                                                     ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100'
                                                     : 'bg-slate-50 text-slate-400 border border-slate-200 hover:bg-slate-100'
                                             }`}
                                           >
                                               {foiFalta ? 'F' : foiPresente ? 'P' : '—'}
                                           </button>
                                        </td>
                                     );
                                  })}
                                  <td className="p-3 text-center">
                                     <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${stats.faltas > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {stats.faltas}
                                     </span>
                                  </td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
              )}
            </div>
          )}

          {/* Aba de Notas / Resultados */}
          {activeTab === 'resultado' && (
            <div>
              {students.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <AlertCircle size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhum aluno matriculado nesta turma.</p>
                  <p className="text-xs text-slate-500 mt-1">Matricule alunos na aba "Alunos" para lançar notas.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                   <table className="w-full text-center border-collapse">
                      <thead>
                         <tr>
                            <th className="p-4 border-b border-slate-200 border-r w-12 text-xs font-black text-slate-400" rowSpan={2}>Nº</th>
                            <th className="p-4 border-b border-slate-200 border-r min-w-[250px] text-xs font-black text-[#001a33] uppercase text-left" rowSpan={2}>Nome do Aluno</th>
                            <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-blue-700 bg-blue-50/50" colSpan={6}>INSTRUMENTOS AVALIATIVOS (0.0 a 10.0)</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA PARCIAL</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>REC</th>
                            <th className="p-4 border-b border-slate-200 border-r text-[10px] font-black text-slate-500 bg-slate-50" rowSpan={2}>MÉDIA FINAL</th>
                            <th className="p-2 border-b border-slate-200 border-r text-xs font-black text-amber-700 bg-amber-50/50" colSpan={2}>FREQUÊNCIA</th>
                            <th className="p-4 border-b border-slate-200 text-xs font-black text-[#001a33] uppercase" rowSpan={2}>RESULTADO FINAL</th>
                         </tr>
                         <tr>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Prova">P</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Trabalho Individual">TI</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Trabalho em Grupo">TG</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Seminário">S</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Critérios Qualitativos">CQ</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-12" title="Outros">O</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">FALTAS</th>
                            <th className="p-2 border-b border-slate-200 border-r text-[10px] uppercase font-bold text-slate-400 w-16">% PRES.</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {students.map((aluno, idx) => {
                            const stats = calculateStudentStats(aluno.id);
                            const isCredited = stats.resultado === 'APROVEITADO';
                            const studentGrades = localGrades[aluno.id] || { p: 0, ti: 0, tg: 0, s: 0, cq: 0, o: 0, rec: null };
                            return (
                               <tr key={aluno.id} className={`transition-colors ${isCredited ? 'bg-violet-50/60' : 'hover:bg-slate-50/50'}`}>
                                  <td className="p-2 text-center border-r border-slate-100 text-slate-400 font-mono text-xs">{String(idx + 1).padStart(2, '0')}</td>
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-[#001a33] text-left truncate max-w-[200px]">{aluno.nome}</td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.p ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'p', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.ti ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'ti', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.tg ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'tg', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.s ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 's', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.cq ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'cq', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-slate-700 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.o ?? ''}
                                      disabled={isCredited}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'o', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs bg-slate-50">
                                    {stats.mediaParcial === null ? '—' : stats.mediaParcial.toFixed(1)}
                                  </td>
                                  <td className="p-1 border-r border-slate-100">
                                    <input 
                                      type="number" min="0" max="10" step="0.1" 
                                      className="w-full text-center text-xs font-bold text-blue-600 bg-transparent outline-none focus:bg-blue-50/50 rounded py-1" 
                                      value={studentGrades.rec === null || studentGrades.rec === undefined ? '' : studentGrades.rec} 
                                      placeholder="—"
                                      disabled={isCredited || (stats.mediaParcial !== null && stats.mediaParcial >= 6)}
                                      onChange={(e) => handleLocalGradeChange(aluno.id, 'rec', e.target.value)}
                                      onBlur={() => handleSaveGrade(aluno.id)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    />
                                  </td>
                                  <td className="p-2 border-r border-slate-100 font-black text-sm bg-slate-50 text-[#001a33]">
                                    {stats.mediaFinal === null ? '—' : stats.mediaFinal.toFixed(1)}
                                  </td>
                                  
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs text-red-600">{stats.faltas}</td>
                                  <td className="p-2 border-r border-slate-100 font-bold text-xs">
                                    {stats.frequencia === null ? '—' : `${stats.frequencia}%`}
                                  </td>
                                  
                                  <td className="p-2">
                                     <span className={`inline-block px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                       ['APROVADO', 'APROVEITADO'].includes(stats.resultado)
                                         ? 'bg-emerald-100 text-emerald-800'
                                         : stats.resultado === 'SEM_LANCAMENTO'
                                           ? 'bg-slate-100 text-slate-500'
                                           : 'bg-red-100 text-red-800'
                                     }`}>
                                        {stats.resultado.replaceAll('_', ' ')}
                                     </span>
                                  </td>
                               </tr>
                            );
                         })}
                      </tbody>
                   </table>
                </div>
              )}
              
              <div className="p-6 bg-slate-50 border-t border-slate-200">
                 <p className="text-xs font-bold text-slate-500 mb-2">LEGENDA - Instrumentos Avaliativos:</p>
                 <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-medium text-slate-600">
                    <span><strong>P</strong> - Prova Escrita</span>
                    <span><strong>TI</strong> - Trabalho Individual</span>
                    <span><strong>TG</strong> - Trabalho em Grupo</span>
                    <span><strong>S</strong> - Seminário</span>
                    <span><strong>CQ</strong> - Critérios Qualitativos (assiduidade, participação, etc.)</span>
                    <span><strong>O</strong> - Outros / Atividades Práticas</span>
                    <span><strong>REC</strong> - Recuperação Semestral</span>
                 </div>
              </div>
            </div>
          )}
          
          {/* Aba de Conteúdo Programático */}
          {activeTab === 'conteudo' && (
            <div className="p-6">
              {aulas.length === 0 ? (
                <div className="py-20 text-center text-slate-400 flex flex-col items-center">
                  <BookOpen size={48} className="mb-4 opacity-50 text-slate-300" />
                  <p className="font-bold text-sm">Nenhuma aula registrada nesta disciplina.</p>
                  <p className="text-xs text-slate-500 mt-1">Adicione aulas e sua carga horária na aba "Grade & Profs".</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="bg-slate-50">
                            <th className="p-4 border-b border-slate-200 border-r w-32 text-xs font-black text-slate-500 uppercase">DIA/MÊS</th>
                            <th className="p-4 border-b border-slate-200 border-r text-xs font-black text-[#001a33] uppercase">AULA / CONTEÚDO PROGRAMÁTICO</th>
                            <th className="p-4 border-b border-slate-200 text-xs font-black text-slate-500 uppercase">PRÁTICA PEDAGÓGICA REGISTRADA</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                         {aulas.map((aula, idx) => (
                            <tr key={aula.id} className="hover:bg-slate-50/50 transition-colors">
                               <td className="p-3 border-r border-slate-100 font-bold text-sm text-slate-700">
                                  {aula.dataLabel}
                               </td>
                               <td className="p-3 border-r border-slate-100">
                                  <div className="text-sm font-bold text-[#001a33]">{aula.titulo}</div>
                                  <div className="text-[10px] text-slate-500 font-medium font-mono mt-0.5">Carga horária: {aula.cargaHoraria}H</div>
                                </td>
                               <td className="p-3">
                                  <textarea 
                                    className="w-full bg-transparent outline-none text-xs text-slate-700 resize-none h-12 focus:bg-blue-50/20 p-1.5 rounded border border-transparent focus:border-slate-200" 
                                    value={localPraticas[aula.id] || ''}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setLocalPraticas(prev => ({ ...prev, [aula.id]: text }));
                                    }}
                                    onBlur={(e) => savePraticaMutation.mutate({ aulaId: aula.id, text: e.target.value })}
                                    placeholder="Descreva a prática pedagógica executada..."
                                  ></textarea>
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
              )}
            </div>
          )}

          {/* Aba de Observações */}
          {activeTab === 'observacoes' && (
            <div className="p-6">
               <div className="space-y-4 max-w-4xl">
                  <div>
                     <label className="text-xs font-bold tracking-wider uppercase text-slate-500 mb-2 block">Anotações do Docente:</label>
                     <textarea 
                        className="w-full rounded-2xl border border-slate-200 p-5 text-sm font-medium text-slate-700 min-h-[300px] outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all bg-slate-50 focus:bg-white resize-none" 
                        value={localObservacoes}
                        onChange={(e) => setLocalObservacoes(e.target.value)}
                        onBlur={(e) => saveObservacoesMutation.mutate(e.target.value)}
                        placeholder="Digite aqui as observações gerais sobre a unidade educacional, ocorrências em sala, rendimento da turma, etc..."
                     ></textarea>
                  </div>
               </div>
            </div>
          )}
         </div>

         {/* Footer / Signatures - Attached to the bottom of the card */}
         <div className="bg-slate-50 p-6 md:px-8 border-t border-slate-200 mt-auto">
            <div className="flex flex-col xl:flex-row justify-between items-center gap-8 text-xs font-bold text-slate-500 uppercase tracking-widest">
               <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
                  <div>Carga Horária Total: <span className="text-slate-700">{disciplina.cargaHoraria}H</span></div>
                  <div>Horas Lançadas: <span className="text-slate-700">{disciplina.horasRealizadas}H</span></div>
                  <div>Encerrado em: <span className="text-slate-700 border-b border-dashed border-slate-400 px-8 text-transparent">____/____/_____</span></div>
               </div>
               <div className="flex flex-wrap items-center gap-12 mt-4 xl:mt-0">
                  <div className="text-center">
                     <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
                     <p>Assinatura Professor(a)</p>
                  </div>
                  <div className="text-center">
                     <div className="w-56 border-b border-slate-400 mb-2 h-4"></div>
                     <p>Assinatura Coordenador(a)</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
      {diarioTemplate && (
        <div className="diario-print-host fixed left-[-20000px] top-0 z-[-1]">
          <DiarioPrintDocument
            ref={printDocumentRef}
            template={diarioTemplate}
            turma={turma}
            disciplina={disciplina}
            moduloNome={moduloNome}
            students={students}
            aulas={aulas}
            attendanceMap={attendanceMap}
            gradesMap={gradesMap}
            praticasMap={praticasMap}
            observacoes={localObservacoes}
            watermark={watermark}
            diretorSigUrl={diarioTemplate.diretorAssinaturaRole ? centralSignatures?.[diarioTemplate.diretorAssinaturaRole] : null}
            secretarioSigUrl={diarioTemplate.secretarioAssinaturaRole ? centralSignatures?.[diarioTemplate.secretarioAssinaturaRole] : null}
          />
        </div>
      )}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default DiarioClasse;
