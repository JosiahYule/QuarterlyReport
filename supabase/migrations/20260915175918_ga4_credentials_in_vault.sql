-- Let the GA4 job read its credential and its property IDs from the database.
--
-- RECONSTRUCTED FROM PRODUCTION. This migration was applied straight to the
-- database (as version 20260915175918, "ga4_credentials_in_vault") and never
-- committed, while the deployed edge function was updated to depend on it.
-- The repo therefore described a function that no longer existed: redeploying
-- `supabase functions deploy ga4-web-sync` from the checked-in source would
-- have dropped both fallbacks below and broken ingestion with no obvious
-- cause. Committing it closes that gap. Every statement is idempotent, so
-- re-applying it over the live objects is a no-op.
--
-- Why a database fallback exists at all. An Edge Function secret is the right
-- home for a private key, and the function still prefers one when it is set.
-- But setting a function secret needs Supabase dashboard access to this
-- project, and that access is currently lost. Vault is encrypted at rest and
-- reachable over the service role, so it carries the credential until the
-- dashboard comes back; setting GA4_SERVICE_ACCOUNT_JSON then takes over with
-- no code change and no migration.

-- ─── Non-secret settings ──────────────────────────────────────────
-- GA4 property IDs. Not secret (they identify a property, they do not grant
-- access to it), so a plain table rather than Vault. RLS is on with no policy
-- at all, which is the point: anon and authenticated reach nothing, and only
-- the service role, which bypasses RLS, can read it.
create table if not exists public.integration_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_config enable row level security;

-- ─── Secret storage ───────────────────────────────────────────────
-- Thin, named wrappers over Vault. SECURITY DEFINER so the job can reach a
-- single secret by name without the whole vault being readable, and
-- search_path is pinned empty so nothing on the caller's path can shadow the
-- objects these bodies name.
create or replace function public.integration_secret_get(p_name text)
returns text
language sql
security definer
set search_path = ''
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$function$;

create or replace function public.integration_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from vault.decrypted_secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'Managed by the GA4 ingestion job');
  else
    perform vault.update_secret(v_id, p_value);
  end if;
end;
$function$;

-- ─── One-time credential install ──────────────────────────────────
-- Installing the service-account JSON without dashboard access means posting
-- it to the edge function. That endpoint must not be a way for anyone who
-- learns the URL to overwrite the credential, so the write is gated on a
-- single-use token minted out of band.
--
-- The token is checked and spent in the same transaction as the write, so a
-- spent token cannot be replayed and the handler cannot be talked into
-- accepting one. Nothing about the key is returned except client_email, which
-- is what lets the installer confirm the right file landed.
--
-- Note the ordering: the shape of the credential is validated BEFORE the token
-- is spent. A malformed paste therefore costs nothing and can be retried with
-- the same token, which is exactly what happened on the first attempt.
--
-- Mint a token by hand from the SQL editor, once, immediately before use:
--
--   select vault.create_secret(encode(gen_random_bytes(32), 'hex'),
--                              'ga4_install_token');
--   select decrypted_secret from vault.decrypted_secrets
--    where name = 'ga4_install_token';
--
-- The value is a credential. It does not belong in this file, in the repo, or
-- in any chat log.
create or replace function public.ga4_install_credential(p_token text, p_credential text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_expected text;
  v_id       uuid;
  v_json     jsonb;
begin
  select decrypted_secret into v_expected
    from vault.decrypted_secrets where name = 'ga4_install_token';

  if v_expected is null then
    raise exception 'ga4_install_credential: no install token is outstanding'
      using hint = 'A token is single-use. Ask for a fresh one to be minted.';
  end if;

  if not (v_expected = p_token) then
    raise exception 'ga4_install_credential: install token does not match';
  end if;

  begin
    v_json := p_credential::jsonb;
  exception when others then
    raise exception 'ga4_install_credential: credential is not valid JSON';
  end;

  if v_json->>'client_email' is null or v_json->>'private_key' is null then
    raise exception 'ga4_install_credential: credential is missing client_email or private_key'
      using hint = 'Send the whole service-account JSON file downloaded from Google Cloud.';
  end if;

  perform public.integration_secret_set('ga4_service_account', p_credential);

  select id into v_id from vault.decrypted_secrets where name = 'ga4_install_token';
  delete from vault.secrets where id = v_id;

  return v_json->>'client_email';
end;
$function$;

-- ─── Grants ───────────────────────────────────────────────────────
-- All three reach Vault through SECURITY DEFINER, so the browser roles must
-- not be able to call them. Only the service role, which is the edge function,
-- ever should.
revoke all on function public.integration_secret_get(text) from public, anon, authenticated;
revoke all on function public.integration_secret_set(text, text) from public, anon, authenticated;
revoke all on function public.ga4_install_credential(text, text) from public, anon, authenticated;

grant execute on function public.integration_secret_get(text) to service_role;
grant execute on function public.integration_secret_set(text, text) to service_role;
grant execute on function public.ga4_install_credential(text, text) to service_role;
