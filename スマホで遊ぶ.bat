@echo off
chcp 65001 > nul
cd /d "%~dp0"
where python > nul 2>&1
if %errorlevel%==0 (
  echo ============================================
  echo  スマホで遊ぶ: 下の「スマホから」の URL を
  echo  スマホのブラウザに入力して開いてください。
  echo  ( PC と同じ Wi-Fi に繋ぐこと )
  echo ============================================
  python serve.py --lan
) else (
  echo Python が見つかりません。index.html を直接開きます。
  start "" "%~dp0index.html"
)
