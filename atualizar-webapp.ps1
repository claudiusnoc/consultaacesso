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
if (-not (Test-Path -LiteralPath $csvPath)) { throw 'chamados.csv não encontrado.' }
if (-not (Test-Path -LiteralPath $syncScript)) { throw 'scripts\sync-chamados.mjs não encontrado.' }

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
    $queryScript = Join-Path $ProjetoPortal 'consultar-sites-playwright.ps1'
    if (-not (Test-Path -LiteralPath $queryScript)) { throw "Consulta do portal não encontrada: $queryScript" }
    $reportDirectory = Join-Path $ProjetoPortal '.tbsa'
    if (-not (Test-Path -LiteralPath $reportDirectory)) { New-Item -ItemType Directory -Path $reportDirectory | Out-Null }
    $RelatorioPortal = Join-Path $reportDirectory ("webapp-status-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Write-Host "Consultando somente $($pendingSites.Count) site(s) ainda não liberado(s)..."
    & $queryScript -Sites $pendingSites -Saida $RelatorioPortal
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $RelatorioPortal)) {
        throw 'Falha na consulta somente leitura ao portal.'
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
    $branch = (git -C $repo branch --show-current).Trim()
    if (-not $branch) { throw 'Não foi possível identificar a branch atual.' }
    git -C $repo push origin $branch
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar a atualização no GitHub.' }
    Write-Host "Atualização publicada na branch $branch."
}
