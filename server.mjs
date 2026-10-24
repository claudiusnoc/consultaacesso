import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 60 * 1000;
const LOGIN_LIMIT = 5;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function json(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function requestOriginIsAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function cookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || '')
      .split(';')
      .map((value) => value.trim().split(/=(.*)/s, 2))
      .filter(([name]) => name)
      .map(([name, value]) => [name, decodeURIComponent(value || '')]),
  );
}

function secureEquals(first, second) {
  const firstBytes = Buffer.from(String(first));
  const secondBytes = Buffer.from(String(second));
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}

function readBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('Arquivo excede o limite de 25 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseMultipartUpload(contentType, body) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType || '');
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw new Error('O envio da planilha não possui um limite multipart válido.');

  const separator = Buffer.from(`--${boundary}`);
  let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(separator, cursor);
    if (start < 0) break;
    const headerStart = start + separator.length + 2;
    const next = body.indexOf(separator, headerStart);
    if (next < 0) break;
    const part = body.subarray(headerStart, next - 2);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd >= 0) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const disposition = /content-disposition:\s*form-data;[^\r\n]*/i.exec(headers)?.[0] || '';
      const name = /name="([^"]+)"/i.exec(disposition)?.[1];
      const filename = /filename="([^"]*)"/i.exec(disposition)?.[1];
      if (name === 'planilha' && filename) {
        return {
          filename: path.basename(filename).replace(/[\r\n]/g, ''),
          bytes: part.subarray(headerEnd + 4),
        };
      }
    }
    cursor = next;
  }
  throw new Error('Selecione uma planilha no campo de envio.');
}

function isXlsx(buffer, filename) {
  return path.extname(filename).toLowerCase() === '.xlsx'
    && buffer.length >= 4
    && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

function execute(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || stdout.trim() || `Importador finalizou com código ${code}.`));
    });
  });
}

async function runPowerShellImport({ rootDir, spreadsheetPath }) {
  const command = process.env.POWERSHELL_PATH || (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');
  const script = path.join(rootDir, 'scripts', 'importar-acessos.ps1');
  const output = path.join(rootDir, 'chamados.csv');
  const result = await execute(command, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script,
    '-Planilha', spreadsheetPath,
    '-Saida', output,
  ], { cwd: rootDir });
  const summary = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  if (!summary.rows || summary.rows < 1) throw new Error('A planilha não gerou acessos válidos.');
  return summary;
}

export function createPortalServer({ rootDir = moduleDirectory, adminCode, runImport = runPowerShellImport } = {}) {
  if (!adminCode || adminCode.length < 8) {
    throw new Error('Defina TBSA_ADMIN_CODE com pelo menos 8 caracteres antes de iniciar o servidor.');
  }

  const sessions = new Map();
  const loginAttempts = new Map();
  const uploadsDir = path.join(rootDir, '.tbsa', 'uploads');

  function getSession(req) {
    const token = cookies(req).tbsa_admin;
    const session = token ? sessions.get(token) : null;
    if (!session || session.expiresAt < Date.now()) {
      if (token) sessions.delete(token);
      return null;
    }
    return { token, ...session };
  }

  function requireSession(req, res) {
    const session = getSession(req);
    if (!session) {
      json(res, 401, { error: 'Sessão administrativa expirada. Informe o código novamente.' });
      return null;
    }
    return session;
  }

  async function serveStatic(req, res, pathname) {
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const target = path.resolve(rootDir, `.${requestedPath}`);
    if (!target.startsWith(`${rootDir}${path.sep}`) || target.includes(`${path.sep}.tbsa${path.sep}`)) {
      json(res, 404, { error: 'Arquivo não encontrado.' });
      return;
    }
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) throw new Error('not file');
      const extension = path.extname(target).toLowerCase();
      const noStore = extension === '.csv' || extension === '.html'
        || ['app.js', 'admin.js', 'sw.js', 'supabase-config.js'].includes(path.basename(target));
      res.writeHead(200, {
        'Cache-Control': noStore ? 'no-store' : 'public, max-age=3600',
        'Content-Security-Policy': "default-src 'self'; base-uri 'self'; connect-src 'self' https://xecbtwhrlrachuixlplm.supabase.co; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self'",
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Referrer-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(await fs.readFile(target));
    } catch {
      json(res, 404, { error: 'Arquivo não encontrado.' });
    }
  }

  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const clientIp = req.socket.remoteAddress || 'unknown';

    if (pathname === '/healthz') {
      json(res, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/api/session' && req.method === 'GET') {
      json(res, 200, { authenticated: Boolean(getSession(req)) });
      return;
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      if (!requestOriginIsAllowed(req)) {
        json(res, 403, { error: 'Origem da solicitação não permitida.' });
        return;
      }
      const attempt = loginAttempts.get(clientIp);
      if (attempt?.blockedUntil > Date.now()) {
        json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos para tentar novamente.' });
        return;
      }
      try {
        const body = JSON.parse((await readBody(req, 4096)).toString('utf8'));
        if (!secureEquals(body.code, adminCode)) {
          const failures = (attempt?.failures || 0) + 1;
          loginAttempts.set(clientIp, {
            failures,
            blockedUntil: failures >= LOGIN_LIMIT ? Date.now() + LOGIN_BLOCK_MS : 0,
          });
          json(res, 401, { error: 'Código inválido. Confira e tente novamente.' });
          return;
        }
        loginAttempts.delete(clientIp);
        const token = randomBytes(32).toString('base64url');
        sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS });
        json(res, 200, { authenticated: true, expiresInMinutes: SESSION_TTL_MS / 60000 }, {
          'Set-Cookie': `tbsa_admin=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
        });
      } catch {
        json(res, 400, { error: 'Não foi possível ler o código informado.' });
      }
      return;
    }

    if (pathname === '/api/logout' && req.method === 'POST') {
      if (!requestOriginIsAllowed(req)) {
        json(res, 403, { error: 'Origem da solicitação não permitida.' });
        return;
      }
      const session = getSession(req);
      if (session) sessions.delete(session.token);
      json(res, 200, { authenticated: false }, { 'Set-Cookie': 'tbsa_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      return;
    }

    if (pathname === '/api/import' && req.method === 'POST') {
      if (!requestOriginIsAllowed(req)) {
        json(res, 403, { error: 'Origem da solicitação não permitida.' });
        return;
      }
      if (!requireSession(req, res)) return;
      let temporaryPath = '';
      try {
        const upload = parseMultipartUpload(req.headers['content-type'], await readBody(req));
        if (!isXlsx(upload.bytes, upload.filename)) {
          json(res, 400, { error: 'Envie uma planilha .xlsx válida.' });
          return;
        }
        await fs.mkdir(uploadsDir, { recursive: true });
        temporaryPath = path.join(uploadsDir, `${randomBytes(18).toString('hex')}.xlsx`);
        await fs.writeFile(temporaryPath, upload.bytes, { flag: 'wx' });
        const summary = await runImport({ rootDir, spreadsheetPath: temporaryPath });
        json(res, 200, { message: 'Base atualizada com sucesso.', rows: summary.rows, approved: summary.approved });
      } catch (error) {
        json(res, 422, { error: error.message || 'Não foi possível importar a planilha.' });
      } finally {
        if (temporaryPath) await fs.rm(temporaryPath, { force: true }).catch(() => {});
      }
      return;
    }

    if (pathname.startsWith('/api/')) {
      json(res, 405, { error: 'Método não permitido.' });
      return;
    }
    await serveStatic(req, res, pathname);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  const server = createPortalServer({ adminCode: process.env.TBSA_ADMIN_CODE });
  server.listen(port, host, () => {
    console.log(`Portal TBSA disponível em http://${host}:${port}`);
  });
}
