# Consulta TBSA

O webapp é publicado pelo GitHub Pages a partir da branch `main`. Os dados exibidos vêm de `chamados.csv`.

## Atualizar os acessos

O portal é apenas de consulta: ele não abre chamados nem acessa o Acesites. Para importar a nova exportação completa, preservando a estrutura apresentada no portal, execute:

```powershell
.\atualizar-acessos.ps1 -Planilha 'C:\caminho\ACESSOS TBSA.xlsx'
```

Para validar a planilha sem alterar o CSV:

```powershell
.\atualizar-acessos.ps1 -Planilha 'C:\caminho\ACESSOS TBSA.xlsx' -DryRun
```

Para importar, criar o commit e publicar na branch `main`:

```powershell
.\atualizar-acessos.ps1 -Planilha 'C:\caminho\ACESSOS TBSA.xlsx' -Publicar
```

O importador lê exclusivamente a aba `Acessos`. Ele usa `PROTOCOLO`, `LOCAL`, `SITE`, `STATUS`, `DATA DE TERMINO`, `REGIAO`, `REVISADO POR` e `OBSERVACOES`; os demais campos são ignorados. Quando o `SITE` não vier calculado na aba principal, ele usa o mapeamento `ID Detentora` + `Estação` da aba `Planilha1`.

O processo bloqueia protocolos ou IDs de detentora duplicados, campos obrigatórios vazios, status desconhecidos e datas inválidas. Nunca abre, altera ou envia chamados ao sistema externo.

## Atualização remota pelo portal

O modo de produção usa Supabase: a consulta pública lê a tabela `portal_acessos` e a atualização pelo ícone de planilha valida o arquivo no navegador e envia os acessos para uma função SQL protegida. Assim, a pessoa responsável atualiza pelo navegador sem usar GitHub, terminal ou um servidor local.

Antes de publicar, aplique `supabase/migrations/20261024140000_portal_acessos.sql` e `supabase/migrations/20261024150000_importacao_pelo_navegador.sql`. Defina o código com `select private.definir_codigo_atualizacao('seu-codigo-forte');` no SQL Editor. A chave em `supabase-config.js` é pública por definição e só permite leitura; apenas a função SQL, que compara o hash do código, pode substituir a base. O arquivo enviado é descartado após a validação, enquanto os acessos permanecem salvos no banco.

Como alternativa de desenvolvimento local, o repositório também inclui o servidor Node abaixo, que grava em `chamados.csv`.

Defina um código administrativo somente no ambiente do servidor e inicie a aplicação:

```powershell
$env:TBSA_ADMIN_CODE = 'defina-um-codigo-longo-e-exclusivo'
node .\server.mjs
```

Acesse `http://127.0.0.1:4173/admin.html`, informe o código e envie a exportação `.xlsx`. O servidor valida a planilha com o mesmo importador, atualiza `chamados.csv` e remove o arquivo enviado. Para acesso externo, defina `HOST=0.0.0.0`, use HTTPS e configure um volume persistente para o diretório do projeto. Não publique o código em arquivos do site ou no GitHub.

## Agendamento automático

O fluxo previsto roda a cada dois dias, às 08:00. Como alternativa local pelo Agendador do Windows:

```powershell
.\instalar-agendamento.ps1 -Planilha 'C:\caminho\ACESSOS TBSA.xlsx' -Horario 08:00 -IntervaloDias 2
```

O agendamento deve apontar para uma exportação da planilha disponível localmente. Cada execução importa a planilha e só publica quando `chamados.csv` mudou.

## Publicação

O GitHub Pages está configurado para servir a raiz da branch `main`. Após o commit chegar à `main`, a nova versão do CSV é publicada automaticamente. O service worker usa estratégia de rede para `chamados.csv` e o app solicita o arquivo sem cache, evitando que status antigos permaneçam no dispositivo.
