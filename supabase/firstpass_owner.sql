-- FirstPass owner dashboard v1. Additive migration; no changes to existing progress table or policies.
begin;
create schema if not exists firstpass_owner_private;
revoke all on schema firstpass_owner_private from public, anon, authenticated;
create table if not exists firstpass_owner_private.owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists firstpass_owner_private.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_key text not null check (length(question_key) between 1 and 1800),
  category text not null check (category in ('answer','explanation','wording','reference','other')),
  detail text not null check (length(detail) between 1 and 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
alter table firstpass_owner_private.owners enable row level security;
alter table firstpass_owner_private.reports enable row level security;
revoke all on all tables in schema firstpass_owner_private from public, anon, authenticated;
create index if not exists fp_reports_user_created_idx on firstpass_owner_private.reports(user_id, created_at);

create or replace function public.firstpass_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from firstpass_owner_private.owners where user_id = auth.uid());
$$;
revoke all on function public.firstpass_is_owner() from public, anon, authenticated;
grant execute on function public.firstpass_is_owner() to authenticated;

-- The stored snapshot is never modified. Escape NULs in a temporary analytics copy only.
-- No snapshot, note, email, or individual student answers are returned to the browser.
create or replace function firstpass_owner_private.analytics_snapshot(s jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare raw text; result jsonb;
begin
  if s->>'codec' = 'firstpass-utf8-base64-v1' then
    if length(s->>'payload') > 20000000 then return null; end if;
    raw := convert_from(decode(s->>'payload', 'base64'), 'UTF8');
    result := replace(replace(raw, '\u0001', '\u0001S'), '\u0000', '\u0001N')::jsonb;
  elsif s->>'schema' = '1' then
    result := replace(replace(s::text, '\u0001', '\u0001S'), '\u0000', '\u0001N')::jsonb;
  else return null;
  end if;
  if result->>'schema' is distinct from '1' or jsonb_typeof(result#>'{state,progress}') is distinct from 'object' then return null; end if;
  return result;
exception when others then return null;
end;
$$;
revoke all on function firstpass_owner_private.analytics_snapshot(jsonb) from public, anon, authenticated;

create or replace function public.firstpass_owner_overview(p_bank_keys text[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.firstpass_is_owner() then raise exception 'Owner access required' using errcode = '42501'; end if;
  if coalesce(cardinality(p_bank_keys),0) > 50000 then raise exception 'Too many question keys'; end if;
  with decoded as materialized (
    select user_id, firstpass_owner_private.analytics_snapshot(snapshot) as doc from public.user_qbank_state
  ), progress as materialized (
    select d.user_id, p.key,
      case when jsonb_typeof(p.value->'attempts') = 'number' then least(1000000000, greatest(0,(p.value->>'attempts')::numeric)) else 0 end as attempts,
      case when jsonb_typeof(p.value->'correct') = 'number' then least(1000000000, greatest(0,(p.value->>'correct')::numeric)) else 0 end as correct
    from decoded d cross join lateral jsonb_each(case when jsonb_typeof(d.doc#>'{state,progress}') = 'object' then d.doc#>'{state,progress}' else '{}'::jsonb end) p
  ), daily as materialized (
    select d.user_id, x.key as day
    from decoded d cross join lateral jsonb_each(case when jsonb_typeof(d.doc->'daily') = 'object' then d.doc->'daily' else '{}'::jsonb end) x
    where case when jsonb_typeof(x.value) = 'number' then (x.value::text)::numeric > 0 else false end
  ), difficulty as (
    select p.key, sum(p.attempts) as attempts, sum(least(p.correct,p.attempts)) as correct, count(*) as learners
    from progress p where p.attempts > 0 and p.key = any(p_bank_keys)
    group by p.key having count(*) >= 3 and sum(p.attempts) >= 5
    order by sum(least(p.correct,p.attempts))/sum(p.attempts), sum(p.attempts) desc, p.key limit 15
  )
  select jsonb_build_object(
    'registered', (select count(*) from auth.users),
    'verified', (select count(*) from auth.users where email_confirmed_at is not null),
    'synced', (select count(*) from decoded),
    'unreadable', (select count(*) from decoded where doc is null),
    'today', (select count(distinct user_id) from daily where day = (now() at time zone 'Asia/Karachi')::date::text),
    'month', (select count(distinct user_id) from daily where day between ((now() at time zone 'Asia/Karachi')::date-29)::text and (now() at time zone 'Asia/Karachi')::date::text),
    'attempts', (select coalesce(sum(attempts),0) from progress),
    'correct', (select coalesce(sum(least(correct,attempts)),0) from progress),
    'hardest', (select coalesce(jsonb_agg(to_jsonb(d) order by d.correct/d.attempts,d.attempts desc,d.key),'[]'::jsonb) from difficulty d),
    'openReports', (select count(*) from firstpass_owner_private.reports where resolved_at is null),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc),'[]'::jsonb) from (select id,question_key,category,detail,created_at,resolved_at from firstpass_owner_private.reports order by (resolved_at is not null), created_at desc limit 100) r)
  ) into result;
  return result;
end;
$$;
revoke all on function public.firstpass_owner_overview(text[]) from public, anon, authenticated;
grant execute on function public.firstpass_owner_overview(text[]) to authenticated;

create or replace function public.firstpass_report_question(p_question_key text,p_category text,p_detail text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Login required' using errcode = '42501'; end if;
  -- Serialize reports per account to enforce a simple rate limit.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  if (select count(*) from firstpass_owner_private.reports where user_id=uid and created_at > now()-interval '1 day') >= 20 then raise exception 'Daily report limit reached'; end if;
  insert into firstpass_owner_private.reports(user_id,question_key,category,detail) values(uid,p_question_key,p_category,btrim(p_detail));
end;
$$;
revoke all on function public.firstpass_report_question(text,text,text) from public, anon, authenticated;
grant execute on function public.firstpass_report_question(text,text,text) to authenticated;

create or replace function public.firstpass_resolve_report(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.firstpass_is_owner() then raise exception 'Owner access required' using errcode = '42501'; end if;
  update firstpass_owner_private.reports set resolved_at=now() where id=p_id and resolved_at is null;
end;
$$;
revoke all on function public.firstpass_resolve_report(uuid) from public, anon, authenticated;
grant execute on function public.firstpass_resolve_report(uuid) to authenticated;
commit;
-- Grant owner access separately using your permanent account UUID from Authentication > Users.
