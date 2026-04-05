# vis-audio

VSCode拡張機能。`.wav` ファイルをカスタムエディタで開き、波形・メルスペクトログラムの可視化と再生制御を提供する。

## 機能

- **波形表示** — min/maxエンベロープ方式でキャンバスに描画。マウスドラッグで再生区間を選択可能
- **メルスペクトログラム** — STFT → メルフィルタバンク → log圧縮をWeb Workerで非同期処理
- **再生制御** — Play / Pause / Stop / Loop ボタンと `MM:SS.mmm` 形式の時刻表示
- **区間再生** — 波形上でドラッグして選択した区間のみ再生・ループ再生
- **メタ情報表示** — サンプルレート、チャンネル数、ビット深度、エンコード形式、デュレーション、ファイルサイズなど
- **設定連動** — VSCode設定変更をリアルタイムに反映（カラーマップ変更は即時、メルパラメータ変更は再計算）

## スクリーンショット

```
┌─────────────────────────────────────────────┐
│  ▶ Play  ⏸ Pause  ⏹ Stop  ↺ Loop  00:01.234 │
├─────────────────────────────────────────────┤
│  Waveform (drag to select region)           │
├─────────────────────────────────────────────┤
│  Mel Spectrogram                            │
├─────────────────────────────────────────────┤
│  File Info: Sample Rate | Channels | ...    │
└─────────────────────────────────────────────┘
```

---

## プロジェクト構成

```
vis-audio/
├── package.json                 # 拡張マニフェスト・NPMスクリプト・VSCode設定定義
├── tsconfig.json                # Extension host (Node.js) 用 TypeScript 設定
├── tsconfig.webview.json        # Webview (ブラウザ) 用 TypeScript 設定
├── esbuild.config.mjs           # 3バンドルのビルド設定
├── .vscodeignore                # VSIX パッケージング除外リスト
├── .vscode/
│   ├── launch.json              # F5 デバッグ設定
│   └── tasks.json               # デフォルトビルドタスク (Watch)
│
├── src/                         # Extension host (Node.js コンテキスト)
│   ├── extension.ts             # activate() エントリポイント
│   ├── wavEditorProvider.ts     # CustomReadonlyEditorProvider 実装
│   ├── wavParser.ts             # RIFF/WAV ヘッダパーサ
│   ├── configProvider.ts        # visAudio.* 設定の読み取り
│   └── types.ts                 # 型定義 (WavMetadata, VisConfig, メッセージ型)
│
├── webview-src/                 # Webview (ブラウザコンテキスト)
│   ├── main.ts                  # DOM構築・メッセージディスパッチ
│   ├── audioEngine.ts           # Web Audio API 再生エンジン
│   ├── waveformRenderer.ts      # Canvas 波形描画
│   ├── spectrogramRenderer.ts   # Canvas スペクトログラム描画
│   ├── colormaps.ts             # カラーマップ LUT (viridis/magma/inferno/plasma/grayscale)
│   ├── types-webview.ts         # 型定義 (src/types.ts のブラウザ互換コピー)
│   ├── ui/
│   │   ├── controls.ts          # 再生ボタン・時刻表示
│   │   ├── metadataPanel.ts     # メタ情報テーブル
│   │   └── regionSelector.ts   # マウスドラッグによる区間選択
│   └── dsp/
│       ├── fft.ts               # Radix-2 Cooley-Tukey FFT (純粋 TypeScript)
│       ├── stft.ts              # STFT + 窓関数 (hann/hamming/blackman/rectangular)
│       ├── melFilterbank.ts     # メルフィルタバンク構築・適用
│       └── worker.ts            # Web Worker エントリ: DSP処理をメインスレッドから分離
│
└── out/                         # esbuild 出力 (gitignore 済み)
    ├── extension.js             # Extension host バンドル
    ├── webview.js               # Webview バンドル
    └── worker.js                # Web Worker バンドル
```

### アーキテクチャ概要

```
VSCode Extension Host (Node.js)
  └─ WavEditorProvider
       ├─ wavParser.ts  →  WavMetadata (RIFF ヘッダ解析)
       ├─ configProvider.ts  →  VisConfig (設定読み取り)
       └─ postMessage({ type: 'init', metadata, audioBase64, config })
             ↓ WebView Message Channel
Webview (Browser)
  └─ main.ts
       ├─ audioEngine.ts       (Web Audio API: 再生・停止・ループ)
       ├─ waveformRenderer.ts  (Canvas: min/max エンベロープ)
       ├─ spectrogramRenderer.ts (Canvas: ImageData ヒートマップ)
       └─ Worker (out/worker.js)
            ├─ stft.ts         (FFT × 全フレーム)
            └─ melFilterbank.ts (メルフィルタ + log 圧縮)
```

#### データフロー

1. ファイルを開く → Extension host が RIFF を解析してメタデータ取得
2. ファイルを base64 エンコードして `init` メッセージで Webview へ送信（>50MB はチャンク分割）
3. Webview が `atob` → `ArrayBuffer` → `decodeAudioData` で再生バッファ生成
4. Channel 0 の `Float32Array` サンプルを Web Worker へ transfer（コピーなし）
5. Worker が STFT → mel filterbank → log 圧縮 → `result` メッセージで返却
6. メインスレッドが `ImageData` に変換して Canvas に描画

---

## 開発環境セットアップ

### 前提条件

- Node.js v18 以上
- npm
- VSCode 1.85 以上

### インストール

```bash
cd vis-audio
npm install
```

### ビルド

```bash
# 開発ビルド (ソースマップ付き)
npm run compile

# ウォッチモード (ファイル変更を検知して自動リビルド)
npm run watch

# 型チェックのみ (ビルドなし)
npm run typecheck
```

---

## デバッグ方法

### F5 デバッグ（推奨）

1. VSCode でこのリポジトリを開く
2. `F5` を押す（または「実行とデバッグ」→「Run Extension」）
3. 自動的に `npm run watch` が起動し、**Extension Development Host** が新しいウィンドウで開く
4. Extension Development Host で `.wav` ファイルを開くと vis-audio エディタが起動する

> **注意**: `F5` は `.vscode/tasks.json` の Watch タスクをプリビルドタスクとして実行する。初回は `npm install` が必要。

### デバッグのポイント

| 対象 | 方法 |
|------|------|
| Extension host のログ | Extension Development Host の「出力」パネル → ドロップダウンから「Extension Host」を選択 |
| Webview のログ | Extension Development Host でコマンドパレット → `Developer: Open Webview Developer Tools` |
| Worker のログ | Webview Developer Tools の Console タブ（Worker のログも集約される） |
| ブレークポイント | `src/` 以下のファイルにブレークポイントを設定すると Extension host でヒットする |

### よくあるデバッグシナリオ

```
# WAV が正しく解析されているか確認
src/wavParser.ts の parseWav() の戻り値を console.log で出力

# メッセージのやり取りを確認
src/wavEditorProvider.ts の postMessage 前後にログを追加

# スペクトログラムが出ない場合
Webview Developer Tools の Console で worker.onerror が発火していないか確認
```

### ソースマップ

開発ビルドではソースマップが生成されるため、`out/webview.js` のエラーが `webview-src/` の元ファイルに紐づく。

---

## 設定リファレンス

VSCode の設定（`settings.json` または GUI）で以下を変更できる。

### スペクトログラム

| 設定キー | 型 | デフォルト | 説明 |
|----------|-----|-----------|------|
| `visAudio.waveform.color` | string | `"#4fc3f7"` | 波形の色（CSS カラー文字列） |
| `visAudio.spectrogram.useMel` | boolean | `true` | `true` = メルスペクトログラム、`false` = 線形周波数スペクトログラム（STFT のみ） |
| `visAudio.spectrogram.colormap` | enum | `"viridis"` | カラーマップ（`viridis` / `magma` / `inferno` / `plasma` / `grayscale`） |

### FFT / メルフィルタバンク

| 設定キー | 型 | デフォルト | 説明 |
|----------|-----|-----------|------|
| `visAudio.mel.nFFT` | enum | `2048` | FFT ウィンドウサイズ（`256` / `512` / `1024` / `2048` / `4096`） |
| `visAudio.mel.hopLength` | integer | `512` | STFT フレーム間のサンプル数（最小 64） |
| `visAudio.mel.windowType` | enum | `"hann"` | 窓関数（`hann` / `hamming` / `blackman` / `rectangular`） |
| `visAudio.mel.fMin` | number | `0` | 表示する最低周波数 (Hz) |
| `visAudio.mel.fMax` | number\|null | `null` | 表示する最高周波数 (Hz)、`null` = ナイキスト周波数 |
| `visAudio.mel.nMels` | integer | `128` | メル周波数バンド数（8〜512、`useMel: true` のときのみ有効） |

### ショートカットキー

Webview にフォーカスがある状態でキーを押すと操作できる。キーは `settings.json` で変更可能。

| 設定キー | デフォルト | 操作 |
|----------|-----------|------|
| `visAudio.keybindings.play` | `"Space"` | 停止中→再生 / 一時停止中→再開 / 再生中→停止 |
| `visAudio.keybindings.pause` | `"p"` | 再生中→一時停止 / 一時停止中→再開 |
| `visAudio.keybindings.stop` | `"s"` | 停止（先頭／選択範囲の先頭に戻る） |
| `visAudio.keybindings.loop` | `"l"` | ループ ON/OFF 切替 |

キー値は [`KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values) に準拠。スペースキーは `"Space"` と指定する。Ctrl / Meta / Alt との組み合わせは無効。

設定例（`settings.json`）:

```json
{
  "visAudio.keybindings.play": "Space",
  "visAudio.keybindings.pause": "p",
  "visAudio.keybindings.stop": "s",
  "visAudio.keybindings.loop": "l"
}
```

設定変更時の挙動：
- **`useMel` / FFT パラメータ変更** → スペクトログラムを再計算（数百 ms〜数秒）
- **カラーマップのみ変更** → キャッシュ済みデータから即座に再描画（高速）
- **波形カラー変更** → 即座に再描画
- **ショートカットキー変更** → 即座に反映

---

## リリース方法

### 前提ツールのインストール

```bash
npm install -g @vscode/vsce
```

### VSIX パッケージの作成

```bash
# プロダクションビルド（minify 済み）+ VSIX 作成
npm run package
```

`vis-audio-0.1.0.vsix` が生成される。

### VSIX をローカルにインストール（動作確認用）

```bash
code --install-extension vis-audio-0.1.0.vsix
```

またはコマンドパレット → `Extensions: Install from VSIX...` でファイルを選択。

### VSCode Marketplace への公開

1. [Visual Studio Marketplace](https://marketplace.visualstudio.com/manage) で publisher アカウントを作成
2. Personal Access Token (PAT) を取得（スコープ: Marketplace → Manage）
3. `package.json` の `"publisher"` フィールドを自分の publisher ID に変更
4. バージョンをインクリメント（`package.json` の `"version"` フィールド）

```bash
# Marketplace にパブリッシュ
vsce publish

# または PAT を明示的に指定
vsce publish -p <YOUR_PAT>
```

### バージョン管理

```bash
# バージョンを上げてパブリッシュ (patch/minor/major)
vsce publish patch   # 0.1.0 → 0.1.1
vsce publish minor   # 0.1.0 → 0.2.0
vsce publish major   # 0.1.0 → 1.0.0
```

### `.vscodeignore` で除外されるもの

パッケージには以下が含まれない（`.vscodeignore` で除外）：

- `src/`, `webview-src/` — ソースファイル（`out/` のバンドルのみ配布）
- `node_modules/` — バンドル済みのため不要
- `tsconfig*.json`, `esbuild.config.mjs` — ビルドツール設定
- `*.map` — ソースマップ
- `.vscode/` — 開発用設定

---

## DSP 実装の詳細

### FFT (`webview-src/dsp/fft.ts`)

Radix-2 Cooley-Tukey FFT を純粋 TypeScript で実装。`Float32Array` の実部・虚部をインプレースで変換。外部ライブラリゼロ。

### STFT (`webview-src/dsp/stft.ts`)

各フレームに窓関数を適用し FFT を計算。戻り値はフラットな `Float32Array [nFrames × (nFFT/2+1)]`（パワースペクトル）。

### メルフィルタバンク (`webview-src/dsp/melFilterbank.ts`)

Hz↔Mel 変換: `mel = 2595 × log10(1 + f/700)`

三角フィルタを nMels 個構築し、各フレームのパワースペクトルに適用後 `log(energy + 1e-9)` で対数圧縮。

### Web Worker

メインスレッドをブロックしないよう DSP 処理全体を Worker に移譲。サンプルバッファは `Transferable` として渡すためコピーが発生しない。処理進捗を 10% / 60% / 100% のタイミングでステータスバーに表示。

---

## ライセンス

MIT
