# Endereço nos Detalhes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o valor da coluna `ENDERECO` da planilha no bloco inferior da tela de detalhes, substituindo o texto de status/data.

**Architecture:** O app continuará lendo a planilha CSV em `app.js`, adicionando o campo interno `e` ao objeto de cada site. A página `detail.html` terá o bloco inferior renomeado para endereço, e `detail.js` preencherá esse bloco com `data.e` ou `Não informado`.

**Tech Stack:** HTML estático, JavaScript puro, Google Sheets publicado como CSV, `localStorage`/`sessionStorage`, navegador/PWA.

---

## File Structure

- Modify: `app.js`
  - Adicionar o campo `e` nos dados offline e no mapeamento do CSV.
- Modify: `detail.html`
  - Trocar o conteúdo do bloco inferior do ticket para label `Endereço:` com ícone de torre e valor de endereço.
- Modify: `detail.js`
  - Referenciar o novo elemento do endereço.
  - Popular o endereço usando `data.e || 'Não informado'`.
  - Atualizar o texto de copiar todos os dados para incluir `ENDERECO`.
- Manual verification only:
  - Este projeto não possui `package.json` nem framework de testes configurado. A validação será feita abrindo o HTML no navegador e simulando dados com/sem `e`.

## Task 1: Mapear `ENDERECO` da planilha

**Files:**
- Modify: `app.js:10-15`
- Modify: `app.js:130-137`

- [ ] **Step 1: Atualizar dados offline de exemplo**

Em `app.js`, alterar os objetos em `OFFLINE_DATA` para incluir `e`:

```js
const OFFLINE_DATA = [
    { "c": "00358519", "t": "TEMGBHO0027", "l": "EMG0010", "f": "2026-05-31", "o": "Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA.", "e": "Rua exemplo, bairro exemplo - Belo Horizonte/MG" },
    { "c": "00358516", "t": "TEMGBHO0004", "l": "EMG0135", "f": "2026-05-31", "o": "Necessário retirar a chave na Claro.", "e": "Não informado" },
    { "c": "00358565", "t": "TEMGDIV0002", "l": "EMG0349", "f": "2026-05-31", "o": "Direcionar os técnicos com a carta de liberação em mãos.", "e": "Rua exemplo, bairro exemplo - Divinópolis/MG" },
    { "c": "00358008", "t": "TCMGACA0001", "l": "MGACA01", "f": "2026-05-30", "o": "Apresentação apenas do chamado na Central da Claro.", "e": "Rua exemplo, bairro exemplo - Acaiaca/MG" },
    { "c": "00358009", "t": "TCMGACA0002", "l": "MGACAR1", "f": "2026-05-30", "o": "Uso do APP MASTER LOCK VAULT ENTERPRISE.", "e": "Rua exemplo, bairro exemplo - Acaiaca/MG" }
];
```

- [ ] **Step 2: Mapear a coluna `ENDERECO` no CSV**

Em `app.js`, alterar o mapeamento para:

```js
dataStore = remoteData.map(item => ({
    c: item['CHAMADO'] || '',
    t: item['ID TBSA'] || '',
    l: item['ID CLARO'] || '',
    f: item['FIM ACESSO'] || '',
    s: item['STATUS'] || '',
    o: item['OBSERVAÇÕES'] || '',
    e: item['ENDERECO'] || ''
}));
```

- [ ] **Step 3: Verificação rápida**

Abrir `app.js` e confirmar que há exatamente uma propriedade `e: item['ENDERECO'] || ''` no mapeamento da planilha.

## Task 2: Alterar o bloco visual da tela de detalhes

**Files:**
- Modify: `detail.html:57-61`

- [ ] **Step 1: Substituir label/status/data por endereço**

Em `detail.html`, trocar este bloco:

```html
<div class="status-stack">
    <span class="section-label"><span class="material-symbols-outlined">build</span> Status</span>
    <strong class="access-status-text" id="ticket-access-status">Acesso ao Site</strong>
    <span class="status-date" id="detail-date">31/05/2026</span>
</div>
```

por:

```html
<div class="status-stack">
    <span class="section-label"><span class="material-symbols-outlined">cell_tower</span> Endereço:</span>
    <strong class="access-status-text" id="ticket-address">Não informado</strong>
</div>
```

- [ ] **Step 2: Verificação rápida**

Abrir `detail.html` e confirmar que:

- `id="ticket-address"` existe.
- `id="ticket-access-status"` não existe mais no bloco inferior.
- `id="detail-date"` não existe mais no bloco inferior.
- O ícone usado é `cell_tower`.

## Task 3: Preencher endereço em `detail.js`

**Files:**
- Modify: `detail.js:3-21`
- Modify: `detail.js:40-47`
- Modify: `detail.js:97-136`

- [ ] **Step 1: Atualizar referências DOM**

Em `detail.js`, trocar esta propriedade:

```js
accessStatus: document.getElementById('ticket-access-status'),
```

por:

```js
address: document.getElementById('ticket-address'),
```

- [ ] **Step 2: Atualizar dado fallback da tela de detalhes**

Em `getTicketData()`, alterar o objeto fallback para incluir `e`:

```js
return {
    c: '00358519',
    t: 'TEMGBHO0027',
    l: 'EMG0010',
    f: '2026-05-31',
    s: 'Aprovado',
    o: 'Carta encaminhada ao local. Problemas de acesso, acionar o NOC TBSA.',
    e: 'Rua exemplo, bairro exemplo - Belo Horizonte/MG'
};
```

- [ ] **Step 3: Popular o endereço**

Em `populatePage(data)`, trocar esta linha:

```js
els.accessStatus.textContent = isBlocked ? 'Acesso Indisponível' : 'Acesso ao Site';
```

por:

```js
els.address.textContent = data.e || 'Não informado';
```

Manter o restante do cálculo de bloqueado/status, pois ele ainda controla o status visual, botão de copiar e regras de acesso.

- [ ] **Step 4: Preservar valor de data para copiar todos os dados**

Trocar esta linha:

```js
window._dateDisplay = els.date.textContent;
```

por:

```js
window._dateDisplay = formatDate(data.f);
```

- [ ] **Step 5: Incluir endereço no texto copiado**

Trocar `buildCopyAllText(data)` por:

```js
function buildCopyAllText(data) {
    return `CHAMADO #${data.c || '--'} | TBSA: ${data.t || '--'} | CLARO: ${data.l || '--'} | ENDERECO: ${data.e || 'Não informado'} | VÁLIDO ATÉ ${window._dateDisplay || '--/--/----'} | STATUS: ${window._statusLabel || '--'} | OBS: ${data.o || 'Sem observações.'}`;
}
```

- [ ] **Step 6: Verificação rápida de referências antigas**

Procurar em `detail.js` por `accessStatus`. Resultado esperado: nenhuma ocorrência.

## Task 4: Validação manual no navegador

**Files:**
- Read: `detail.html`
- Read: `detail.js`
- Read: `app.js`

- [ ] **Step 1: Testar fallback com endereço**

Abrir `detail.html` diretamente no navegador.

Resultado esperado:

- O bloco inferior mostra `Endereço:`.
- O ícone é uma torre.
- Abaixo aparece o endereço do fallback.
- Não aparece `Acesso Ao Site` nesse bloco.
- Não aparece a data `31/05/2026` nesse bloco.

- [ ] **Step 2: Testar sem endereço**

No console do navegador, executar:

```js
sessionStorage.setItem('eqs-detail', JSON.stringify({
  c: '123',
  t: 'SITE123',
  l: 'CLARO123',
  f: '2026-05-31',
  s: 'Aprovado',
  o: 'Teste sem endereço'
}));
location.href = 'detail.html';
```

Resultado esperado:

- O bloco inferior mostra `Endereço:`.
- Abaixo aparece `Não informado`.

- [ ] **Step 3: Testar com endereço vindo da sessão**

No console do navegador, executar:

```js
sessionStorage.setItem('eqs-detail', JSON.stringify({
  c: '123',
  t: 'SITE123',
  l: 'CLARO123',
  f: '2026-05-31',
  s: 'Aprovado',
  o: 'Teste com endereço',
  e: 'Rua das Flores, 100 - Centro'
}));
location.href = 'detail.html';
```

Resultado esperado:

- O bloco inferior mostra `Rua das Flores, 100 - Centro`.

- [ ] **Step 4: Testar fluxo pela consulta**

Abrir `index.html`, buscar um site e clicar em `DETALHES`.

Resultado esperado:

- A tela de detalhes abre normalmente.
- Se o item tiver `ENDERECO`, o endereço aparece no bloco inferior.
- Se não tiver, aparece `Não informado`.

## Self-Review

- Spec coverage: todos os requisitos da spec estão cobertos nas Tasks 1-4.
- Placeholder scan: não há `TBD`, `TODO` ou instruções vagas.
- Type consistency: o campo interno é `e` em `app.js`, `detail.js` e nos dados de teste manual; o id DOM é `ticket-address` em HTML e JS.
