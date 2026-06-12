
// File: modules/gestor/cadastros/modelos-documentos/declaracao/declaracao.service.ts

// Mock Storage: Chave é o ID do Polo
let templatesStore: Record<string, any> = {};

// Mock Storage: Configuração Global do QR Code
let qrCodeConfig = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

const defaultTemplate = {
  textContent: `<p>Declaramos para os devidos fins que, <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº {{ALUNO_CPF}}, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, nesta instituição de ensino.</p><br><p>O referido curso é realizado na modalidade presencial no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.</p>`,
  absoluteFields: [
    { 
        id: 'data_field', 
        type: 'variable', 
        value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}', 
        x: 400, 
        y: 800, 
        style: { textAlign: 'right', fontWeight: 'bold' } 
    }
  ],
};

export const declaracaoService = {
  async getTemplate(poloId: string) {
    return new Promise<any>((resolve) => {
      setTimeout(() => {
        const template = templatesStore[poloId] || JSON.parse(JSON.stringify(defaultTemplate));
        resolve(template);
      }, 500);
    });
  },

  async saveTemplate(poloId: string, data: any) {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        templatesStore[poloId] = data;
        resolve(true);
      }, 800);
    });
  },

  // --- Novos métodos para Configuração de QR Code ---

  async getQrConfig() {
    return new Promise<any>((resolve) => {
      setTimeout(() => resolve(qrCodeConfig), 300);
    });
  },

  async saveQrConfig(config: any) {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        qrCodeConfig = config;
        resolve(true);
      }, 600);
    });
  }
};
