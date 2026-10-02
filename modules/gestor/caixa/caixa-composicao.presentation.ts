/** Apenas texto de apresentação; nenhum valor financeiro é inferido aqui. */
export const CAIXA_PARTIAL_COMPOSITION_NOTE =
  'Componentes não informados não integram os subtotais.';

export const caixaPartialCompositionLabel = (quantidadeAConferir: number): string | null => (
  quantidadeAConferir > 0
    ? `Parcial: subtotais identificados; ${quantidadeAConferir} movimento(s) a conferir.`
    : null
);
