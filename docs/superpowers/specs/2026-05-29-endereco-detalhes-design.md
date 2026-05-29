# Design: Endereço na tela de detalhes

## Objetivo

Adicionar suporte à coluna `ENDERECO` da planilha online e exibir esse valor no bloco inferior do cartão de detalhes do site.

## Comportamento atual

Na tela `detail.html`, o bloco inferior do ticket mostra:

- Label: `Status`
- Texto principal: `Acesso Ao Site` ou `Acesso Indisponível`
- Data de validade do acesso

Esses dados vêm do objeto montado em `app.js` a partir da planilha CSV publicada pelo Google Sheets.

## Comportamento desejado

O mesmo bloco inferior passará a mostrar:

- Ícone de torre
- Label: `Endereço:`
- Abaixo, o endereço vindo da coluna `ENDERECO`

Formato visual desejado:

```text
[ícone de torre] Endereço:
Rua xx, bairro tal...
```

Se o endereço estiver vazio ou ausente, o texto exibido será:

```text
Não informado
```

## Dados

A planilha deve ter uma coluna com cabeçalho exatamente igual a:

```text
ENDERECO
```

Essa coluna não precisa ficar em uma posição específica. O parser identifica as colunas pelo nome do cabeçalho.

O mapeamento em `app.js` deve adicionar um novo campo interno, por exemplo:

```js
e: item['ENDERECO'] || ''
```

## Arquitetura e fluxo

1. `app.js` baixa o CSV da planilha publicada.
2. `parseCSV()` transforma o CSV em objetos usando os cabeçalhos.
3. O mapeamento de `dataStore` inclui o novo campo `e` com o valor de `ENDERECO`.
4. Ao clicar em `DETALHES`, o item completo é salvo no `sessionStorage` e enviado para `detail.html` pela query string.
5. `detail.js` lê o objeto e preenche o bloco inferior com `data.e`.

## Componentes afetados

- `app.js`
  - Adicionar `ENDERECO` ao mapeamento da planilha.
  - Opcionalmente adicionar o campo nos dados offline de exemplo.

- `detail.html`
  - Alterar o bloco inferior do ticket para representar endereço em vez de status/data.
  - Usar um ícone visual de torre no label.

- `detail.js`
  - Adicionar referência ao elemento de endereço.
  - Preencher endereço com `data.e || 'Não informado'`.
  - Remover ou deixar de usar, nesse bloco, o texto de status/data.
  - Opcionalmente incluir endereço no texto de copiar todos os dados.

## Tratamento de erro e compatibilidade

- Se a coluna `ENDERECO` ainda não existir na planilha, o app continuará funcionando.
- Nesse caso, a tela mostrará `Não informado`.
- Caches antigos podem não conter o campo `e`; a tela também deve cair para `Não informado`.

## Fora de escopo

- Alterar a URL da planilha.
- Mudar a tela de consulta principal.
- Criar mapa, link de navegação ou integração com Google Maps.
- Reorganizar todos os dados do cartão de detalhes.

## Critérios de aceite

- Com `ENDERECO` preenchido na planilha, a tela de detalhes mostra o endereço no bloco inferior.
- O label aparece como `Endereço:` com ícone de torre.
- O texto `Acesso Ao Site` e a data não aparecem mais nesse bloco.
- Sem endereço, a tela mostra `Não informado`.
- A busca e a abertura dos detalhes continuam funcionando.
