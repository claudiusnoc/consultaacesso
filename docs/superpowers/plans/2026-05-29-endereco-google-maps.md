# Endereço Google Maps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o texto do endereço na tela de detalhes clicável, abrindo o Google Maps em modo pesquisa.

**Architecture:** O endereço continuará vindo de `data.e`, preenchido pela coluna `ENDERECO`. `detail.html` transformará o elemento visual em link, `detail.js` definirá `href`/estado conforme o endereço, e `detail.css` manterá aparência de texto normal sem etiqueta extra.

**Tech Stack:** HTML estático, JavaScript puro, CSS, Google Maps Search URL, servidor local Python para validação.

---

## File Structure

- Modify: `detail.html`
  - Trocar o elemento `strong#ticket-address` por `a#ticket-address` preservando classes visuais.
- Modify: `detail.js`
  - Criar helper para validar endereço preenchido.
  - Criar helper para gerar URL do Google Maps.
  - Configurar `href`, `target`, `rel`, `aria-disabled` e `tabIndex` do endereço.
- Modify: `detail.css`
  - Remover aparência padrão de link mantendo o visual atual.
  - Adicionar cursor de clique apenas quando houver `href`.
  - Manter foco visível para acessibilidade por teclado.

## Task 1: Transformar endereço em link visualmente neutro

**Files:**
- Modify: `detail.html:57-60`
- Modify: `detail.css:407-413`

- [ ] **Step 1: Alterar HTML do endereço**

Em `detail.html`, trocar:

```html
<strong class="access-status-text" id="ticket-address">Não informado</strong>
```

por:

```html
<a class="access-status-text address-link" id="ticket-address">Não informado</a>
```

- [ ] **Step 2: Manter aparência de texto normal**

Em `detail.css`, após `.access-status-text`, adicionar:

```css
.address-link {
    text-decoration: none;
    color: var(--text);
    cursor: default;
}

.address-link[href] {
    cursor: pointer;
}

.address-link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    border-radius: 8px;
}
```

- [ ] **Step 3: Verificação rápida**

Confirmar que `detail.html` contém `class="access-status-text address-link"` e que `detail.css` contém `.address-link[href]`.

## Task 2: Gerar link Google Maps no JavaScript

**Files:**
- Modify: `detail.js:68-97`
- Modify: `detail.js:97-131`

- [ ] **Step 1: Adicionar helper de endereço válido**

Em `detail.js`, após `showToast()`, adicionar:

```js
function hasValidAddress(address) {
    const value = (address || '').trim();
    return value !== '' && value.toLowerCase() !== 'não informado' && value.toLowerCase() !== 'nao informado';
}
```

- [ ] **Step 2: Adicionar helper de URL do Google Maps**

Logo após `hasValidAddress()`, adicionar:

```js
function buildMapsSearchUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}
```

- [ ] **Step 3: Configurar link no `populatePage()`**

Em `populatePage(data)`, trocar:

```js
els.address.textContent = data.e || 'Não informado';
```

por:

```js
const address = data.e || 'Não informado';
els.address.textContent = address;

if (hasValidAddress(address)) {
    els.address.href = buildMapsSearchUrl(address);
    els.address.target = '_blank';
    els.address.rel = 'noopener noreferrer';
    els.address.removeAttribute('aria-disabled');
    els.address.tabIndex = 0;
} else {
    els.address.removeAttribute('href');
    els.address.removeAttribute('target');
    els.address.removeAttribute('rel');
    els.address.setAttribute('aria-disabled', 'true');
    els.address.tabIndex = -1;
}
```

- [ ] **Step 4: Verificação rápida**

Confirmar que `detail.js` contém:

```js
https://www.google.com/maps/search/?api=1&query=
```

e usa `encodeURIComponent(address.trim())`.

## Task 3: Validação local

**Files:**
- Read: `detail.html`
- Read: `detail.js`
- Read: `detail.css`

- [ ] **Step 1: Verificar sintaxe JavaScript**

Run:

```powershell
node --check detail.js
```

Expected: saída vazia e exit code 0.

- [ ] **Step 2: Subir/usar servidor local**

Se `http://127.0.0.1:8080/detail.html` não responder, iniciar:

```powershell
python -m http.server 8080
```

Expected: `detail.html` responde HTTP 200.

- [ ] **Step 3: Testar endereço preenchido no navegador**

Abrir:

```text
http://127.0.0.1:8080/detail.html?data=%7B%22c%22%3A%22123%22%2C%22t%22%3A%22SITE123%22%2C%22l%22%3A%22CLARO123%22%2C%22f%22%3A%222026-05-31%22%2C%22s%22%3A%22Aprovado%22%2C%22o%22%3A%22Teste%22%2C%22e%22%3A%22Rua%20das%20Flores%2C%20100%20-%20Centro%22%7D
```

Expected:

- O texto visível continua `Rua das Flores, 100 - Centro`.
- O elemento `#ticket-address` possui `href="https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20100%20-%20Centro"`.
- Não aparece texto extra de instrução.

- [ ] **Step 4: Testar endereço ausente no navegador**

Abrir:

```text
http://127.0.0.1:8080/detail.html?data=%7B%22c%22%3A%22123%22%2C%22t%22%3A%22SITE123%22%2C%22l%22%3A%22CLARO123%22%2C%22f%22%3A%222026-05-31%22%2C%22s%22%3A%22Aprovado%22%2C%22o%22%3A%22Teste%22%7D
```

Expected:

- O texto visível é `Não informado`.
- O elemento `#ticket-address` não possui `href`.
- Clicar no texto não abre Google Maps.

## Self-Review

- Spec coverage: Tasks 1-3 cobrem link clicável, URL Google Maps Search, ausência de etiqueta visual e comportamento sem endereço.
- Placeholder scan: não há `TBD`, `TODO` ou instrução vaga.
- Type consistency: o elemento continua usando id `ticket-address`; o campo de dados continua `data.e`; a URL usa `encodeURIComponent(address.trim())`.
