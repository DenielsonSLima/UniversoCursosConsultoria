import forge from 'npm:node-forge@1.4.3';

const MAX_ITERATIONS=200_000;
type Node={type:number;value:string|Node[]};
function iterations(node: Node | undefined) {
  if (!node || node.type!==forge.asn1.Type.INTEGER || typeof node.value!=='string'
    || !node.value.length || node.value.length>4 || (node.value.charCodeAt(0)&128)) throw new Error('INVALID_KDF_COST');
  let count=0;
  for (const character of node.value) count=count*256+character.charCodeAt(0);
  if (count<1 || count>MAX_ITERATIONS) throw new Error('INVALID_KDF_COST');
}

/** Inspect visible KDF parameters before any MAC derivation or decryption. */
export function assertPfxCost(root: Node) {
  if (Array.isArray(root.value)) {
    const mac=root.value[2];
    if (mac && Array.isArray(mac.value) && mac.value[2]) iterations(mac.value[2]);
  }
  const pending=[{node:root,depth:0}]; let count=0;
  while (pending.length) {
    const {node,depth}=pending.pop()!;
    if (++count>4000 || depth>32) throw new Error('INVALID_ASN1_COMPLEXITY');
    if (Array.isArray(node.value)) {
      const [oid,params]=node.value;
      if (oid?.type===forge.asn1.Type.OID && typeof oid.value==='string') {
        const id=forge.asn1.derToOid(oid.value);
        if (id==='1.2.840.113549.1.5.12' || /^1\.2\.840\.113549\.1\.12\.1\.[1-6]$/.test(id)) {
          if (!params || !Array.isArray(params.value)) throw new Error('INVALID_KDF_PARAMETERS');
          iterations(params.value[1]);
        }
      }
      for (const child of node.value) pending.push({node:child,depth:depth+1});
    } else if (node.type===forge.asn1.Type.OCTETSTRING && node.value.charCodeAt(0)===48) {
      // AuthenticatedSafe and data SafeContents are DER carried in OCTET STRINGs.
      // Ciphertext is opaque; malformed incidental sequences are not followed.
      let inner: Node | undefined;
      try {inner=forge.asn1.fromDer(node.value,true);} catch {continue;}
      pending.push({node:inner!,depth:depth+1});
    }
  }
}
