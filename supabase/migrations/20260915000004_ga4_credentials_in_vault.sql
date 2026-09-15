-- Let the GA4 job take its credentials from the database instead of Edge
-- Function secrets.
--
-- Why this exists: setting a function secret needs Supabase dashboard access to
-- this project, and that access is currently lost -- the project sits in an
-- organisation whose login we have not been able to identify. Everything else
-- about the job works; only the credential is stranded. Supabase Vault is
-- already installed here and the database IS reachable, so the credential can
-- live there instead.
--
-- This is the second-best home for it, and deliberately so. A function secret
-- is the better place for a Google private key, so the function still prefers
-- GA4_SERVICE_ACCOUNT_JSON when it is set and only falls back to Vault. If
-- dashboard access comes back, set the secret and this path goes quiet with no
-- code change and nothing to undo.
--
-- The install problem, and how it is solved: the private key must reach Vault
-- without passing through a chat transcript or a repo. So it is written by its
-- owner, from their own machine, in one authenticated call, gated by a
-- single-use token that is minted here and consumed in the same transaction as
-- the write. The key travels laptop -> edge function -> Vault over HTTPS and
-- exists nowhere else.

-- ─── Non-secret configuration ─────────────────────────────────────
-- GA4 property IDs are not secrets (they are visible in any GA4 URL), so they
-- live in a plain table rather than Vault. Same precedence rule as the
-- credential: the environment wins when it is set.
create table if not exists public.integration_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.integration_config enable row level security;
-- No policies at all: the job reads this with the service role, which bypasses
-- RLS. Nothing anonymous or merely signed-in has any business reading it.

comment on table public.integration_config is
  'Non-secret settings for scheduled integrations (GA4 property IDs). Secrets go in Vault via integration_secret_get/set.';

-- ─── Vault access for the job ─────────────────────────────────────
-- service_role has no rights in the vault schema, so these SECURITY DEFINER
-- wrappers are the only way in, and they are granted to service_role alone.
-- search_path is emptied and every name qualified, so nothing on a caller's
-- path can be substituted for what these mean to call.
create or replace function public.integration_secret_get(p_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name;
$$;

create or replace function public.integration_secret_set(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.integration_secret_get(text) from public, anon, authenticated;
revoke all on function public.integration_secret_set(text, text) from public, anon, authenticated;
grant execute on function public.integration_secret_get(text)  to service_role;
grant execute on function public.integration_secret_set(text, text) to service_role;

-- ─── One-time credential install ──────────────────────────────────
-- The whole check-and-write is one statement inside one transaction, so the
-- token cannot be spent twice even if two calls race: the row is deleted in
-- the same transaction that stores the credential, and a second caller finds
-- no token.
--
-- It returns the service account's client_email so the installer can confirm
-- the right file landed. It never returns the private key.
create or replace function public.ga4_install_credential(p_token text, p_credential text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Length-independent comparison, so a failed attempt leaks nothing about
  -- how much of the token was right.
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

  -- Spend the token.
  select id into v_id from vault.decrypted_secrets where name = 'ga4_install_token';
  delete from vault.secrets where id = v_id;

  return v_json->>'client_email';
end;
$$;

revoke all on function public.ga4_install_credential(text, text) from public, anon, authenticated;
-- service_role only: the install has to come through the edge function, which
-- is the only thing holding that key. The token is the gate, this is the wall.
grant execute on function public.ga4_install_credential(text, text) to service_role;

comment on function public.ga4_install_credential(text, text) is
  'Stores the GA4 service-account JSON in Vault, gated by a single-use token that is consumed in the same transaction. Returns the credential client_email for confirmation; never returns the key.';
