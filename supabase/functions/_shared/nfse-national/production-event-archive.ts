import {Buffer} from 'node:buffer';
import {decodeFiscalXml,MAX_FISCAL_XML_BYTES} from './pilot-codec.ts';
import {requireContract} from './xml.ts';
import type {PreparedProductionCancellation} from './production.types.ts';
const maxInnerBase64=Math.ceil(MAX_FISCAL_XML_BYTES/3)*4;
const maxOuterBase64=Math.ceil(maxInnerBase64/3)*4;
/** Validates receipt metadata only. A local timestamp is not assigned UTC or used for a deadline. */
export function validProductionEventReceiptDate(value:unknown):boolean{
  if(typeof value!=='string'||value.length>80)return false;
  const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})?$/);
  if(!parts)return false;
  const [,year,month,day,hour,minute,second,fraction,zone]=parts;
  if(!zone&&fraction?.length!==3)return false;
  const y=Number(year),m=Number(month),d=Number(day);
  const leap=y%4===0&&(y%100!==0||y%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(y<1||m<1||m>12||d<1||d>days[m-1]||Number(hour)>23||Number(minute)>59||Number(second)>59)return false;
  return !zone||Number.isFinite(Date.parse(value));
}
/** Authenticated SEFIN event archive: Base64(ASCII Base64(GZip UTF8 XML)). */
export function decodeProductionEventArchive(value:unknown):string{
  requireContract(typeof value==='string'&&value.length>0&&value.length<=maxOuterBase64&&value.length%4===0&&
    /^[A-Za-z0-9+/]*={0,2}$/.test(value),'INVALID_EVENT_ARCHIVE_BASE64');
  const bytes=Buffer.from(value,'base64');
  requireContract(bytes.length>0&&bytes.length<=maxInnerBase64&&bytes.toString('base64')===value,'INVALID_EVENT_ARCHIVE_BASE64');
  // latin1 preserves high bytes so the ASCII grammar rejects them, rather than
  // masking their high bits or accepting a lossy UTF8 conversion.
  const inner=bytes.toString('latin1');
  requireContract(inner.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(inner),'INVALID_EVENT_ARCHIVE_INNER_BASE64');
  return decodeFiscalXml(inner);
}
export function productionEventArchiveItems(envelope:Record<string,unknown>,prepared:PreparedProductionCancellation){
  requireContract(Object.keys(envelope).sort().join(',')==='dataHoraProcessamento,eventos,tipoAmbiente,versaoAplicativo'&&
    Array.isArray(envelope.eventos)&&envelope.eventos.length===1,'EVENT_ARCHIVE_ENVELOPE_MISMATCH');
  const items=envelope.eventos as Record<string,unknown>[];
  for(const item of items){
    requireContract(item!==null&&typeof item==='object'&&!Array.isArray(item)&&
      Object.keys(item).sort().join(',')==='arquivoXml,chaveAcesso,dataHoraRecebimento,numeroPedidoRegistroEvento,tipoEvento',
    'EVENT_ARCHIVE_ITEM_MISMATCH');
    requireContract(typeof item.tipoEvento==='number'&&Number.isInteger(item.tipoEvento)&&String(item.tipoEvento)===prepared.input.eventCode,
      'EVENT_ARCHIVE_EVENT_TYPE_MISMATCH');
    requireContract(item.chaveAcesso===prepared.input.accessKey,'EVENT_ARCHIVE_ACCESS_KEY_MISMATCH');
    requireContract(validProductionEventReceiptDate(item.dataHoraRecebimento),'EVENT_ARCHIVE_RECEIVED_DATE_MISMATCH');
    requireContract(typeof item.numeroPedidoRegistroEvento==='number'&&Number.isInteger(item.numeroPedidoRegistroEvento),
      'EVENT_ARCHIVE_REQUEST_NUMBER_MISMATCH');
    // numeroPedidoRegistroEvento is a protocol number, not the event sequence.
  }
  return items;
}
