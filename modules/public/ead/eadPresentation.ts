export function isSelfDirectedPresentation(pagina: unknown): boolean {
  return Boolean(pagina && typeof pagina === 'object'
    && 'formato' in pagina && pagina.formato === 'autoinstrucional');
}
