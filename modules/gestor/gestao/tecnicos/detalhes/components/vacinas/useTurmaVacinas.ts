import { useEffect, useMemo } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const [cursoResult, matriculasResult, registrosResult] = await Promise.all([
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
    supabase
      .from('aluno_vacinas')
      .select('id, aluno_id, curso_id, matricula_id, turma_id, vacina_codigo, vacina_nome, dose_numero, dose_label, data_aplicacao, lote, local_aplicacao, arquivo_url, status, origem, observacao, validado_em, updated_at')
      .eq('turma_id', turma.id)
      .eq('curso_id', turma.cursoId),
  ]);

  if (cursoResult.error) throw cursoResult.error;
  if (matriculasResult.error) throw matriculasResult.error;
  if (registrosResult.error) throw registrosResult.error;

  const config = normalizeCursoVacinasConfig(
    cursoResult.data?.vacinas_config,
    cursoResult.data?.nome,
  );
  const matriculas = matriculasResult.data || [];
  return {
    config,
    matriculas,
    registros: alunoVacinasService.mapRegistros(registrosResult.data || []),
  };
};

export const turmaVacinasKeys = {
  turma: (turmaId: string, cursoId: string) => ['turma-vacinas', turmaId, cursoId] as const,
};

export const turmaVacinasQueryOptions = (turma: Turma) => queryOptions({
  queryKey: turmaVacinasKeys.turma(turma.id, turma.cursoId),
  queryFn: () => loadTurmaVacinas(turma),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
});

interface UseTurmaVacinasCallbacks {
  onStatusError?: (error: unknown) => void;
  onStatusSuccess?: () => void;
}

export const useTurmaVacinas = (
  turma: Turma,
  callbacks: UseTurmaVacinasCallbacks = {},
) => {
  const queryClient = useQueryClient();
  const queryOptionsConfig = useMemo(() => turmaVacinasQueryOptions(turma), [turma.cursoId, turma.id]);
  const queryKey = queryOptionsConfig.queryKey;
  const query = useQuery(queryOptionsConfig);

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
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, (current: Awaited<ReturnType<typeof loadTurmaVacinas>> | undefined) => {
        if (!current) return current;
        return {
          ...current,
          registros: current.registros.map((registro) => (registro.id === updated.id ? updated : registro)),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['turma-estagio-vacinas-resumo', turma.id, turma.cursoId] });
      callbacks.onStatusSuccess?.();
    },
    onError: callbacks.onStatusError,
  });

  const getArquivoUrl = (registro: AlunoVacinaRegistro) => {
    if (!registro.arquivoPath) return Promise.resolve(null);
    return queryClient.fetchQuery({
      queryKey: ['vacina-arquivo-url', registro.id, registro.updatedAt || 'sem-versao'],
      queryFn: () => alunoVacinasService.getArquivoUrl(registro.arquivoPath),
      staleTime: 4 * 60_000,
      gcTime: 5 * 60_000,
    });
  };

  return {
    ...query,
    config: query.data?.config as CursoVacinasConfig | undefined,
    registrosMap,
    requiredDoses,
    studentRows,
    studentGroups,
    statusMutation,
    getArquivoUrl,
  };
};
