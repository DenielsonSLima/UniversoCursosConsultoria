import { supabase } from '../../../../lib/supabase';

export interface SecretariaAssinaturasTurmaOption {
  id: string;
  label: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const requiredUuid = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} não corresponde ao escopo autorizado.`);
  }
  return value;
};

const boundedText = (value: unknown, label: string, maximumLength: number) => {
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || value.length > maximumLength
  ) {
    throw new Error(`${label} retornou um formato inválido.`);
  }
  return value;
};

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} retornou um formato inválido.`);
  }
  return value as Record<string, unknown>;
};

const assertExactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string) => {
  const received = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (received.length !== expected.length || received.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} não corresponde ao contrato autorizado.`);
  }
};

export const secretariaAssinaturasAcervoService = {
  async listTurmas(params: {
    contextId: string;
    poloId: string;
  }): Promise<readonly SecretariaAssinaturasTurmaOption[]> {
    const { data, error } = await supabase.rpc(
      'assinatura_eletronica_opcoes_acervo_gestor',
      {
        p_context_id: requiredUuid(params.contextId, 'O contexto das turmas'),
        p_polo_id: requiredUuid(params.poloId, 'O polo das turmas'),
      },
    );
    if (error) throw error;
    const payload = asRecord(data, 'As opções do acervo');
    assertExactKeys(payload, ['items'], 'As opções do acervo');
    if (!Array.isArray(payload.items)) {
      throw new Error('As opções do acervo não informaram uma lista autorizada.');
    }
    const ids = new Set<string>();
    return payload.items.map((value) => {
      const item = asRecord(value, 'Uma turma do acervo');
      assertExactKeys(item, ['id', 'label'], 'A turma do acervo');
      const id = requiredUuid(item.id, 'A turma');
      if (ids.has(id)) throw new Error('As opções do acervo repetiram uma turma.');
      ids.add(id);
      return {
        id,
        label: boundedText(item.label, 'O nome da turma', 300),
      };
    });
  },
};
