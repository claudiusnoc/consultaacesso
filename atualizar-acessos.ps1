[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Planilha,
    [switch]$Publicar,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot
$csvPath = Join-Path $repo 'chamados.csv'
$importScript = Join-Path $repo 'scripts\importar-acessos.ps1'
if (-not (Test-Path -LiteralPath $importScript)) { throw 'scripts\importar-acessos.ps1 não encontrado.' }

function Invoke-GitWithRetry {
    param([Parameter(Mandatory)][string[]]$Arguments, [Parameter(Mandatory)][string]$FailureMessage, [int]$MaxAttempts = 3)
    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        & git -c $gitConfig -C $repo @Arguments
        if ($LASTEXITCODE -eq 0) { return }
        if ($attempt -lt $MaxAttempts) { Start-Sleep -Seconds (5 * $attempt) }
    }
    throw $FailureMessage
}

if ($Publicar) {
    $gitConfig = "safe.directory=$repo"
    $branch = (git -c $gitConfig -C $repo branch --show-current).Trim()
    if ($branch -ne 'main') { throw "Publicação automática permitida somente na branch main. Branch atual: $branch" }
    $initialChanges = @(git -c $gitConfig -C $repo status --porcelain)
    if ($initialChanges.Count -gt 0) { throw "Publicação bloqueada: existem alterações locais antes da importação.`n$($initialChanges -join [Environment]::NewLine)" }
    Invoke-GitWithRetry -Arguments @('fetch', 'origin', 'main', '--quiet') -FailureMessage 'Falha ao consultar a versão atual da branch main no GitHub.'
    $localHead = (git -c $gitConfig -C $repo rev-parse HEAD).Trim()
    $remoteHead = (git -c $gitConfig -C $repo rev-parse origin/main).Trim()
    if ($localHead -ne $remoteHead) {
        git -c $gitConfig -C $repo merge --ff-only origin/main
        if ($LASTEXITCODE -ne 0) { throw 'A branch main local divergiu do GitHub. Publicação bloqueada.' }
    }
}

$arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $importScript, '-Planilha', $Planilha, '-Saida', $csvPath)
if ($DryRun) { $arguments += '-DryRun' }
$summaryOutput = @(& powershell.exe @arguments)
if ($LASTEXITCODE -ne 0) { throw 'Falha ao importar a planilha de acessos.' }
$summary = $summaryOutput[-1] | ConvertFrom-Json
if ($summary.rows -eq 0) { throw 'A importação não produziu registros.' }

Write-Host ("Importação validada: {0} acesso(s), {1} liberado(s)." -f $summary.rows, $summary.approved)
if ($DryRun) {
    Write-Host 'DRY-RUN concluído. O CSV não foi alterado e nada foi publicado.'
    exit 0
}

if ($Publicar) {
    $gitChanges = @(git -c $gitConfig -C $repo status --porcelain)
    $unexpected = @($gitChanges | Where-Object { $_ -notmatch '^.. chamados\.csv$' })
    if ($unexpected.Count -gt 0) { throw "Publicação bloqueada: existem alterações locais além de chamados.csv.`n$($unexpected -join [Environment]::NewLine)" }
    git -c $gitConfig -C $repo diff --quiet -- chamados.csv
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'A planilha não trouxe mudanças para publicar.'
        exit 0
    }
    git -c $gitConfig -C $repo add -- chamados.csv
    git -c $gitConfig -C $repo commit -m 'Atualiza acessos TBSA pela planilha'
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar o commit de atualização.' }
    Invoke-GitWithRetry -Arguments @('push', 'origin', 'main') -FailureMessage 'Falha ao publicar a atualização no GitHub.'
    Write-Host 'Atualização publicada na branch main.'
}
