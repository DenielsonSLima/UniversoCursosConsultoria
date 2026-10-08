import {existsSync} from 'node:fs';
const packaged=new URL('../../../tests/bounded-integration-setup.mjs',import.meta.url);
export const integrationSetupUrl=existsSync(packaged)?packaged:new URL('../../t46-bounded-correction/supabase/tests/bounded-integration-setup.mjs',import.meta.url);
export const nativeIntegrationSetupUrl=existsSync(packaged)?packaged:new URL('../../t46-bounded-correction/publish/supabase/tests/bounded-integration-setup.mjs',import.meta.url);
export const seedUrl=new URL('./bounded-seed.mjs',integrationSetupUrl);
