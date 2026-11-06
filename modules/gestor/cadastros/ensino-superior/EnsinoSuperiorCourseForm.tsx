import React from 'react';
import { AlertCircle, Building, X } from 'lucide-react';
import { Curso } from '../cadastros.types';

interface EnsinoSuperiorCourseFormProps {
  readOnly: boolean;
  showFormModal: boolean;
  setShowFormModal: (value: boolean) => void;
  editingCurso: Curso | null;
  handleSaveCurso: (event: React.FormEvent) => void;
  nome: string;
  setNome: (value: string) => void;
  grau: string;
  setGrau: (value: string) => void;
  tipoEnsino: string;
  setTipoEnsino: (value: string) => void;
  versao: string;
  setVersao: (value: string) => void;
  customArea: string;
  setCustomArea: (value: string) => void;
  parceirosPj: any[] | undefined;
  parceiroTipo: string;
  handlePartnerSelectChange: (value: string) => void;
  parceiroNomeCustom: string;
  setParceiroNomeCustom: (value: string) => void;
  imagemUrl: string;
  setImagemUrl: (value: string) => void;
  isUploading: boolean;
  handleUploadImagem: (event: React.ChangeEvent<HTMLInputElement>) => void;
  descricao: string;
  setDescricao: (value: string) => void;
  isSaving: boolean;
}

const EnsinoSuperiorCourseForm: React.FC<EnsinoSuperiorCourseFormProps> = ({
  readOnly,
  showFormModal,
  setShowFormModal,
  editingCurso,
  handleSaveCurso,
  nome,
  setNome,
  grau,
  setGrau,
  tipoEnsino,
  setTipoEnsino,
  versao,
  setVersao,
  customArea,
  setCustomArea,
  parceirosPj,
  parceiroTipo,
  handlePartnerSelectChange,
  parceiroNomeCustom,
  setParceiroNomeCustom,
  imagemUrl,
  setImagemUrl,
  isUploading,
  handleUploadImagem,
  descricao,
  setDescricao,
  isSaving,
}: EnsinoSuperiorCourseFormProps) => (
  <>
      {/* Modal de Formulário (Criar/Editar) */}
      {!readOnly && showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowFormModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6">
              {editingCurso ? 'Editar Curso Superior' : 'Novo Curso Superior'}
            </h3>
            
            <form onSubmit={handleSaveCurso} className="space-y-4">
              {/* Nome do Curso */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Graduação / Pós-Graduação</label>
                <input 
                  required
                  type="text" 
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Bacharelado em Administração"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Categoria/Grau e Tipo/Modalidade/Versão */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Grau / Categoria</label>
                  <select 
                    value={grau}
                    onChange={(e) => setGrau(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="Bacharelado">Bacharelado</option>
                    <option value="Licenciatura">Licenciatura</option>
                    <option value="Tecnologia">Tecnologia (Cursos Superiores de)</option>
                    <option value="Outro">Outra Categoria</option>
                  </select>
                </div>

                {(grau === 'Bacharelado' || grau === 'Licenciatura') ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo / Modalidade</label>
                    <select 
                      value={tipoEnsino}
                      onChange={(e) => setTipoEnsino(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="SEMIPRESENCIAL">Semipresencial</option>
                      <option value="100% ONLINE">100% Online</option>
                      <option value="PRESENCIAL">Presencial</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                    <input 
                      required
                      type="text" 
                      value={versao}
                      onChange={(e) => setVersao(e.target.value)}
                      placeholder="Ex: 1.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Se for Outro, exibe campo personalizado */}
              {grau === 'Outro' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Categoria Personalizada</label>
                  <input 
                    required
                    type="text" 
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Ex: PÓS-GRADUAÇÃO - 100% ONLINE"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              )}

              {/* Se for Bacharelado ou Licenciatura, a Versão é exibida abaixo */}
              {(grau === 'Bacharelado' || grau === 'Licenciatura') && (
                <div className="grid grid-cols-2 gap-4">
                  <div></div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                    <input 
                      required
                      type="text" 
                      value={versao}
                      onChange={(e) => setVersao(e.target.value)}
                      placeholder="Ex: 1.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Escolha do Parceiro */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Instituição Parceira</label>
                {(!parceirosPj || parceirosPj.length === 0) ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <AlertCircle size={16} className="text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">
                      Nenhum parceiro PJ cadastrado ainda. <span className="font-black">Cadastre uma empresa em Parceiros → Pessoa Jurídica</span> antes de criar um curso superior.
                    </p>
                  </div>
                ) : (
                  <>
                    <select
                      value={parceiroTipo}
                      onChange={(e) => handlePartnerSelectChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="">Selecione o parceiro...</option>
                      {parceirosPj.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                      <option value="Outro">Outra Instituição (não cadastrada)</option>
                    </select>

                    {/* Preview da logo que virá do parceiro */}
                    {parceiroTipo && parceiroTipo !== 'Outro' && (() => {
                      const dbPartner = parceirosPj.find(p => p.id === parceiroTipo);
                      return dbPartner ? (
                        <div className="flex items-center gap-3 mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {dbPartner.foto ? (
                              <img src={dbPartner.foto} alt={dbPartner.nome} className="w-full h-full object-contain" />
                            ) : (
                              <Building size={20} className="text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-700">{dbPartner.nome}</p>
                            {dbPartner.foto ? (
                              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">✓ Logo cadastrada no perfil do parceiro</p>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-bold mt-0.5">⚠ Sem logo — cadastre no perfil do parceiro</p>
                            )}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </>
                )}

                {parceiroTipo === 'Outro' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Instituição</label>
                    <input
                      required
                      type="text"
                      value={parceiroNomeCustom}
                      onChange={(e) => setParceiroNomeCustom(e.target.value)}
                      placeholder="Ex: Faculdade São Luís"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    <p className="text-[10px] text-amber-600 font-medium mt-1.5">⚠ Sem logo — cadastre este parceiro em Parceiros → PJ para adicionar logo.</p>
                  </div>
                )}
              </div>

              {/* Imagem do Card (Upload) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Capa (Card)</label>
                <div className="flex items-center gap-4">
                  {imagemUrl ? (
                    <div className="relative w-24 h-16 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shrink-0">
                      <img src={imagemUrl} alt="Capa" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImagemUrl('')}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full transition-colors"
                        title="Remover Imagem"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-16 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                      Sem Capa
                    </div>
                  )}
                  <div className="flex-grow">
                    <label className="inline-block px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                      {isUploading ? 'Fazendo Upload...' : imagemUrl ? 'Alterar Imagem' : 'Upload de Imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImagem}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">Imagens recomendadas no formato 16:9.</p>
                  </div>
                </div>
              </div>

              {/* Descrição do Curso */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Descrição / História do Curso</label>
                <textarea 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Resumo da formação acadêmica, campos de atuação e objetivos da parceria..."
                  className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Ações */}
              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Curso'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowFormModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
  </>
);

export default EnsinoSuperiorCourseForm;
