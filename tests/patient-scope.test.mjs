import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patientScope } from '../src/lib/patientScope.ts';
test('cuentas sin centro asignado no obtienen pacientes',()=>{assert.equal(patientScope({role:'Centro de Salud'}).sql,'FALSE');assert.equal(patientScope({role:'Maternidad'}).sql,'FALSE')});
test('un centro queda limitado a su código, que se pasa como parámetro',()=>{const x=patientScope({role:'Centro de Salud',sisa_code:"111' OR TRUE --"});assert.deepEqual(x.params,["111' OR TRUE --"]);assert.ok(!x.sql.includes("111'"));assert.match(x.sql,/\$2/)});
test('una maternidad puede utilizar su identificador y su centro',()=>{const x=patientScope({role:'Maternidad',sisa_code:'123',maternidad_id:'45'});assert.deepEqual(x.params,['123','45']);assert.match(x.sql,/\$2/);assert.match(x.sql,/\$3/)});
test('una cuenta de administración conserva su alcance general',()=>{assert.equal(patientScope({role:'Administrador'}).sql,'TRUE')});
