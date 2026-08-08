[CmdletBinding()]
param(
    [string]$RelatorioPortal,
    [string]$ProjetoPortal = 'C:\Users\Claudius\Documents\PORTAL TBSA MINAS GERAIS',
    [switch]$Publicar,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$csvPath = Join-Path $repo 'chamados.csv'
$syncScript = Join-Path $repo 'scripts\sync-chamados.mjs'
$exportScript = Join-Path $repo 'scripts\exportar-relatorio-portal.ps1'
if (-not (Test-Path -LiteralPath $csvPath)) { throw 'chamados.csv não encontrado.' }
if (-not (Test-Path -LiteralPath $syncScript)) { throw 'scripts\sync-chamados.mjs não encontrado.' }
if (-not (Test-Path -LiteralPath $exportScript)) { throw 'scripts\exportar-relatorio-portal.ps1 não encontrado.' }

if ($Publicar) {
    $branch = (git -C $repo branch --show-current).Trim()
    if ($branch -ne 'main') { throw "Publicação automática permitida somente na branch main. Branch atual: $branch" }
    $initialChanges = @(git -C $repo status --porcelain)
    if ($initialChanges.Count -gt 0) {
        throw "Publicação bloqueada: o repositório possui alterações locais antes da consulta.`n$($initialChanges -join [Environment]::NewLine)"
    }
    git -C $repo fetch origin main --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao consultar a versão atual da branch main no GitHub.' }
    $localHead = (git -C $repo rev-parse HEAD).Trim()
    $remoteHead = (git -C $repo rev-parse origin/main).Trim()
    if ($localHead -ne $remoteHead) {
        git -C $repo merge --ff-only origin/main
        if ($LASTEXITCODE -ne 0) { throw 'A branch main local divergiu do GitHub. Publicação bloqueada.' }
    }
}

$rows = @(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
if ($rows.Count -eq 0) { throw 'O CSV está vazio.' }
$pendingSites = @(
    $rows |
        Where-Object { ([string]$_.STATUS).Trim() -ne 'Liberado' } |
        ForEach-Object { ([string]$_.'ID DETENTORA').Trim().ToUpperInvariant() } |
        Where-Object { $_ } |
        Sort-Object -Unique
)

if (-not $RelatorioPortal) {
    if ($pendingSites.Count -eq 0) {
        Write-Host 'Todos os chamados já estão liberados. Nenhuma consulta necessária.'
        exit 0
    }
    $reportDirectory = Join-Path $ProjetoPortal '.tbsa\relatorios-webapp'
    if (-not (Test-Path -LiteralPath $reportDirectory)) { New-Item -ItemType Directory -Path $reportDirectory | Out-Null }
    $RelatorioPortal = Join-Path $reportDirectory ("webapp-status-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Write-Host "Extraindo um único relatório para os $($rows.Count) chamado(s) do controle..."
    & $exportScript -BaseCsv $csvPath -Saida $RelatorioPortal -ProjetoPortal $ProjetoPortal
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $RelatorioPortal)) {
        throw 'Falha na extração somente leitura do relatório do portal.'
    }
}

$RelatorioPortal = (Resolve-Path -LiteralPath $RelatorioPortal).Path
$runtimeScript = Join-Path $ProjetoPortal 'scripts\runtime.ps1'
if (-not (Test-Path -LiteralPath $runtimeScript)) { throw "Runtime do projeto TBSA não encontrado: $runtimeScript" }
. $runtimeScript
$node = Get-TbsaNode

$arguments = @($syncScript, '--base', $csvPath, '--report', $RelatorioPortal, '--output', $csvPath)
if ($DryRun) { $arguments += '--dry-run' }
$syncOutput = @(& $node @arguments)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao sincronizar o CSV.' }
$summary = $syncOutput[-1] | ConvertFrom-Json
if ($summary.matched -ne $rows.Count -or $summary.missing -ne 0) {
    throw "Sincronização bloqueada: relatório incompleto ($($summary.matched)/$($rows.Count), $($summary.missing) ausente(s))."
}

$validatedRows = @(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
$duplicates = @($validatedRows | Group-Object 'ID DETENTORA' | Where-Object { $_.Count -gt 1 })
if ($validatedRows.Count -ne $rows.Count) { throw 'A sincronização alterou indevidamente a quantidade de linhas.' }
if ($duplicates.Count -gt 0) { throw 'A sincronização criou IDs de detentora duplicados.' }

Write-Host ("Sincronização validada: {0} linha(s), {1} correspondência(s), {2} atualização(ões), {3} pendência(s) sem correspondência." -f $summary.rows, $summary.matched, $summary.updated, $summary.missing)
if ($DryRun) {
    Write-Host 'DRY-RUN concluído. O CSV não foi alterado e nada foi publicado.'
    exit 0
}

if ($Publicar) {
    $gitChanges = @(git -C $repo status --porcelain)
    $unexpected = @($gitChanges | Where-Object { $_ -notmatch '^.. chamados\.csv$' })
    if ($unexpected.Count -gt 0) {
        throw "Publicação bloqueada: existem alterações locais além de chamados.csv.`n$($unexpected -join [Environment]::NewLine)"
    }
    git -C $repo diff --quiet -- chamados.csv
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'Nenhuma mudança de status para publicar.'
        exit 0
    }
    git -C $repo add -- chamados.csv
    git -C $repo commit -m 'Atualiza status dos chamados TBSA'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o commit de atualização.' }
    git -C $repo push origin main
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar a atualização no GitHub.' }
    Write-Host 'Atualização publicada na branch main.'
}
