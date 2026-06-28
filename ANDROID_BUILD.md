# ANDROID_BUILD — Web版を Capacitor で Android ネイティブ配信

> 目的: Web版(js/)を**書き直さず** Capacitor で WebView 包装し、APK/AAB として Google Play へ。
> 方針は [[web-primary-pivot]] / `WEB_FUTUREPROOF.md` の **measure-first**。
> ⚠️ この手順は**あなたのマシンで実行**する(Android SDK/実機が要る)。Claude側ではAndroidビルドは走らせられない。
>
> 前提環境: Node 18+ / Android Studio + Android SDK (Platform 34) / JDK 17 / 実機(USBデバッグON)か中位エミュ。

---

## 0. 同梱物(www)の整理
Web版が**実行時に読む**もの: `index.html` / `css/` / `js/` / **`assets/`(portraits + sprite画像 + manifest)**。
`assets/sprites/raw` `assets/sprites/source` `*.py` `*.md` は**ビルド入力で実行時不要**＝APKに入れない(サイズ削減)。

`www/` を作る同期スクリプト例 (`build-web.bat`、プロジェクト直下):
```bat
@echo off
chcp 65001 >nul
rmdir /s /q www 2>nul & mkdir www
copy index.html www\ >nul
xcopy css www\css\ /e /i /y >nul
xcopy js  www\js\  /e /i /y >nul
xcopy assets\portraits www\assets\portraits\ /e /i /y >nul
xcopy assets\sprites   www\assets\sprites\   /e /i /y /exclude:tools\_wwwexclude.txt >nul
xcopy assets\fx        www\assets\fx\        /e /i /y >nul
echo done: www\
```
`tools\_wwwexclude.txt` (除外パターン): 
```
\raw\
\source\
\animation_sheets\
.py
.md
```
※ `animation_sheets\`(GPT製の元シート ~40MB)は分割済の `animation\` だけ実行時に使うので除外(本番肥大回避)。`ai_generated\` は copy 対象外なので元から入らない。
※ まず `js/sprites.js` の sprite basePath/manifest 名を確認し、**実行時に取りに行くパスが www 内に揃っているか**を起動後 DevTools の Network で 404 が無いか確認(不足ファイルがあれば copy 対象に追加)。

---

## 1. Capacitor 導入
プロジェクト直下で:
```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "百鬼夜行サバイバーズ" com.indie.hyakki --web-dir=www
npx cap add android
```
`capacitor.config.json` 推奨追記:
```json
{
  "appId": "com.indie.hyakki",
  "appName": "百鬼夜行サバイバーズ",
  "webDir": "www",
  "android": { "backgroundColor": "#05060b" },
  "server": { "androidScheme": "https" }
}
```

## 2. ビルド→実機
```bash
build-web.bat            :: www を最新化(コード変更のたび)
npx cap sync android     :: www + プラグインを android プロジェクトへ
npx cap open android     :: Android Studio で開く → 実機選択 → Run
```
(または `npx cap run android --target <deviceId>`)

---

## 3. ★ measure (#228 の本命)
**中位/低位 Android 実機で fps を測る**。Web版は `G.debug.show`(URL に `?debug`)や `__G` で計測可。
- **60fps 圏内** → そのまま Play 申請準備(下記4)。
- **重い**(大量スプライト+加算fxでfill-rate不足) → **描画層のみ WebGL/Pixi 化**(ゲームロジックは不変)。`WEB_FUTUREPROOF.md` §1-3。**先に大改修しない**=実機で詰まってから。
- 端末の WebView は最新 Chrome ベース(Play配布なら自動更新)。Canvas2D はHW加速されるが、低位GPUは加算多用で律速しうる。

---

## 4. 保存 / 課金 / 広告(任意・必要時)
- **保存**: 現状 `localStorage`(`platform.js` がメモリfallback付き)。Capacitor WebView の localStorage は永続するが、確実にするなら `@capacitor/preferences` を `G.platform.save/load` の native backend として差す(seam は用意済)。
- **課金**: Google Play Billing 系プラグイン(例 `@capacitor-community/in-app-purchases`)。
- **広告**: `@capacitor-community/admob`。
いずれも `js/` 側は触らず、`platform.js`/プラグイン呼び出しで吸収。

## 5. リリース署名(AAB)
- Android Studio で keystore 作成 → `android/app` の signingConfig に設定 → **Build → Generate Signed Bundle (AAB)** → Play Console へ。
- versionCode/Name は `android/app/build.gradle`。

---

## 注意
- **横画面固定**: 既に縦持ち案内(`#rotate`)あり。`AndroidManifest.xml` の activity に `android:screenOrientation="sensorLandscape"` を足すと確実。
- **戻るボタン**: WebView の戻るで終了しないよう、Capacitor の `App.addListener('backButton', ...)` で一時停止/確認に。
- **音**: 初回タップで AudioContext 解錠(`platform.unlockAudio` + main.js `tryAudio` が既存)。モバイルは無音起動が正常。
- itch.io 版は Web のまま併存(WEB_FUTUREPROOF.md)。Unity版(`HyakkiUnity/`)は性能保険で温存。
