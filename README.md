# Consulta TBSA

O webapp é publicado pelo GitHub Pages a partir da branch `main`. Os dados exibidos vêm de `chamados.csv`.

## Atualizar os status

O comando abaixo baixa uma única vez o relatório interno do Acesites, mantém somente os 520 pares `ID DETENTORA + CHAMADO` do controle e altera apenas a coluna `STATUS`:

```powershell
.\atualizar-webapp.ps1
```

Para conferir um relatório já extraído, sem consultar o portal e sem alterar o CSV:

```powershell
.\atualizar-webapp.ps1 -RelatorioPortal C:\caminho\relatorio.json -DryRun
```

Para atualizar, criar o commit e publicar na branch atual:

```powershell
.\atualizar-webapp.ps1 -Publicar
```

O processo não abre chamados e não chama o endpoint de criação. Ele exige os 520 chamados no relatório, bloqueia duplicidades, status desconhecidos e relatórios incompletos, e recusa a publicação quando existem outras alterações locais.

## Agendamento automático

O fluxo previsto roda a cada dois dias, às 08:00. Como alternativa local pelo Agendador do Windows:

```powershell
.\instalar-agendamento.ps1 -Horario 08:00 -IntervaloDias 2
```

O agendamento usa a credencial protegida e já configurada neste computador. Cada execução fecha sua sessão do navegador ao terminar e só publica quando algum status mudou.

## Publicação

O GitHub Pages está configurado para servir a raiz da branch `main`. Após o commit chegar à `main`, a nova versão do CSV é publicada automaticamente. O service worker usa estratégia de rede para `chamados.csv` e o app solicita o arquivo sem cache, evitando que status antigos permaneçam no dispositivo.
