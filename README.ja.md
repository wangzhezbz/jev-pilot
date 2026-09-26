<p align="center"><img src="assets/hero.ja.31dd4496d610.svg" width="100%" alt="JevPilot" /></p>

<p align="center"><a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-x64.zip"><img src="assets/windows.ja.svg?v=preview20260926" width="32%" alt="windows x64 — プレビューをダウンロード" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-arm64.zip"><img src="assets/macos.ja.svg?v=preview20260926" width="32%" alt="macos arm64 — プレビューをダウンロード" /></a>
<a href="https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-x64.zip"><img src="assets/linux.ja.svg?v=preview20260926" width="32%" alt="linux x64 — プレビューをダウンロード" /></a></p>

<p align="center">[English](README.md) · [简体中文](README.zh-CN.md) · [Русский](README.ru.md) · [日本語](README.ja.md) · [한국어](README.ko.md)</p>

# JevPilot

**ひとつのプラグインで、いつもの Codex を。小さな判断は Jev が支援し、計画・実装・最終確認は Codex が担当します。**

[他のアーキテクチャとチェックサム](https://github.com/wangzhezbz/jev-pilot/releases/tag/preview-20260926) · [macOS Intel](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-macos-x64.zip) · [Windows ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-windows-arm64.zip) · [Linux ARM64](https://github.com/wangzhezbz/jev-pilot/releases/download/preview-20260926/jev-pilot-linux-arm64.zip)

macOS は実機検証済み。Windows/Linux はビルドと CI を確認済み、デスクトップ実機検証は未完了。未署名 ZIP。Node 24+、curl、ripgrep が必要です。

## いつもの作業をそのまま

通常どおり依頼するだけ。JevPilot が判断、資料の選別、画面操作を支援します。多数の Skill や専用の起動フレーズは不要です。

## 実測例

| シナリオ | 所要時間 | GPT トークン | Jev 込みの推定費用 |
|---|---:|---:|---:|
| 文書の選別 | −40.03% | −23.88% | −33.69% |
| Computer Use の連続操作 | −47.64% | −57.14% | −56.52% |

選定した実測例。macOS で各 2 組の比較。UI は長い会話の操作区間を計測、費用は 2026-09-24 の API 価格に基づく推定です。すべての作業で同じ効果を保証するものではありません。 [Data & methodology](docs/reports/targeted-20260925/README.zh-CN.md) · [All reports](https://github.com/wangzhezbz/jev-pilot/tree/main/docs/reports)

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

## 一度設定して、いつもどおり使う

1. OS と CPU に合う ZIP をダウンロードして展開。
2. 下の依頼文と展開先を Codex に送信。
3. ローカル設定画面で自分の TypeSafe Key を入力し、Codex を再起動。
4. あとは通常どおり依頼。画面操作には既存の公式 Chrome / Computer Use プラグインを使用。

> この展開フォルダーの JevPilot を個人用 Codex プラグインとしてインストールしてください。依存関係と互換性を確認し、TypeSafe Key を私が非公開で入力できるローカル設定画面を開いてください。アダプターを設定し、再起動後に有効化を確認してください。選択したモデルと他のプラグインは維持してください。

### GitHub から直接インストール

> https://github.com/wangzhezbz/jev-pilot から JevPilot を個人用 Codex プラグインとしてインストールし、依存関係と互換性を確認してください。TypeSafe Key の非公開設定と再起動後の確認も案内してください。

[詳しいインストール手順](docs/INSTALL.md) · [TypeSafe](https://typesafe.ai/)

## プロジェクトの状態

開発プレビュー · MIT · 5 言語。プロジェクトメモリは同意が必要です。引き継ぎは元の会話履歴を書き換えません。OpenAI や TypeSafe の公式製品ではありません。
