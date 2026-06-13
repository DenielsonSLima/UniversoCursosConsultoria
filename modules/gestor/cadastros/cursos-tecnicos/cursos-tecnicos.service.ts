// File: modules/gestor/cadastros/cursos-tecnicos/cursos-tecnicos.service.ts

import { cadastrosService } from '../cadastros.service';
import { CursoTecnico } from './cursos-tecnicos.types';

export const cursosTecnicosService = {
  async getAll(): Promise<CursoTecnico[]> {
    try {
      const cursos = await cadastrosService.getCursosByModalidade('TECNICO');
      const result: CursoTecnico[] = [];

      for (const c of cursos) {
        const modulos = await cadastrosService.getGrade(c.id);
        result.push({
          id: c.id,
          nome: c.nome,
          descricao: `Curso técnico profissionalizante regulamentado em ${c.nome}.`,
          cargaHorariaTotal: c.carga_horaria,
          duracaoMeses: c.carga_horaria >= 1200 ? 24 : 18,
          area: 'Saúde',
          modulos: modulos
        });
      }

      return result;
    } catch (err) {
      console.error('Erro no service de cursos técnicos:', err);
      return [];
    }
  },

  async getById(id: string): Promise<CursoTecnico | undefined> {
    const list = await this.getAll();
    return list.find(c => c.id === id);
  },

  async update(curso: CursoTecnico): Promise<void> {
    // Apenas redireciona a chamada de grade para o novo serviço genérico
    await cadastrosService.saveGrade(curso.id, curso.modulos);
  },

  async create(curso: CursoTecnico): Promise<CursoTecnico> {
    const created = await cadastrosService.createCurso({
      nome: curso.nome,
      carga_horaria: curso.cargaHorariaTotal,
      modalidade: 'TECNICO',
      status: 'ativo'
    });

    await cadastrosService.saveGrade(created.id, curso.modulos);

    return {
      ...curso,
      id: created.id
    };
  }
};
