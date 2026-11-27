-- FirstPass shared question bank. Run after firstpass_owner.sql.
-- Adds an overlay only. Does not modify auth, progress, reports, or bundled questions.
begin;
create table if not exists firstpass_owner_private.global_bank_version (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0 check (revision >= 0)
);
insert into firstpass_owner_private.global_bank_version(singleton) values(true) on conflict do nothing;
create table if not exists firstpass_owner_private.global_bank_entries (
  key text primary key check (length(key) between 1 and 2048),
  question jsonb not null,
  revision bigint not null,
  updated_at timestamptz not null default now()
);
alter table firstpass_owner_private.global_bank_version enable row level security;
alter table firstpass_owner_private.global_bank_entries enable row level security;
revoke all on firstpass_owner_private.global_bank_version, firstpass_owner_private.global_bank_entries from public, anon, authenticated;

-- All signed-in students can read published content only. One statement sees a consistent snapshot.
create or replace function public.firstpass_global_bank_read() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  return (select jsonb_build_object('revision', v.revision, 'entries',
    coalesce((select jsonb_agg(jsonb_build_object('key', e.key, 'question', e.question) order by e.key)
              from firstpass_owner_private.global_bank_entries e), '[]'::jsonb))
    from firstpass_owner_private.global_bank_version v where v.singleton);
end;
$$;
revoke all on function public.firstpass_global_bank_read() from public, anon, authenticated;
grant execute on function public.firstpass_global_bank_read() to authenticated;

-- Atomic publication, no partial uploads; optimistic revision check prevents stale overwrites.
create or replace function public.firstpass_global_bank_publish(p_revision bigint, p_entries jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_revision bigint;
  e jsonb;
  q jsonb;
  k text;
  field text;
  opt text;
  options text[];
begin
  if auth.uid() is null or public.firstpass_is_owner() is distinct from true then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Expected an array'; end if;
  if jsonb_array_length(p_entries) not between 1 and 2000 or octet_length(p_entries::text) > 15000000 then
    raise exception 'Publish 1–2000 questions, maximum 15 MB per batch';
  end if;
  select revision into v_revision from firstpass_owner_private.global_bank_version where singleton for update;
  if p_revision is distinct from v_revision then raise exception 'Bank changed since loading. Reload and review your draft before publishing.' using errcode='40001'; end if;
  if (select count(distinct item->>'key') from jsonb_array_elements(p_entries) as x(item)) <> jsonb_array_length(p_entries) then
    raise exception 'Duplicate or missing question keys';
  end if;
  for e in select value from jsonb_array_elements(p_entries) loop
    k := e->>'key'; q := e->'question';
    if jsonb_typeof(e->'key') is distinct from 'string' or k is null or length(k) not between 1 and 2048 or jsonb_typeof(q) is distinct from 'object' or octet_length(q::text) > 110000 then
      raise exception 'Invalid question record';
    end if;
    -- Encoded IDs are URL-encoded ASCII strings, never raw database identifiers.
    if k !~ '^[A-Za-z0-9_.!~*''()%\-]+$' or k ~ '%(?![0-9A-F]{2})' then raise exception 'Invalid encoded question ID'; end if;
    foreach field in array array['system','concept_id','concept_name','angle','stem','option_A','option_B','option_C','option_D','correct_explanation','high_yield_pearl'] loop
      if jsonb_typeof(q->field) is distinct from 'string' or length(btrim(q->>field))=0 then raise exception 'Invalid question field: %', field; end if;
    end loop;
    if jsonb_typeof(q->'tier') is null or jsonb_typeof(q->'tier') not in ('number','string') or jsonb_typeof(q->'correct_fa_page') is distinct from 'number' or jsonb_typeof(q->'distractor_explanations') is distinct from 'object' then raise exception 'Invalid tier, reference or explanations'; end if;
    if q ? 'topic_overview' and jsonb_typeof(q->'topic_overview') is distinct from 'string' then raise exception 'Invalid topic overview'; end if;
    options := array['A','B','C','D'];
    if q ? 'option_E' then
      if jsonb_typeof(q->'option_E') is distinct from 'string' or length(btrim(q->>'option_E'))=0 then raise exception 'Invalid option E'; end if;
      options := array_append(options,'E');
    end if;
    if jsonb_typeof(q->'correct_option') is distinct from 'string' or not ((q->>'correct_option') = any(options)) then raise exception 'Invalid correct option'; end if;
    foreach opt in array options loop
      if jsonb_typeof(q->'distractor_explanations'->opt->'reason') is distinct from 'string' or jsonb_typeof(q->'distractor_explanations'->opt->'fa_page') is distinct from 'number' then raise exception 'Invalid option explanation: %', opt; end if;
    end loop;
    insert into firstpass_owner_private.global_bank_entries(key,question,revision,updated_at)
    values(k,q,v_revision+1,now()) on conflict (key) do update set question=excluded.question,revision=excluded.revision,updated_at=excluded.updated_at;
  end loop;
  update firstpass_owner_private.global_bank_version set revision=v_revision+1 where singleton;
  return v_revision+1;
end;
$$;
revoke all on function public.firstpass_global_bank_publish(bigint,jsonb) from public, anon, authenticated;
grant execute on function public.firstpass_global_bank_publish(bigint,jsonb) to authenticated;
commit;
