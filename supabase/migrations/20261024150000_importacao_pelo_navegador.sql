create extension if not exists pgcrypto with schema extensions;

create table if not exists private.portal_atualizacao_segredo (
  id boolean primary key default true check (id),
  codigo_hash text not null,
  atualizado_em timestamptz not null default now()
);

create or replace function private.definir_codigo_atualizacao(p_codigo text)
returns void
language plpgsql
security definer
set search_path = private, extensions, pg_temp
as $$
begin
  if length(coalesce(p_codigo, '')) < 8 then
    raise exception 'O código precisa ter pelo menos 8 caracteres.';
  end if;

  insert into private.portal_atualizacao_segredo (id, codigo_hash, atualizado_em)
  values (true, extensions.crypt(p_codigo, extensions.gen_salt('bf')), now())
  on conflict (id) do update set codigo_hash = excluded.codigo_hash, atualizado_em = excluded.atualizado_em;
end;
$$;

create or replace function public.validar_codigo_atualizacao(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = private, extensions, pg_temp
as $$
declare
  stored_hash text;
begin
  select codigo_hash into stored_hash from private.portal_atualizacao_segredo where id = true;
  return stored_hash is not null and extensions.crypt(coalesce(p_codigo, ''), stored_hash) = stored_hash;
end;
$$;

create or replace function public.importar_portal_acessos(p_codigo text, p_acessos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  quantidade integer;
  liberados integer;
begin
  if not public.validar_codigo_atualizacao(p_codigo) then
    raise exception 'Código inválido.' using errcode = '28000';
  end if;

  if jsonb_typeof(p_acessos) <> 'array' or jsonb_array_length(p_acessos) = 0 then
    raise exception 'A importação não contém acessos válidos.';
  end if;

  perform public.substituir_portal_acessos(p_acessos);
  quantidade := jsonb_array_length(p_acessos);
  select count(*) into liberados from jsonb_array_elements(p_acessos) as item where item->>'status' = 'Liberado';
  return jsonb_build_object('message', 'Base atualizada com sucesso.', 'rows', quantidade, 'approved', liberados);
end;
$$;

revoke all on function private.definir_codigo_atualizacao(text) from public, anon, authenticated;
revoke all on function public.validar_codigo_atualizacao(text) from public;
revoke all on function public.importar_portal_acessos(text, jsonb) from public;
grant execute on function public.validar_codigo_atualizacao(text) to anon, authenticated;
grant execute on function public.importar_portal_acessos(text, jsonb) to anon, authenticated;
