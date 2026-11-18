-- Fix RLS circular dependency caught by transactional tests (2026-11-18).
-- Original cycle: members INSERT -> invitations SELECT -> groups SELECT -> members SELECT.
-- Invitation invited_by is immutable to authenticated clients and validated at INSERT.
-- Members can voluntarily leave; group-owner member removal awaits an audited function.
begin;
alter policy tgl_invitations_read on public.tgl_group_invitations to authenticated
  using (invited_user_id=(select auth.uid()) or invited_by=(select auth.uid()));
alter policy tgl_invitations_remove on public.tgl_group_invitations to authenticated
  using (invited_user_id=(select auth.uid()) or invited_by=(select auth.uid()));
alter policy tgl_members_leave_or_remove on public.tgl_group_members to authenticated
  using (user_id=(select auth.uid()));
commit;
