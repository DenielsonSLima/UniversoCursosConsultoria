/** Apenas texto de apresentação; nenhum valor financeiro é inferido aqui. */
export const CAIXA_PARTIAL_COMPOSITION_NOTE =
  'Componentes não informados não integram os subtotais.';

export const caixaCompositionObservation = (observation: string): string => (
  observation.toLocaleLowerCase('pt-BR').includes(
    CAIXA_PARTIAL_COMPOSITION_NOTE.toLocaleLowerCase('pt-BR'),
  )
    ? observation
    : `${observation} ${CAIXA_PARTIAL_COMPOSITION_NOTE}`
);

export const caixaPartialCompositionLabel = (quantidadeAConferir: number): string | null => (
  quantidadeAConferir > 0
    ? `Parcial: subtotais identificados; ${quantidadeAConferir} movimento(s) a conferir.`
    : null
);
