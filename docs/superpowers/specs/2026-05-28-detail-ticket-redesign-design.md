# Design: Tela de detalhe tipo ticket — Consulta de Chamados TBSA

## Escopo

Redesenhar a tela `detail.html` para ficar fiel à referência enviada: layout mobile-first, visual claro, card principal tipo ticket, informações grandes e navegação inferior. A tela inicial não faz parte desta etapa.

## Objetivo visual

A tela deve transmitir a ideia de um comprovante/ticket moderno e profissional. O foco principal é o ID TBSA em tamanho grande, seguido por metadados essenciais do chamado e um card secundário com número do chamado e observações.

## Estrutura da tela

- Fundo claro e abstrato, alinhado ao visual da tela inicial.
- Sem topbar fixa no topo.
- Card principal branco/translúcido com cantos arredondados e sombra suave.
- Título principal grande com o ID TBSA, por exemplo `TEMGBHO0027`.
- Linha de informações em 3 colunas:
  - `ESTAÇÃO` com `ID CLARO`, exemplo `EMG0010`.
  - `ACESSO` com `Manutenção`.
  - `STATUS` com indicador verde quando aprovado ou vermelho quando bloqueado/vencido.
- Linha pontilhada horizontal com recortes laterais simulando ticket destacável.
- Parte inferior do ticket com `STATUS` → `Acesso ao Site` e QR code decorativo à direita.
- Card inferior branco com borda lateral vermelha:
  - Label `EQS TAB`.
  - `CHAMADO #00358519`.
  - Botão de copiar chamado.
  - Separador.
  - Label `OBSERVAÇÕES`.
  - Texto real da observação.
- Bottom nav fixo com duas opções:
  - `Consulta`.
  - `Detalhe` ativo em vermelho.

## Dados preservados

- `data.t` continua sendo o ID TBSA/título principal.
- `data.l` continua sendo a estação/ID Claro.
- `data.c` continua sendo o número do chamado.
- `data.s`, `data.f` e regra atual continuam determinando se o status está aprovado, vencido ou bloqueado.
- `data.o` continua preenchendo observações.

## QR code

O QR code será apenas decorativo, sem gerar dados reais nesta etapa.

## Arquitetura de implementação

- Atualizar `detail.html` para uma estrutura mais próxima da referência.
- Reescrever/ajustar `detail.css` para o novo layout.
- Fazer pequenos ajustes em `detail.js` somente para preencher novos IDs/classes e manter copiar chamado/dados funcionando.

## Fora de escopo

- QR code funcional.
- Novas rotas ou perfil/configurações.
- Alterações na origem dos dados.
- Redesign adicional da tela inicial.

## Critérios de aceite

- A tela de detalhes fica visualmente próxima à referência enviada.
- O ID TBSA aparece grande no card principal.
- Chamado e observações usam dados reais.
- O botão de copiar chamado continua funcionando.
- O status aprovado/bloqueado/vencido continua respeitando a lógica existente.
- A bottom nav exibe Consulta e Detalhe, com Detalhe ativo.
