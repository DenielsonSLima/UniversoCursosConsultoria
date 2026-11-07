import React from 'react';
import { Check, Upload, Globe, MapPin, GraduationCap, Search, Layers, Clock, Calendar } from 'lucide-react';
import type { Scope } from '../biblioteca.types';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { UploadSelectionList } from './UploadWizardPreviews';
import type { UploadWizardStepsProps } from './uploadWizard.types';

export default function UploadWizardSteps({
  currentStep, formData, setFormData, handleFileChange, formatSizeMB, accessOptions, accessMode, setMode, isProfessorUpload, polos,
  getPoloMeta, selectedCursos, setSelectedCursos, searchCurso, setSearchCurso, filteredCursos, toggleCurso, selectedTurmas, setSelectedTurmas, searchTurma,
  setSearchTurma, turmas, filteredTurmas, toggleTurma, availabilityMode, setAvailability, liberacaoData, setLiberacaoData, liberacaoDataFim, setLiberacaoDataFim,
  audienceLabels, selectedPoloName, selectedPolo, getPeriodEndLabel, getPeriodDays, selectedCursoNames, selectedTurmaNames, preview
}: UploadWizardStepsProps) {
  return <>
            {currentStep === 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 animate-fadeIn">
                <div className="space-y-5">
                  <div className="relative group">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`w-full min-h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all text-center px-5 ${
                        formData.file
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400'
                      }`}
                    >
                      {formData.file ? (
                        <>
                          <div className="w-11 h-11 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                            <Check size={22} />
                          </div>
                          <p className="text-sm font-black text-[#001a33] truncate max-w-full">{formData.file.name}</p>
                          <p className="text-[10px] text-emerald-700 font-black uppercase tracking-wider mt-1">
                            {formatSizeMB(formData.file.size)} MB - Clique para trocar
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="w-11 h-11 bg-white text-slate-400 rounded-full flex items-center justify-center mb-3 shadow-sm group-hover:text-blue-500 transition-colors">
                            <Upload size={22} />
                          </div>
                          <p className="text-sm font-black text-slate-650 group-hover:text-blue-700">Selecionar arquivo</p>
                          <p className="text-[11px] text-slate-400 mt-1">PDF, Word, Excel, PowerPoint e imagens até 10MB</p>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Titulo do Documento</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                      placeholder="Ex: Calendario Academico 2026"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Descricao</label>
                    <textarea
                      className="w-full min-h-28 resize-none px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                      placeholder="Breve descricao do conteudo"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>

                <div>{preview}</div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {accessOptions.map(option => {
                    const Icon = option.icon;
                    const isSelected = accessMode === option.mode;

                    return (
                      <button
                        type="button"
                        key={option.mode}
                        onClick={() => setMode(option.mode)}
                        className={`biblioteca-upload-access-option min-h-28 text-left p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-blue-200 bg-blue-50 shadow-sm'
                            : 'border-slate-150 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Icon size={18} />
                          </span>
                          {isSelected && <Check size={16} className="text-blue-600" />}
                        </div>
                        <p className="text-xs font-black text-[#001a33] uppercase tracking-wider mt-3">{option.title}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">{option.description}</p>
                      </button>
                    );
                  })}
                </div>

                {!isProfessorUpload && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                        <Globe size={12} /> Abrangencia
                      </label>
                      <InstitutionalSelect
                        className="biblioteca-upload-scope"
                        value={formData.scope}
                        onValueChange={(value) => setFormData({ ...formData, scope: value as Scope, poloId: '' })}
                        ariaLabel="Abrangencia"
                        options={[
                          { value: 'GLOBAL', label: 'Todos os polos' },
                          { value: 'POLO_ESPECIFICO', label: 'Polo especifico' }
                        ]}
                      />
                    </div>

                    {formData.scope === 'POLO_ESPECIFICO' && (
                      <div className="md:col-span-2 space-y-2 animate-fadeIn">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                          <MapPin size={12} /> Polo
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {polos.map(p => {
                            const isSelected = formData.poloId === p.id;

                            return (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() => setFormData({ ...formData, poloId: p.id })}
                                aria-pressed={isSelected}
                                className={`min-h-20 text-left px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-black uppercase tracking-wider truncate">
                                    {p.nome}
                                  </span>
                                  <span className="block text-[11px] font-bold text-slate-500 mt-1 truncate">
                                    {getPoloMeta(p)}
                                  </span>
                                </span>
                                {isSelected && <Check size={16} className="shrink-0 text-blue-600" />}
                              </button>
                            );
                          })}

                          {polos.length === 0 && (
                            <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-250 bg-slate-50 p-5 text-center text-[11px] font-bold uppercase text-slate-400">
                              Nenhum polo encontrado.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isProfessorUpload && accessMode === 'PRIVADO' && (
                  <div className="rounded-2xl border border-slate-150 bg-slate-50 p-5 text-xs font-bold text-slate-600 leading-relaxed">
                    Este documento ficará disponível apenas no seu repositório docente. Para liberar aos alunos, escolha a opção de turmas vinculadas.
                  </div>
                )}

                {(accessMode === 'CURSOS' || accessMode === 'TURMAS') && (
                  <div className={`grid grid-cols-1 ${isProfessorUpload ? '' : 'lg:grid-cols-2'} gap-5 animate-fadeIn`}>
                    {!isProfessorUpload && (
                      <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <GraduationCap size={14} className="text-blue-500" /> Cursos ({selectedCursos.length})
                        </label>
                        {selectedCursos.length > 0 && (
                          <button type="button" onClick={() => setSelectedCursos([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500">
                            Limpar
                          </button>
                        )}
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                        <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                        <input
                          type="text"
                          placeholder="Buscar curso..."
                          value={searchCurso}
                          onChange={(e) => setSearchCurso(e.target.value)}
                          className="bg-transparent border-none outline-none w-full font-medium"
                        />
                      </div>
                      <UploadSelectionList type="curso" items={filteredCursos} selectedIds={selectedCursos} onToggle={toggleCurso} />
                    </div>
                    )}

                    {accessMode === 'TURMAS' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers size={14} className="text-emerald-500" /> Turmas ({selectedTurmas.length})
                          </label>
                          {selectedTurmas.length > 0 && (
                            <button type="button" onClick={() => setSelectedTurmas([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500">
                              Limpar
                            </button>
                          )}
                        </div>
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                          <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                          <input
                            type="text"
                            placeholder={isProfessorUpload ? 'Buscar turma vinculada...' : selectedCursos.length > 0 ? 'Buscar turma nos cursos selecionados...' : 'Buscar turma...'}
                            value={searchTurma}
                            onChange={(e) => setSearchTurma(e.target.value)}
                            className="bg-transparent border-none outline-none w-full font-medium"
                          />
                        </div>
                        {isProfessorUpload && turmas.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-250 bg-slate-50 p-5 text-center text-[11px] font-bold uppercase text-slate-400">
                            Nenhuma turma ativa vinculada ao professor.
                          </div>
                        )}
                        <UploadSelectionList type="turma" items={filteredTurmas} selectedIds={selectedTurmas} onToggle={toggleTurma} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setAvailability('FREE')}
                    className={`min-h-32 text-left p-5 rounded-2xl border transition-all ${
                      availabilityMode === 'FREE'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                        availabilityMode === 'FREE' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Clock size={18} />
                      </span>
                      {availabilityMode === 'FREE' && <Check size={16} className="text-emerald-600" />}
                    </div>
                    <p className="text-sm font-black text-[#001a33] uppercase mt-4">Livre</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Disponivel assim que for publicado, sem data final.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAvailability('PERIOD')}
                    className={`min-h-32 text-left p-5 rounded-2xl border transition-all ${
                      availabilityMode === 'PERIOD'
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                        availabilityMode === 'PERIOD' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Calendar size={18} />
                      </span>
                      {availabilityMode === 'PERIOD' && <Check size={16} className="text-blue-600" />}
                    </div>
                    <p className="text-sm font-black text-[#001a33] uppercase mt-4">Periodo definido</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Escolha a data inicial e a data final de disponibilidade.</p>
                  </button>
                </div>

                {availabilityMode === 'PERIOD' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-2xl border border-blue-100 bg-blue-50/60 animate-fadeIn">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Data inicial</label>
                      <input
                        type="date"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                        value={liberacaoData}
                        onChange={(e) => setLiberacaoData(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Data final</label>
                      <input
                        type="date"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                        value={liberacaoDataFim}
                        onChange={(e) => setLiberacaoDataFim(e.target.value)}
                        min={liberacaoData || undefined}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6 animate-fadeIn">
                <div>{preview}</div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-150 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Documento</p>
                    <h4 className="text-lg font-black text-[#001a33] leading-tight">{formData.title || 'Sem titulo'}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-2">{formData.description || 'Sem descricao informada.'}</p>
                    {formData.file && (
                      <p className="text-[11px] text-slate-400 font-bold uppercase mt-3">
                        {formData.file.name} - {formatSizeMB(formData.file.size)} MB
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-150 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Acesso</p>
                      <p className="text-sm font-black text-slate-800">{audienceLabels[formData.targetAudience]}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formData.scope === 'GLOBAL' ? 'Todos os polos' : selectedPoloName}
                      </p>
                      {formData.scope === 'POLO_ESPECIFICO' && selectedPolo && (
                        <p className="text-[11px] text-slate-400 font-bold mt-1">
                          {getPoloMeta(selectedPolo)}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-150 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Disponibilidade</p>
                      <p className="text-sm font-black text-slate-800">
                        {availabilityMode === 'FREE'
                          ? 'Livre'
                          : `${new Date(`${liberacaoData}T00:00:00`).toLocaleDateString('pt-BR')} ate ${getPeriodEndLabel()}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {availabilityMode === 'FREE' ? 'Sem restricao de periodo' : `${getPeriodDays()} dia(s) de acesso`}
                      </p>
                    </div>
                  </div>

                  {(selectedCursoNames.length > 0 || selectedTurmaNames.length > 0) && (
                    <div className="rounded-2xl border border-slate-150 p-4 space-y-3">
                      {selectedCursoNames.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cursos selecionados</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedCursoNames.map(name => (
                              <span key={name} className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedTurmaNames.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Turmas selecionadas</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedTurmaNames.map(name => (
                              <span key={name} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
  </>;
}
