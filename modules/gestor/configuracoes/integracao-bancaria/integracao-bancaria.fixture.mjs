// Fictional local configuration. This module never invokes a live service.
export function createBankingFixture() {
  const modalities = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS_CREDITOS'];
  const environments = ['production', 'sandbox'];
  const providers = [{ code: 'banese_card', name: 'Banese', supportsPix: true, supportsBoleto: true,
    supportsCreditCard: false, active: true, metadata: { checkout_blocked: false } },
  { code: 'mercado_pago', name: 'Mercado Pago', supportsPix: false, supportsBoleto: false,
    supportsCreditCard: true, active: true, metadata: { checkout_blocked: true } }];
  const credentials = providers.flatMap(provider => environments.map(environment => ({
    id: `${provider.code}-${environment}`, providerCode: provider.code, environment, configured: true,
    clientIdConfigured: true, clientSecretConfigured: true, accessTokenConfigured: true,
    publicKeyConfigured: true, webhookSecretConfigured: true, lastTestStatus: 'ERROR',
    metadata: { merchantId: 'fictional', baneseConvenio: environment === 'production' ? '15261' : '15528' },
  })));
  const routes = modalities.flatMap(modalidade => environments.flatMap(environment => ['BOLETO', 'PIX', 'CREDIT_CARD'].map(paymentMethod => {
    const providerCode = paymentMethod === 'CREDIT_CARD' ? 'mercado_pago' : 'banese_card';
    return { id: `${modalidade}-${environment}-${paymentMethod}`, modalidade, environment, paymentMethod, providerCode,
      credentialId: `${providerCode}-${environment}`, enabled: paymentMethod === 'BOLETO'
        && (environment === 'production' ? ['EAD', 'TECNICO', 'OUTROS_CREDITOS'].includes(modalidade) : modalidade === 'EAD') };
  })));
  const issuer = { id: 'fictional-matrix', companyId: 'fictional-company', name: 'Matriz fictícia', cnpj: '00.000.000/0001-00',
    city: 'Cidade fictícia', state: 'SE', status: 'ativo', isMatrix: true };
  return { overview: { providers, credentials, routes, integrationEnabled: true, activeEnvironment: 'production',
    issuerConfig: { id: 1, issuerPoloId: issuer.id, appliesToAllPolos: true, active: true, issuer },
    issuerCandidates: [issuer], activePolosCount: 4, webhookUrls: {} },
  reads: 0, routeWrites: [], runtimeWrites: [], channels: [], removed: 0 };
}

export function bankingFixturePlugin(base) {
  return { name: 'fictional-banking-config', setup(builder) {
    builder.onResolve({ filter: /integracao-bancaria\.service$/ }, () => ({ path: 'service', namespace: 'banking-fixture' }));
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'banking-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'banking-fixture' }, args => ({ loader: 'js', resolveDir: base,
      contents: args.path === 'service' ? `const f=globalThis.__bankingFixture;const clone=x=>JSON.parse(JSON.stringify(x));
        export const integracaoBancariaService={getOverview:async()=>{f.reads++;return clone(f.overview);},
          saveRoute:async input=>{f.routeWrites.push(clone(input));const at=f.overview.routes.findIndex(route=>
            route.modalidade===input.modalidade&&route.environment===input.environment&&route.paymentMethod===input.paymentMethod);
            if(at<0)throw new Error('Fictional route missing');const route={...f.overview.routes[at],...input};
            f.overview={...f.overview,routes:f.overview.routes.map((old,index)=>index===at?route:old)};return clone(route);},
          saveRuntimeConfig:async input=>{f.runtimeWrites.push(clone(input));f.overview={...f.overview,
            integrationEnabled:input.enabled,activeEnvironment:input.activeEnvironment};return clone(input);},
          saveCredential:async()=>{throw new Error('Credential writes are excluded from this fictional smoke');},
          saveIssuer:async()=>{throw new Error('Issuer changes are excluded from this fictional smoke');},
          testConnection:async()=>{throw new Error('Real connection testing is forbidden in this fixture');}};`
        : `const f=globalThis.__bankingFixture;export const supabase={channel(name){const c={name,events:[],
          on(_type,config,callback){c.events.push({config,callback});return c},subscribe(callback){c.status=callback;return c}};
          f.channels.push(c);return c},removeChannel(){f.removed++;},
          functions:{invoke(){throw new Error('Live Edge forbidden');}},rpc(){throw new Error('Live SQL forbidden');}};`,
    }));
  } };
}
