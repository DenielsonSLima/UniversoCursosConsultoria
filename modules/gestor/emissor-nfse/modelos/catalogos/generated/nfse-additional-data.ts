// Generated public domain snapshot split into bounded, readable data files.
import metadata from './nfse-additional-metadata.json';
import currencies01 from './nfse-currencies-01.json';
import currencies02 from './nfse-currencies-02.json';
import currencies03 from './nfse-currencies-03.json';
import currencies04 from './nfse-currencies-04.json';
import currencies05 from './nfse-currencies-05.json';
import currencies06 from './nfse-currencies-06.json';
const snapshot = { ...metadata, currencies: [...currencies01, ...currencies02, ...currencies03, ...currencies04, ...currencies05, ...currencies06] };
export default snapshot;
