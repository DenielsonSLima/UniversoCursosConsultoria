// File: modules/gestor/cadastros/cursos-especializacao/cursos-especializacao.service.ts

import { cadastrosService } from '../cadastros.service';
import { CursoEspecializacao } from './cursos-especializacao.types';

export const cursosEspecializacaoService = {
  async getAll(): Promise<CursoEspecializacao[]> {
    try {
      const cursos = await cadastrosService.getCursosByModalidade('ESPECIALIZACAO');
      const result: CursoEspecializacao[] = [];

      for (const c of cursos) {
        const modulos = await cadastrosService.getGrade(c.id);
        result.push({
          id: c.id,
          nome: c.nome,
          descricao: `Curso de especialização de pós-formação em ${c.nome}.`,
          cargaHorariaTotal: c.carga_horaria,
          duracaoMeses: c.carga_horaria >= 360 ? 12 : 6,
          area: 'Saúde',
          requisito: 'Curso concluído na área de Saúde',
          modulos: modulos
        });
      }

      return result;
    } catch (err) {
      console.error('Erro no service de cursos especialização:', err);
      return [];
    }
  },

  async getById(id: string): Promise<CursoEspecializacao | undefined> {
    const list = await this.getAll();
    return list.find(c => c.id === id);
  },

  async update(curso: CursoEspecializacao): Promise<void> {
    await cadastrosService.saveGrade(curso.id, curso.modulos);
  },

  async create(curso: CursoEspecializacao): Promise<CursoEspecializacao> {
    const created = await cadastrosService.createCurso({
      nome: curso.nome,
      carga_horaria: curso.cargaHorariaTotal,
      modalidade: 'ESPECIALIZACAO',
      status: 'ativo'
    });

    await cadastrosService.saveGrade(created.id, curso.modulos);

    return {
      ...curso,
      id: created.id
    };
  }
};
