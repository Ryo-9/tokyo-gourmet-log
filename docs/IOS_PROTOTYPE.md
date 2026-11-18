# TOKYO GOURMET LOG — iOS Capacitor試作環境

更新: 2026-11-18

## 達成したこと（開発用の土台）
- 既存のGitHub Pages Webアプリと別に、`dist/` にiOS用静的アセットを複製するビルド処理を追加。
- GitHub Pages本番コードへの変更なし。WebとiOSで同じHTML/JSを流用。
- Capacitor v8.5.0（Appプラグイン v8.1.2）の依存バージョンを指定し、`capacitor.config.json` の `webDir=dist` を構成。
- Node.js標準機能だけでビルド用アセットの完全性と不要ファイル不混入をテスト。
- **iOSネイティブプロジェクトはまだ生成・実機起動・署名していない。** TestFlight/App Storeへ提出できる状態ではない。

## Mac/Xcodeで実施する手順
1. Node.jsおよび公式ドキュメント指定のXcodeをインストール。
2. リポジトリを取得し、`npm install` を実行して `package-lock.json` を生成・コミットする（依存バージョンは固定済み）。
3. `npm run test:ios-web` と `node --test scripts/native-auth.test.mjs` でビルドと認証コールバックのテストに合格する。
4. `npm run ios:add`（初回のみ）でネイティブの `ios/` プロジェクトを生成する。
5. `npm run ios:sync` を実行後、`npm run ios:open` でXcodeを開く。
6. 自分のApple Development Teamを選択し、プロビジョニングと署名を設定する。
7. `Info.plist` の位置情報利用目的等の権限文言、プライバシーManifestを利用機能に合わせて整備。必要に応じて権限処理のiOSプラグインを導入。
8. Xcodeの `App > Info > URL Types` でURL Scheme `tokyogourmetlog` を登録する。iOSの複数ウィンドウ構成ではCapacitorのAppプラグインがURLイベントを受け取れるよう設定を確認する。
9. Supabase Dashboard > Authentication > URL Configuration > Redirect URLs に `tokyogourmetlog://auth/callback` を **追加**（既存Web版URL/Site URLは削除・変更しない）。メールテンプレートは変更しない。
10. iPhone実機でメールリンクをタップ→アプリが開く→セッションが確立する→設定からログイン状態が見えるところまで検証。コールドスタートと起動中の両方を試す。
11. iPhone実機で個人記録、写真、位置情報、グループの閲覧、オフラインを検証。

## ブロッカー・未検証
- **メール認証（重要）:** iOSビルド専用に `native-auth.js` と `@capacitor/app` を組み込み、メール認証の戻り先を `tokyogourmetlog://auth/callback` に切り替えるコードと自動テストを追加済み。ただしXcodeでURLスキームを登録してSupabaseの認証リダイレクト許可URLを追加し、実機でメールログインが成功するまでは **未検証** とする。GitHub Pagesは従来どおりWeb URLを使用。
- iOS版では `@capacitor/app` の `appUrlOpen` と `getLaunchUrl` を使い、Supabaseの暗黙トークン（`access_token`＋`refresh_token`）またはPKCE `code` を受け取る。ただし動作確認前は成功と断定しない。Supabaseの既存音楽アプリも同じプロジェクトを使うため、メールテンプレートやSite URLは変更しない。
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

## iOS専用認証の回帰テスト（2026-11-18）
- Web公開版の `index.html` は変更せず、iOS版の `dist/index.html` だけに `native-auth.js` を挿入。Web版のログインリダイレクトはそのまま。
- 有効なコールバックURL以外は拒否し、認証エラーやトークンを画面やログに表示しない。
- URLの起動時取得・起動中イベント・重複イベントの単体テストをGitHub Actionsで検証。
- プラグインが使えない場合は認証メール送信を開始せず明確にエラー表示（未設定状態を正常と見なさない）。
- **未検証:** 実機のURL Types設定、Supabase実リンク、App Store用署名、Capacitorのネイティブプラグイン連携。
