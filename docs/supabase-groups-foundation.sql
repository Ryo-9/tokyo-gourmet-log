-- TOKYO GOURMET LOG: group foundation / opt-in membership / private-by-default
-- Isolated from old music app tables. This does not enable a public feed.
-- Creation: user-created group, direct invite to another authenticated user's UUID,
-- invitee accepts, then creates own membership; no automatic addition or location tracking.
begin;

create table public.tgl_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description)<=350),
  created_at timestamptz not null default now()
);
create index tgl_groups_owner on public.tgl_groups(owner_id);

create table public.tgl_group_invitations (
  group_id uuid not null references public.tgl_groups(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  primary key(group_id,invited_user_id)
);
create index tgl_group_invitation_user on public.tgl_group_invitations(invited_user_id,status);

create table public.tgl_group_members (
  group_id uuid not null references public.tgl_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create index tgl_group_member_user on public.tgl_group_members(user_id);

create table public.tgl_group_places (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.tgl_groups(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  name text not null check(char_length(name) between 1 and 160),
  area text not null default '' check(char_length(area)<=100),
  cuisine text not null default '' check(char_length(cuisine)<=80),
  created_at timestamptz not null default now(),
  unique(group_id,id)
);
create index tgl_group_places_group on public.tgl_group_places(group_id,created_at);

create table public.tgl_group_votes (
  place_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(place_id,user_id),
  constraint tgl_vote_place_group foreign key (group_id,place_id)
    references public.tgl_group_places(group_id,id) on delete cascade
);
create index tgl_group_votes_group on public.tgl_group_votes(group_id);

alter table public.tgl_groups enable row level security;
alter table public.tgl_group_invitations enable row level security;
alter table public.tgl_group_members enable row level security;
alter table public.tgl_group_places enable row level security;
alter table public.tgl_group_votes enable row level security;

revoke all on public.tgl_groups,public.tgl_group_invitations,public.tgl_group_members,public.tgl_group_places,public.tgl_group_votes from anon,authenticated;
grant select,insert,delete on public.tgl_groups to authenticated;
grant update(title,description) on public.tgl_groups to authenticated;
grant select,insert,delete on public.tgl_group_invitations to authenticated;
grant update(status) on public.tgl_group_invitations to authenticated;
grant select,insert,delete on public.tgl_group_members to authenticated;
grant select,insert,delete on public.tgl_group_places to authenticated;
grant update(name,area,cuisine) on public.tgl_group_places to authenticated;
grant select,insert,delete on public.tgl_group_votes to authenticated;
grant update(choice) on public.tgl_group_votes to authenticated;

-- Group access requires ownership or a membership row. This membership
-- subquery never recursively checks another membership: members SELECT self only.
create policy tgl_groups_read on public.tgl_groups for select to authenticated
  using (owner_id=(select auth.uid())
    or exists (select 1 from public.tgl_group_members m
      where m.group_id=tgl_groups.id and m.user_id=(select auth.uid())));
create policy tgl_groups_create on public.tgl_groups for insert to authenticated
  with check (owner_id=(select auth.uid()));
create policy tgl_groups_edit on public.tgl_groups for update to authenticated
  using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy tgl_groups_remove on public.tgl_groups for delete to authenticated
  using(owner_id=(select auth.uid()));

-- Invitation is visible only to the recipient or group owner.
create policy tgl_invitations_read on public.tgl_group_invitations for select to authenticated
  using(invited_user_id=(select auth.uid()) or exists (
    select 1 from public.tgl_groups g where g.id=tgl_group_invitations.group_id and g.owner_id=(select auth.uid())));
create policy tgl_invitations_create on public.tgl_group_invitations for insert to authenticated
  with check(status='pending' and invited_by=(select auth.uid()) and invited_user_id<>(select auth.uid())
    and exists (select 1 from public.tgl_groups g where g.id=tgl_group_invitations.group_id and g.owner_id=(select auth.uid())));
create policy tgl_invitations_respond on public.tgl_group_invitations for update to authenticated
  using(invited_user_id=(select auth.uid()) and status='pending')
  with check(invited_user_id=(select auth.uid()) and status in ('accepted','declined'));
create policy tgl_invitations_remove on public.tgl_group_invitations for delete to authenticated
  using(invited_user_id=(select auth.uid()) or exists (
    select 1 from public.tgl_groups g where g.id=tgl_group_invitations.group_id and g.owner_id=(select auth.uid())));

-- No one gets added to a group without accepting their invitation.
create policy tgl_members_read_self on public.tgl_group_members for select to authenticated
  using(user_id=(select auth.uid()));
create policy tgl_members_join_self on public.tgl_group_members for insert to authenticated
  with check(user_id=(select auth.uid()) and exists (
    select 1 from public.tgl_group_invitations i
    where i.group_id=tgl_group_members.group_id and i.invited_user_id=(select auth.uid()) and i.status='accepted'));
create policy tgl_members_leave_or_remove on public.tgl_group_members for delete to authenticated
  using(user_id=(select auth.uid()) or exists (
    select 1 from public.tgl_groups g where g.id=tgl_group_members.group_id and g.owner_id=(select auth.uid())));

-- Only group participants see nominated businesses, not private visit logs.
create policy tgl_group_places_read on public.tgl_group_places for select to authenticated
  using(exists(select 1 from public.tgl_groups g where g.id=tgl_group_places.group_id and g.owner_id=(select auth.uid()))
    or exists(select 1 from public.tgl_group_members m where m.group_id=tgl_group_places.group_id and m.user_id=(select auth.uid())));
create policy tgl_group_places_create on public.tgl_group_places for insert to authenticated
  with check(added_by=(select auth.uid()) and
   (exists(select 1 from public.tgl_groups g where g.id=tgl_group_places.group_id and g.owner_id=(select auth.uid()))
    or exists(select 1 from public.tgl_group_members m where m.group_id=tgl_group_places.group_id and m.user_id=(select auth.uid()))));
create policy tgl_group_places_edit on public.tgl_group_places for update to authenticated
  using(added_by=(select auth.uid()) or exists(
    select 1 from public.tgl_groups g where g.id=tgl_group_places.group_id and g.owner_id=(select auth.uid())))
  with check(added_by=(select auth.uid()) or exists(
    select 1 from public.tgl_groups g where g.id=tgl_group_places.group_id and g.owner_id=(select auth.uid())));
create policy tgl_group_places_remove on public.tgl_group_places for delete to authenticated
  using(added_by=(select auth.uid()) or exists(
    select 1 from public.tgl_groups g where g.id=tgl_group_places.group_id and g.owner_id=(select auth.uid())));

-- Participants may read votes within their group; only change their own.
create policy tgl_group_votes_read on public.tgl_group_votes for select to authenticated
  using(exists(select 1 from public.tgl_groups g where g.id=tgl_group_votes.group_id and g.owner_id=(select auth.uid()))
    or exists(select 1 from public.tgl_group_members m where m.group_id=tgl_group_votes.group_id and m.user_id=(select auth.uid())));
create policy tgl_group_votes_create on public.tgl_group_votes for insert to authenticated
  with check(user_id=(select auth.uid()) and
    (exists(select 1 from public.tgl_groups g where g.id=tgl_group_votes.group_id and g.owner_id=(select auth.uid()))
    or exists(select 1 from public.tgl_group_members m where m.group_id=tgl_group_votes.group_id and m.user_id=(select auth.uid()))));
create policy tgl_group_votes_edit on public.tgl_group_votes for update to authenticated
  using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy tgl_group_votes_remove on public.tgl_group_votes for delete to authenticated
  using(user_id=(select auth.uid()));

commit;
