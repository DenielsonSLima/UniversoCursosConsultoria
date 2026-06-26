import React from 'react';
import { BookOpen, CheckCircle2, GraduationCap, Layers3, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';

interface Props {
  alunoId: string;
}

const ParceiroAlunoCursos: React.FC<Props> = ({ alunoId }) => {
  const { data: courses = [], isLoading } = useQuery<any[]>({
    queryKey: ['parceiro', alunoId, 'cursos-consolidados'],
    queryFn: async () => {
      const { data: enrollments, error } = await supabase
        .from('matriculas')
        .select(`
          id, status, data_matricula,
          turmas(
            id, nome, codigo, turno,
            cursos(id, nome, modalidade, carga_horaria),
            polos(nome)
          )
        `)
        .eq('aluno_id', alunoId)
        .order('data_matricula', { ascending: false });
      if (error) throw error;

      const { data: credits, error: creditsError } = await supabase
        .from('matricula_aproveitamentos')
        .select('matricula_id, disciplina_id')
        .in('matricula_id', (enrollments || []).map((item) => item.id));
      if (creditsError) throw creditsError;

      const grouped = new Map<string, any>();
      (enrollments || []).forEach((enrollment: any) => {
        const course = enrollment.turmas?.cursos;
        if (!course) return;
        const current = grouped.get(course.id) || {
          ...course,
          matriculas: [],
          aproveitamentos: 0,
        };
        current.matriculas.push(enrollment);
        current.aproveitamentos += (credits || []).filter((credit) => credit.matricula_id === enrollment.id).length;
        grouped.set(course.id, current);
      });
      return Array.from(grouped.values());
    },
    enabled: !!alunoId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="border-b border-slate-100 pb-5">
        <div className="flex items-center gap-2 text-blue-600">
          <BookOpen size={20} />
          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Visão acadêmica consolidada</span>
        </div>
        <h3 className="mt-2 text-xl font-black uppercase text-[#001a33]">Cursos do aluno</h3>
        <p className="mt-1 text-xs text-slate-500">
          Aqui o curso aparece uma vez. Trocas de turma, trancamentos e retornos ficam na aba Matrículas.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {courses.map((course) => {
          const active = course.matriculas.find((item: any) => item.status === 'ATIVO');
          const concluded = course.matriculas.some((item: any) => item.status === 'CONCLUIDO');
          return (
            <article key={course.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600"><GraduationCap size={22} /></div>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${concluded ? 'bg-emerald-50 text-emerald-700' : active ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                  {concluded ? 'Concluído' : active ? 'Em andamento' : 'Histórico'}
                </span>
              </div>
              <h4 className="mt-5 text-lg font-black text-[#001a33]">{course.nome}</h4>
              <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{course.modalidade} · {course.carga_horaria || 0}h</p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <Layers3 size={14} className="text-slate-400" />
                  <p className="mt-2 text-xl font-black text-[#001a33]">{course.matriculas.length}</p>
                  <span className="text-[9px] font-black uppercase text-slate-400">Vínculos em turmas</span>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <p className="mt-2 text-xl font-black text-[#001a33]">{course.aproveitamentos}</p>
                  <span className="text-[9px] font-black uppercase text-slate-400">Aproveitamentos</span>
                </div>
              </div>

              {active && (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                  Turma atual: {active.turmas?.nome} · {active.turmas?.polos?.nome}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!courses.length && <p className="py-16 text-center text-sm text-slate-400">Nenhum curso registrado para este aluno.</p>}
    </div>
  );
};

export default ParceiroAlunoCursos;
