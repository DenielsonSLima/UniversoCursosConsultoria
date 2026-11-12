import type { NfseAccountingReport, NfseAccountingRow } from './nfse-accounting.types';
import type { NfseIssuedExportAssets } from '../../emissor-nfse/exportacao/interno/nfse-issued-export.types';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
export const accountingFixtureAssets: NfseIssuedExportAssets = {
  logo: null, watermark: null, institution: {
    name: 'UNIVERSO CURSOS E CONSULTORIA', legalName: '', cnpj: '00.000.000/0001-00',
    address: 'Dados fictícios para aprovação do layout', number: '', complement: '', neighborhood: '',
    city: 'Sergipe', state: 'SE', postalCode: '', phone: '', email: '', isHeadquarters: true,
  },
};
export function accountingFixture(mode: 'POLO' | 'GERAL' = 'GERAL'): NfseAccountingReport {
  const rows: NfseAccountingRow[] = [
    ['Matriz', 1, 'Empresa Exemplo A', '500.00', '080201', '122020000'],
    ['Propriá', 2, 'Aluno Exemplo B', '200.00', '080201', '122020000'],
    ['Propriá', 2, 'Aluno Exemplo C', '300.00', '080201', '122020000'],
    ['Aquidabã', 3, 'Instituição Exemplo D', '2500.00', '170101', '113011000'],
    ['Porto da Folha', 4, 'Aluno Exemplo E', '180.00', '080201', '122020000'],
  ].map(([poloName, polo, recipientName, amount, nationalServiceCode, nbsCode], index) => ({
    id: id(index + 20), number: String(index + 101), accessKey: String(index + 1).padStart(50, '0'),
    emittedAt: `2026-11-${String(index + 2).padStart(2, '0')}T12:00:00Z`,
    poloId: id(Number(polo)), poloName: String(poloName), recipientName: String(recipientName),
    recipientDocument: index === 0 || index === 3 ? '00000000000000' : '00000000000',
    serviceDate: '2026-10-31', competenceDate: '2026-10-31', nationalServiceCode: String(nationalServiceCode),
    nbsCode: String(nbsCode), amount: String(amount), issAmount: index === 3 ? '50.00' : '0.00',
    issRetention: index === 3 ? '2' : '1', state: 'AUTHORIZED', origin: index === 0 || index === 3 ? 'SERVICO' : 'ALUNO', xmlAvailable: true,
  }));
  const byCode = mode === 'GERAL' ? [{ code: '080201', count: 4, amount: '1180.00' }, { code: '170101', count: 1, amount: '2500.00' }]
    : [{ code: '080201', count: 2, amount: '500.00' }];
  const byNbs = mode === 'GERAL' ? [{ code: '113011000', count: 1, amount: '2500.00' }, { code: '122020000', count: 4, amount: '1180.00' }] : [{ code: '122020000', count: 2, amount: '500.00' }];
  const byPolo = mode === 'GERAL' ? [
    { poloId: id(3), poloName: 'Aquidabã', count: 1, amount: '2500.00' },
    { poloId: id(1), poloName: 'Matriz', count: 1, amount: '500.00' },
    { poloId: id(4), poloName: 'Porto da Folha', count: 1, amount: '180.00' },
    { poloId: id(2), poloName: 'Propriá', count: 2, amount: '500.00' },
  ] : [{ poloId: id(2), poloName: 'Propriá', count: 2, amount: '500.00' }];
  return { scope: { poloId: id(mode === 'GERAL' ? 1 : 2), contextKey: id(10), environment: 'HOMOLOGACAO', month: '2026-11' },
    mode, dateFrom: '2026-11-01', dateTo: '2026-11-30', generatedAt: '2026-11-12T14:00:00Z',
    pages: [mode === 'GERAL' ? rows : rows.filter(r => r.poloId === id(2))],
    totalItems: mode === 'GERAL' ? 5 : 2, totalAmount: mode === 'GERAL' ? '3680.00' : '500.00',
    byCode, byNbs, byPolo, unitsDescription: 'DEMONSTRAÇÃO · Dados fictícios · Códigos ilustrativos, não são orientação fiscal',
    summaryPages: [[...byCode.map(c => ({ kind: 'CODE' as const, ...c })), ...byNbs.map(c => ({ kind: 'NBS' as const, ...c })), ...(mode === 'GERAL' ? byPolo.map(p => ({ kind: 'POLO' as const, ...p })) : [])]],
  };
}
