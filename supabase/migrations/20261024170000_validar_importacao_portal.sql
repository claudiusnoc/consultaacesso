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

  if coalesce(jsonb_typeof(p_acessos), '') <> 'array' or jsonb_array_length(p_acessos) = 0 then
    raise exception 'A importação não contém acessos válidos.';
  end if;

  if jsonb_array_length(p_acessos) > 10000 then
    raise exception 'A planilha ultrapassa o limite de 10.000 acessos.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_acessos) as accesses(access_data)
    where jsonb_typeof(access_data) <> 'object'
       or nullif(btrim(access_data->>'chamado'), '') is null
       or nullif(btrim(access_data->>'id_detentora'), '') is null
       or nullif(btrim(access_data->>'site'), '') is null
       or coalesce(access_data->>'status', '') not in ('Liberado', 'Pendente', 'Bloqueado')
  ) then
    raise exception 'A planilha contém linhas incompletas ou status inválidos.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_acessos) as accesses(access_data)
    group by access_data->>'chamado'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(p_acessos) as accesses(access_data)
    group by upper(btrim(access_data->>'id_detentora'))
    having count(*) > 1
  ) then
    raise exception 'A planilha contém chamados ou IDs de detentora duplicados.';
  end if;

  perform pg_advisory_xact_lock(hashtext('consulta-tbsa-importacao'));
  perform public.substituir_portal_acessos(p_acessos);

  select count(*) into quantidade from public.portal_acessos;
  select count(*) into liberados from public.portal_acessos where status = 'Liberado';

  if quantidade <> jsonb_array_length(p_acessos) then
    raise exception 'A quantidade gravada não corresponde à planilha enviada.';
  end if;

  insert into private.portal_importacoes (quantidade)
  values (quantidade);

  return jsonb_build_object(
    'message', 'Base atualizada com sucesso.',
    'rows', quantidade,
    'approved', liberados
  );
end;
$$;

revoke all on function public.importar_portal_acessos(text, jsonb) from public;
grant execute on function public.importar_portal_acessos(text, jsonb) to anon, authenticated;
