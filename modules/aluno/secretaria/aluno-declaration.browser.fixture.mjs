import { declarationModel } from '../../gestor/secretaria/historico-emissoes/declaration-pdf.fixture.mjs';

/** No real students, institutions or remote assets are used in this fixture. */
export function createAlunoDeclarationFixture(createCanvas) {
  const asset = (color) => {
    const canvas = createCanvas(360, 120);
    const context = canvas.getContext('2d');
    context.strokeStyle = color;
    context.lineWidth = 8;
    context.strokeRect(12, 12, 336, 96);
    context.beginPath(); context.moveTo(30, 95); context.lineTo(180, 25); context.lineTo(320, 90); context.stroke();
    return canvas.toDataURL('image/png');
  };
  const template = {
    ...declarationModel,
    absoluteFields: declarationModel.absoluteFields.map(field => field.type === 'image'
      ? { ...field, value: asset('#1d4ed8') } : { ...field }),
  };
  template.absoluteFields.push({ id: 'configured-marker', type: 'text', x: 92, y: 730, width: 420,
    value: 'REGISTRO DO MODELO CADASTRADO', style: { fontSize: '12px', fontWeight: 'bold' } });
  return {
    emission: {
      id: 'test-declaration', identidade: 'test-identity', codigo: 'DEC-MAT-TEST-1234-5678',
      documento: 'declaracao_matricula', aluno_id: 'test-student', matricula_id: 'test-enrollment',
      polo_id: 'test-polo', status: 'ATIVO', quantidade_emissoes: 1, validacao_publica: true,
      periodo_referencia: null, referencia_externa: null, revogado_em: null, emitido_por: 'test-user',
      emitido_em: '2026-10-09T12:00:00.000Z', ultima_emissao_em: '2026-10-09T12:00:00.000Z',
      validade_ate: '2026-11-08T12:00:00.000Z',
      dados_emissao: {
        studentName: 'ALUNA SINTÉTICA DE TESTE', studentCpf: '12345678909', studentRg: '12345678909',
        studentDocumentType: 'CIN', studentRgIssuer: 'SSP', studentRgState: 'SE',
        studentBirthDate: '2000-02-07', studentMatricula: 'UNIV-TEST123',
        courseName: 'Curso de Teste', className: 'Turma de Teste', unitName: 'Instituição de Teste',
      },
    },
    preview: {
      template, certificate: null, academicData: null,
      polo: { nome: 'Instituição de Teste', nomeFantasia: 'Instituição de Teste', logoUrl: asset('#0f172a'),
        cnpj: '12345678000199', cidade: 'Cidade Teste', estado: 'SE', endereco: 'Rua Teste', numero: '10',
        telefone: '(79) 3000-0000', bairro: 'Bairro Teste', cep: '49000-000', email: 'instituicao@example.test' },
      watermark: { watermarkUrl: asset('#0284c7'), watermarkOpacity: 0.12, watermarkScale: 70, watermarkRotate: true },
    },
  };
}

export const alunoDeclarationRpcStub = `
  export const supabase = {
    rpc(name, parameters) {
      window.rpcCalls.push({name, parameters});
      if (name !== 'obter_declaracao_matricula_aluno_pdf') throw Error('Unexpected RPC: ' + name);
      if (parameters.p_matricula_id !== 'test-enrollment') throw Error('Unexpected enrollment');
      const reply = window.rpcReplies.shift();
      if (!reply) throw Error('No configured RPC response');
      const promise = Promise.resolve(reply);
      promise.abortSignal = () => promise;
      return promise;
    },
    from() { throw Error('The student declaration must use its authorized RPC, not a direct table query'); },
  };
`;
