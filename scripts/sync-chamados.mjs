import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_HEADERS = [
  'CHAMADO',
  'ID DETENTORA',
  'SITE',
  'STATUS',
  'VALIDADE',
  'ENDEREÇO',
  'CLUSTER',
  'SUPERVISOR',
];

function removeAccents(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeCall(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.padStart(8, '0') : '';
}

export function normalizeStatus(value) {
  const normalized = removeAccents(value).trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('reprovado')) return 'Reprovado';
  if (normalized.includes('aguardando')) return 'Aguardando Aprovação';
  if (normalized.includes('tratamento')) return 'Em Tratamento';
  if (normalized.includes('liberado') || normalized.includes('aprovado') || normalized.includes('chaves liberadas')) return 'Liberado';
  return '';
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }

  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((value) => value.trim());
  const records = rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
  return { headers, records };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeCsv(headers, records) {
  const lines = [headers.map(csvCell).join(',')];
  for (const record of records) lines.push(headers.map((header) => csvCell(record[header])).join(','));
  return `${lines.join('\n')}\n`;
}

function portalCells(row) {
  if (Array.isArray(row)) return row;
  if (Array.isArray(row?.cells)) return row.cells;
  if (Array.isArray(row?.value)) return row.value;
  return [];
}

function normalizeObservation(value) {
  return String(value ?? '').trim();
}

function portalObservation(row) {
  if (!row || typeof row !== 'object') return '';
  const key = Object.keys(row).find((candidate) => {
    const normalized = removeAccents(candidate).toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized === 'obs' || normalized.startsWith('obs') || normalized.startsWith('observa') || normalized === 'motivositebloqtext';
  });
  return key ? normalizeObservation(row[key]) : '';
}

export function buildPortalStatusMap(report) {
  const result = new Map();
  const addStatus = (siteValue, callValue, statusValue, observationValue = '') => {
    const site = String(siteValue || '').trim().toUpperCase();
    const call = normalizeCall(callValue);
    const status = normalizeStatus(statusValue);
    const observation = normalizeObservation(observationValue);
    if (!site || !call || !status) return;
    const key = `${site}|${call}`;
    const previous = result.get(key);
    if (previous && previous.status !== status) throw new Error(`Status conflitante no relatório para ${key}.`);
    if (previous && previous.observation && observation && previous.observation !== observation) {
      throw new Error(`OBS conflitante no relatório para ${key}.`);
    }
    result.set(key, {
      status,
      observation: previous?.observation || observation,
    });
  };

  for (const row of Array.isArray(report?.rows) ? report.rows : []) {
    addStatus(row?.idSiteacessar, row?.id, row?.statu, row?.obs ?? portalObservation(row));
  }
  for (const [siteValue, rows] of Object.entries(report?.calls || {})) {
    for (const rawRow of Array.isArray(rows) ? rows : []) {
      const cells = portalCells(rawRow);
      addStatus(siteValue, cells[0], cells[12], cells[13]);
    }
  }
  return result;
}

export function synchronizeRecords(records, report) {
  const portalStatuses = buildPortalStatusMap(report);
  let updated = 0;
  let statusUpdated = 0;
  let observationUpdated = 0;
  let matched = 0;
  const missing = [];

  for (const record of records) {
    const site = String(record['ID DETENTORA'] || '').trim().toUpperCase();
    const call = normalizeCall(record.CHAMADO);
    const portalData = portalStatuses.get(`${site}|${call}`);
    if (!portalData) {
      if (report?.complete === true || normalizeStatus(record.STATUS) !== 'Liberado') missing.push({ site, chamado: call });
      continue;
    }
    matched += 1;
    let rowUpdated = false;
    if (record.STATUS !== portalData.status) {
      record.STATUS = portalData.status;
      statusUpdated += 1;
      rowUpdated = true;
    }
    if (String(record['OBSERVAÇÕES'] ?? '') !== portalData.observation) {
      record['OBSERVAÇÕES'] = portalData.observation;
      observationUpdated += 1;
      rowUpdated = true;
    }
    if (rowUpdated) updated += 1;
  }

  return { updated, statusUpdated, observationUpdated, matched, missing };
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

async function main() {
  const args = process.argv.slice(2);
  const baseArgument = argumentValue(args, '--base');
  const reportArgument = argumentValue(args, '--report');
  if (!baseArgument || !reportArgument) throw new Error('Uso: --base chamados.csv --report portal.json [--output chamados.csv] [--dry-run]');
  const basePath = path.resolve(baseArgument);
  const reportPath = path.resolve(reportArgument);
  const outputPath = path.resolve(argumentValue(args, '--output') || basePath);
  const dryRun = args.includes('--dry-run');

  const { headers, records } = parseCsv(await fs.readFile(basePath, 'utf8'));
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) throw new Error(`Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}`);
  const originalCount = records.length;
  const uniqueSites = new Set(records.map((record) => String(record['ID DETENTORA'] || '').trim().toUpperCase()));
  if (uniqueSites.size !== originalCount) throw new Error('ID DETENTORA duplicado no CSV base.');

  const report = JSON.parse((await fs.readFile(reportPath, 'utf8')).replace(/^\uFEFF/, ''));
  if (!String(report?.observationField || '').trim()) {
    throw new Error('Relatório sem o campo OBS; sincronização bloqueada para não apagar observações.');
  }
  const sync = synchronizeRecords(records, report);
  const statusCounts = Object.fromEntries(
    [...records.reduce((map, record) => map.set(record.STATUS, (map.get(record.STATUS) || 0) + 1), new Map())]
  );

  const outputHeaders = headers.includes('OBSERVAÇÕES') ? headers : [...headers, 'OBSERVAÇÕES'];
  if (!dryRun && (sync.updated > 0 || outputHeaders.length !== headers.length)) {
    const nextContent = serializeCsv(outputHeaders, records);
    const temporaryPath = `${outputPath}.tmp`;
    await fs.writeFile(temporaryPath, nextContent, 'utf8');
    await fs.rename(temporaryPath, outputPath);
  }

  console.log(JSON.stringify({
    rows: originalCount,
    uniqueSites: uniqueSites.size,
    matched: sync.matched,
    updated: sync.updated,
    statusUpdated: sync.statusUpdated,
    observationUpdated: sync.observationUpdated,
    missing: sync.missing.length,
    observationField: report.observationField,
    statusCounts,
    dryRun,
    output: outputPath,
  }));
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
