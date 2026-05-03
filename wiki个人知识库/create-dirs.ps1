$dirs = @(
    "d:\hiclaw\wiki个人知识库\knowledge\notebooks",
    "d:\hiclaw\wiki个人知识库\knowledge\sources",
    "d:\hiclaw\wiki个人知识库\knowledge\wiki"
)
foreach ($d in $dirs) {
    if (!(Test-Path $d)) {
        New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
}
Write-Host "Directories created"
