// File: modules/gestor/cadastros/modelos-documentos/declaracao/declaracao.service.ts

const STORAGE_KEY_PREFIX = 'universo_template_declaracao_';
const QR_CONFIG_KEY = 'universo_qr_config_declaracao';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

const defaultTemplate = {
  textContent: `<p>Declaramos para os devidos fins que, <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº {{ALUNO_CPF}}, encontra-se regularmente matriculado(a) no curso de <b>{{CURSO_NOME}}</b>, nesta instituição de ensino.</p><br><p>O referido curso é realizado na modalidade presencial no polo de <b>{{POLO_NOME}}</b>.</p><br><p>Atestamos que o aluno apresenta frequência regular e está em dia com suas obrigações acadêmicas.</p>`,
  absoluteFields: [
    { 
        id: 'data_field', 
        type: 'text', 
        value: '{{CIDADE_POLO}}, {{DATA_ATUAL}}', 
        x: 400, 
        y: 800, 
        style: { textAlign: 'right', fontWeight: 'bold' } 
    }
  ],
  validityDays: 30,
};

const getLocalStorageTemplate = (poloId: string) => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${poloId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao ler template do localStorage:', e);
      }
    }
  }
  return JSON.parse(JSON.stringify(defaultTemplate));
};

const getLocalStorageQrConfig = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(QR_CONFIG_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao ler QR config do localStorage:', e);
      }
    }
  }
  return DEFAULT_QR_CONFIG;
};

export const declaracaoService = {
  async getTemplate(poloId: string) {
    return new Promise<any>((resolve) => {
      setTimeout(() => {
        resolve(getLocalStorageTemplate(poloId));
      }, 300);
    });
  },

  async saveTemplate(poloId: string, data: any) {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(`${STORAGE_KEY_PREFIX}${poloId}`, JSON.stringify(data));
        }
        resolve(true);
      }, 350);
    });
  },

  async getQrConfig() {
    return new Promise<any>((resolve) => {
      setTimeout(() => resolve(getLocalStorageQrConfig()), 300);
    });
  },

  async saveQrConfig(config: any) {
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(QR_CONFIG_KEY, JSON.stringify(config));
        }
        resolve(true);
      }, 350);
    });
  }
};
