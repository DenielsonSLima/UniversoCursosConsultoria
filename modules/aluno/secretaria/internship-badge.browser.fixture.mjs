export const badgeStudent = {
  nome: 'ALUNA SINTÉTICA CRACHÁ', cpf: '123.456.789-09', matricula: 'UNIV-QA123',
  curso: 'CURSO DE TESTE', polo: 'POLO DE TESTE', validationCode: 'CRA-QA12-AB34-CD56',
};

export const badgeModel = {
  hasVerso: true, ocultarDesignPadrao: true, cargoPadrao: 'ESTAGIÁRIO',
  fields: [
    { id: 'photo', type: 'foto', x: 28, y: 15, width: 44, height: 33, page: 'frente' },
    { id: 'name', type: 'text', value: '{{ALUNO_NOME}}', x: 4, y: 53, width: 92, page: 'frente',
      style: { fontSize: '9px', fontWeight: 'bold', textAlign: 'center' } },
    { id: 'course', type: 'text', value: '{{ALUNO_CURSO}}', x: 8, y: 62, width: 58, page: 'frente', style: { fontSize: '7px' } },
    { id: 'enrollment', type: 'text', value: '{{ALUNO_MATRICULA}}', x: 8, y: 71, width: 54, page: 'frente', style: { fontSize: '7px' } },
    { id: 'qr', type: 'qrcode', x: 65, y: 65, width: 27, page: 'frente' },
    { id: 'instructions', type: 'text', value: 'INSTRUÇÕES DO MODELO SALVO', x: 8, y: 15, width: 84, page: 'verso', style: { fontSize: '8px' } },
    { id: 'issue', type: 'text', value: 'EMISSÃO {{DATA_HOJE}}', x: 8, y: 45, width: 84, page: 'verso', style: { fontSize: '8px' } },
    { id: 'validity', type: 'text', value: 'VALIDADE {{DATA_VALIDADE}}', x: 8, y: 55, width: 84, page: 'verso', style: { fontSize: '8px' } },
    { id: 'qr-back', type: 'qrcode', x: 32, y: 65, width: 36, page: 'verso' },
  ],
};
