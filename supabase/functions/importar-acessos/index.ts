import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const encoder = new TextEncoder();
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const TOKEN_DURATION_MS = 30 * 60 * 1000;

const corsHeaders = {
  'Access-Control-Allow-Headers': 'apikey, content-type, x-tbsa-update-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': 'https://claudiusnoc.github.io',
  'Content-Type': 'application/json; charset=utf-8',
};

type Access = {
  chamado: string;
  id_detentora: string;
  site: string;
  status: string;
  validade: string;
  endereco: string;
  cluster: string;
  supervisor: string;
  observacoes: string;
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function normalizedHeader(value: unknown) {
  return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function toValidity(value: unknown) {
  const raw = normalize(value);
  if (!raw) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`DATA DE TERMINO inválida: ${raw}.`);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

function portalStatus(value: unknown) {
  const status = normalizedHeader(value);
  if (['APROBADO', 'APROVADO', 'LIBERADO'].includes(status)) return 'Liberado';
  if (['PENDENTE', 'PENDING', 'EM ANALISE'].includes(status)) return 'Pendente';
  if (['BLOQUEADO', 'REPROVADO', 'NEGADO'].includes(status)) return 'Bloqueado';
  throw new Error(`STATUS inválido: ${normalize(value)}.`);
}

function headerRow(rows: unknown[][], required: string[]) {
  const index = rows.findIndex((row) => {
    const headers = new Set(row.map(normalizedHeader));
    return required.every((name) => headers.has(name));
  });
  if (index < 0) throw new Error(`A aba Acessos precisa conter: ${required.join(', ')}.`);
  return index;
}

function cell(row: unknown[], headers: Map<string, number>, name: string) {
  return normalize(row[headers.get(name) ?? -1]);
}

function parseSpreadsheet(file: File): Promise<Access[]> {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets.Acessos;
    if (!sheet) throw new Error('A planilha precisa conter a aba Acessos.');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false });
    const firstDataRow = headerRow(rows, ['PROTOCOLO', 'STATUS', 'LOCAL']);
    const headers = new Map(rows[firstDataRow].map((item, index) => [normalizedHeader(item), index]));
    const records: Access[] = [];
    const protocols = new Set<string>();
    const locals = new Set<string>();

    for (const row of rows.slice(firstDataRow + 1)) {
      const chamado = cell(row, headers, 'PROTOCOLO');
      const id_detentora = cell(row, headers, 'LOCAL');
      if (!chamado && !id_detentora) continue;
      if (!chamado || !id_detentora) throw new Error('Há uma linha sem PROTOCOLO ou LOCAL.');
      const site = cell(row, headers, 'SITE');
      if (!site || site === '#N/A') throw new Error(`LOCAL ${id_detentora} está sem SITE.`);
      if (protocols.has(chamado) || locals.has(id_detentora.toUpperCase())) {
        throw new Error(`Há PROTOCOLO ou LOCAL duplicado: ${chamado} / ${id_detentora}.`);
      }
      protocols.add(chamado);
      locals.add(id_detentora.toUpperCase());
      records.push({
        chamado,
        id_detentora,
        site,
        status: portalStatus(cell(row, headers, 'STATUS')),
        validade: toValidity(cell(row, headers, 'DATA DE TERMINO')),
        endereco: '',
        cluster: cell(row, headers, 'REGIAO'),
        supervisor: cell(row, headers, 'REVISADO POR'),
        observacoes: cell(row, headers, 'OBSERVACOES'),
      });
    }
    if (!records.length) throw new Error('Nenhum acesso válido foi encontrado na aba Acessos.');
    return records;
  });
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function issueToken(secret: string) {
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Date.now() + TOKEN_DURATION_MS })));
  return `${payload}.${await sign(payload, secret)}`;
}

async function tokenIsValid(token: string | null, secret: string) {
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.', 2);
  if (signature !== await sign(payload, secret)) return false;
  try { return JSON.parse(new TextDecoder().decode(fromBase64url(payload))).exp > Date.now(); } catch { return false; }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response(405, { error: 'Método não permitido.' });

  const code = Deno.env.get('TBSA_ADMIN_CODE');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!code || !serviceKey || !supabaseUrl) return response(500, { error: 'A função ainda não foi configurada.' });

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    if (body.action !== 'autorizar' || body.code !== code) return response(401, { error: 'Código inválido.' });
    return response(200, { token: await issueToken(code), expiresInMinutes: TOKEN_DURATION_MS / 60000 });
  }

  if (!(await tokenIsValid(request.headers.get('x-tbsa-update-token'), code))) {
    return response(401, { error: 'Sessão de atualização expirada. Informe o código novamente.' });
  }
  try {
    const form = await request.formData();
    const file = form.get('planilha');
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.xlsx')) {
      return response(400, { error: 'Envie uma planilha .xlsx válida.' });
    }
    if (file.size > MAX_FILE_SIZE) return response(400, { error: 'A planilha excede o limite de 25 MB.' });
    const accesses = await parseSpreadsheet(file);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.rpc('substituir_portal_acessos', { p_acessos: accesses });
    if (error) throw new Error('Não foi possível gravar a nova base.');
    return response(200, { message: 'Base atualizada com sucesso.', rows: accesses.length, approved: accesses.filter((item) => item.status === 'Liberado').length });
  } catch (error) {
    return response(422, { error: error instanceof Error ? error.message : 'Não foi possível importar a planilha.' });
  }
});
