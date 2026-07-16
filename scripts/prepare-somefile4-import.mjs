import fs from 'node:fs';

const sourcePath = process.argv[2] ?? '2024:2025/SomeFile-4.xls';
const html = fs.readFileSync(sourcePath, 'utf8');

const decode = (value) => value
  .replace(/<br\s*\/?\s*>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ')
  .trim();

const tableRows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
  .map((match) => [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((cell) => decode(cell[1])));

if (tableRows.length < 2) throw new Error('A planilha não contém linhas de dados.');

const headers = tableRows[0].map((header) => header.replace(/:\s*$/, '').trim());
const rows = tableRows.slice(1).map((cells) => Object.fromEntries(
  headers.map((header, index) => [header, cells[index] ?? '']),
));

const classMap = {
  'ENF T-38 INT': { codigo: 'ENF-T38-INT-MAT', poloId: '44444444-4444-4444-4444-444444444444', priority: 38 },
  'ENF T-39 SEM': { codigo: 'ENF-T39-SEM-POR', poloId: '31497afd-e2dd-4444-aa3d-8087c0ae0753', priority: 39 },
  'ENF T-40 INT': { codigo: 'ENF-T40-INT-MAT', poloId: '44444444-4444-4444-4444-444444444444', priority: 40 },
  'ENF T-41 SEM': { codigo: 'ENF-T41-SEM-AQU', poloId: '335fdbe4-b3b4-4622-aa7d-04c585455091', priority: 41 },
  'ENF T-42 INT': { codigo: 'ENF-T42-INT-MAT', poloId: '44444444-4444-4444-4444-444444444444', priority: 42 },
};

const digits = (value) => String(value ?? '').replace(/\D/g, '');
const blankToNull = (value) => String(value ?? '').trim() || null;
const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]/g, '')
  .toUpperCase();
const toIsoDate = (value) => {
  const match = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const candidates = rows
  .filter((row) => classMap[row.Turma])
  .map((row) => ({ row, turma: classMap[row.Turma] }));

const groups = new Map();
for (const candidate of candidates) {
  const key = `${normalize(candidate.row.Aluno)}|${toIsoDate(candidate.row['Data de nascimento']) ?? ''}`;
  const list = groups.get(key) ?? [];
  list.push(candidate);
  groups.set(key, list);
}

const score = ({ row }) => [
  row['CPF/CIN'], row.Email, row.Celular, row.Endereço, row.Identidade,
  row['Data de emissão'], row['Certidão de nascimento antiga'], row['Certidão de nascimento nova'],
].filter((value) => String(value ?? '').trim()).length;

const selected = [...groups.values()].map((group) => {
  const firstPriority = Math.min(...group.map(({ turma }) => turma.priority));
  return group
    .filter(({ turma }) => turma.priority === firstPriority)
    .sort((a, b) => score(b) - score(a))[0];
});

const parseOldCertificate = (value) => {
  const match = String(value ?? '').match(/Termo:\s*([^,]+),\s*Livro:\s*([^,]+),\s*Folha:\s*(.+)$/i);
  return match ? { termo: match[1].trim(), livro: match[2].trim(), folha: match[3].trim() } : null;
};

const mapRace = (value) => {
  const normalized = normalize(value);
  const values = {
    BRANCA: 'BRANCA', PRETA: 'PRETA', PARDA: 'PARDA', AMARELA: 'AMARELA',
    INDIGENA: 'INDÍGENA', PREFIRONAOINFORMAR: 'PREFIRO NÃO INFORMAR',
  };
  return values[normalized] ?? null;
};

const records = selected.map(({ row, turma }) => {
  const cpfDigits = digits(row['CPF/CIN']);
  const rgDigits = digits(row.Identidade);
  const oldCertificate = parseOldCertificate(row['Certidão de nascimento antiga']);
  const newCertificate = digits(row['Certidão de nascimento nova']);
  const validNewCertificate = newCertificate.length === 32 && newCertificate[14] === '1';
  const tipoDocumento = !blankToNull(row.Identidade)
    ? null
    : rgDigits === cpfDigits
      ? 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'
      : 'RG (ANTIGO)';

  return {
    turma_codigo: turma.codigo,
    turma_nome: row.Turma,
    polo_id: turma.poloId,
    ordem_origem: Number(row.Ordem),
    ra_origem: blankToNull(row['Registro do aluno (RA)']),
    rm_origem: blankToNull(row['Registro de Matrícula (RM)']),
    nome: row.Aluno.trim(),
    cpf_cnpj: row['CPF/CIN'].trim(),
    email: row.Email.trim().toLowerCase(),
    telefone: blankToNull(row.Celular),
    cep: blankToNull(row.Cep),
    endereco: blankToNull(row.Endereço),
    bairro: blankToNull(row.Bairro),
    cidade: blankToNull(row.Cidade),
    uf: blankToNull(row.Estado)?.toUpperCase() ?? null,
    data_nascimento: toIsoDate(row['Data de nascimento']),
    sexo: blankToNull(row.Sexo)?.toUpperCase() ?? null,
    rg: blankToNull(row.Identidade),
    tipo_documento: tipoDocumento,
    orgao_emissor: blankToNull(row.Emissor),
    rg_data_emissao: toIsoDate(row['Data de emissão']),
    rg_uf_emissao: blankToNull(row.Emissor)?.match(/(?:\/|-)([A-Z]{2})$/i)?.[1]?.toUpperCase() ?? null,
    nacionalidade: blankToNull(row.Nacionalidade) ? 'Brasileira' : null,
    naturalidade: blankToNull(row['Local de nascimento']),
    nome_mae: blankToNull(row.Mãe),
    nome_pai: blankToNull(row.Pai),
    responsavel_nome: blankToNull(row['Responsável financeiro']),
    raca_cor: mapRace(row.Cor),
    certidao_tipo: oldCertificate || validNewCertificate ? 'NASCIMENTO' : null,
    certidao_modelo: oldCertificate ? 'ANTIGO' : validNewCertificate ? 'NOVO' : null,
    certidao_matricula: validNewCertificate ? newCertificate : null,
    certidao_termo: oldCertificate?.termo ?? null,
    certidao_livro: oldCertificate?.livro ?? null,
    certidao_folha: oldCertificate?.folha ?? null,
  };
});

if (records.length !== 204) throw new Error(`Esperados 204 alunos únicos, encontrados ${records.length}.`);
if (records.some((record) => digits(record.cpf_cnpj).length !== 11 || !record.email)) {
  throw new Error('Há aluno selecionado sem CPF ou e-mail válido para a carga.');
}

const duplicatedCpf = records.filter((record, index) =>
  records.findIndex((other) => digits(other.cpf_cnpj) === digits(record.cpf_cnpj)) !== index);
const duplicatedEmail = records.filter((record, index) =>
  records.findIndex((other) => other.email === record.email) !== index);
if (duplicatedCpf.length || duplicatedEmail.length) {
  throw new Error(`Duplicidades restantes: CPF=${duplicatedCpf.length}, e-mail=${duplicatedEmail.length}.`);
}

process.stdout.write(JSON.stringify(records));
