-- Diagnóstico de solo lectura: tablas del esquema público sin RLS.
select
  'table_without_rls'::text as issue_type,
  tablename::text as object_name,
  tableowner::text as owner_or_schema
from pg_catalog.pg_tables
where schemaname = 'public'
  and rowsecurity = false
union all
select
  'extension_in_public'::text,
  ext.extname::text,
  ns.nspname::text
from pg_catalog.pg_extension ext
join pg_catalog.pg_namespace ns on ns.oid = ext.extnamespace
where ns.nspname = 'public'
order by issue_type, object_name;
