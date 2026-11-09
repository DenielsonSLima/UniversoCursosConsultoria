import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { NfseConfigurationDefinition } from '../../../emissor-nfse/services/configuration/configuration.types';

type RegimeDraft = {
  opSimpNac: NfseConfigurationDefinition['opSimpNac'] | '';
  regEspTrib: NfseConfigurationDefinition['regEspTrib'] | '';
  regApTribSN: NfseConfigurationDefinition['regApTribSN'];
};
interface Props { draft: RegimeDraft; disabled: boolean; onChange: (patch: Partial<RegimeDraft>) => void }

export default function NfseTaxRegimeFields({ draft,disabled,onChange }: Props) {
  return <div className="nfse-portal-fields mt-4">
    <label><span>Opção pelo Simples Nacional</span><InstitutionalSelect
      ariaLabel="Opção pelo Simples Nacional" value={draft.opSimpNac} required disabled={disabled}
      options={[{value:'1',label:'Não optante'},{value:'2',label:'Optante · MEI'},{value:'3',label:'Optante · ME/EPP'}]}
      onValueChange={value => {
        if (value==='1' || value==='2' || value==='3') onChange({opSimpNac:value,regApTribSN:null});
      }} /></label>
    <label><span>Regime especial de tributação</span><InstitutionalSelect
      ariaLabel="Regime especial de tributação" value={draft.regEspTrib} required disabled={disabled}
      options={[{value:'0',label:'Nenhum'},{value:'1',label:'Ato cooperado'},{value:'2',label:'Estimativa'},
        {value:'3',label:'Microempresa municipal'},{value:'4',label:'Notário ou registrador'},
        {value:'5',label:'Profissional autônomo'},{value:'6',label:'Sociedade de profissionais'},{value:'9',label:'Outros'}]}
      onValueChange={value => {
        if (['0','1','2','3','4','5','6','9'].includes(value)) onChange({regEspTrib:value as RegimeDraft['regEspTrib']});
      }} /></label>
    {draft.opSimpNac==='3' && <label><span>Apuração tributária do Simples</span><InstitutionalSelect
      ariaLabel="Apuração tributária do Simples" value={draft.regApTribSN || ''} disabled={disabled}
      options={[{value:'',label:'Não informado'},{value:'1',label:'Tributos federais e ISSQN no Simples Nacional'},
        {value:'2',label:'Federais no Simples; ISSQN conforme legislação municipal'},
        {value:'3',label:'Federais e ISSQN fora do Simples Nacional'}]}
      onValueChange={value => {
        if (value==='') onChange({regApTribSN:null});
        else if (value==='1' || value==='2' || value==='3') onChange({regApTribSN:value});
      }} /></label>}
    <p className="nfse-portal-note">Informe o enquadramento fiscal confirmado do estabelecimento. Salvar parâmetros não valida poderes de representação ou autorização para emitir.</p>
  </div>;
}
