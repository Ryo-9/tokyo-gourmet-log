# TOKYO GOURMET LOG — Supabase導入手順

更新: 2026-11-18

## 状況

- Supabase プロジェクト: Ryo-9's Project
- Project ref: `uqcwtixittdrktziszab`
- Project URL: `https://uqcwtixittdrktziszab.supabase.co`
- Region: ap-northeast-1 / 無料組織
- 2026-11-18 プロジェクト再開をユーザーが許可。restore_project 成功。作業時は RESTORING。既存テーブルの読み取り完了前にSQLを適用しない。
- SQLドラフト: `docs/supabase-private-schema-draft.sql`。テーブル名は `tgl_*` で既存サービスと衝突しないよう配慮。
- GitHub Pages の本番 UI: `https://ryo-9.github.io/tokyo-gourmet-log/`

## 再開完了後の順序

1. `get_project.status=ACTIVE_HEALTHY` を確認。
2. `list_tables(schemas=['public'], verbose=true)` と `list_migrations` で既存データを点検。既存のテーブル・行を削除しない。
3. `tgl_*` が既存にあれば勝手に変更せずスキーマを比較し、適合しなければ停止する。
4. 既存と名前の衝突がないと確認したら、ドラフトを検査して適用。4表、4件のRLS有効化、16件の個人専用ポリシーが期待値。
5. `get_advisors(type=security)`、`pg_class`、`pg_policies`、`information_schema.role_table_grants` で監査。PostgreSQL のRLSテスト用に anon ロールが読めないか、異なるユーザーIDが見えないか、投稿の public 表示が非公開のままかを確認。
6. 見知らぬ本番データには触らず、テストレコードを用いる場合は独立して後で削除する。テスト時に本人のメールアドレスは不要。
7. 認証URL: Supabase dashboard > Authentication > URL Configuration > Site URL と Redirect URLs に `https://ryo-9.github.io/tokyo-gourmet-log/` を登録する。UIログインを公開する前に設定を確認。
8. フロントエンドの public publishable key (`sb_publishable_...`) のみを利用。秘密キー/service_role を GitHub / static JS / localStorage に置かない。
9. 最初は **明示的に選択したユーザー** のみ同期機能を使う。現地端末のlocalStorage/IndexedDBは変更せず、事前にバックアップを促す。写真のクラウド保存は別段階。
10. まずは1ユーザーで認証→空の状態→個人の保存店・訪問履歴をアップロード→再取得→件数と所有権を比較。別ユーザーから読めないことを検証してから有効化する。

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
