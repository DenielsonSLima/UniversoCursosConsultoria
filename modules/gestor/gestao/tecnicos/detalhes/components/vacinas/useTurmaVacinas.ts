import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../../lib/supabase';
import { Turma } from '../../../../gestao.types';
import {
  getVacinaDoseKey,
  normalizeCursoVacinasConfig,
} from '../../../../../../shared/vacinas/vacinas.config';
import { alunoVacinasService } from '../../../../../../shared/vacinas/vacinas.service';
import {
  AlunoVacinaRegistro,
  CursoVacinaRequirement,
  CursoVacinasConfig,
  VacinaDoseRequirement,
  VacinaStatus,
} from '../../../../../../shared/vacinas/vacinas.types';

export interface RequiredVacinaDose {
  vacina: CursoVacinaRequirement;
  dose: VacinaDoseRequirement;
  doseKey: string;
}

export interface TurmaVacinaStudentRow {
  matricula: any;
  aluno: any;
  pendentes: RequiredVacinaDose[];
  liberado: boolean;
  aprovadas: number;
  totalDoses: number;
}

export interface TurmaVacinaStudentGroup {
  id: string;
  title: string;
  rows: TurmaVacinaStudentRow[];
}

const loadTurmaVacinas = async (turma: Turma) => {
  const [cursoResult, matriculasResult] = await Promise.all([
    supabase
      .from('cursos')
      .select('id, nome, vacinas_config')
      .eq('id', turma.cursoId)
      .single(),
    supabase
      .from('matriculas')
      .select('id, aluno_id, data_matricula, status, parceiros(id, nome, cpf_cnpj, nome_mae, data_nascimento, polo_id)')
      .eq('turma_id', turma.id)
      .order('data_matricula', { ascending: true }),
  ]);

  if (cursoResult.error) throw cursoResult.error;
  if (matriculasResult.error) throw matriculasResult.error;

  const config = normalizeCursoVacinasConfig(
    cursoResult.data?.vacinas_config,
    cursoResult.data?.nome,
  );
  const matriculas = matriculasResult.data || [];
  const alunoIds = matriculas.map((matricula: any) => matricula.aluno_id).filter(Boolean);
  const registrosResult = alunoIds.length > 0
    ? await supabase
      .from('aluno_vacinas')
      .select('*')
      .eq('curso_id', turma.cursoId)
      .in('aluno_id', alunoIds)
    : { data: [], error: null };

  if (registrosResult.error) throw registrosResult.error;
  return {
    config,
    matriculas,
    registros: await alunoVacinasService.hydrateRegistros(registrosResult.data || []),
  };
};

interface UseTurmaVacinasCallbacks {
  onStatusError?: (error: unknown) => void;
  onStatusSuccess?: () => void;
}

export const useTurmaVacinas = (
  turma: Turma,
  callbacks: UseTurmaVacinasCallbacks = {},
) => {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['turma-vacinas', turma.id, turma.cursoId] as const,
    [turma.cursoId, turma.id],
  );
  const query = useQuery({
    queryKey,
    queryFn: () => loadTurmaVacinas(turma),
  });

  useEffect(() => {
    if (!turma.id) return;
    const channel = supabase
      .channel(`turma_vacinas_${turma.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'aluno_vacinas', filter: `turma_id=eq.${turma.id}` },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, queryKey, turma.id]);

  const registrosMap = useMemo(() => {
    const map = new Map<string, AlunoVacinaRegistro>();
    (query.data?.registros || []).forEach((row) => {
      map.set(
        `${row.alunoId}:${getVacinaDoseKey(row.cursoId, row.vacinaCodigo, row.doseNumero)}`,
        row,
      );
    });
    return map;
  }, [query.data?.registros]);

  const requiredDoses = useMemo<RequiredVacinaDose[]>(() => (
    (query.data?.config.vacinas || []).flatMap((vacina) => (
      vacina.obrigatoria
        ? vacina.doses.map((dose) => ({
          vacina,
          dose,
          doseKey: getVacinaDoseKey(turma.cursoId, vacina.codigo, dose.numero),
        }))
        : []
    ))
  ), [query.data?.config.vacinas, turma.cursoId]);

  const studentRows = useMemo<TurmaVacinaStudentRow[]>(() => (
    (query.data?.matriculas || []).map((matricula: any) => {
      const aluno = Array.isArray(matricula.parceiros) ? matricula.parceiros[0] : matricula.parceiros;
      const pendentes = requiredDoses.filter(({ doseKey }) => (
        registrosMap.get(`${aluno?.id}:${doseKey}`)?.status !== 'aprovado'
      ));
      return {
        matricula,
        aluno,
        pendentes,
        liberado: pendentes.length === 0,
        aprovadas: Math.max(0, requiredDoses.length - pendentes.length),
        totalDoses: requiredDoses.length,
      };
    })
  ), [query.data?.matriculas, registrosMap, requiredDoses]);

  const studentGroups = useMemo<TurmaVacinaStudentGroup[]>(() => ([
    { id: 'pendentes', title: 'Alunos com pendências', rows: studentRows.filter((row) => !row.liberado) },
    { id: 'liberados', title: 'Alunos liberados', rows: studentRows.filter((row) => row.liberado) },
  ].filter((group) => group.rows.length > 0)), [studentRows]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status, observacao }: { id: string; status: VacinaStatus; observacao?: string }) => (
      alunoVacinasService.updateStatus(id, status, observacao)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['turma-estagio-vacinas-resumo', turma.id, turma.cursoId] });
      callbacks.onStatusSuccess?.();
    },
    onError: callbacks.onStatusError,
  });

  return {
    ...query,
    config: query.data?.config as CursoVacinasConfig | undefined,
    registrosMap,
    requiredDoses,
    studentRows,
    studentGroups,
    statusMutation,
  };
};
