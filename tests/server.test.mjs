import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPortalServer } from '../server.mjs';
import test from 'node:test';

const spreadsheet = process.env.TBSA_TEST_XLSX;

async function startServer() {
  const server = createPortalServer({
    rootDir: process.cwd(),
    adminCode: 'teste-local-2026',
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test('protege a importação e importa a exportação oficial', { skip: !spreadsheet }, async () => {
  let instance = await startServer();
  try {
    const { baseUrl } = instance;
    const unauthorized = await fetch(`${baseUrl}/api/import`, { method: 'POST' });
    assert.equal(unauthorized.status, 401);

    const deniedLogin = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'codigo-invalido' }),
    });
    assert.equal(deniedLogin.status, 401);

    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'teste-local-2026' }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.getSetCookie()[0].split(';', 1)[0];

    const file = await readFile(spreadsheet);
    const form = new FormData();
    form.append('planilha', new Blob([file], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), 'ACESSOS TBSA.xlsx');
    const imported = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    assert.equal(imported.status, 200);
    assert.deepEqual(await imported.json(), {
      message: 'Base atualizada com sucesso.',
      rows: 518,
      approved: 518,
    });

    const csv = await fetch(`${baseUrl}/chamados.csv`);
    assert.equal(csv.status, 200);
    assert.equal(csv.headers.get('cache-control'), 'no-store');
    const lines = (await csv.text()).trim().split(/\r?\n/);
    assert.match(lines[0], /^CHAMADO,ID DETENTORA,SITE,STATUS,VALIDADE,/);
    assert.ok(lines.length > 518, 'linhas de observação podem ocupar múltiplas linhas CSV');

    const appScript = await fetch(`${baseUrl}/app.js`);
    assert.equal(appScript.headers.get('cache-control'), 'no-store');

    await new Promise((resolve) => instance.server.close(resolve));
    instance = await startServer();
    const persisted = await fetch(`${instance.baseUrl}/chamados.csv?atualizado=apos-reinicio`);
    assert.equal(persisted.status, 200);
    assert.match(await persisted.text(), /TCMGAFD0001/);
  } finally {
    await new Promise((resolve) => instance.server.close(resolve));
  }
});
