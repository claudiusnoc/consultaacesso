create schema if not exists private;

create table if not exists public.portal_acessos (
  chamado text primary key,
  id_detentora text not null unique,
  site text not null,
  status text not null,
  validade text,
  endereco text,
  cluster text,
  supervisor text,
  observacoes text,
  atualizado_em timestamptz not null default now()
);

create index if not exists portal_acessos_id_detentora_idx on public.portal_acessos (id_detentora);
create index if not exists portal_acessos_site_idx on public.portal_acessos (site);

create table if not exists private.portal_importacoes (
  id bigint generated always as identity primary key,
  quantidade integer not null check (quantidade > 0),
  importado_em timestamptz not null default now()
);

alter table public.portal_acessos enable row level security;
revoke all on table public.portal_acessos from anon, authenticated;
grant select on table public.portal_acessos to anon, authenticated;

drop policy if exists "consulta publica de acessos" on public.portal_acessos;
create policy "consulta publica de acessos"
  on public.portal_acessos for select
  to anon, authenticated
  using (true);

revoke all on table private.portal_importacoes from anon, authenticated;

create or replace function public.substituir_portal_acessos(p_acessos jsonb)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if jsonb_typeof(p_acessos) <> 'array' or jsonb_array_length(p_acessos) = 0 then
    raise exception 'A importação não contém acessos válidos.';
  end if;

  delete from public.portal_acessos where chamado is not null;

  insert into public.portal_acessos (
    chamado, id_detentora, site, status, validade, endereco, cluster, supervisor, observacoes, atualizado_em
  )
  select
    nullif(item->>'chamado', ''),
    nullif(item->>'id_detentora', ''),
    nullif(item->>'site', ''),
    nullif(item->>'status', ''),
    nullif(item->>'validade', ''),
    nullif(item->>'endereco', ''),
    nullif(item->>'cluster', ''),
    nullif(item->>'supervisor', ''),
    nullif(item->>'observacoes', ''),
    now()
  from jsonb_array_elements(p_acessos) as item;

  insert into private.portal_importacoes (quantidade)
  values (jsonb_array_length(p_acessos));
end;
$$;

revoke all on function public.substituir_portal_acessos(jsonb) from public, anon, authenticated;
grant execute on function public.substituir_portal_acessos(jsonb) to service_role;
