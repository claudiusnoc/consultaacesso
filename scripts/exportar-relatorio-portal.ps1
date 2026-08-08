[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BaseCsv,
    [Parameter(Mandatory)][string]$Saida,
    [string]$ProjetoPortal = 'C:\Users\Claudius\Documents\PORTAL TBSA MINAS GERAIS',
    [string]$Session = 'tbsa-webapp-sync'
)

$ErrorActionPreference = 'Stop'
$portalSessionScript = Join-Path $ProjetoPortal 'scripts\portal-session.ps1'
if (-not (Test-Path -LiteralPath $portalSessionScript)) {
    throw "Controle de sessão do portal não encontrado: $portalSessionScript"
}
if (-not (Test-Path -LiteralPath $BaseCsv)) { throw "CSV base não encontrado: $BaseCsv" }

. $portalSessionScript
$baseRows = @(Import-Csv -LiteralPath $BaseCsv -Encoding UTF8)
if ($baseRows.Count -eq 0) { throw 'O CSV base está vazio.' }

$targetKeys = @(
    $baseRows | ForEach-Object {
        $site = ([string]$_.'ID DETENTORA').Trim().ToUpperInvariant()
        $call = ([string]$_.CHAMADO -replace '\D', '').TrimStart('0')
        if (-not $site -or -not $call) { throw 'O CSV possui chamado ou ID detentora vazio.' }
        "$site|$call"
    }
)
$uniqueTargets = @($targetKeys | Sort-Object -Unique)
if ($uniqueTargets.Count -ne $baseRows.Count) { throw 'O CSV possui chaves ID detentora + chamado duplicadas.' }

try {
    Write-Host 'Abrindo a sessão autenticada do Acesites...'
    $previousTimeout = $env:AGENT_BROWSER_DEFAULT_TIMEOUT
    try {
        $env:AGENT_BROWSER_DEFAULT_TIMEOUT = '60000'
        & agent-browser.cmd --session $Session open 'https://acesites.com.br/index.php'
        if ($LASTEXITCODE -ne 0) { throw 'O portal não respondeu à abertura da sessão.' }
    } finally {
        if ($null -eq $previousTimeout) { Remove-Item Env:AGENT_BROWSER_DEFAULT_TIMEOUT -ErrorAction SilentlyContinue }
        else { $env:AGENT_BROWSER_DEFAULT_TIMEOUT = $previousTimeout }
    }
    Open-TbsaSession -Session $Session | Out-Null
    Write-Host 'Sessão autenticada. Solicitando o relatório único...'
    Invoke-AgentBrowser -Session $Session -Arguments @('eval', 'window.__tbsaTargetKeys=[]') | Out-Null

    for ($offset = 0; $offset -lt $uniqueTargets.Count; $offset += 80) {
        $last = [Math]::Min($offset + 79, $uniqueTargets.Count - 1)
        $payload = $uniqueTargets[$offset..$last] -join ';'
        $javascript = "window.__tbsaTargetKeys.push(...'$payload'.split(';'))"
        $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($javascript))
        Invoke-AgentBrowser -Session $Session -Arguments @('eval', '-b', $encoded) | Out-Null
    }

    $extractJavascript = @'
(async()=>{
  const response=await fetch('getDadosChamado.php',{cache:'no-store',signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error('Relatorio HTTP '+response.status);
  const all=await response.json();
  if(!Array.isArray(all)) throw new Error('Formato inesperado do relatorio');
  const normalizeCall=value=>String(value??'').replace(/\D/g,'').replace(/^0+/, '');
  const wanted=new Set(window.__tbsaTargetKeys||[]);
  const rows=all
    .filter(row=>wanted.has(String(row.idSiteacessar??'').trim().toUpperCase()+'|'+normalizeCall(row.id)))
    .map(row=>({id:row.id,idSiteacessar:row.idSiteacessar,statu:row.statu}));
  return {complete:true,source:'getDadosChamado.php',generatedAt:new Date().toISOString(),totalPortal:all.length,targets:wanted.size,rows};
})()
'@
    $encodedExtract = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($extractJavascript))
    $rawReport = Invoke-AgentBrowser -Session $Session -Arguments @('eval', '-b', $encodedExtract)
    $report = $rawReport | ConvertFrom-Json

    if (-not $report.complete -or $report.targets -ne $uniqueTargets.Count) {
        throw 'O relatório retornado não corresponde ao conjunto solicitado.'
    }
    $reportRows = @($report.rows)
    $reportKeys = @(
        $reportRows | ForEach-Object {
            $site = ([string]$_.idSiteacessar).Trim().ToUpperInvariant()
            $call = ([string]$_.id -replace '\D', '').TrimStart('0')
            "$site|$call"
        }
    )
    $uniqueReportKeys = @($reportKeys | Sort-Object -Unique)
    if ($reportRows.Count -ne $uniqueReportKeys.Count) { throw 'O relatório possui chamados duplicados.' }
    if ($uniqueReportKeys.Count -ne $uniqueTargets.Count) {
        $missing = @($uniqueTargets | Where-Object { $_ -notin $uniqueReportKeys })
        throw "Relatório incompleto: $($missing.Count) chamado(s) ausente(s)."
    }

    $outputDirectory = Split-Path -Parent $Saida
    if (-not (Test-Path -LiteralPath $outputDirectory)) {
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    }
    $temporaryPath = "$Saida.tmp"
    $report | ConvertTo-Json -Depth 5 -Compress | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Saida -Force
    Write-Host ("Relatório extraído: {0} registro(s) do controle, em {1} registro(s) do portal." -f $reportRows.Count, $report.totalPortal)
} finally {
    try { Invoke-AgentBrowser -Session $Session -Arguments @('close') | Out-Null } catch {}
}
