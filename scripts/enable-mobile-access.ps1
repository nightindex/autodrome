[CmdletBinding()]
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$taskRuleName = 'AVTODROM Mobile Preview TCP 5174'
$taskProject = Split-Path -Parent $PSScriptRoot
$taskResultDirectory = Join-Path $taskProject 'test-results/mobile-access'
$taskResultFile = Join-Path $taskResultDirectory 'firewall-result.json'
New-Item -ItemType Directory -Path $taskResultDirectory -Force | Out-Null

try {
    $taskIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $taskPrincipal = [Security.Principal.WindowsPrincipal]::new($taskIdentity)
    if (-not $taskPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        Write-Host 'Windows needs administrator approval for the simulator Wi-Fi firewall rule.'
        $taskArguments = @('-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', ('"' + $PSCommandPath + '"'))
        if ($Remove) { $taskArguments += '-Remove' }
        $taskProcess = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -ArgumentList $taskArguments -Wait -PassThru
        if ($taskProcess.ExitCode -ne 0) {
            if (Test-Path -LiteralPath $taskResultFile) { Get-Content -LiteralPath $taskResultFile }
            throw 'The administrator step did not complete. The firewall rule was not verified.'
        }
        Get-Content -LiteralPath $taskResultFile
        exit 0
    }

    if ($Remove) {
        & netsh advfirewall firewall delete rule "name=$taskRuleName" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Windows could not remove the simulator rule.' }
        @{status='removed';rule=$taskRuleName} | ConvertTo-Json | Set-Content -LiteralPath $taskResultFile -Encoding UTF8
        exit 0
    }

    $taskNode = (Get-Command node.exe -ErrorAction Stop).Source
    $taskAddresses = @([Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
        Where-Object { $_.NetworkInterfaceType -eq 'Wireless80211' -and $_.OperationalStatus -eq 'Up' } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
        Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } |
        ForEach-Object { $_.Address.IPAddressToString })
    if ($taskAddresses.Count -eq 0) { throw 'Connect this PC to Wi-Fi before enabling phone access.' }

    $taskFirewall = New-Object -ComObject HNetCfg.FwPolicy2
    $taskExisting = @($taskFirewall.Rules | Where-Object { $_.Name -eq $taskRuleName })
    if ($taskExisting.Count -gt 0) {
        if (@($taskExisting | Where-Object { $_.ApplicationName -ne $taskNode -or $_.LocalPorts -ne '5174' }).Count -gt 0) {
            throw 'A different firewall rule uses the simulator rule name. It was left unchanged.'
        }
        & netsh advfirewall firewall set rule "name=$taskRuleName" new enable=yes action=allow dir=in protocol=TCP localport=5174 "program=$taskNode" profile=private interfacetype=wireless "localip=$($taskAddresses -join ',')" remoteip=localsubnet | Out-Null
    } else {
        & netsh advfirewall firewall add rule "name=$taskRuleName" enable=yes action=allow dir=in protocol=TCP localport=5174 "program=$taskNode" profile=private interfacetype=wireless "localip=$($taskAddresses -join ',')" remoteip=localsubnet | Out-Null
    }
    if ($LASTEXITCODE -ne 0) { throw 'Windows could not apply the simulator firewall rule.' }

    $taskRule = $taskFirewall.Rules.Item($taskRuleName)
    if (-not $taskRule.Enabled -or $taskRule.Action -ne 1 -or $taskRule.Direction -ne 1 -or $taskRule.Protocol -ne 6 -or $taskRule.LocalPorts -ne '5174' -or $taskRule.Profiles -ne 2 -or $taskRule.ApplicationName -ne $taskNode) {
        throw 'Windows did not return the expected private Wi-Fi rule.'
    }
    @{status='enabled';rule=$taskRuleName;program=$taskNode;port=5174;profiles='Private';interfaces='Wireless';localAddresses=$taskRule.LocalAddresses;remoteAddresses=$taskRule.RemoteAddresses;urls=@($taskAddresses | ForEach-Object { "http://${_}:5174/" })} |
        ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $taskResultFile -Encoding UTF8
} catch {
    @{status='error';message=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath $taskResultFile -Encoding UTF8
    Write-Error $_.Exception.Message
    exit 1
}
