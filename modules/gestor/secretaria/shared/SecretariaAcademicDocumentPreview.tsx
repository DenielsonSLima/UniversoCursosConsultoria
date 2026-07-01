import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import { supabase } from '../../../../lib/supabase';
import { formatMatricula } from '../../../../lib/academicUtils';
import { sanitizedHtml } from '../../../../lib/htmlSanitizer';
import DocumentHeader from '../../components/DocumentHeader';
import { boletimService } from '../../cadastros/modelos-documentos/boletim/boletim.service';
import { atestadoConclusaoService } from '../../cadastros/modelos-documentos/atestado-conclusao/atestado-conclusao.service';

interface Props {
  matriculaId: string;
  type: 'boletim_tecnico' | 'atestado_conclusao_tecnico';
}

interface AcademicRow {
  modulo: string;
  disciplina: string;
  cargaHoraria: number;
  media: number | null;
  frequencia: number | null;
  situacao: string;
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Não informada';
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
};

const SecretariaAcademicDocumentPreview: React.FC<Props> = ({ matriculaId, type }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['secretaria', 'academic-document-preview', type, matriculaId],
    queryFn: async () => {
      const { data: matricula, error: matriculaError } = await supabase
        .from('matriculas')
        .select(`
          id, aluno_id, turma_id, status, data_matricula,
          parceiros!inner(nome, cpf_cnpj, rg),
          turmas!inner(
            nome, codigo, data_previsao_termino, polo_id,
            cursos!inner(id, nome, carga_horaria, modalidade),
            polos!inner(*)
          )
        `)
        .eq('id', matriculaId)
        .single();
      if (matriculaError) throw matriculaError;

      const turma: any = matricula.turmas;
      const aluno: any = matricula.parceiros;

      const [
        { data: grade, error: gradeError },
        { data: notas, error: notasError },
        { data: aulas, error: aulasError },
        { data: frequencias, error: frequenciasError },
        { data: certificado },
      ] = await Promise.all([
        supabase
          .from('turmas_disciplinas')
          .select('disciplina_id, concluida, disciplinas!inner(nome, carga_horaria, created_at, modulos!inner(nome, created_at)), periodos_letivos(ordem)')
          .eq('turma_id', matricula.turma_id),
        supabase
          .from('diario_notas')
          .select('*')
          .eq('turma_id', matricula.turma_id)
          .eq('aluno_id', matricula.aluno_id),
        supabase
          .from('aulas_turma')
          .select('id, disciplina_id')
          .eq('turma_id', matricula.turma_id),
        supabase
          .from('diario_frequencia')
          .select('disciplina_id, status')
          .eq('turma_id', matricula.turma_id)
          .eq('aluno_id', matricula.aluno_id),
        supabase
          .from('certificados_academicos')
          .select('data_conclusao')
          .eq('matricula_id', matriculaId)
          .maybeSingle(),
      ]);
      if (gradeError) throw gradeError;
      if (notasError) throw notasError;
      if (aulasError) throw aulasError;
      if (frequenciasError) throw frequenciasError;

      const notesByDiscipline = new Map((notas || []).map((note: any) => [note.disciplina_id, note]));
      const classesByDiscipline = new Map<string, number>();
      (aulas || []).forEach((lesson: any) => {
        classesByDiscipline.set(lesson.disciplina_id, (classesByDiscipline.get(lesson.disciplina_id) || 0) + 1);
      });
      const absencesByDiscipline = new Map<string, number>();
      const recordsByDiscipline = new Map<string, number>();
      (frequencias || []).forEach((record: any) => {
        recordsByDiscipline.set(record.disciplina_id, (recordsByDiscipline.get(record.disciplina_id) || 0) + 1);
        if (record.status === 'F') {
          absencesByDiscipline.set(record.disciplina_id, (absencesByDiscipline.get(record.disciplina_id) || 0) + 1);
        }
      });

      const rows: AcademicRow[] = (grade || [])
        .sort((a: any, b: any) => {
          const period = Number(a.periodos_letivos?.ordem || 999) - Number(b.periodos_letivos?.ordem || 999);
          if (period !== 0) return period;
          const moduleOrder = String(a.disciplinas?.modulos?.created_at || '').localeCompare(String(b.disciplinas?.modulos?.created_at || ''));
          if (moduleOrder !== 0) return moduleOrder;
          return String(a.disciplinas?.created_at || '').localeCompare(String(b.disciplinas?.created_at || ''));
        })
        .map((item: any) => {
          const note: any = notesByDiscipline.get(item.disciplina_id);
          const partial = note
            ? Math.min(10, ((Number(note.nota_p) + Number(note.nota_ti) + Number(note.nota_tg) + Number(note.nota_s)) / 4) + Number(note.nota_cq) + Number(note.nota_o))
            : null;
          const finalGrade = partial === null
            ? null
            : note?.nota_rec !== null && Number(note.nota_rec) > partial
              ? Number(note.nota_rec)
              : partial;
          const totalClasses = classesByDiscipline.get(item.disciplina_id) || 0;
          const frequencyRecords = recordsByDiscipline.get(item.disciplina_id) || 0;
          const frequency = totalClasses > 0 && frequencyRecords === totalClasses
            ? Math.round(((totalClasses - (absencesByDiscipline.get(item.disciplina_id) || 0)) / totalClasses) * 100)
            : null;
          const situation = finalGrade === null
            ? 'Sem lançamento'
            : frequency !== null && frequency < 75
              ? 'Reprovado por frequência'
              : finalGrade >= 6
                ? 'Aprovado'
                : note?.nota_rec === null
                  ? 'Recuperação'
                  : 'Reprovado';

          return {
            modulo: item.disciplinas?.modulos?.nome || 'Módulo',
            disciplina: item.disciplinas?.nome || 'Disciplina',
            cargaHoraria: Number(item.disciplinas?.carga_horaria || 0),
            media: finalGrade === null ? null : Number(finalGrade.toFixed(1)),
            frequencia: frequency,
            situacao: situation,
          };
        });

      const validGrades = rows.filter((row) => row.media !== null);
      const validFrequencies = rows.filter((row) => row.frequencia !== null);
      const average = validGrades.length
        ? validGrades.reduce((sum, row) => sum + Number(row.media), 0) / validGrades.length
        : null;
      const generalFrequency = validFrequencies.length
        ? validFrequencies.reduce((sum, row) => sum + Number(row.frequencia), 0) / validFrequencies.length
        : null;

      const templateService = type === 'boletim_tecnico' ? boletimService : atestadoConclusaoService;
      const template = await templateService.getTemplate('TECNICO');

      return {
        matricula,
        aluno,
        turma,
        polo: turma.polos,
        rows,
        average,
        generalFrequency,
        completionDate: certificado?.data_conclusao || turma.data_previsao_termino,
        template,
      };
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" /></div>;
  }
  if (isError || !data) {
    return <p className="rounded-2xl bg-rose-50 p-4 text-center text-xs font-bold text-rose-700">Não foi possível montar o preview acadêmico.</p>;
  }

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px">
      <thead><tr style="background:#f1f5f9">
        <th style="border:1px solid #cbd5e1;padding:6px;text-align:left">Módulo</th>
        <th style="border:1px solid #cbd5e1;padding:6px;text-align:left">Disciplina</th>
        <th style="border:1px solid #cbd5e1;padding:6px">CH</th>
        <th style="border:1px solid #cbd5e1;padding:6px">Nota</th>
        <th style="border:1px solid #cbd5e1;padding:6px">Freq.</th>
        <th style="border:1px solid #cbd5e1;padding:6px">Situação</th>
      </tr></thead>
      <tbody>${data.rows.map((row) => `<tr>
        <td style="border:1px solid #cbd5e1;padding:5px">${row.modulo}</td>
        <td style="border:1px solid #cbd5e1;padding:5px">${row.disciplina}</td>
        <td style="border:1px solid #cbd5e1;padding:5px;text-align:center">${row.cargaHoraria}h</td>
        <td style="border:1px solid #cbd5e1;padding:5px;text-align:center">${row.media ?? '—'}</td>
        <td style="border:1px solid #cbd5e1;padding:5px;text-align:center">${row.frequencia === null ? '—' : `${row.frequencia}%`}</td>
        <td style="border:1px solid #cbd5e1;padding:5px;text-align:center">${row.situacao}</td>
      </tr>`).join('')}</tbody>
    </table>`;

  const modules = [...new Set(data.rows.map((row) => row.modulo))].join(', ');
  const status = data.matricula.status === 'CONCLUIDO' ? 'Concluído' : data.matricula.status;
  const replacements: Record<string, string> = {
    '{{ALUNO_NOME}}': data.aluno.nome,
    '{{ALUNO_CPF}}': data.aluno.cpf_cnpj || 'Não informado',
    '{{ALUNO_RG}}': data.aluno.rg || 'Não informado',
    '{{ALUNO_MATRICULA}}': formatMatricula(data.matricula.id, data.matricula.data_matricula, data.turma.polo_id),
    '{{CURSO_NOME}}': data.turma.cursos.nome,
    '{{TURMA_NOME}}': data.turma.nome,
    '{{POLO_NOME}}': data.polo.nome,
    '{{CIDADE_POLO}}': `${data.polo.cidade}/${data.polo.estado}`,
    '{{DATA_ATUAL}}': new Date().toLocaleDateString('pt-BR'),
    '{{DATA_CONCLUSAO}}': formatDate(data.completionDate),
    '{{CARGA_HORARIA_TOTAL}}': String(data.turma.cursos.carga_horaria || 0),
    '{{MODULO_PERIODO}}': modules || 'Sem módulos cadastrados',
    '{{ANO_LETIVO}}': String(new Date().getFullYear()),
    '{{TABELA_BOLETIM_TECNICO}}': tableHtml,
    '{{MEDIA_GERAL}}': data.average === null ? '—' : data.average.toFixed(1),
    '{{FREQUENCIA_GERAL}}': data.generalFrequency === null ? '—' : `${data.generalFrequency.toFixed(0)}%`,
    '{{SITUACAO_ACADEMICA}}': status,
  };

  let parsedText = data.template.textContent;
  Object.entries(replacements).forEach(([token, value]) => {
    parsedText = parsedText.replaceAll(token, value);
  });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Preview do documento</p>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-600">
          <Printer size={13} /> Imprimir
        </button>
      </div>
      <div className="max-h-[680px] overflow-auto rounded-2xl bg-slate-900 p-5">
        <div className="mx-auto min-h-[1050px] w-[794px] bg-white p-14 shadow-2xl relative" style={{ fontFamily: '"Times New Roman", serif' }}>

          {/* Marca d'água */}
          {data.polo?.watermark_url && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
              <img
                src={data.polo.watermark_url}
                alt="Watermark"
                style={{
                  opacity: data.polo.watermark_opacity ?? 0.1,
                  width: `${data.polo.watermark_scale ?? 50}%`,
                  transform: data.polo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none',
                }}
              />
            </div>
          )}

          <DocumentHeader polo={data.polo} orientation="portrait" />
          <h2 className="my-8 text-center text-2xl font-bold uppercase text-[#001a33] underline underline-offset-8">
            {type === 'boletim_tecnico' ? 'Boletim Escolar — Cursos Técnicos' : 'Atestado de Conclusão'}
          </h2>
          <div className="text-justify text-base leading-loose text-black relative z-10" dangerouslySetInnerHTML={sanitizedHtml(parsedText)} />
        </div>
      </div>
    </div>

  );
};

export default SecretariaAcademicDocumentPreview;
