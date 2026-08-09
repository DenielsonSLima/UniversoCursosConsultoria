import { supabase } from '../../../../lib/supabase';
import { escapeHtmlText } from '../../../../lib/htmlSanitizer';
import type {
  AcademicComponentRow,
  AcademicPreviewData,
  AcademicPreviewRpcPayload,
  EmissionLog,
} from './historico-emissoes.types';

const parseDateOrDash = (value?: string | null): string => {
  if (!value) return '—';
  const valueParts = value.split('T')[0]?.split('-') || [];
  return valueParts.length === 3
    ? `${valueParts[2]}/${valueParts[1]}/${valueParts[0]}`
    : value;
};

const sortRows = (rows: AcademicComponentRow[]) =>
  [...rows].sort((a, b) => {
    if (a.moduleOrder !== b.moduleOrder) return a.moduleOrder - b.moduleOrder;
    const aDisciplineOrder = Number.isFinite(a.disciplineOrder)
      ? Number(a.disciplineOrder)
      : Number.MAX_SAFE_INTEGER;
    const bDisciplineOrder = Number.isFinite(b.disciplineOrder)
      ? Number(b.disciplineOrder)
      : Number.MAX_SAFE_INTEGER;
    if (aDisciplineOrder !== bDisciplineOrder) {
      return aDisciplineOrder - bDisciplineOrder;
    }
    return (a.discipline || '').localeCompare(b.discipline || '', 'pt-BR');
  });

const renderFrequency = (value: number | null) =>
  value === null ? '—' : `${value}%`;

const renderGrade = (value: number | null) =>
  value === null ? '—' : Number(value).toFixed(1);

const renderWorkload = (value?: number | null) => {
  const workload = Number(value || 0);
  return workload > 0 ? String(workload) : '—';
};

const buildAcademicTableByDocument = (rows: AcademicComponentRow[]) => {
  if (!rows.length) {
    return '<p style="margin:8px 0;font-size:10px;color:#64748b;">Não há componentes curriculares disponíveis no momento.</p>';
  }

  const rowsByModule = new Map<string, AcademicComponentRow[]>();
  sortRows(rows).forEach((row) => {
    const moduleRows = rowsByModule.get(row.moduleName) || [];
    moduleRows.push(row);
    rowsByModule.set(row.moduleName, moduleRows);
  });

  const moduleBlocks = Array.from(rowsByModule.entries())
    .map(([moduleName, moduleRows]) => {
      const rowLines = moduleRows.map((row) => `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:4px 6px;">${row.discipline}</td>
          <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center">${row.cargaHoraria}h</td>
          <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center">${renderGrade(row.nota)}</td>
          <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center">${renderFrequency(row.frequencia)}</td>
          <td style="border:1px solid #cbd5e1;padding:4px 6px;text-align:center">${row.situacao}</td>
        </tr>`).join('');

      return `
        <tr><td colspan="5" style="background:#f1f5f9;border:1px solid #cbd5e1;padding:5px 8px;font-weight:700">${moduleName}</td></tr>
        ${rowLines}`;
    })
    .join('');

  return `
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:6px">
      <thead><tr style="background:#f8fafc">
        <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:left">Componente Curricular</th>
        <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center">CH</th>
        <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center">Nota</th>
        <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center">Frequência</th>
        <th style="border:1px solid #cbd5e1;padding:5px 6px;text-align:center">Situação</th>
      </tr></thead>
      <tbody>${moduleBlocks}</tbody>
    </table>`;
};

const buildHistoricoTable = (rows: AcademicComponentRow[]) => {
  if (!rows.length) {
    return '<p style="margin:8px 0;font-size:10px;color:#64748b;">Não há histórico curricular disponível no momento.</p>';
  }

  const rowsByModule = new Map<string, AcademicComponentRow[]>();
  sortRows(rows).forEach((row) => {
    const moduleName = row.moduleName || 'Módulo';
    const moduleRows = rowsByModule.get(moduleName) || [];
    moduleRows.push(row);
    rowsByModule.set(moduleName, moduleRows);
  });
  const body = Array.from(rowsByModule.entries()).map(([moduleName, moduleRows]) => `
    <tr>
      <th colspan="9" style="border:1px solid #111;padding:1.5px 3px;text-align:left;font-size:6.5px;line-height:1.05;background:rgba(241,245,249,.72);">${escapeHtmlText(moduleName)}</th>
    </tr>
    ${moduleRows.map((row) => `
      <tr style="break-inside:avoid;">
        <td style="border:1px solid #111;padding:1.5px 3px;text-align:left;">${escapeHtmlText(row.discipline)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderWorkload(row.cargaHorariaTeoria)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderWorkload(row.cargaHorariaPratica)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderWorkload(row.cargaHorariaEstagio)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderGrade(row.nota)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderGrade(row.notaEstagio ?? null)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderFrequency(row.frequencia)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${renderFrequency(row.frequenciaEstagio ?? null)}</td>
        <td style="border:1px solid #111;padding:1px;text-align:center;">${escapeHtmlText(row.situacao)}</td>
      </tr>`).join('')}
  `).join('');

  return `
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:Arial,Helvetica,sans-serif;font-size:6.2px;line-height:1.02;color:#000;">
      <thead>
        <tr>
          <th rowspan="2" style="width:49%;border:1px solid #111;padding:2px;text-align:center;">MÓDULO / UNIDADE CURRICULAR</th>
          <th colspan="3" style="border:1px solid #111;padding:2px;text-align:center;">CARGA HORÁRIA</th>
          <th colspan="2" style="border:1px solid #111;padding:2px;text-align:center;">NOTA</th>
          <th colspan="2" style="border:1px solid #111;padding:2px;text-align:center;">FREQUÊNCIA</th>
          <th rowspan="2" style="width:12%;border:1px solid #111;padding:2px;text-align:center;">SITUAÇÃO</th>
        </tr>
        <tr>
          <th style="border:1px solid #111;padding:1px;">T</th>
          <th style="border:1px solid #111;padding:1px;">P</th>
          <th style="border:1px solid #111;padding:1px;">E</th>
          <th style="border:1px solid #111;padding:1px;">T/P</th>
          <th style="border:1px solid #111;padding:1px;">E</th>
          <th style="border:1px solid #111;padding:1px;">T/P</th>
          <th style="border:1px solid #111;padding:1px;">E</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
};

export const loadAcademicPreview = async (
  emission: EmissionLog
): Promise<AcademicPreviewData> => {
  if (!emission.matricula_id) {
    throw new Error('A emissão não possui matrícula acadêmica vinculada.');
  }

  const { data, error } = await (supabase.rpc as any)(
    'get_secretaria_documento_academico',
    {
      p_matricula_id: emission.matricula_id,
      p_documento: emission.documento,
    }
  );
  if (error) throw error;
  if (!data) throw new Error('O histórico acadêmico não retornou dados para esta matrícula.');

  const payload = data as AcademicPreviewRpcPayload;
  const allRows = Array.isArray(payload.componentes) ? payload.componentes : [];
  const selectedModuleId = emission.documento === 'boletim'
    ? emission.periodo_referencia
    : null;
  const rows = selectedModuleId
    ? allRows.filter((row) => row.moduleId === selectedModuleId)
    : allRows;
  if (selectedModuleId && !rows.length) {
    throw new Error('O módulo selecionado não possui componentes curriculares nesta turma.');
  }
  const inicio = parseDateOrDash(payload.inicioCurso);
  const fim = parseDateOrDash(payload.fimCurso);
  const rowsWithGrade = rows.filter((row) => row.nota !== null);
  const rowsWithFrequency = rows.filter((row) => row.frequencia !== null);
  const selectedModuleAverage = rowsWithGrade.length
    ? rowsWithGrade.reduce((sum, row) => sum + Number(row.nota), 0) / rowsWithGrade.length
    : null;
  const selectedModuleFrequencyWeight = rowsWithFrequency.reduce(
    (sum, row) => sum + Math.max(Number(row.cargaHoraria) || 0, 1),
    0
  );
  const selectedModuleFrequency = selectedModuleFrequencyWeight
    ? rowsWithFrequency.reduce(
        (sum, row) => sum + Number(row.frequencia) * Math.max(Number(row.cargaHoraria) || 0, 1),
        0
      ) / selectedModuleFrequencyWeight
    : null;
  const moduleHours = rows.reduce((sum, row) => sum + (Number(row.cargaHoraria) || 0), 0);
  const completedModuleHours = rows
    .filter((row) => ['Aprovado', 'Aproveitado'].includes(row.situacao))
    .reduce((sum, row) => sum + (Number(row.cargaHoraria) || 0), 0);
  const moduleNames = [...new Set(rows.map((row) => row.moduleName).filter(Boolean))];
  const componentes = sortRows(rows);

  return {
    componentes,
    componentesTable: buildAcademicTableByDocument(componentes),
    historicoTable: buildHistoricoTable(componentes),
    cargaHorariaCumprida: selectedModuleId
      ? completedModuleHours
      : Number(payload.cargaHorariaCumprida || 0),
    cargaHorariaTotal: selectedModuleId
      ? moduleHours
      : Number(payload.cargaHorariaTotal || 0),
    periodoCurso: fim === '—' ? inicio : `${inicio} até ${fim}`,
    observacoesHistorico: rows.length
      ? 'Histórico emitido conforme os registros de notas e frequência no momento da emissão.'
      : 'Ainda não há histórico consolidado no sistema para esta matrícula.',
    situacaoAcademica: payload.situacaoAcademica || 'Em análise',
    mediaGeral: selectedModuleId
      ? selectedModuleAverage
      : payload.mediaGeral === null || payload.mediaGeral === undefined
        ? null
        : Number(payload.mediaGeral),
    frequenciaGeral: selectedModuleId
      ? selectedModuleFrequency
      : payload.frequenciaGeral === null || payload.frequenciaGeral === undefined
        ? null
        : Number(payload.frequenciaGeral),
    inicioCurso: payload.inicioCurso || null,
    fimCurso: payload.fimCurso || null,
    courseArea: String(payload.courseArea || ''),
    courseTechnologicalAxis: String(payload.courseTechnologicalAxis || ''),
    courseProfessionalProfile: String(payload.courseProfessionalProfile || ''),
    moduleNames,
  };
};
