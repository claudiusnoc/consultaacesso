# Design: Endereço clicável para Google Maps

## Objetivo

Permitir que o usuário clique no endereço exibido na tela de detalhes para abrir o Google Maps em modo pesquisa, sem adicionar etiqueta visual ou instrução dizendo que o campo é clicável.

## Comportamento desejado

Na tela `detail.html`, o bloco inferior continuará mostrando:

```text
[ícone de torre] Endereço:
Rua xx, bairro tal...
```

O texto do endereço será clicável. Ao clicar, o app abrirá uma pesquisa no Google Maps usando o endereço preenchido na coluna `ENDERECO`.

## URL do Google Maps

A URL será montada no formato:

```text
https://www.google.com/maps/search/?api=1&query=<ENDERECO codificado>
```

Exemplo:

```text
https://www.google.com/maps/search/?api=1&query=Rua%20das%20Flores%2C%20100%20-%20Centro
```

Em celulares, o sistema normalmente abre o aplicativo Google Maps quando instalado. Se não houver app disponível, abrirá no navegador.

## Interface

- Não haverá texto como “clique aqui”, “abrir mapa” ou similar.
- O visual do campo permanecerá praticamente igual ao atual.
- O cursor pode indicar clique em ambientes desktop.
- O endereço deve continuar legível como texto normal.

## Tratamento de dados ausentes

Se o endereço estiver vazio ou for exibido como `Não informado`:

- O campo não abrirá o Google Maps.
- O texto continuará aparecendo como `Não informado`.
- Não haverá erro para o usuário.

## Arquitetura e fluxo

1. `app.js` continua lendo `ENDERECO` da planilha para o campo interno `e`.
2. `detail.js` recebe `data.e` e preenche o campo de endereço.
3. `detail.js` monta a URL do Google Maps com `encodeURIComponent(data.e)`.
4. `detail.html` usará um elemento clicável para o endereço, mantendo a estrutura visual do bloco inferior.

## Componentes afetados

- `detail.html`
  - Alterar o elemento do endereço para permitir link/click.

- `detail.js`
  - Definir o texto do endereço.
  - Definir/remover o link do Google Maps conforme existência de endereço válido.

- `detail.css`
  - Manter o visual do endereço semelhante ao atual.
  - Remover aparência padrão de link, se necessário.
  - Preservar acessibilidade mínima com foco visível quando navegado por teclado.

## Critérios de aceite

- Endereço preenchido abre Google Maps em modo pesquisa ao ser clicado.
- A URL usa `https://www.google.com/maps/search/?api=1&query=...`.
- O endereço não mostra etiqueta extra indicando clique.
- Endereço vazio/ausente mostra `Não informado` e não abre mapa.
- A tela de detalhes continua funcionando com os dados vindos da planilha, query string e fallback.
