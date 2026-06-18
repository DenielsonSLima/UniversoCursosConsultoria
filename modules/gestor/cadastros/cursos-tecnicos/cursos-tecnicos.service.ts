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
          descricao: c.descricao || `Curso técnico profissionalizante regulamentado em ${c.nome}.`,
          cargaHorariaTotal: c.carga_horaria,
          duracaoMeses: c.duracao_meses || (c.carga_horaria >= 1200 ? 24 : 18),
          area: c.area || 'Saúde',
          status: c.status,
          versao: c.versao || '1.0',
          totalTurmas: c.total_turmas,
          cargaHorariaCadastrada: c.carga_horaria_cadastrada,
          publicarSite: c.publicar_site,
          imagemDetalhe1: c.imagem_detalhe_1,
          imagemDetalhe2: c.imagem_detalhe_2,
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
    await cadastrosService.updateCurso({
      id: curso.id,
      nome: curso.nome,
      modalidade: 'TECNICO',
      carga_horaria: curso.cargaHorariaTotal,
      status: (curso.status as any) || 'ativo',
      area: curso.area,
      descricao: curso.descricao,
      versao: curso.versao,
      duracao_meses: curso.duracaoMeses,
      publicar_site: curso.publicarSite,
      imagem_detalhe_1: curso.imagemDetalhe1,
      imagem_detalhe_2: curso.imagemDetalhe2
    });
    await cadastrosService.saveGrade(curso.id, curso.modulos);
  },

  async create(curso: CursoTecnico): Promise<CursoTecnico> {
    const created = await cadastrosService.createCurso({
      nome: curso.nome,
      carga_horaria: curso.cargaHorariaTotal,
      modalidade: 'TECNICO',
      status: 'ativo',
      area: curso.area,
      descricao: curso.descricao,
      versao: curso.versao || '1.0',
      duracao_meses: curso.duracaoMeses,
      publicar_site: curso.publicarSite,
      imagem_detalhe_1: curso.imagemDetalhe1,
      imagem_detalhe_2: curso.imagemDetalhe2
    });

    await cadastrosService.saveGrade(created.id, curso.modulos);

    return {
      ...curso,
      id: created.id
    };
  }
};
