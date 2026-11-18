# TOKYO GOURMET LOG — Supabase導入手順

更新: 2026-11-18

## 状況

- Supabase プロジェクト: Ryo-9's Project
- Project ref: `uqcwtixittdrktziszab`
- Project URL: `https://uqcwtixittdrktziszab.supabase.co`
- Region: ap-northeast-1 / 無料組織
- 2026-11-18 ユーザー許可後にプロジェクトを再開し、ACTIVE_HEALTHYを確認済み。既存の音楽用4テーブル（profiles / songs / song_members / messages、全て空、RLS有効）は変更しなかった。
- データベース変更は適用済み。migration: 20261118082615 tokyo_gourmet_log_private_foundation。ソース: `docs/supabase-private-schema-draft.sql`。4つのtGL専用テーブルと16ポリシーを確認。
- GitHub Pages の本番 UI: `https://ryo-9.github.io/tokyo-gourmet-log/`

## 実施結果と残る作業

1. 【完了】`get_project.status=ACTIVE_HEALTHY` を確認。
2. 【完了】`list_tables(schemas=['public'], verbose=true)` と `list_migrations` で既存データを点検。既存のテーブル・行は削除していない。
3. 【完了】`tgl_*` は適用前に存在せず、名前の衝突なし。
4. 【完了】4表を作成、全4表でRLS有効、各表4ポリシー＝合計16を検査した。anonロールのSELECT権限は全4表でfalse。
5. 【一部完了】`get_advisors(type=security)`、`pg_class`、`pg_policies`、`information_schema.role_table_grants` で監査。anonの権限なし、本人のauth.uid限定のRLSを検査済み。異なるログインユーザー間の実機APIテストは未実施。以前から存在する音楽用関数 `public.add_owner_as_song_member()` の SECURITY DEFINER 警告と、漏えいパスワード保護未設定の警告は残るため別途対処。
6. 見知らぬ本番データには触らず、テストレコードを用いる場合は独立して後で削除する。テスト時に本人のメールアドレスは不要。
7. 【ユーザー操作が必要】認証URL: Supabase dashboard > Authentication > URL Configuration > Site URL と Redirect URLs に `https://ryo-9.github.io/tokyo-gourmet-log/` を登録する。UIログインを公開する前に設定を確認。
8. フロントエンドの public publishable key (`sb_publishable_...`) のみを利用。秘密キー/service_role を GitHub / static JS / localStorage に置かない。
9. 【未実施】最初は **明示的に選択したユーザー** のみ同期機能を使う。現地端末のlocalStorage/IndexedDBは変更せず、事前にバックアップを促す。写真のクラウド保存は別段階。
10. 【未実施】まずは1ユーザーで認証→空の状態→個人の保存店・訪問履歴をアップロード→再取得→件数と所有権を比較。別ユーザーから読めないことを検証してから有効化する。

## 個人投稿と公開SNSの境界

- `tgl_posts.visibility` が `public` でも初期RLSでは本人だけが閲覧できる。これを変える前に、通報・ブロック、投稿削除、公開範囲を選ぶUI、未成年者への制限を準備。
- すれ違った人の生位置・移動履歴・リアルタイム遭遇時刻は記録または表示しない。
- フォローやグループなどの他者閲覧のRLS設計は、個人データの基本同期が通った後、テストを用意して別々に追加。
- Cloudに移行しても、これまでのローカル閲覧・保存は無料かつログインなしで残す。

## 監査用SQL（読取専用）

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname like 'tgl_%' and c.relkind='r'
order by 1;

select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname='public' and tablename like 'tgl_%'
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema='public' and table_name like 'tgl_%'
and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;
```

## staged client

- `staging/cloud-sync.js` は端末内データを変更せず、ユーザーの明示操作でJSONバックアップ→クラウドへアップロードする試作実装。**本番のindex.htmlからは読み込んでいない**。
- AuthのリダイレクトURLとメール認証が確認できるまで、本番画面へ接続しない。後からアップロードを繰り返してもclient_idで重複しない設計。写真のアップロードとクラウドから端末への自動マージは未実装。

## 公開版クラウド機能の状況（2026-11-18）

- 利用者が認証Redirect URLを追加したことを確認。
- `cloud-config.js` と `cloud-sync.js` を公開サイトに導入。キーはフロントエンド用publishable、SDKはsettingsで初期化。
- 認証後に端末データをクラウドへ保存する操作と、クラウドからのプレビュー→非破壊的な未登録データ取り込みを実装。すべて手動。事前JSONバックアップあり。
- 公開ページの「設定」でメール入力・ログインボタンが表示されることをブラウザ検証済み。メール配信・ログイン後の実際のAPI書き込みと2アカウント間の権限分離は未検証。
- 旧記事にある「本番画面へ接続しない」という記述は当時のステージング状態を記録したもの。現在は任意のβ機能として公開している。
