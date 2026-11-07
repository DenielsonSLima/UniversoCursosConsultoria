import React from 'react';
import { Building, AlertCircle, Search, Loader2, CheckCircle2, Save } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { Polo } from '../polos.service';
type CnpjMessage = { type: 'error' | 'success'; text: string } | null;
interface PoloEditorProps {
 polos: Polo[]; isEditing: string | null; editingPolo: Partial<Polo>;
 setEditingPolo: React.Dispatch<React.SetStateAction<Partial<Polo>>>;
 handleCnpjChange: (value: string) => void;
 handleConsultarCnpj: () => void; isSearchingCnpj: boolean; cnpjMessage: CnpjMessage;
 maskCep: (value: string) => string; maskPhoneList: (value: string) => string;
 setIsEditing: React.Dispatch<React.SetStateAction<string | null>>;
 setCnpjMessage: React.Dispatch<React.SetStateAction<CnpjMessage>>;
 handleSave: () => void; saveMutation: { isPending: boolean };
}
const PoloEditor: React.FC<PoloEditorProps> = ({ polos, isEditing, editingPolo, setEditingPolo,
 handleCnpjChange, handleConsultarCnpj, isSearchingCnpj, cnpjMessage, maskCep, maskPhoneList,
 setIsEditing, setCnpjMessage, handleSave, saveMutation }) => (
<div className="config-section config-card config-access-card config-access-form lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm animate-fadeIn flex flex-col h-full">
            <h4 className="font-black text-[#001a33] text-lg mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Building size={20} className="text-blue-600" /> 
              {polos.find(p => p.id === isEditing) ? 'Editar Polo' : 'Novo Polo'}
            </h4>
            
            {editingPolo.is_matriz && (
              <div className="bg-blue-50 border border-blue-100 text-blue-800 p-4 rounded-2xl text-xs font-semibold mb-6 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-blue-600 flex-shrink-0 mt-0.5" />
                <p>
                  Este polo representa a <strong>Matriz</strong>. O Nome e o CNPJ são sincronizados automaticamente a partir das configurações em <strong>Dados da Empresa</strong>.
                </p>
              </div>
            )}
            
            <div className="space-y-5 flex-1">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Nome do Polo</label>
                <input
                  type="text"
                  value={editingPolo.nome || ''}
                  onChange={e => setEditingPolo({...editingPolo, nome: e.target.value})}
                  disabled={editingPolo.is_matriz}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="Ex: Polo Matriz"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Complemento</label>
                <input
                  type="text"
                  value={editingPolo.complemento || ''}
                  disabled={editingPolo.is_matriz}
                  onChange={e => setEditingPolo({...editingPolo, complemento: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: Edifício, sala ou referência"}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CNPJ</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={18}
                      value={editingPolo.cnpj || ''}
                      onChange={e => handleCnpjChange(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (editingPolo.cnpj || '').replace(/\D/g, '').length === 14) {
                          e.preventDefault();
                          void handleConsultarCnpj();
                        }
                      }}
                      disabled={editingPolo.is_matriz || isSearchingCnpj}
                      className="min-w-0 flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold font-mono text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      placeholder="00.000.000/0000-00"
                    />
                    {!editingPolo.is_matriz && (
                      <button
                        type="button"
                        onClick={() => void handleConsultarCnpj()}
                        disabled={isSearchingCnpj || (editingPolo.cnpj || '').replace(/\D/g, '').length !== 14}
                        className="px-4 bg-slate-900 hover:bg-[#001a33] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shadow-sm disabled:cursor-not-allowed"
                        title="Consultar CNPJ na BrasilAPI"
                      >
                        {isSearchingCnpj ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Search size={14} />
                        )}
                        <span className="hidden sm:inline">
                          {isSearchingCnpj ? 'Consultando' : 'Consultar'}
                        </span>
                      </button>
                    )}
                  </div>
                  {cnpjMessage && !editingPolo.is_matriz && (
                    <p
                      role="status"
                      aria-live="polite"
                      className={`text-[11px] font-bold mt-1 ml-0.5 flex items-center gap-1 animate-fadeIn ${
                        cnpjMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {cnpjMessage.type === 'success' ? (
                        <CheckCircle2 size={11} />
                      ) : (
                        <AlertCircle size={11} />
                      )}
                      {cnpjMessage.text}
                    </p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Status</label>
                  <InstitutionalSelect
  value={String(editingPolo.status || 'ativo')}
  onValueChange={(value) => (e => setEditingPolo({...editingPolo, status: e.target.value as 'ativo' | 'inativo'}))({ target: { value, name: "", type: 'select-one', tagName: 'SELECT' }, currentTarget: { value, name: "", type: 'select-one', tagName: 'SELECT' } } as React.ChangeEvent<HTMLSelectElement>)}
  ariaLabel="Status do polo"
  options={[({ value: String("ativo"), label: "Ativo" }),
({ value: String("inativo"), label: "Inativo" }) ]}
  className="w-full"
  disabled={editingPolo.is_matriz}
/>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cidade</label>
                  <input
                    type="text"
                    value={editingPolo.cidade || ''}
                    onChange={e => setEditingPolo({...editingPolo, cidade: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Estado (UF)</label>
                  <input
                    type="text"
                    maxLength={2}
                    value={editingPolo.estado || ''}
                    onChange={e => setEditingPolo({...editingPolo, estado: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Endereço / Logradouro</label>
                  <input
                    type="text"
                    value={editingPolo.endereco || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, endereco: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: Rua Principal"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Número</label>
                  <input
                    type="text"
                    value={editingPolo.numero || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, numero: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: 100"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Bairro</label>
                  <input
                    type="text"
                    value={editingPolo.bairro || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, bairro: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: Centro"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">CEP</label>
                  <input
                    type="text"
                    value={editingPolo.cep || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, cep: maskCep(e.target.value)})}
                    inputMode="numeric"
                    maxLength={9}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: 49950-000"}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Telefone / Contato</label>
                  <input
                    type="text"
                    value={editingPolo.telefone || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, telefone: maskPhoneList(e.target.value)})}
                    inputMode="tel"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: (79) 99999-0000 / (79) 99999-0001"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">E-mail</label>
                  <input
                    type="email"
                    value={editingPolo.email || ''}
                    disabled={editingPolo.is_matriz}
                    onChange={e => setEditingPolo({...editingPolo, email: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 focus:bg-white font-bold text-slate-700 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder={editingPolo.is_matriz ? "Sincronizado da empresa principal" : "Ex: polo@exemplo.com"}
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsEditing(null);
                  setCnpjMessage(null);
                }}
                className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-8 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
              >
                <Save size={16} /> {saveMutation.isPending ? 'Salvando...' : 'Salvar Polo'}
              </button>
            </div>

          </div>
);

export default PoloEditor;
