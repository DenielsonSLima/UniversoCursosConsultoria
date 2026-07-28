import {
  CensoReadinessIssue,
  CensoReadinessResult,
  CensoReadinessRow,
  CensoSeverity,
} from './matricula-inicial.types';

const isBlank = (value: unknown) => String(value ?? '').trim().length === 0;

const issue = (
  severity: CensoSeverity,
  domain: 'aluno' | 'turma',
  entityType: 'ALUNO' | 'TURMA',
  entityId: string,
  entityName: string,
  field: string,
  message: string,
): CensoReadinessIssue => ({
  id: `${entityType}:${entityId}:${field}`,
  severity,
  domain,
  entityType,
  entityId,
  entityName,
  field,
  message,
});

export const validateCensoReadiness = (rows: CensoReadinessRow[]): CensoReadinessResult => {
  const issues: CensoReadinessIssue[] = [];
  const students = new Map<string, CensoReadinessRow>();
  const classes = new Map<string, CensoReadinessRow>();

  rows.forEach((row) => {
    if (!students.has(row.alunoId)) students.set(row.alunoId, row);
    if (!classes.has(row.turmaId)) classes.set(row.turmaId, row);
  });

  students.forEach((row) => {
    const add = (severity: CensoSeverity, field: string, message: string) => {
      issues.push(issue(severity, 'aluno', 'ALUNO', row.alunoId, row.alunoNome, field, message));
    };

    if (isBlank(row.alunoCpf)) add('erro', 'cpf', 'CPF não informado.');
    if (isBlank(row.dataNascimento)) add('erro', 'data_nascimento', 'Data de nascimento não informada.');
    if (isBlank(row.sexo)) add('erro', 'sexo', 'Sexo não informado.');
    if (isBlank(row.nomeMae)) add('erro', 'nome_mae', 'Filiação materna não informada.');
    if (isBlank(row.racaCor)) add('aviso', 'raca_cor', 'Raça/cor não informada.');
    if (isBlank(row.naturalidade)) add('aviso', 'naturalidade', 'Naturalidade não informada.');
    if (isBlank(row.nacionalidade)) add('aviso', 'nacionalidade', 'Nacionalidade não informada.');
    if (isBlank(row.cep)) add('aviso', 'cep', 'CEP não informado.');
    if (isBlank(row.endereco)) add('aviso', 'endereco', 'Endereço não informado.');
    if (isBlank(row.cidade)) add('aviso', 'cidade', 'Cidade não informada.');
    if (isBlank(row.uf)) add('aviso', 'uf', 'UF não informada.');
  });

  classes.forEach((row) => {
    const add = (severity: CensoSeverity, field: string, message: string) => {
      issues.push(issue(severity, 'turma', 'TURMA', row.turmaId, row.turmaNome, field, message));
    };

    if (isBlank(row.turmaCodigo)) add('erro', 'codigo', 'Código interno da turma não informado.');
    if (isBlank(row.turmaInicio)) add('erro', 'data_inicio', 'Data de início da turma não informada.');
    if (isBlank(row.turmaFim)) add('aviso', 'data_fim', 'Previsão de término da turma não informada.');
    if (isBlank(row.turno)) add('aviso', 'turno', 'Turno da turma não informado.');
    if (isBlank(row.cursoNome)) add('erro', 'curso', 'Curso da turma não informado.');
  });

  const studentsWithIssues = new Set(
    issues.filter((item) => item.entityType === 'ALUNO').map((item) => item.entityId),
  );

  return {
    issues,
    totalAlunos: students.size,
    totalTurmas: classes.size,
    alunosComPendencia: studentsWithIssues.size,
    erros: issues.filter((item) => item.severity === 'erro').length,
    avisos: issues.filter((item) => item.severity === 'aviso').length,
  };
};
