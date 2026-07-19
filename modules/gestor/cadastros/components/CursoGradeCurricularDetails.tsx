import React, { useEffect, useState } from 'react';
import { Curso, CursoFinanceiroConfig, Disciplina, Modulo } from '../cadastros.types';
import { cadastrosService, normalizeCursoFinanceiroConfig } from '../cadastros.service';
import { supabase } from '../../../../lib/supabase';
import { REQUIRED_HEALTH_VACCINES, normalizeCursoVacinasConfig } from '../../../shared/vacinas/vacinas.config';
import {
  getModalidadeConfig,
  moneyInputValue,
  parseMoneyInput
} from './cursoGradeCurricular.helpers';
import CursoFinanceiroTab from './CursoFinanceiroTab';
import CursoGradeCurricularHeader, { CursoGradeTab as ActiveTab } from './CursoGradeCurricularHeader';
import CursoGradeTab from './CursoGradeTab';
import CursoPublicoTab from './CursoPublicoTab';
import CursoTurmasTab from './CursoTurmasTab';
import CursoVacinasTab from './CursoVacinasTab';
import { useCursoPublication } from './useCursoPublication';

interface CursoGradeCurricularDetailsProps {
  curso: Curso;
  onBack: () => void;
  onUpdate: () => void;
}

const CursoGradeCurricularDetails: React.FC<CursoGradeCurricularDetailsProps> = ({ curso, onBack, onUpdate }) => {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('grade');
  const [kpis, setKpis] = useState<{
    carga_horaria_total: number;
    carga_horaria_cadastrada: number;
    carga_horaria_restante: number;
  } | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [turmasVinculadas, setTurmasVinculadas] = useState<any[]>([]);
  const [loadingTurmas, setLoadingTurmas] = useState(false);
  const publication = useCursoPublication({ curso, onUpdate });
  const {
    publicarSite,
    imagemUrl,
    imagemDetalhe1,
    imagemDetalhe2,
    usesTurmaFinanceiro,
    setValorCurso
  } = publication;

  const initialFinanceiroConfig = () => normalizeCursoFinanceiroConfig(curso.financeiro_config, curso.modalidade);
  const [financeiroConfig, setFinanceiroConfig] = useState<CursoFinanceiroConfig>(initialFinanceiroConfig);
  const [valorBaseInput, setValorBaseInput] = useState(() => moneyInputValue(initialFinanceiroConfig().valorBase));
  const [descontoInput, setDescontoInput] = useState(() => moneyInputValue(initialFinanceiroConfig().descontoPontualidade));
  const [isSavingFinanceiro, setIsSavingFinanceiro] = useState(false);
  const [vacinasConfig, setVacinasConfig] = useState(() => normalizeCursoVacinasConfig(curso.vacinas_config, curso.nome));
  const [isSavingVacinas, setIsSavingVacinas] = useState(false);
  const [newModuloName, setNewModuloName] = useState('');
  const [addingDiscToModId, setAddingDiscToModId] = useState<string | null>(null);
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscHoras, setNewDiscHoras] = useState('');
  const [newDiscTeoria, setNewDiscTeoria] = useState('');
  const [newDiscPratica, setNewDiscPratica] = useState('');
  const [newDiscEstagio, setNewDiscEstagio] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');
  const config = getModalidadeConfig(curso.modalidade);

  const loadGrade = async () => {
    setLoading(true);
    try {
      setModulos(await cadastrosService.getGrade(curso.id));
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar grade do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const loadKpis = async () => {
    setLoadingKpis(true);
    try {
      setKpis(await cadastrosService.getCursoGradeKpis(curso.id));
    } catch (err) {
      console.error('Erro ao buscar KPIs da grade:', err);
    } finally {
      setLoadingKpis(false);
    }
  };

  const loadTurmas = async () => {
    setLoadingTurmas(true);
    try {
      const { data, error } = await supabase
        .from('turmas')
        .select('*, polos(nome)')
        .eq('curso_id', curso.id)
        .order('codigo', { ascending: true });
      if (error) throw error;
      setTurmasVinculadas(data || []);
    } catch (err) {
      console.error('Erro ao buscar turmas:', err);
    } finally {
      setLoadingTurmas(false);
    }
  };

  useEffect(() => {
    loadGrade();
    loadKpis();
    loadTurmas();
    const nextFinanceiroConfig = normalizeCursoFinanceiroConfig(curso.financeiro_config, curso.modalidade);
    setFinanceiroConfig(nextFinanceiroConfig);
    setValorBaseInput(moneyInputValue(nextFinanceiroConfig.valorBase));
    setDescontoInput(moneyInputValue(nextFinanceiroConfig.descontoPontualidade));
    setVacinasConfig(normalizeCursoVacinasConfig(curso.vacinas_config, curso.nome));
  }, [
    curso.id,
    curso.publicar_site,
    curso.imagem_url,
    curso.imagem_detalhe_1,
    curso.imagem_detalhe_2,
    curso.valor,
    curso.financeiro_config,
    curso.vacinas_config,
    curso.nome
  ]);

  const updateFinanceiroConfig = (patch: Partial<CursoFinanceiroConfig>) => {
    setFinanceiroConfig(prev => normalizeCursoFinanceiroConfig({ ...prev, ...patch }, curso.modalidade));
  };

  const updateFinanceiroNested = (key: keyof CursoFinanceiroConfig, patch: Record<string, unknown>) => {
    setFinanceiroConfig(prev => normalizeCursoFinanceiroConfig({
      ...prev,
      [key]: { ...(prev[key] as any), ...patch }
    }, curso.modalidade));
  };

  const handleSaveFinanceiroCurso = async () => {
    const normalized = normalizeCursoFinanceiroConfig(
      usesTurmaFinanceiro
        ? {
            ...financeiroConfig,
            descontoPontualidade: 0,
            descontoMetodo: { pix: false, boleto: false, cartao: false }
          }
        : {
            ...financeiroConfig,
            valorBase: parseMoneyInput(valorBaseInput, financeiroConfig.valorBase),
            descontoPontualidade: parseMoneyInput(descontoInput, financeiroConfig.descontoPontualidade)
          },
      curso.modalidade
    );
    setIsSavingFinanceiro(true);
    try {
      await cadastrosService.updateCurso({
        ...curso,
        publicar_site: publicarSite,
        imagem_url: imagemUrl || null,
        imagem_detalhe_1: imagemDetalhe1 || null,
        imagem_detalhe_2: imagemDetalhe2 || null,
        valor: usesTurmaFinanceiro ? (curso.valor ?? null) : normalized.valorBase,
        financeiro_config: normalized
      });
      setFinanceiroConfig(normalized);
      if (!usesTurmaFinanceiro) {
        setValorCurso(moneyInputValue(normalized.valorBase));
        setValorBaseInput(moneyInputValue(normalized.valorBase));
        setDescontoInput(moneyInputValue(normalized.descontoPontualidade));
      }
      onUpdate();
    } catch (err) {
      console.error('Erro ao salvar política financeira do curso:', err);
      alert('Erro ao salvar a política financeira do curso.');
    } finally {
      setIsSavingFinanceiro(false);
    }
  };

  const handleAddModulo = () => {
    if (!newModuloName.trim()) return;
    setModulos(prev => [...prev, {
      id: `temp-mod-${Math.random().toString(36).substr(2, 9)}`,
      nome: newModuloName,
      disciplinas: []
    }]);
    setNewModuloName('');
  };

  const handleRemoveModulo = (moduloId: string) => {
    if (confirm('Remover este módulo e todo seu conteúdo?')) {
      setModulos(prev => prev.filter(modulo => modulo.id !== moduloId));
    }
  };

  const handleAddDisciplina = (moduloId: string) => {
    if (!newDiscName.trim()) return;
    let teoria = 0;
    let pratica = 0;
    let estagio = 0;
    const horas = curso.modalidade === 'TECNICO'
      ? (() => {
          teoria = parseInt(newDiscTeoria) || 0;
          pratica = parseInt(newDiscPratica) || 0;
          estagio = parseInt(newDiscEstagio) || 0;
          return teoria + pratica + estagio;
        })()
      : parseInt(newDiscHoras) || 0;
    const novaDisciplina: Disciplina = {
      id: `temp-disc-${Math.random().toString(36).substr(2, 9)}`,
      nome: newDiscName,
      cargaHoraria: horas,
      cargaHorariaTeoria: teoria,
      cargaHorariaPratica: pratica,
      cargaHorariaEstagio: estagio,
      descricao: newDiscDesc.trim() || undefined,
      aulas: []
    };
    setModulos(prev => prev.map(modulo => modulo.id === moduloId
      ? { ...modulo, disciplinas: [...modulo.disciplinas, novaDisciplina] }
      : modulo));
    setNewDiscName('');
    setNewDiscHoras('');
    setNewDiscTeoria('');
    setNewDiscPratica('');
    setNewDiscEstagio('');
    setNewDiscDesc('');
    setAddingDiscToModId(null);
  };

  const handleRemoveDisciplina = (moduloId: string, disciplinaId: string) => {
    if (confirm(`Remover ${config.labelDisciplina.toLowerCase()}?`)) {
      setModulos(prev => prev.map(modulo => modulo.id === moduloId
        ? { ...modulo, disciplinas: modulo.disciplinas.filter(disciplina => disciplina.id !== disciplinaId) }
        : modulo));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await cadastrosService.saveGrade(curso.id, modulos);
      await loadKpis();
      onUpdate();
      setIsSaving(false);
      alert('Grade curricular salva no Supabase com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar grade no banco de dados.');
      setIsSaving(false);
    }
  };

  const handleToggleVacinaObrigatoria = (codigo: string) => {
    setVacinasConfig(prev => ({
      ...prev,
      vacinas: prev.vacinas.map(vacina => vacina.codigo === codigo
        ? { ...vacina, obrigatoria: !vacina.obrigatoria }
        : vacina)
    }));
  };

  const handleSaveVacinasCurso = async () => {
    setIsSavingVacinas(true);
    try {
      await cadastrosService.updateCurso({ ...curso, vacinas_config: vacinasConfig });
      onUpdate();
      alert('Configuração de vacinas salva com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar configuração de vacinas.');
    } finally {
      setIsSavingVacinas(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      <CursoGradeCurricularHeader
        curso={curso}
        config={config}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        turmasCount={turmasVinculadas.length}
        loading={loading}
        isSaving={isSaving}
        isSavingVacinas={isSavingVacinas}
        loadingKpis={loadingKpis}
        kpis={kpis}
        onBack={onBack}
        onSave={handleSave}
        onSaveVacinas={handleSaveVacinasCurso}
      />

      {activeTab === 'turmas' && <CursoTurmasTab turmas={turmasVinculadas} loading={loadingTurmas} config={config} />}
      {activeTab === 'financeiro' && (
        <CursoFinanceiroTab
          financeiroConfig={financeiroConfig}
          valorBaseInput={valorBaseInput}
          descontoInput={descontoInput}
          isSaving={isSavingFinanceiro}
          usesTurmaFinanceiro={usesTurmaFinanceiro}
          setValorBaseInput={setValorBaseInput}
          setDescontoInput={setDescontoInput}
          updateConfig={updateFinanceiroConfig}
          updateNested={updateFinanceiroNested}
          onSave={handleSaveFinanceiroCurso}
        />
      )}
      {activeTab === 'vacinas' && (
        <CursoVacinasTab
          config={vacinasConfig}
          setConfig={setVacinasConfig}
          onUseHealthPreset={() => setVacinasConfig(REQUIRED_HEALTH_VACCINES)}
          onToggleObrigatoria={handleToggleVacinaObrigatoria}
        />
      )}
      {activeTab === 'publico' && <CursoPublicoTab curso={curso} publication={publication} />}
      {activeTab === 'grade' && (
        <CursoGradeTab
          curso={curso}
          config={config}
          modulos={modulos}
          loading={loading}
          newModuloName={newModuloName}
          addingDiscToModId={addingDiscToModId}
          newDiscName={newDiscName}
          newDiscHoras={newDiscHoras}
          newDiscTeoria={newDiscTeoria}
          newDiscPratica={newDiscPratica}
          newDiscEstagio={newDiscEstagio}
          newDiscDesc={newDiscDesc}
          setModulos={setModulos}
          setNewModuloName={setNewModuloName}
          setAddingDiscToModId={setAddingDiscToModId}
          setNewDiscName={setNewDiscName}
          setNewDiscHoras={setNewDiscHoras}
          setNewDiscTeoria={setNewDiscTeoria}
          setNewDiscPratica={setNewDiscPratica}
          setNewDiscEstagio={setNewDiscEstagio}
          setNewDiscDesc={setNewDiscDesc}
          onAddModulo={handleAddModulo}
          onRemoveModulo={handleRemoveModulo}
          onAddDisciplina={handleAddDisciplina}
          onRemoveDisciplina={handleRemoveDisciplina}
        />
      )}
    </div>
  );
};

export default CursoGradeCurricularDetails;
