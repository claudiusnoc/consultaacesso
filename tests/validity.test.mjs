import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const normalizeValidity = require('../scripts/normalize-validity.js');

test('aceita data brasileira exportada pelo Excel com hora', () => {
  assert.equal(normalizeValidity('30/10/2026 23:59:59'), '30/10/2026');
});

test('datas antigas são aceitas sem comparação com a data atual', () => {
  assert.equal(normalizeValidity('30/10/2023 23:59:59'), '30/10/2023');
});

test('normaliza data brasileira, ISO e número serial do Excel', () => {
  assert.equal(normalizeValidity('5/2/2025'), '05/02/2025');
  assert.equal(normalizeValidity('2025-02-05T23:59:59.000Z'), '05/02/2025');
  assert.equal(normalizeValidity('45923'), '23/09/2025');
});

test('mantém datas vazias e N/D vazios e ainda rejeita datas malformadas', () => {
  assert.equal(normalizeValidity(''), '');
  assert.equal(normalizeValidity('N/D'), '');
  assert.throws(() => normalizeValidity('31/02/2026 23:59:59'), /DATA DE TERMINO inválida/);
});
