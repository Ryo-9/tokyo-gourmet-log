# TOKYO GOURMET LOG — iOS Capacitor試作環境

更新: 2026-11-18

## 達成したこと（開発用の土台）
- 既存のGitHub Pages Webアプリと別に、`dist/` にiOS用静的アセットを複製するビルド処理を追加。
- GitHub Pages本番コードへの変更なし。WebとiOSで同じHTML/JSを流用。
- Capacitor v8.5.0の依存バージョンを指定し、`capacitor.config.json` の `webDir=dist` を構成。
- Node.js標準機能だけでビルド用アセットの完全性と不要ファイル不混入をテスト。
- **iOSネイティブプロジェクトはまだ生成・実機起動・署名していない。** TestFlight/App Storeへ提出できる状態ではない。

## Mac/Xcodeで実施する手順
1. Node.jsおよび公式ドキュメント指定のXcodeをインストール。
2. リポジトリを取得し、`npm install` を実行して `package-lock.json` を生成・コミットする（依存バージョンは固定済み）。
3. `npm run test:ios-web` で静的アセットのテストに合格する。
4. `npm run ios:add`（初回のみ）でネイティブの `ios/` プロジェクトを生成する。
5. `npm run ios:sync` を実行後、`npm run ios:open` でXcodeを開く。
6. 自分のApple Development Teamを選択し、プロビジョニングと署名を設定する。
7. `Info.plist` の位置情報利用目的等の権限文言、プライバシーManifestを利用機能に合わせて整備。必要に応じて権限処理のiOSプラグインを導入。
8. iPhone実機で個人記録、写真、位置情報、グループの閲覧、オフラインを検証。

## ブロッカー・未検証
- **メール認証（重要）:** 現状のSupabase `signInWithOtp` はWeb版の `location.origin + location.pathname` にメールリンクを戻す設計。CapacitorのローカルスキームにWeb用のまま戻せないため、ネイティブ版では認証が未対応。実際にメールが送れてもログイン成功とは見なさない。
- 認証の修正候補：専用URLスキーム/Universal Linkと `@capacitor/app` の `appUrlOpen`、またはSupabaseメールテンプレートにトークンを含めてアプリ内OTP入力を実装。Supabaseの既存音楽アプリも同じプロジェクトを使うため、メールテンプレート変更は他アプリへの影響調査後に行う。
- **データ移行（重要）:** Safari/PWAのlocalStorageやIndexedDBは、Capacitorアプリ内WKWebViewに自動的には移らない。Web版の店舗訪問JSONと写真を別々にバックアップし、アプリ側に取り込む手順を実機検証する。
- **利用許可:** 写真・位置情報・共有はiOS側の権限/ネイティブAPIと実機で要確認。バックグラウンド位置追跡は行わない。
- **外部読み込み:** Supabase SDK、Leaflet、画像OCRなどネットワークを使う機能はオフライン利用できない。Webアプリのサービスワーカーがネイティブで作動する保証はない。
- **App Store審査:** Webサイトの単純なラッパーにならないよう、明確なiOSネイティブ体験、アカウント削除、通報/ブロック、ポリシー表示を完成させる。
- `appId` の `io.github.ryo9.tokyogourmetlog` は**暫定**。Apple Developer登録後、製品版のBundle IDを確定するまで署名・配信IDとして決定しない。
- この手順は試作の足場。Xcodeでの成功やApp Store公開済みと記載しない。

公式資料：
- https://capacitorjs.com/docs/getting-started
- https://capacitorjs.com/docs/ios
- https://capacitorjs.com/docs/guides/deep-links
- https://supabase.com/docs/guides/auth/native-mobile-deep-linking
