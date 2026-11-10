const messages: Record<string, string> = {
  ICP_TRUST_STORE_UNAVAILABLE: 'O serviço de certificados está sem a cadeia de confiança configurada. A administração precisa regularizar o serviço; isso não indica senha incorreta.',
  INVALID_PFX_PASSWORD: 'A senha excede o limite de 1.024 caracteres.',
  INVALID_PFX_PASSWORD_OR_DATA: 'Não foi possível abrir o arquivo com essa senha. Confira a senha e se o PFX/P12 está íntegro.',
  UNSUPPORTED_PFX_ENCRYPTION: 'A criptografia deste arquivo não é compatível com o serviço. Solicite uma exportação A1 compatível à certificadora.',
  INVALID_PFX_FORMAT: 'O arquivo não pôde ser lido como PFX/P12. Selecione a exportação original do certificado A1.',
  INVALID_PFX_COST: 'A proteção criptográfica do arquivo excede os limites seguros do serviço. A administração precisa verificar a compatibilidade.',
  INVALID_PFX_OR_UNTRUSTED_CHAIN: 'Não foi possível validar o arquivo ou sua cadeia de confiança. Confira o PFX/P12 e a senha; a falha também pode estar na cadeia do certificado.',
  UNTRUSTED_CERTIFICATE_CHAIN: 'A cadeia do certificado não pôde ser validada. Confira se o arquivo contém a cadeia ICP-Brasil completa.',
  CERTIFICATE_EXPIRED_OR_NOT_YET_VALID: 'O certificado está vencido ou sua validade ainda não começou. Selecione um certificado vigente.',
  CERTIFICATE_CNPJ_MISMATCH: 'O CNPJ do certificado não corresponde ao estabelecimento definido como origem. Confira a unidade e o certificado selecionado.',
  CERTIFICATE_CNPJ_REQUIRED: 'O arquivo não contém o CNPJ exigido para este cadastro. Selecione o certificado A1 do estabelecimento.',
  ICP_A1_POLICY_REQUIRED: 'O certificado precisa ser um A1 ICP-Brasil compatível com este cadastro.',
  INVALID_PFX_CONTENTS: 'O arquivo precisa conter um certificado A1 e sua chave de assinatura.',
  UNSUPPORTED_A1_KEY: 'A chave de assinatura deste certificado não é compatível com o serviço.',
  INVALID_PFX_UPLOAD: 'Selecione um arquivo PFX/P12 válido, com até 128 KB.',
  INVALID_PFX_SIZE: 'O arquivo deve ter entre 1 byte e 128 KB.',
  INVALID_UPLOAD_SIZE: 'O arquivo enviado ultrapassa o tamanho permitido de 128 KB.',
  INVALID_UPLOAD_SCOPE: 'O contexto da unidade não é válido. Atualize a página e selecione novamente a unidade.',
  UPLOAD_NOT_AUTHORIZED_OR_UNAVAILABLE: 'O acesso ou o serviço de cadastro não está disponível. Atualize a página e confira suas permissões. Isso não confirma senha incorreta.',
  RATE_LIMITED: 'Foram feitas muitas tentativas. Aguarde um minuto antes de tentar novamente.',
};

/** Only display our own messages, never raw server, SQL, crypto or credential data. */
export async function certificateUploadError(error: unknown): Promise<Error> {
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;
  const response = context instanceof Response ? context : null;
  if (response) {
    try {
      const body: unknown = await response.clone().json();
      const code = body && typeof body === 'object' && 'error' in body ? body.error : null;
      if (typeof code === 'string' && Object.hasOwn(messages, code)) return new Error(messages[code]);
    } catch { /* A non-JSON gateway response must not escape into the interface. */ }
    if (response.status === 401 || response.status === 403) {
      return new Error('Sua sessão ou permissão não permite cadastrar o certificado. Entre novamente e confira o acesso à unidade.');
    }
    if (response.status === 404 || response.status === 503) {
      return new Error('O serviço de cadastro de certificados está indisponível. Tente novamente após a administração verificar o serviço.');
    }
    if (response.status === 429) return new Error(messages.RATE_LIMITED);
  }
  return new Error('Não foi possível confirmar o cadastro. Atualize a situação do certificado antes de tentar novamente. A falha de comunicação não confirma senha incorreta.');
}
