import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase, client, clone, definition, valuesOptions, ibsDefinition, none, documentRule } from './nfse_model_complete_presets.fixture.mjs';
const invalid = (promise) => assert.rejects(promise, (e) => e.code === '22023');

test('four-stage Values persist fiscal strategies without calculating tax or accepting unsupported API branches', async (t) => {
  const db = await createDatabase(); const c = client(db);
  try {
    await t.test('decimal, inactive and nested identity guards fail closed', async () => {
      assert.deepEqual(await c.values(), valuesOptions);
      for (const fixedAmount of ['0', '-1', '1,00', '1e2', 1, '1.001']) {
        const options = clone(valuesOptions); options.serviceAmount = { source: 'FIXED', fixedAmount };
        await invalid(c.values(options));
      }
      for (const key of ['cpf', 'key', 'paymentDate', 'supplierName']) {
        const options = clone(valuesOptions); options.iss[key] = 'SYNTHETIC'; await invalid(c.values(options));
      }
      const rental = clone(valuesOptions); rental.rental = {}; await invalid(c.values(rental));
      rental.rental = null; rental.serviceAmount.source = 'RENTAL_SHARE'; await invalid(c.values(rental));
    });
    await t.test('fixed discounts and withheld totals cannot consume more than the declared fixed service', async () => {
      const options = clone(valuesOptions); options.serviceAmount = { source: 'FIXED', fixedAmount: '10.00' };
      options.unconditionalDiscount = { source: 'FIXED', value: '9', base: null };
      options.conditionalDiscount = { source: 'FIXED', value: '2', base: null }; await invalid(c.values(options));
      options.conditionalDiscount = none(); assert.equal((await c.values(options)).serviceAmount.fixedAmount, '10.00');
      options.unconditionalDiscount = { source: 'PERCENTAGE', value: '100', base: 'SERVICE' }; await invalid(c.values(options));
    });
    await t.test('ISS retention follows participants, issuer role, suspension, MEI and actual Simples assessment', async () => {
      const options = clone(valuesOptions); options.iss.retention = 'RECIPIENT';
      const model = clone(definition); model.peopleOptions.recipientLocation = 'NOT_INFORMED';
      await invalid(c.values(options, model)); model.peopleOptions.issuerRole = 'RECIPIENT';
      assert.equal((await c.values(options, model)).iss.retention, 'RECIPIENT');
      options.iss.suspensionType = 'JUDICIAL'; options.iss.suspensionProcessNumber = 'SYNTHETIC-PROCESS'; await invalid(c.values(options, model));
      options.iss.suspensionType = 'NONE'; options.iss.suspensionProcessNumber = null;
      options.iss.retention = 'NONE'; options.iss.rateSource = 'FIXED'; options.iss.ratePercent = '3';
      await invalid(c.values(options));
      model.peopleOptions.simpleNationalOption = '1'; model.peopleOptions.simpleNationalAssessment = null;
      assert.equal((await c.values(options, model)).iss.ratePercent, '3');
      for (const issTreatment of ['IMUNIDADE', 'EXPORTACAO', 'NAO_INCIDENCIA']) await invalid(c.values(options, { ...model, issTreatment }));
      model.peopleOptions.simpleNationalOption = '2'; await invalid(c.values(options, model));
    });
    await t.test('federal explicit values are locked in MEI and Simples assessments1/2; CST remains optional', async () => {
      const options = clone(valuesOptions); options.federal.mode = 'EXPLICIT';
      options.federal.withheldCp = { source: 'FIXED', value: '1', base: null };
      await invalid(c.values(options));
      const model = clone(definition); model.peopleOptions.simpleNationalOption = '3'; model.peopleOptions.simpleNationalAssessment = '2';
      await invalid(c.values(options, model)); model.peopleOptions.simpleNationalAssessment = '3';
      assert.equal((await c.values(options, model)).federal.pisCofinsCst, null);
      options.federal.withheldSocialContributions = { source: 'FIXED', value: '1', base: null }; await invalid(c.values(options, model));
      options.federal.pisCofinsCst = '00'; options.federal.retentionType = '0'; await invalid(c.values(options, model));
      options.federal.retentionType = '3'; assert.equal((await c.values(options, model)).federal.retentionType, '3');
      options.federal.withheldSocialContributions = none(); await invalid(c.values(options, model));
    });
    await t.test('document categories and types retain lexical domains for each fiscal profile', async () => {
      const options = clone(valuesOptions); options.deduction = { mode: 'DOCUMENTS', value: null, documents: [documentRule()] };
      assert.equal((await c.values(options)).deduction.documents.length, 1);
      await invalid(c.values(options, definition, 'PRODUCAO'));
      options.deduction.documents[0].categoryCode = '02'; assert.equal((await c.values(options, definition, 'PRODUCAO')).deduction.documents[0].categoryCode, '02');
      options.deduction.documents[0].documentType = 'CTE'; await invalid(c.values(options, definition, 'PRODUCAO'));
      options.deduction.documents[0].categoryCode = '99'; options.deduction.documents[0].documentType = 'NON_FISCAL';
      await invalid(c.values(options)); options.deduction.documents[0].categoryDescription = 'OUTROS SINTÉTICOS';
      await invalid(c.values(options)); options.deduction.documents[0].documentDescription = 'DOCUMENTO SINTÉTICO';
      assert.equal((await c.values(options)).deduction.documents[0].documentType, 'NON_FISCAL');
      options.deduction.documents = Array.from({ length: 1001 }, documentRule); await invalid(c.values(options));
    });
    await t.test('IBS/CBS validates pinned class flags, regular taxation and DFe credit eligibility', async () => {
      const model = ibsDefinition(); assert.equal((await c.values(model.valuesOptions, model)).ibscbs.cst, '000');
      model.valuesOptions.ibscbs.cst = '515'; model.valuesOptions.ibscbs.classificationCode = '515001';
      await invalid(c.values(model.valuesOptions, model));
      model.valuesOptions.ibscbs.deferral = { statePercent: '0', municipalPercent: '10', cbsPercent: '0' };
      assert.equal((await c.values(model.valuesOptions, model)).ibscbs.deferral.municipalPercent, '10');
      model.valuesOptions.ibscbs.cst = '000'; model.valuesOptions.ibscbs.classificationCode = '000001';
      await invalid(c.values(model.valuesOptions, model)); model.valuesOptions.ibscbs.deferral = null;
      model.valuesOptions.ibscbs.cst = '550'; model.valuesOptions.ibscbs.classificationCode = '550016';
      await invalid(c.values(model.valuesOptions, model));
      model.valuesOptions.ibscbs.regularTaxation = { cst: '000', classificationCode: '000001' };
      assert.equal((await c.values(model.valuesOptions, model)).ibscbs.regularTaxation.cst, '000');
      model.valuesOptions.ibscbs.presumedCreditCode = '01'; await invalid(c.values(model.valuesOptions, model));
    });
    await t.test('transparency branches require their own complete inputs and applicable taxpayer regime', async () => {
      const options = clone(valuesOptions); options.transparency.mode = 'NOT_INFORMED';
      options.transparency.federalPercent = null; options.transparency.statePercent = null; options.transparency.municipalPercent = null;
      await invalid(c.values(options)); const model = clone(definition);
      model.peopleOptions.simpleNationalOption = '2'; model.peopleOptions.simpleNationalAssessment = null;
      assert.equal((await c.values(options, model)).transparency.mode, 'NOT_INFORMED');
      options.transparency.mode = 'SIMPLE_NATIONAL_PERCENTAGE'; options.transparency.simpleNationalPercent = '5';
      await invalid(c.values(options, model)); assert.equal((await c.values(options)).transparency.simpleNationalPercent, '5');
      options.transparency.simpleNationalPercent = '100'; await invalid(c.values(options));
    });
  } finally { await db.close(); }
});
