[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Planilha,
    [string]$Saida,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
if (-not $Saida) { $Saida = Join-Path (Split-Path -Parent $PSCommandPath) '..\chamados.csv' }

function Normalize-Header {
    param([object]$Value)
    $text = [string]$Value
    $text = $text.Normalize([Text.NormalizationForm]::FormD) -replace '[\p{Mn}]', ''
    return ($text.ToUpperInvariant() -replace '[^A-Z0-9]+', ' ').Trim()
}

function Get-ArchiveText {
    param([Parameter(Mandatory)]$Archive, [Parameter(Mandatory)][string]$Path)
    $entry = $Archive.GetEntry($Path)
    if ($null -eq $entry) { throw "Arquivo XLSX ausente: $Path" }
    $reader = [IO.StreamReader]::new($entry.Open(), [Text.Encoding]::UTF8, $true)
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-SharedStrings {
    param([Parameter(Mandatory)]$Archive)
    if ($null -eq $Archive.GetEntry('xl/sharedStrings.xml')) { return @() }
    $document = [xml](Get-ArchiveText -Archive $Archive -Path 'xl/sharedStrings.xml')
    $namespace = [Xml.XmlNamespaceManager]::new($document.NameTable)
    $namespace.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    return @($document.SelectNodes('/x:sst/x:si', $namespace) | ForEach-Object { $_.InnerText })
}

function Get-WorksheetPath {
    param([Parameter(Mandatory)]$Archive, [Parameter(Mandatory)][string]$SheetName)
    $workbook = [xml](Get-ArchiveText -Archive $Archive -Path 'xl/workbook.xml')
    $namespace = [Xml.XmlNamespaceManager]::new($workbook.NameTable)
    $namespace.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $sheet = @($workbook.SelectNodes('/x:workbook/x:sheets/x:sheet', $namespace) | Where-Object { $_.GetAttribute('name') -eq $SheetName })[0]
    if ($null -eq $sheet) { throw "A aba '$SheetName' não foi encontrada na planilha." }
    $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $relationships = [xml](Get-ArchiveText -Archive $Archive -Path 'xl/_rels/workbook.xml.rels')
    $relationship = @($relationships.Relationships.Relationship | Where-Object { $_.GetAttribute('Id') -eq $relationshipId })[0]
    if ($null -eq $relationship) { throw "Relacionamento da aba '$SheetName' não encontrado." }
    $target = $relationship.GetAttribute('Target').Replace('\\', '/')
    if ($target.StartsWith('/')) { return $target.TrimStart('/') }
    return "xl/$target"
}

function Get-ColumnNumber {
    param([Parameter(Mandatory)][string]$Reference)
    $letters = ($Reference -replace '\d', '').ToUpperInvariant()
    $number = 0
    foreach ($letter in $letters.ToCharArray()) { $number = ($number * 26) + ([int][char]$letter - [int][char]'A' + 1) }
    return $number
}

function Get-CellValue {
    param([Parameter(Mandatory)]$Cell, [Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$SharedStrings, [Parameter(Mandatory)]$Namespace)
    $type = $Cell.GetAttribute('t')
    if ($type -eq 'inlineStr') {
        $inline = $Cell.SelectSingleNode('x:is', $Namespace)
        return if ($inline) { $inline.InnerText } else { '' }
    }
    $valueNode = $Cell.SelectSingleNode('x:v', $Namespace)
    if ($null -eq $valueNode) { return '' }
    $value = $valueNode.InnerText
    if ($type -eq 's') {
        $index = 0
        if (-not [int]::TryParse($value, [ref]$index) -or $index -lt 0 -or $index -ge $SharedStrings.Count) { throw "Índice inválido em sharedStrings: $value" }
        return $SharedStrings[$index]
    }
    return $value
}

function Get-XlsxRows {
    param([Parameter(Mandatory)]$Archive, [Parameter(Mandatory)][string]$SheetName, [Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$SharedStrings)
    $path = Get-WorksheetPath -Archive $Archive -SheetName $SheetName
    $document = [xml](Get-ArchiveText -Archive $Archive -Path $path)
    $namespace = [Xml.XmlNamespaceManager]::new($document.NameTable)
    $namespace.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    $rows = @{}
    foreach ($row in $document.SelectNodes('/x:worksheet/x:sheetData/x:row', $namespace)) {
        $cells = @{}
        foreach ($cell in $row.SelectNodes('x:c', $namespace)) { $cells[(Get-ColumnNumber -Reference $cell.GetAttribute('r'))] = Get-CellValue -Cell $cell -SharedStrings $SharedStrings -Namespace $namespace }
        $rows[[int]$row.GetAttribute('r')] = $cells
    }
    return $rows
}

function Find-HeaderRow {
    param([Parameter(Mandatory)]$Rows, [Parameter(Mandatory)][string[]]$RequiredHeaders)
    foreach ($rowNumber in @($Rows.Keys | Sort-Object)) {
        $headers = @($Rows[$rowNumber].Values | ForEach-Object { Normalize-Header $_ })
        if (@($RequiredHeaders | Where-Object { $_ -notin $headers }).Count -eq 0) { return [int]$rowNumber }
    }
    throw "Não foi localizada uma linha com os cabeçalhos exigidos: $($RequiredHeaders -join ', ')."
}

function Get-HeaderMap {
    param([Parameter(Mandatory)]$Row, [Parameter(Mandatory)][string[]]$RequiredHeaders)
    $map = @{}
    foreach ($column in $Row.Keys) {
        $header = Normalize-Header $Row[$column]
        if ($header -and -not $map.ContainsKey($header)) { $map[$header] = [int]$column }
    }
    foreach ($header in $RequiredHeaders) { if (-not $map.ContainsKey($header)) { throw "Coluna obrigatória ausente: $header" } }
    return $map
}

function Get-RowField {
    param($Row, $HeaderMap, [string]$Header)
    if (-not $HeaderMap.ContainsKey($Header)) { return '' }
    return ([string]$Row[$HeaderMap[$Header]]).Trim()
}

function Convert-PortalStatus {
    param([string]$Value)
    $normalized = Normalize-Header $Value
    if (-not $normalized) { throw 'Foi encontrado um registro sem STATUS.' }
    if ($normalized -match 'APROB|APROV|LIBERAD|APPROVED') { return 'Liberado' }
    if ($normalized -match 'AGUARD|PENDENTE') { return 'Aguardando Aprovação' }
    if ($normalized -match 'TRATAMENTO') { return 'Em Tratamento' }
    if ($normalized -match 'REPROV|NEGAD|CANCEL') { return 'Reprovado' }
    throw "STATUS não reconhecido: '$Value'."
}

function Convert-Validity {
    param([string]$Value)
    $text = $Value.Trim()
    if (-not $text -or $text -eq 'N/D') { return '' }
    if ($text -match '^(\d{2}/\d{2}/\d{4})') { return $Matches[1] }
    if ($text -match '^(\d{4})-(\d{2})-(\d{2})') { return "$($Matches[3])/$($Matches[2])/$($Matches[1])" }
    $serial = 0.0
    if ([double]::TryParse($text, [ref]$serial)) { return [DateTime]::FromOADate($serial).ToString('dd/MM/yyyy') }
    throw "DATA DE TERMINO inválida: '$Value'."
}

function ConvertTo-CsvCell {
    param([object]$Value)
    $text = [string]$Value
    $text = $text -replace '(?m)[ \t]+(?=\r?$)', ''
    if ($text -match '[",\r\n]') { return '"' + $text.Replace('"', '""') + '"' }
    return $text
}

if (-not (Test-Path -LiteralPath $Planilha)) { throw "Planilha não encontrada: $Planilha" }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Planilha))
try {
    $sharedStrings = Get-SharedStrings -Archive $archive
    $accessRows = Get-XlsxRows -Archive $archive -SheetName 'Acessos' -SharedStrings $sharedStrings
    $requiredAccessColumns = @('PROTOCOLO', 'STATUS', 'LOCAL', 'SITE', 'DATA DE TERMINO', 'OBSERVACOES')
    $accessHeaderRow = Find-HeaderRow -Rows $accessRows -RequiredHeaders $requiredAccessColumns
    $accessHeaders = Get-HeaderMap -Row $accessRows[$accessHeaderRow] -RequiredHeaders $requiredAccessColumns
    $siteByLocal = @{}
    try {
        $mappingRows = Get-XlsxRows -Archive $archive -SheetName 'Planilha1' -SharedStrings $sharedStrings
        $mappingHeaderRow = Find-HeaderRow -Rows $mappingRows -RequiredHeaders @('ID DETENTORA', 'ESTACAO')
        $mappingHeaders = Get-HeaderMap -Row $mappingRows[$mappingHeaderRow] -RequiredHeaders @('ID DETENTORA', 'ESTACAO')
        foreach ($rowNumber in @($mappingRows.Keys | Where-Object { $_ -gt $mappingHeaderRow } | Sort-Object)) {
            $local = Get-RowField -Row $mappingRows[$rowNumber] -HeaderMap $mappingHeaders -Header 'ID DETENTORA'
            $site = Get-RowField -Row $mappingRows[$rowNumber] -HeaderMap $mappingHeaders -Header 'ESTACAO'
            if ($local -and $site -and -not $siteByLocal.ContainsKey($local.ToUpperInvariant())) { $siteByLocal[$local.ToUpperInvariant()] = $site }
        }
    } catch { Write-Verbose "Aba Planilha1 indisponível para contingência de SITE: $($_.Exception.Message)" }

    $records = @(); $seenProtocols = @{}; $seenLocals = @{}
    foreach ($rowNumber in @($accessRows.Keys | Where-Object { $_ -gt $accessHeaderRow } | Sort-Object)) {
        $row = $accessRows[$rowNumber]
        $protocol = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'PROTOCOLO'
        $local = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'LOCAL'
        if (-not $protocol -and -not $local) { continue }
        if (-not $protocol -or -not $local) { throw "Linha $rowNumber sem PROTOCOLO ou LOCAL." }
        $site = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'SITE'
        if (-not $site -or $site -eq '#N/A') { $site = $siteByLocal[$local.ToUpperInvariant()] }
        if (-not $site) { throw "Linha $rowNumber sem SITE para o LOCAL '$local'." }
        if ($seenProtocols.ContainsKey($protocol)) { throw "PROTOCOLO duplicado: '$protocol' (linhas $($seenProtocols[$protocol]) e $rowNumber)." }
        if ($seenLocals.ContainsKey($local.ToUpperInvariant())) { throw "LOCAL duplicado: '$local' (linhas $($seenLocals[$local.ToUpperInvariant()]) e $rowNumber)." }
        $seenProtocols[$protocol] = $rowNumber; $seenLocals[$local.ToUpperInvariant()] = $rowNumber
        $records += [pscustomobject][ordered]@{
            'CHAMADO' = $protocol; 'ID DETENTORA' = $local; 'SITE' = $site
            'STATUS' = Convert-PortalStatus (Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'STATUS')
            'VALIDADE' = Convert-Validity (Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'DATA DE TERMINO')
            'ENDERECO' = ''; 'CLUSTER' = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'REGIAO'
            'SUPERVISOR' = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'REVISADO POR'
            'OBSERVACOES' = Get-RowField -Row $row -HeaderMap $accessHeaders -Header 'OBSERVACOES'
        }
    }
    if ($records.Count -eq 0) { throw 'Nenhum acesso válido foi encontrado na aba Acessos.' }
    $headers = @('CHAMADO', 'ID DETENTORA', 'SITE', 'STATUS', 'VALIDADE', 'ENDERECO', 'CLUSTER', 'SUPERVISOR', 'OBSERVACOES')
    $content = (@($headers -join ',') + @($records | ForEach-Object {
        $record = $_
        @($headers | ForEach-Object { ConvertTo-CsvCell $record.PSObject.Properties[$_].Value }) -join ','
    })) -join "`n"
    if (-not $DryRun) {
        $outputPath = [IO.Path]::GetFullPath($Saida); $outputDirectory = Split-Path -Parent $outputPath
        if (-not (Test-Path -LiteralPath $outputDirectory)) { New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null }
        $temporaryPath = "$outputPath.tmp"
        [IO.File]::WriteAllText($temporaryPath, "$content`n", [Text.UTF8Encoding]::new($false))
        Move-Item -LiteralPath $temporaryPath -Destination $outputPath -Force
    }
    [pscustomobject]@{ rows = $records.Count; approved = @($records | Where-Object STATUS -eq 'Liberado').Count; output = if ($DryRun) { '' } else { [IO.Path]::GetFullPath($Saida) }; dryRun = [bool]$DryRun } | ConvertTo-Json -Compress
} finally { $archive.Dispose() }
