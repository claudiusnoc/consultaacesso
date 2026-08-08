[CmdletBinding()]
param(
    [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')][string]$Horario = '07:00',
    [string]$NomeTarefa = 'TBSA - Atualizar webapp de acessos'
)

$ErrorActionPreference = 'Stop'
$updateScript = Join-Path $PSScriptRoot 'atualizar-webapp.ps1'
if (-not (Test-Path -LiteralPath $updateScript)) { throw 'atualizar-webapp.ps1 não encontrado.' }

$today = Get-Date -Format 'yyyy-MM-dd'
$startAt = [datetime]::ParseExact("$today $Horario", 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture)
if ($startAt -le (Get-Date)) { $startAt = $startAt.AddDays(1) }

$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$updateScript`" -Publicar"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $startAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName $NomeTarefa `
    -Description 'Consulta somente os chamados TBSA ainda pendentes, atualiza chamados.csv e publica a mudança no GitHub.' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Force | Out-Null

Write-Host "Agendamento instalado: $NomeTarefa, diariamente às $Horario."
