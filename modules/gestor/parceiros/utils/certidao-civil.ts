const onlyDigits = (value?: unknown) => String(value || '').replace(/\D/g, '');

export const normalizeCertidaoMatricula = (value?: unknown) => onlyDigits(value).slice(0, 32);

export const hasCertidaoCivilData = (profile: any) => [
  profile?.certidaoTipo ?? profile?.certidao_tipo,
  profile?.certidaoModelo ?? profile?.certidao_modelo,
  profile?.certidaoMatricula ?? profile?.certidao_matricula,
  profile?.certidaoTermo ?? profile?.certidao_termo,
  profile?.certidaoLivro ?? profile?.certidao_livro,
  profile?.certidaoFolha ?? profile?.certidao_folha,
].some((value) => String(value || '').trim().length > 0);

export const validateCertidaoCivil = (profile: any): string | null => {
  const tipo = String(profile?.certidaoTipo ?? profile?.certidao_tipo ?? '').toUpperCase();
  const modelo = String(profile?.certidaoModelo ?? profile?.certidao_modelo ?? '').toUpperCase();

  if (!['NASCIMENTO', 'CASAMENTO'].includes(tipo)) {
    return 'Selecione se a certidão é de nascimento ou de casamento.';
  }
  if (!['NOVO', 'ANTIGO'].includes(modelo)) {
    return 'Selecione se a certidão é do modelo novo ou antigo.';
  }

  if (modelo === 'NOVO') {
    const matricula = normalizeCertidaoMatricula(
      profile?.certidaoMatricula ?? profile?.certidao_matricula,
    );
    if (matricula.length !== 32) {
      return 'Informe os 32 dígitos da matrícula da certidão.';
    }

    const expectedTypeDigit = tipo === 'NASCIMENTO' ? '1' : '2';
    if (matricula.charAt(14) !== expectedTypeDigit) {
      return tipo === 'NASCIMENTO'
        ? 'A matrícula informada não corresponde a uma certidão de nascimento.'
        : 'A matrícula informada não corresponde a uma certidão de casamento.';
    }
    return null;
  }

  const termo = String(profile?.certidaoTermo ?? profile?.certidao_termo ?? '').trim();
  const livro = String(profile?.certidaoLivro ?? profile?.certidao_livro ?? '').trim();
  const folha = String(profile?.certidaoFolha ?? profile?.certidao_folha ?? '').trim();
  if (!termo || !livro || !folha) {
    return 'Informe livro, folha e termo da certidão no modelo antigo.';
  }

  return null;
};
