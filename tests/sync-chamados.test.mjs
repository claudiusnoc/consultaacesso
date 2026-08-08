import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCall,
  normalizeStatus,
  parseCsv,
  serializeCsv,
  synchronizeRecords,
} from '../scripts/sync-chamados.mjs';

test('normaliza chamados e status do portal', () => {
  assert.equal(normalizeCall('417077'), '00417077');
  assert.equal(normalizeStatus('Aprovado / Chaves Liberadas'), 'Liberado');
  assert.equal(normalizeStatus('Aguardando Aprovação'), 'Aguardando Aprovação');
  assert.equal(normalizeStatus('Aguardando'), 'Aguardando Aprovação');
  assert.equal(normalizeStatus('Em tratamento'), 'Em Tratamento');
  assert.equal(normalizeStatus('Reprovado'), 'Reprovado');
});

test('sincroniza o relatório único exportado pelo portal', () => {
  const records = [
    { CHAMADO: '00417077', 'ID DETENTORA': 'TCMG001', STATUS: 'Aguardando Aprovação' },
    { CHAMADO: '00417078', 'ID DETENTORA': 'TCMG002', STATUS: 'Aguardando Aprovação' },
  ];
  const report = {
    complete: true,
    rows: [
      { id: '00417077', idSiteacessar: 'TCMG001', statu: 'Aprovado' },
      { id: '00417078', idSiteacessar: 'TCMG002', statu: 'Aguardando' },
    ],
  };
  const result = synchronizeRecords(records, report);
  assert.equal(result.matched, 2);
  assert.equal(result.updated, 1);
  assert.equal(result.missing.length, 0);
  assert.equal(records[0].STATUS, 'Liberado');
  assert.equal(records[1].STATUS, 'Aguardando Aprovação');
});

test('bloqueia status conflitantes no relatório completo', () => {
  const records = [{ CHAMADO: '00417077', 'ID DETENTORA': 'TCMG001', STATUS: 'Aguardando Aprovação' }];
  const report = {
    complete: true,
    rows: [
      { id: '00417077', idSiteacessar: 'TCMG001', statu: 'Aprovado' },
      { id: '00417077', idSiteacessar: 'TCMG001', statu: 'Reprovado' },
    ],
  };
  assert.throws(() => synchronizeRecords(records, report), /Status conflitante/);
});

test('marca como ausente qualquer chamado de um relatório completo', () => {
  const records = [{ CHAMADO: '00417077', 'ID DETENTORA': 'TCMG001', STATUS: 'Liberado' }];
  const result = synchronizeRecords(records, { complete: true, rows: [] });
  assert.equal(result.matched, 0);
  assert.equal(result.missing.length, 1);
});

test('preserva CSV com vírgulas e aspas', () => {
  const source = 'CHAMADO,ID DETENTORA,SITE,STATUS,VALIDADE,ENDEREÇO,CLUSTER,SUPERVISOR\n417077,TCMG001,MG001,Aguardando Aprovação,22/09/2026,"Rua A, 10",SUL,"Nome ""Teste"""\n';
  const parsed = parseCsv(source);
  assert.equal(parsed.records[0]['ENDEREÇO'], 'Rua A, 10');
  assert.equal(parsed.records[0].SUPERVISOR, 'Nome "Teste"');
  assert.deepEqual(parseCsv(serializeCsv(parsed.headers, parsed.records)), parsed);
});

test('atualiza somente o chamado exato do site', () => {
  const records = [
    {
      CHAMADO: '417077',
      'ID DETENTORA': 'TCMG001',
      SITE: 'MG001',
      STATUS: 'Aguardando Aprovação',
      VALIDADE: '22/09/2026',
      'ENDEREÇO': 'Rua A',
      CLUSTER: 'SUL',
      SUPERVISOR: 'Pessoa',
    },
  ];
  const report = {
    calls: {
      TCMG001: [
        { cells: ['00417076', 'TCMG001', '', '', 'Manutenção', '', '', '', '', '', '', '', 'Liberado'] },
        { cells: ['00417077', 'TCMG001', '', '', 'Manutenção', '', '', '', '', '', '', '', 'Aprovado / Chaves Liberadas'] },
      ],
    },
  };
  const result = synchronizeRecords(records, report);
  assert.equal(result.matched, 1);
  assert.equal(result.updated, 1);
  assert.equal(records[0].STATUS, 'Liberado');
});

test('não altera status quando o relatório não contém o chamado exato', () => {
  const records = [{ CHAMADO: '417077', 'ID DETENTORA': 'TCMG001', STATUS: 'Aguardando Aprovação' }];
  const result = synchronizeRecords(records, { calls: { TCMG001: [{ cells: ['00417076'] }] } });
  assert.equal(result.updated, 0);
  assert.equal(result.missing.length, 1);
  assert.equal(records[0].STATUS, 'Aguardando Aprovação');
});
