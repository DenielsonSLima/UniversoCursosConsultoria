// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoResponsavel.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { UserCheck, ShieldAlert, Save } from 'lucide-react';
import { parceirosService } from '../../../../parceiros.service';

interface ParceiroAlunoResponsavelProps {
  aluno: any;
  onChange: (data: any) => void;
}

const ParceiroAlunoResponsavel: React.FC<ParceiroAlunoResponsavelProps> = ({ aluno, onChange }) => {
  const [formData, setFormData] = useState({
    nome: aluno.responsavelNome || '',
    cpf: aluno.responsavelCpf || '',
    parentesco: aluno.responsavelParentesco || 'Mãe'
  });

  const isMaiorDeIdade = useMemo(() => {
    if (!aluno.dataNascimento) return true;
    const hoje = new Date();
    const nasc = new Date(aluno.dataNascimento);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) {
        idade--;
    }
    return idade >= 18;
  }, [aluno.dataNascimento]);

  const [isProprioResp, setIsProprioResp] = useState(
    !aluno.responsavelNome && isMaiorDeIdade
  );

  useEffect(() => {
    setFormData({
      nome: aluno.responsavelNome || '',
      cpf: aluno.responsavelCpf || '',
      parentesco: aluno.responsavelParentesco || 'Mãe'
    });
    setIsProprioResp(!aluno.responsavelNome && isMaiorDeIdade);
  }, [aluno]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      const updatedFields = isProprioResp ? {
        responsavelNome: '',
        responsavelCpf: '',
        responsavelParentesco: ''
      } : {
        responsavelNome: formData.nome,
        responsavelCpf: formData.cpf,
        responsavelParentesco: formData.parentesco
      };

      const updated = await parceirosService.update(aluno.id, {
        ...aluno,
        ...updatedFields
      });
      
      onChange(updated);
      alert('Dados do responsável salvos com sucesso!');
    } catch (err) {
      alert('Erro ao salvar dados do responsável.');
      console.error(err);
    }
  };

  return (
    <div className="animate-fadeIn">
      {isMaiorDeIdade ? (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white text-blue-600 rounded-xl shadow-sm border border-slate-100">
                <UserCheck size={24} />
            </div>
            <div>
                <h4 className="text-slate-800 font-bold text-sm uppercase">Aluno Maior de Idade</h4>
                <p className="text-slate-550 text-xs mt-1 font-medium">
                    O aluno é o próprio responsável financeiro?
                </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <button 
               onClick={async () => {
                 setIsProprioResp(true);
                 // Auto save directly when selecting "É ele mesmo"
                 try {
                   const updated = await parceirosService.update(aluno.id, {
                     ...aluno,
                     responsavelNome: '',
                     responsavelCpf: '',
                     responsavelParentesco: ''
                   });
                   onChange(updated);
                 } catch (err) {
                   console.error(err);
                 }
               }}
               className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${isProprioResp ? 'bg-blue-650 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
             >
               Sim, É Ele Mesmo
             </button>
             <button 
               onClick={() => setIsProprioResp(false)}
               className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${!isProprioResp ? 'bg-blue-650 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}
             >
               Não, Outra Pessoa
             </button>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl mb-8 flex items-start gap-4">
          <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <ShieldAlert size={24} />
          </div>
          <div>
              <h4 className="text-amber-900 font-bold text-sm uppercase">Aluno Menor de Idade</h4>
              <p className="text-amber-700 text-sm mt-1 leading-relaxed">
                  É obrigatório o cadastro do responsável legal (pai, mãe, tutor) para fins de contrato e faturamento.
              </p>
          </div>
        </div>
      )}

      {isMaiorDeIdade && isProprioResp ? (
        <div className="py-12 flex flex-col items-center justify-center text-center animate-fadeIn">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-4 shadow-sm border border-emerald-100">
              <UserCheck size={40} />
          </div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-2">
              Responsabilidade Própria
          </h3>
          <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed">
              O próprio aluno será utilizado como contratante legal nas emissões de faturamento e termos contratuais.
          </p>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome do Responsável <span className="text-red-500">*</span></label>
                <input 
                    type="text" name="nome" value={formData.nome} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none transition-all"
                    placeholder="Nome completo do pai, mãe ou tutor"
                    required
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF do Responsável <span className="text-red-500">*</span></label>
                <input 
                    type="text" name="cpf" value={formData.cpf} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-mono focus:border-blue-500 outline-none transition-all"
                    placeholder="000.000.000-00"
                    required
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Grau de Parentesco</label>
                <select 
                    name="parentesco" value={formData.parentesco} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none transition-all cursor-pointer font-bold"
                >
                    <option value="Mãe">Mãe</option>
                    <option value="Pai">Pai</option>
                    <option value="Tutor Legal">Tutor Legal</option>
                    <option value="Outro">Outro</option>
                </select>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button 
              onClick={handleSave}
              className="flex items-center gap-2 bg-[#001a33] text-white px-8 py-4 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg"
            >
                <Save size={16} /> Salvar Responsável
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoResponsavel;
