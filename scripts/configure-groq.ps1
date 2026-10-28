# Enter the credential privately; it is held only in this process and its child.
$ErrorActionPreference = 'Stop'
$hadPrevious = Test-Path Env:GROQ_API_KEY
$previous = $env:GROQ_API_KEY
try {
    if ([string]::IsNullOrWhiteSpace($env:GROQ_API_KEY)) {
        $secret = Read-Host 'Groq API key (hidden; not saved)' -AsSecureString
        $env:GROQ_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
    }
    & node (Join-Path $PSScriptRoot 'configure-groq.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Groq setup failed. No credential was written to disk.' }
} finally {
    if ($hadPrevious) { $env:GROQ_API_KEY = $previous } else { Remove-Item Env:GROQ_API_KEY -ErrorAction SilentlyContinue }
    $previous = $null
    if ($null -ne $secret) { $secret.Dispose() }
}
