// File: modules/gestor/cadastros/modelos-documentos/estagio/estagio.service.ts

const STORAGE_KEY_PREFIX = 'universo_template_estagio_';
const QR_CONFIG_KEY = 'universo_qr_config_estagio';

const DEFAULT_QR_CONFIG = {
  pattern: ['{POLO_ID}', '{CURSO_ID}', '{ALUNO_MATRICULA}', '{ANO_ATUAL}'],
  separator: '-'
};

const defaultTemplate = {
  textContent: `<p><b>TERMO DE COMPROMISSO DE ESTÁGIO SUPERVISIONADO OBRIGATÓRIO</b></p><br><p>Por este instrumento, as partes qualificadas celebram o presente Termo de Estágio. De um lado a Instituição de Ensino <b>{{POLO_NOME}}</b>, e de outro o(a) estudante <b>{{ALUNO_NOME}}</b>, portador(a) do CPF nº {{ALUNO_CPF}} e RG nº {{ALUNO_RG}}, regularmente matriculado(a) no curso técnico de <b>{{CURSO_NOME}}</b>, sob matrícula nº {{ALUNO_MATRICULA}}.</p><br><p>O estágio prático profissional supervisionado será realizado nas dependências da unidade de saúde parceira credenciada, observando o plano de atividades pedagógicas, cronograma de carga horária prática estabelecido e a supervisão acadêmica oficial desta instituição.</p>`,
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
  validityDays: 90,
};

const getLocalStorageTemplate = (poloId: string) => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${poloId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Erro ao ler template de estágio do localStorage:', e);
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
        console.error('Erro ao ler QR config de estágio do localStorage:', e);
      }
    }
  }
  return DEFAULT_QR_CONFIG;
};

export const estagioService = {
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
