# Design: Transição Nativa entre Telas (View Transitions API)

## Objetivo

Adicionar animação fluida, profissional e leve entre a tela de consulta (`index.html`) e a tela de detalhes (`detail.html`) usando a View Transitions API, com um toque sutil de expansão do card no elemento principal do ticket.

## Comportamento atual

A navegação entre páginas é instantânea (corte seco). O app usa `window.location.href` para ir da consulta ao detalhe, e links normais para voltar. Já existem animações de entrada nos cards (`fadeInUp`) e no ticket (`ticketOpenTop`/`ticketOpenBottom`), mas entre páginas não há transição.

## Comportamento desejado

### Transição principal (index → detail)

| Fase | Animação | Duração |
|------|----------|---------|
| Saída (index) | fade out + escala 0.98 | 200ms, ease-out |
| Entrada (detail) | fade in + deslocamento vertical 12px para cima | 300ms, ease-out |
| Stagger detail | ticket halves aparecem em sequência (já existente) | 100ms gap |

### Toque sutil card → ticket (Opção 2)

Quando a detail carrega, o elemento `ticket-site-code` (número grande do site) inicia com `scale(0.85)` e anima para `scale(1.0)` — um eco visual do card que foi clicado na tela anterior.

### Transição reversa (detail → index)

A volta usa a mesma transição, apenas invertida. A página de consulta mantém o scroll state.

## Como funciona

### View Transitions API (cross-document)

Quando o navegador navega entre duas páginas do mesmo origin, a View Transitions API captura um screenshot da página antiga, carrega a nova página, e anima a troca usando CSS. Isso funciona sem JS e sem precisar converter o app em SPA.

### CSS necessário

```css
/* Habilita transições cross-document */
@view-transition {
  navigation: auto;
}

/* Animação de saída (página antiga) */
::view-transition-old(root) {
  animation: 200ms ease-out both viewOut;
}

/* Animação de entrada (página nova) */
::view-transition-new(root) {
  animation: 300ms ease-out both viewIn;
}

@keyframes viewOut {
  to {
    opacity: 0;
    transform: scale(0.98);
  }
}

@keyframes viewIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
```

### Expansão sutil do ticket-site-code

O elemento fica **dentro do root group** (sem `view-transition-name` próprio), então participa da transição de fade+translate com o resto da página. A animação CSS extra começa de `scale(0.85)` — o snapshot da View Transitions captura esse estado inicial, e após os 300ms da transição principal o elemento continua crescendo suavemente até `scale(1)`.

```css
.ticket-site-code {
  animation: siteCodeGrow 500ms ease-out both;
}

@keyframes siteCodeGrow {
  from {
    transform: scale(0.85);
    opacity: 0.9;
  }
}
```

## Fallback

Se o navegador não suportar View Transitions API:
- A navegação acontece normalmente, sem erro.
- As animações de entrada existentes (ticket halves, cards) continuam funcionando.
- Nenhuma degradação visível.

## Acessibilidade

O arquivo `index.css` já possui:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Isso desativa todas as animações para usuários que preferem movimento reduzido.

## Impacto

| Aspecto | Impacto |
|---------|---------|
| Peso | ~1KB de CSS novo |
| JavaScript | Nenhuma alteração |
| HTML | Nenhuma alteração |
| Service Worker | Nenhuma alteração |
| Cache | Nenhuma alteração |

## Componentes afetados

- `index.css`
  - Adicionar `@view-transition` rule.
  - Adicionar `::view-transition-old(root)` e `::view-transition-new(root)` com keyframes.
  - Nada mais muda neste arquivo.

- `detail.css`
  - Adicionar keyframe `siteCodeGrow` para o eco de expansão no `.ticket-site-code`.
  - Sem `view-transition-name` — o elemento fica no root group para transicionar com a página.

## Critérios de aceite

- Ao navegar de `index.html` para `detail.html`, a página atual fade out com leve escala.
- A nova página fade in com deslocamento vertical suave.
- O número grande do site (`ticket-site-code`) tem uma breve expansão de 0.85 → 1.0.
- Ao voltar para `index.html`, a transição é suave.
- Em navegadores sem suporte, a navegação funciona sem animação (sem erro).
- `prefers-reduced-motion` desativa todas as animações.
