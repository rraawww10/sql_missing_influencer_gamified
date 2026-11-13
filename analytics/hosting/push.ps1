# Uploads the analytics server and the episode packs from this Windows machine to the AWS box.
# Use this when the GitHub repo is private (otherwise `git clone` on the server is simpler - see README).
#
#   cd analytics\hosting
#   .\push.ps1 -Server 13.233.x.x -KeyFile C:\Users\Hp\Downloads\LightsailDefaultKey.pem
#
# Sends ONLY what the server needs:
#   analytics\*.mjs + public\ + hosting\  ->  /opt/tmi/analytics/
#   content\sessions\*.json               ->  /opt/tmi/content/sessions/
# It never touches /var/lib/tmi, so student data is safe to re-run this over a live server.
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$KeyFile,
  [string]$User = 'ubuntu'
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$ssh = "ssh -i `"$KeyFile`" -o StrictHostKeyChecking=accept-new"

if (-not (Test-Path $KeyFile)) { throw "key file not found: $KeyFile" }
if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
  throw "scp not found. Install Windows OpenSSH Client: Settings > System > Optional features > Add > OpenSSH Client"
}

Write-Host "`n==> staging the files to send" -ForegroundColor Cyan
$stage = Join-Path $env:TEMP "tmi-push-$(Get-Random)"
New-Item -ItemType Directory -Path "$stage\analytics\public", "$stage\analytics\hosting", "$stage\content\sessions" -Force | Out-Null

Copy-Item "$repo\analytics\*.mjs" "$stage\analytics\"
Copy-Item "$repo\analytics\package.json" "$stage\analytics\"
Copy-Item "$repo\analytics\public\*" "$stage\analytics\public\" -Recurse
# setup.sh and its templates travel with the code: Stage 4 runs them from /opt/tmi/analytics/hosting
Copy-Item "$repo\analytics\hosting\*" "$stage\analytics\hosting\"
Copy-Item "$repo\content\sessions\s*.json" "$stage\content\sessions\"
$packs = (Get-ChildItem "$stage\content\sessions" -Filter 's*.json').Count
if ($packs -ne 13) { throw "expected 13 episode packs, found $packs - run `node pipeline/build_sessions.mjs` first" }
Write-Host "    server code + $packs episode packs"

Write-Host "`n==> uploading to $User@$Server" -ForegroundColor Cyan
# into a staging folder first: a half-finished upload must never be what the service restarts onto
cmd /c "ssh -i `"$KeyFile`" -o StrictHostKeyChecking=accept-new $User@$Server `"rm -rf ~/tmi-stage && mkdir -p ~/tmi-stage`""
if ($LASTEXITCODE -ne 0) { throw "ssh failed - check the IP, the key file and that port 22 is open" }
cmd /c "scp -i `"$KeyFile`" -o StrictHostKeyChecking=accept-new -q -r `"$stage\analytics`" `"$stage\content`" ${User}@${Server}:~/tmi-stage/"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

Write-Host "`n==> installing on the server" -ForegroundColor Cyan
# The work happens in install-remote.sh (uploaded with the rest), not in a quoted one-liner:
# it copes with both the first upload (no service, no tmi user yet) and later updates.
cmd /c "ssh -i `"$KeyFile`" -o StrictHostKeyChecking=accept-new $User@$Server `"bash ~/tmi-stage/analytics/hosting/install-remote.sh ~/tmi-stage`""
if ($LASTEXITCODE -ne 0) { throw "remote install failed - ssh in and run: sudo journalctl -u tmi-analytics -n 50" }

Remove-Item $stage -Recurse -Force
Write-Host "`nDone. Check the dashboard, then:  sudo journalctl -u tmi-analytics -f" -ForegroundColor Green
