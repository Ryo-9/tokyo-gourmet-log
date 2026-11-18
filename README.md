# TOKYO GOURMET LOG — GitHub Pages版

AIビルダーのクレジット不要で運用できる静的Webアプリです。

## 公開
1. GitHubに公開リポジトリ `tokyo-gourmet-log` を作成します。
2. このディレクトリのファイルをリポジトリのルートに配置します（ChatGPTのGitHub接続でアップロード可能）。
3. リポジトリの Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/(root)` → Save。
4. GitHubの公開処理後、`https://<GitHubユーザー名>.github.io/tokyo-gourmet-log/` で開きます。
5. 今後はGitHubのファイルを更新するだけで自動公開されます。

## 注意
- 訪問履歴はブラウザ内の保存領域にあります。別ドメインからは自動移行されないため、旧サイトのJSONバックアップを取得して取り込んでください。
- 写真はブラウザ内の画像保存領域を使う設計です。JSONと別に写真のバックアップを取ってください。
- 未登録の店舗の画像を実店舗の写真として扱いません。地図とSNSの一部機能は外部サービスへのリンクを使います。
- リポジトリは公開です。APIキー、パスワード、個人の訪問記録や個人写真はGitHubへコミットしないでください。

## 無料の店舗発掘（2026-11-18）

- SNSタブ「画像・リンクからお店を探す」：画像内の日本語・英語をブラウザ内OCR（Tesseract.js、初回に外部CDNから言語データを取得）でテキスト化。既存店舗と照合、Googleマップで確認後に保存。
- Googleマップの通常URLから店名候補を抽出。短縮URL・TikTok・Instagramリンクだけでは、投稿内容から自動で店名特定できないため手動確認が必要。
- 地図タブ「230店舗以外も見つける」：本人が位置情報使用を押した場合のみ、OpenStreetMapのOverpass APIで周辺の登録店を表示。お店を選んで保存できる。
- OpenStreetMap© contributors, ODbL： https://www.openstreetmap.org/copyright
- 公共のOverpass APIは小規模の試作向け。アクセス制限、未登録店舗、営業情報の不備などがあり、東京の全店を網羅しない。
- 将来の全域検索・写真/営業時間/評価にはGoogle Places API等の正式なデータ連携（課金・利用規約・APIキー保護）が必要。Googleの地図・店舗情報を一括収集して保存しない。
- 既存の `localStorage` 店舗・行きたい・訪問データと IndexedDB写真はそのまま維持。バックアップは定期的に取得。
