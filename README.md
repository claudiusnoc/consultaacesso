# Consulta TBSA

O webapp é publicado pelo GitHub Pages a partir da branch `main`. Os dados exibidos vêm de `chamados.csv`.

## Atualizar os status

O comando abaixo consulta no Acesites somente os sites cujo status ainda não é `Liberado`, cruza o retorno pelo par `ID DETENTORA + CHAMADO` e altera apenas a coluna `STATUS`:

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

O processo não abre chamados e não chama o endpoint de criação. Ele consulta os chamados existentes, mantém as 520 linhas do CSV e recusa a publicação quando existem outras alterações locais.

## Agendamento diário

Depois que esta alteração estiver na `main`, o agendamento pode ser instalado no Windows informando o horário desejado:

```powershell
.\instalar-agendamento.ps1 -Horario 07:00
```

O agendamento usa a sessão e as credenciais já configuradas no computador. Ele não é instalado automaticamente pelo repositório.

## Publicação

O GitHub Pages está configurado para servir a raiz da branch `main`. Após o commit chegar à `main`, a nova versão do CSV é publicada automaticamente. O service worker usa estratégia de rede para `chamados.csv` e o app solicita o arquivo sem cache, evitando que status antigos permaneçam no dispositivo.
