export type CaixaImmersiveColorCode =
  | 'AZUL_INSTITUCIONAL'
  | 'AZUL_CLARO'
  | 'VERDE'
  | 'AMBAR'
  | 'VERMELHO'
  | 'ARDOSIA';

interface CaixaImmersiveColorToken {
  solid: string;
  soft: string;
  ink: string;
}

const COLOR_TOKENS: Record<CaixaImmersiveColorCode, CaixaImmersiveColorToken> = {
  AZUL_INSTITUCIONAL: { solid: '#0755a5', soft: '#dbeafe', ink: '#123d68' },
  AZUL_CLARO: { solid: '#38a8e8', soft: '#e0f2fe', ink: '#075985' },
  VERDE: { solid: '#16866f', soft: '#d1fae5', ink: '#065f46' },
  AMBAR: { solid: '#d98b18', soft: '#fef3c7', ink: '#92400e' },
  VERMELHO: { solid: '#c94755', soft: '#ffe4e6', ink: '#9f1239' },
  ARDOSIA: { solid: '#64748b', soft: '#e2e8f0', ink: '#334155' },
};

export const getCaixaImmersiveColor = (code: CaixaImmersiveColorCode) => (
  COLOR_TOKENS[code]
);

const BUSINESS_CODE_COLORS: Readonly<Record<string, CaixaImmersiveColorCode>> = {
  ENTRADAS: 'VERDE', RECEITAS: 'VERDE', SAIDAS: 'VERMELHO', DESPESAS: 'VERMELHO',
  RESULTADO: 'AZUL_INSTITUCIONAL', INADIMPLENCIA: 'AMBAR',
  EAD: 'AZUL_INSTITUCIONAL', LIVRE: 'AZUL_CLARO', TECNICO: 'VERDE',
  ESPECIALIZACAO: 'AMBAR', BANCARIA: 'AZUL_INSTITUCIONAL', CAIXA_INTERNO: 'AMBAR',
  ADMINISTRATIVA: 'AZUL_CLARO', DESPESA_FIXA: 'VERMELHO', FOLHA: 'AMBAR', PESSOAL: 'AMBAR',
};

export const getCaixaImmersiveColorByBusinessCode = (code: string | null) => (
  getCaixaImmersiveColor(BUSINESS_CODE_COLORS[(code || '').toUpperCase()] ?? 'ARDOSIA')
);
