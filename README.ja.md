<p align="center"><img src="assets/hero.ja.31dd4496d610.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.ja.svg?v=download20260926" width="32%" alt="windows x64 — ダウンロード" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.ja.svg?v=download20260926" width="32%" alt="macos arm64 — ダウンロード" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.ja.svg?v=download20260926" width="32%" alt="linux x64 — ダウンロード" /></a></p>

<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ru.md">Русский</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a></p>

# JevPilot

**ひとつのプラグインで、いつもの Codex を。小さな判断は Jev が支援し、計画・実装・最終確認は Codex が担当します。**

## いつもの作業をそのまま

通常どおり依頼するだけ。JevPilot が判断、資料の選別、画面操作を支援します。多数の Skill や専用の起動フレーズは不要です。

## GitHub から直接インストール

次の依頼文を Codex に送信してください：

> https://github.com/wangzhezbz/jev-pilot から JevPilot を個人用 Codex プラグインとしてインストールし、依存関係と互換性を確認してください。TypeSafe Key の非公開設定と再起動後の確認も案内してください。

[詳しいインストール手順](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## 実測例

### 推論強度の自動調整：実際の変更

| シナリオ | 所要時間 | GPT トークン | Jev 込みの推定費用 | 実際の強度変更 |
| --- | --- | --- | --- | --- |
| [チケットの安定ソート修正](docs/reports/holdout-20260925/README.zh-CN.md) | −25.64% | −17.13% | −5.25% | high → medium |
| [区間差分の修正](docs/reports/holdout-20260925/README.zh-CN.md) | −14.20% | −12.58% | −31.40% | high → low |

両タスクは独立検証に合格し、ネイティブの applied 記録を確認。数値はタスク全体の比較です。

### 文書選別と復元可能な出力

| シナリオ | 所要時間 | GPT トークン | Jev 込みの推定費用 |
| --- | --- | --- | --- |
| [文書の選別](docs/reports/targeted-20260925/README.zh-CN.md) | −40.03% | −23.88% | −33.69% |

### 自動判断の実測：Chrome と Computer Use

| シナリオ | 所要時間 | GPT トークン | Jev 込みの推定費用 | 実際の Jev 判断 |
| --- | --- | --- | --- | --- |
| [Chrome での記録検索](docs/reports/holdout-20260925/README.zh-CN.md) | −41.03% | −55.91% | −54.87% | 判断 5 回・操作 5 回・途中引き継ぎ 0 回 |
| [Computer Use の連続操作](docs/reports/targeted-20260925/README.zh-CN.md) | −47.64% | −57.14% | −56.52% | 2 回の実行で各：判断 5 回・操作 5 回・途中引き継ぎ 0 回 |

### コンポーネントの実測

| コンポーネント | 実測結果 |
| --- | --- |
| [自動判断：資料の一括選別](docs/reports/cache-budget-20260924/README.zh-CN.md) | 180 件を Jev 6 回・4.119 秒で処理。116 件を除外し、対象証拠 8 件をすべて保持。返却本文のバイト数 −62.96% |
| [必須ツールの選択](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 必須ツール 12 件をすべて保持。不要な Jev トークン：2,090 → 0 |
| [レビューとテスト選択](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 旧版比：時間 −22.69%、Jev トークン −53.93%。必須テスト 9 件をすべて保持 |
| [引き継ぎ判断の再利用](docs/reports/workflow-efficiency-20260925/README.zh-CN.md) | 5 回の引き継ぎでリクエスト 5 → 1、Jev トークン −80.25%。原文をすべて保持 |
| [可逆なコンテキスト引き継ぎ](docs/reports/localization-handoff-20260925/README.zh-CN.md) | 完全な表現：5,439 → 2,713 バイト（−50.12%）。6 組すべて復元可能 |

以上はシナリオを実際に実行した測定結果です。 [テストシナリオと全データ](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

## 14 の機能

| # | 機能 | できること |
|---:|---|---|
| 1 | **自動判断** | 分類や候補選択をまとめて処理し、判断を再利用。 |
| 2 | **推論強度の自動調整** | 選択したモデルを保ち、実際のリクエスト強度を調整。 |
| 3 | **検索とファイル選別** | 出典の位置を保ちながら関連資料を選別。 |
| 4 | **復元可能な出力フィルター** | 重要な証拠を先に読み、原文を必要時に取得。 |
| 5 | **ツールと Skill の選択** | 必須ツールを保持し、適切な候補を選択。 |
| 6 | **失敗の認識と復旧** | 再試行を制限し、不確実な場合は Codex に引き継ぐ。 |
| 7 | **証拠と品質の確認** | 実行結果、内容ルール、翻訳の整合性を確認。 |
| 8 | **Chrome と Computer Use** | 既存の公式プラグインで範囲を限定した連続クリック。 |
| 9 | **プロジェクトメモリ** | 同意に基づく保存。出典、有効期限、取り消しに対応。 |
| 10 | **使用量と効果の計測** | GPT/Jev の使用量、推定費用、実際の強度変更を記録。 |
| 11 | **コンテキストの引き継ぎ** | 繰り返しを可逆表現にまとめ、原文を保持。 |
| 12 | **変更レビューとテスト選択** | 必須テストを保持し、関連する変更を優先。 |
| 13 | **チェックポイントと再開** | 進捗を保存し、ファイルの変更を確認して再開。 |
| 14 | **原文の正確な抽出** | 原文の位置を返し、欠落や曖昧さを明示。 |
