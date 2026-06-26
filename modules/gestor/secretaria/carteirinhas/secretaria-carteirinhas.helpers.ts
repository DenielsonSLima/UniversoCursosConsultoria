export const TEMPLATE_DEFAULT = {
  corPrimaria: '#0284c7', // Sky 600
  corSecundaria: '#e0f2fe',
  textoFrente: 'DOCUMENTO DO ESTUDANTE',
  textoVerso: 'Este documento é padronizado nacionalmente nos termos da Lei nº 12.933/2013 e garante o direito de meia-entrada em eventos artísticos-culturais e esportivos.\n\nUso pessoal e intransferível.\nVerifique a validade via QR Code.',
  tipoCurso: 'Cursos Técnicos',
  hasVerso: true,
  startNumber: 1000,
  bgFrenteUrl: '',
  bgVersoUrl: '',
  ocultarDesignPadrao: false
};

export const getTechnicalActiveMatricula = (matriculas: any[]) =>
    (matriculas || [])
      .filter((m) => {
        const status = (m.status || '').toUpperCase();
        const turmaStatus = (m.turmas?.status || '').toUpperCase();
        return status === 'ATIVO' && turmaStatus === 'EM_ANDAMENTO' && m.turmas?.cursos?.modalidade === 'TECNICO';
      })
      .sort(
        (a, b) =>
          new Date(b.data_matricula || '').getTime() -
          new Date(a.data_matricula || '').getTime()
      );
