import type React from 'react';
import { Loader2 } from 'lucide-react';

import ParceiroAlunoDisplayField from './ParceiroAlunoDisplayField';
import { formatPhoneDisplay } from './parceiro-aluno-dados.utils';

export type CepStatus = 'idle' | 'loading' | 'resolved' | 'not-found' | 'error';

interface AddressSectionProps {
  formData: any;
  isEditing: boolean;
  cepStatus: CepStatus;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const ParceiroAlunoAddressSection: React.FC<AddressSectionProps> = ({ formData, isEditing, cepStatus, onChange }) => (
  <div id="aluno-contato" className="scroll-mt-28 space-y-4 border-t border-slate-100 pt-6">
    <h4 className="text-base font-semibold text-[#001a33] border-b border-slate-100 pb-3">Contato e Endereço</h4>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="aluno-cep" className="block text-xs font-medium text-slate-600">CEP</label>
            <div className="relative">
              <input id="aluno-cep" type="text" name="cep" value={formData.cep || ''} onChange={onChange} maxLength={9} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm pr-10 bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
              {cepStatus === 'loading' && <Loader2 size={16} className="absolute right-3 top-3.5 animate-spin text-blue-500" />}
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="aluno-endereco" className="block text-xs font-medium text-slate-600">Endereço</label>
            <input id="aluno-endereco" type="text" name="endereco" value={formData.endereco || ''} onChange={onChange} autoComplete="street-address" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-numero" className="block text-xs font-medium text-slate-600">Número</label>
            <input id="aluno-numero" type="text" name="numero" value={formData.numero || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="aluno-complemento" className="block text-xs font-medium text-slate-600">Complemento</label>
            <input id="aluno-complemento" type="text" name="complemento" value={formData.complemento || ''} onChange={onChange} placeholder="APTO, BLOCO, PONTO DE REFERÊNCIA..." className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-bairro" className="block text-xs font-medium text-slate-600">Bairro</label>
            <input id="aluno-bairro" type="text" name="bairro" value={formData.bairro || ''} onChange={onChange} autoComplete="address-level3" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-cidade" className="block text-xs font-medium text-slate-600">Cidade</label>
            <input id="aluno-cidade" type="text" name="cidade" value={formData.cidade || ''} onChange={onChange} readOnly={cepStatus === 'resolved'} autoComplete="address-level2" className={`w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm border rounded-xl outline-none ${cepStatus === 'resolved' ? 'cursor-not-allowed border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 focus:border-blue-500'}`} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-uf" className="block text-xs font-medium text-slate-600">UF</label>
            <input id="aluno-uf" type="text" name="uf" value={formData.uf || ''} onChange={onChange} readOnly={cepStatus === 'resolved'} maxLength={2} autoComplete="address-level1" className={`w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm border rounded-xl outline-none ${cepStatus === 'resolved' ? 'cursor-not-allowed border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 focus:border-blue-500'}`} />
          </div>
          {cepStatus !== 'idle' && (
            <p className={`text-xs md:col-span-3 ${cepStatus === 'resolved' ? 'text-emerald-600' : cepStatus === 'loading' ? 'text-blue-600' : 'text-amber-600'}`}>
              {cepStatus === 'resolved' && 'CEP localizado. Cidade e UF foram preenchidas e bloqueadas.'}
              {cepStatus === 'loading' && 'Consultando CEP...'}
              {cepStatus === 'not-found' && 'CEP não encontrado. Confira o número; cidade e UF continuam liberadas.'}
              {cepStatus === 'error' && 'Não foi possível consultar o CEP agora. Cidade e UF continuam liberadas.'}
            </p>
          )}
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="aluno-email" className="block text-xs font-medium text-slate-600">E-mail</label>
            <input id="aluno-email" type="email" name="email" value={formData.email || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-telefone" className="block text-xs font-medium text-slate-600">Telefone / WhatsApp</label>
            <input id="aluno-telefone" type="tel" name="telefone" value={formData.telefone || formData.contato1 || ''} onChange={onChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="CEP" value={formData.cep} />
          <div className="md:col-span-2"><ParceiroAlunoDisplayField label="Endereço" value={formData.endereco} /></div>
          <ParceiroAlunoDisplayField label="Número" value={formData.numero} />
          <div className="md:col-span-2"><ParceiroAlunoDisplayField label="Complemento" value={formData.complemento} /></div>
          <ParceiroAlunoDisplayField label="Bairro" value={formData.bairro} />
          <ParceiroAlunoDisplayField label="Cidade" value={formData.cidade} />
          <ParceiroAlunoDisplayField label="UF" value={formData.uf} />
          <div className="md:col-span-2"><ParceiroAlunoDisplayField label="E-mail" value={formData.email} /></div>
          <ParceiroAlunoDisplayField label="Telefone / WhatsApp" value={formatPhoneDisplay(formData.telefone || formData.contato1)} />
        </>
      )}
    </div>
  </div>
);

export default ParceiroAlunoAddressSection;
