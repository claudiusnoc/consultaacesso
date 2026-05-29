# Design: Tela inicial Material/Glass — Consulta de Chamados TBSA

## Escopo

Redesenhar primeiro apenas a tela inicial do portal Consulta de Chamados TBSA, recriando fielmente a referência visual enviada. A tela de detalhes, navegação inferior e demais áreas do projeto ficam fora desta etapa.

## Objetivo visual

A nova tela inicial deve parecer moderna, limpa e profissional, com composição mobile-first inspirada em Material Design e glassmorphism claro. O resultado esperado é uma tela centralizada, com grande uso de espaço em branco, fundo abstrato suave, card translúcido, botão vermelho de destaque e identificação EQS no rodapé.

## Estrutura da tela

- Fundo claro abstrato ocupando toda a viewport, usando o asset existente `fundo.webp` como base sempre que possível.
- Toggle de tema fixo no topo direito, visualmente parecido com uma cápsula clara com ícones de sol e lua.
- Card principal centralizado verticalmente, com borda branca, transparência, blur e sombra suave.
- Título central: `Consulta de Chamados TBSA`, em duas linhas quando necessário.
- Campo de busca branco com ícone de lupa à esquerda e placeholder: `Estação, ID ou Chamado`.
- Botão vermelho EQS com texto em caixa alta: `CONSULTAR CHAMADO`.
- Status de sincronização abaixo do botão, com ponto verde e texto `Conectado à Planilha (Sincronizado)` quando conectado.
- Logo/marca EQS centralizada no rodapé.

## Comportamento preservado

- Manter os IDs usados pelo JavaScript atual: `search-input`, `search-btn`, `status-sync`, `status-search`, `dashboard-panel`, `filters-panel`, `loading-spinner-container`, `loading-text`, `results-list`, `theme-check`.
- A busca deve continuar funcionando com a lógica atual em `app.js`.
- Dashboard, filtros, loading, mensagens de erro e resultados podem continuar existindo no HTML, mas não devem poluir o estado inicial.
- Não adicionar bottom navigation nesta etapa.

## Arquitetura de implementação

- Atualizar `index.html` somente quando necessário para ajustar semântica, wrappers e ícone de busca, mantendo compatibilidade com `app.js`.
- Reescrever/ajustar `index.css` para o novo visual da tela inicial.
- Evitar mudanças em `app.js` nesta primeira etapa, salvo se uma pequena adaptação for indispensável para preservar o layout.

## Acessibilidade e responsividade

- O layout deve ser mobile-first e se adaptar bem a telas pequenas e médias.
- O botão vermelho deve ter contraste suficiente com texto branco.
- O campo de busca deve ter área de toque confortável.
- Estados de foco devem ser visíveis.
- O texto principal deve permanecer legível em ambiente externo com brilho alto.

## Fora de escopo nesta etapa

- Redesign da tela de detalhes.
- Barra inferior de navegação.
- Novas funcionalidades de perfil, tickets ou configurações.
- Alterações na fonte de dados ou na lógica de sincronização.
- Reestruturação completa do JavaScript.

## Critérios de aceite

- A tela inicial fica visualmente próxima à imagem de referência enviada.
- A busca por estação, ID ou chamado continua funcionando.
- O status de conexão continua sendo exibido dinamicamente.
- O modo claro/escuro continua disponível.
- Em estado inicial, a tela não mostra navegação inferior.
