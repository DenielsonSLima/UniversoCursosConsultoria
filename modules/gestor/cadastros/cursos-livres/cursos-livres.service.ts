// File: modules/gestor/cadastros/cursos-livres/cursos-livres.service.ts

import { cadastrosService } from '../cadastros.service';
import { CursoLivre } from './cursos-livres.types';

export const cursosLivresService = {
  async getAll(): Promise<CursoLivre[]> {
    try {
      const cursos = await cadastrosService.getCursosByModalidade('LIVRE');
      const result: CursoLivre[] = [];

      for (const c of cursos) {
        const modulos = await cadastrosService.getGrade(c.id);
        result.push({
          id: c.id,
          nome: c.nome,
          descricao: `Curso livre de capacitação profissional em ${c.nome}.`,
          cargaHorariaTotal: c.carga_horaria,
          duracaoSemanas: Math.ceil(c.carga_horaria / 10) || 4,
          area: 'Capacitação',
          modulos: modulos
        });
      }

      return result;
    } catch (err) {
      console.error('Erro no service de cursos livres:', err);
      return [];
    }
  },

  async getById(id: string): Promise<CursoLivre | undefined> {
    const list = await this.getAll();
    return list.find(c => c.id === id);
  },

  async update(curso: CursoLivre): Promise<void> {
    await cadastrosService.saveGrade(curso.id, curso.modulos);
  },

  async create(curso: CursoLivre): Promise<CursoLivre> {
    const created = await cadastrosService.createCurso({
      nome: curso.nome,
      carga_horaria: curso.cargaHorariaTotal,
      modalidade: 'LIVRE',
      status: 'ativo'
    });

    await cadastrosService.saveGrade(created.id, curso.modulos);

    return {
      ...curso,
      id: created.id
    };
  }
};
