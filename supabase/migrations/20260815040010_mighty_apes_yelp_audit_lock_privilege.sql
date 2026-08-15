begin;

-- PostgreSQL requires UPDATE privilege on at least one selected column for
-- SELECT ... FOR UPDATE. The ingestion RPC locks immutable delivery evidence
-- while remaining SECURITY INVOKER, so grant only the primary-key column.
-- The immutable BEFORE UPDATE trigger still rejects every attempted UPDATE.
grant update (id)
on table public.mighty_apes_yelp_webhook_events
to service_role;

commit;
