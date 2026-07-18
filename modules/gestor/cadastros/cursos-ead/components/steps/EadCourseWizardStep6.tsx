import { Plus, Trash2, HelpCircle, ListChecks } from 'lucide-react';
import { useEadCourseWizardContext } from '../EadCourseWizardContext';
import { MIN_EAD_PROVA_QUESTOES } from '../eadCourseWizard.helpers';

const EadCourseWizardStep6 = () => {
  const {
    conteudos,
    atividades,
    newAtividadeTitulo,
    setNewAtividadeTitulo,
    newAtividadeEnunciado,
    setNewAtividadeEnunciado,
    newAtividadeEtapaId,
    setNewAtividadeEtapaId,
    newAtividadeTipo,
    setNewAtividadeTipo,
    newAtividadeOpcoes,
    setNewAtividadeOpcoes,
    newAtividadeCorreta,
    setNewAtividadeCorreta,
    provas,
    selectedProvaIdx,
    setSelectedProvaIdx,
    newProvaTitle,
    setNewProvaTitle,
    newProvaMinScore,
    setNewProvaMinScore,
    newQuestaoPergunta,
    setNewQuestaoPergunta,
    newQuestaoOpcao0,
    setNewQuestaoOpcao0,
    newQuestaoOpcao1,
    setNewQuestaoOpcao1,
    newQuestaoOpcao2,
    setNewQuestaoOpcao2,
    newQuestaoOpcao3,
    setNewQuestaoOpcao3,
    newQuestaoCorreta,
    setNewQuestaoCorreta,
    handleAddAtividade,
    handleRemoveAtividade,
    handleAddProva,
    handleAddQuestao,
    handleRemoveQuestao,
    handleRemoveProva,
  } = useEadCourseWizardContext();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><HelpCircle size={20} /></span>
        <div>
          <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Atividades e Provas Avaliativas</h4>
          <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre atividades obrigatórias por etapa antes da prova final.</p>
        </div>
      </div>

      <div className="border border-emerald-200 rounded-3xl p-5 bg-emerald-50/40 space-y-4">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-emerald-700" />
          <h5 className="font-black text-sm text-[#001a33] uppercase tracking-tight">Atividades antes da prova</h5>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Título da atividade</label>
            <input
              className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
              value={newAtividadeTitulo}
              onChange={e => setNewAtividadeTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Vincular à etapa</label>
            <select
              className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
              value={newAtividadeEtapaId}
              onChange={e => setNewAtividadeEtapaId(e.target.value)}
            >
              <option value="">Geral do curso</option>
              {conteudos.map((conteudo, index) => (
                <option key={conteudo.id} value={conteudo.id}>Etapa {conteudo.etapa || index + 1}: {conteudo.titulo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Enunciado</label>
          <textarea
            rows={3}
            className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-medium text-xs resize-none"
            value={newAtividadeEnunciado}
            onChange={e => setNewAtividadeEnunciado(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Tipo</label>
            <select
              className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
              value={newAtividadeTipo}
              onChange={e => setNewAtividadeTipo(e.target.value as any)}
            >
              <option value="reflexao">Resposta reflexiva</option>
              <option value="multipla_escolha">Múltipla escolha</option>
            </select>
          </div>
          {newAtividadeTipo === 'multipla_escolha' && (
            <>
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Opções (uma por linha)</label>
                <textarea
                  rows={3}
                  className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-medium text-xs resize-none"
                  value={newAtividadeOpcoes}
                  onChange={e => setNewAtividadeOpcoes(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black text-emerald-700 uppercase tracking-widest">Correta (0, 1, 2...)</label>
                <input
                  type="number"
                  className="w-full px-4 py-2 bg-white border border-emerald-150 rounded-xl outline-none font-bold text-xs"
                  value={newAtividadeCorreta}
                  onChange={e => setNewAtividadeCorreta(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between items-center gap-4">
          <span className="text-[10px] text-emerald-800 font-bold">{atividades.length} atividade(s) cadastrada(s)</span>
          <button
            onClick={handleAddAtividade}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
          >
            <Plus size={14} /> Adicionar Atividade
          </button>
        </div>

        {atividades.length > 0 && (
          <div className="grid grid-cols-1 gap-2">
            {atividades.map((atividade) => (
              <div key={atividade.id} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3">
                <div>
                  <p className="text-xs font-black text-[#001a33]">{atividade.titulo}</p>
                  <p className="text-[10px] text-slate-500 font-medium line-clamp-1">{atividade.enunciado}</p>
                </div>
                <button onClick={() => handleRemoveAtividade(atividade.id)} className="text-slate-350 hover:text-red-500">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Abas de Provas */}
      <div className="flex flex-col md:flex-row gap-6">

        {/* Lado Esquerdo: Lista de Provas */}
        <div className="w-full md:w-64 space-y-3 shrink-0">
          <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Avaliações ({provas.length})</span>
          </div>

          <div className="space-y-2">
            {provas.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setSelectedProvaIdx(idx)}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                  selectedProvaIdx === idx
                    ? 'bg-purple-50 border-purple-200 text-purple-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="truncate pr-2">
                  <p className="text-xs font-bold">{p.titulo}</p>
                  <p className={`text-[9px] mt-0.5 ${p.questoes.length >= MIN_EAD_PROVA_QUESTOES ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {p.questoes.length}/{MIN_EAD_PROVA_QUESTOES} questões mín. • Min: {p.notaMinima}%
                  </p>
                </div>
                <Trash2
                  size={14}
                  className="text-slate-350 hover:text-red-500 shrink-0 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handleRemoveProva(idx); }}
                />
              </button>
            ))}

            {/* Cadastrar Nova Prova */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 mt-2">
              <input
                type="text"
                placeholder="Título da Prova..."
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold"
                value={newProvaTitle}
                onChange={e => setNewProvaTitle(e.target.value)}
              />
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Mínimo %"
                  className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold text-center"
                  value={newProvaMinScore}
                  onChange={e => setNewProvaMinScore(e.target.value)}
                />
                <button
                  onClick={handleAddProva}
                  className="px-3 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] uppercase font-bold shrink-0"
                >
                  Criar
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito: Editor de Questões */}
        <div className="flex-1 border border-slate-200 rounded-2xl p-5 bg-white space-y-6">
          {provas.length === 0 ? (
            <div className="text-center py-16 text-slate-400 font-bold text-xs uppercase">
              Crie uma avaliação na barra lateral para começar a configurar as perguntas.
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h5 className="font-bold text-sm text-[#001a33] uppercase">Perguntas de: {provas[selectedProvaIdx]?.titulo}</h5>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">
                    Aprovação mínima: {provas[selectedProvaIdx]?.notaMinima}%
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    (provas[selectedProvaIdx]?.questoes.length || 0) >= MIN_EAD_PROVA_QUESTOES
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {(provas[selectedProvaIdx]?.questoes.length || 0)}/{MIN_EAD_PROVA_QUESTOES} questões
                  </span>
                </div>
              </div>

              {/* Criar Nova Questão */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Enunciado da Pergunta *</label>
                  <input
                    type="text"
                    placeholder="Qual a pergunta da questão?"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none font-bold"
                    value={newQuestaoPergunta}
                    onChange={e => setNewQuestaoPergunta(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Alternativas (Selecione a Correta)</label>

                  {/* Opção 1 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="questao_correta"
                      checked={newQuestaoCorreta === 0}
                      onChange={() => setNewQuestaoCorreta(0)}
                      className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <input
                      type="text"
                      placeholder="Opção A *"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                      value={newQuestaoOpcao0}
                      onChange={e => setNewQuestaoOpcao0(e.target.value)}
                    />
                  </div>

                  {/* Opção 2 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="questao_correta"
                      checked={newQuestaoCorreta === 1}
                      onChange={() => setNewQuestaoCorreta(1)}
                      className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <input
                      type="text"
                      placeholder="Opção B *"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                      value={newQuestaoOpcao1}
                      onChange={e => setNewQuestaoOpcao1(e.target.value)}
                    />
                  </div>

                  {/* Opção 3 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="questao_correta"
                      checked={newQuestaoCorreta === 2}
                      onChange={() => setNewQuestaoCorreta(2)}
                      className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <input
                      type="text"
                      placeholder="Opção C (Opcional)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                      value={newQuestaoOpcao2}
                      onChange={e => setNewQuestaoOpcao2(e.target.value)}
                    />
                  </div>

                  {/* Opção 4 */}
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="questao_correta"
                      checked={newQuestaoCorreta === 3}
                      onChange={() => setNewQuestaoCorreta(3)}
                      className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                    />
                    <input
                      type="text"
                      placeholder="Opção D (Opcional)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                      value={newQuestaoOpcao3}
                      onChange={e => setNewQuestaoOpcao3(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleAddQuestao(selectedProvaIdx)}
                    className="px-4 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider"
                  >
                    Adicionar Questão
                  </button>
                </div>
              </div>

              {/* Lista de Questões Adicionadas */}
              <div className="space-y-3">
                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Questões criadas ({provas[selectedProvaIdx]?.questoes.length}) • mínimo obrigatório: {MIN_EAD_PROVA_QUESTOES}
                </h6>
                {provas[selectedProvaIdx]?.questoes.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-xs italic">Nenhuma pergunta cadastrada para esta prova.</p>
                ) : (
                  <div className="space-y-4">
                    {provas[selectedProvaIdx].questoes.map((q, qIdx) => (
                      <div key={q.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 relative group">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h6 className="font-bold text-xs text-[#001a33]">{qIdx + 1}. {q.pergunta}</h6>
                            <ul className="mt-2 space-y-1 pl-4 list-disc text-[11px] text-slate-650 font-medium">
                              {q.opcoes.map((op, oIdx) => (
                                <li key={oIdx} className={q.respostaCorreta === oIdx ? 'text-emerald-600 font-bold' : ''}>
                                  {op} {q.respostaCorreta === oIdx && '✔'}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <button
                            onClick={() => handleRemoveQuestao(selectedProvaIdx, q.id)}
                            className="text-slate-350 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EadCourseWizardStep6;
