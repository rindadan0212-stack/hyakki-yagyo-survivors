# 百鬼夜行サバイバーズ — 公開デプロイ (出先確認用)
# 1) 最新ソースから単一HTMLを再ビルド → 2) docs/ に配置 (GitHub Pages が配信) → 3) commit & push
# 使い方: デプロイ.bat をダブルクリック (または pwsh -File publish.ps1)
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host '▶ 単一HTMLを再ビルド中...' -ForegroundColor Cyan
python build_standalone.py
Copy-Item '百鬼夜行.html' 'docs/index.html' -Force

git add -A
if (git status --porcelain) {
    $msg = 'publish: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
    git commit -m $msg | Out-Null
    Write-Host '▶ push 中...' -ForegroundColor Cyan
    git push
    Write-Host '✅ 公開完了。GitHub Pages に約1分で反映されます。' -ForegroundColor Green
} else {
    Write-Host '変更なし — コミットするものがありません。' -ForegroundColor Yellow
}
