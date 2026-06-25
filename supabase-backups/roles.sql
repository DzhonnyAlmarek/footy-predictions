
SET default_transaction_read_only = off;

SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE ROLE "supabase_etl_admin";
ALTER ROLE "supabase_etl_admin" WITH INHERIT NOCREATEROLE NOCREATEDB LOGIN REPLICATION BYPASSRLS;
CREATE ROLE "supabase_privileged_role";
ALTER ROLE "supabase_privileged_role" WITH INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOBYPASSRLS;

ALTER ROLE "anon" SET "statement_timeout" TO '3s';

ALTER ROLE "authenticated" SET "statement_timeout" TO '8s';

ALTER ROLE "authenticator" SET "statement_timeout" TO '8s';

GRANT "pg_monitor" TO "supabase_etl_admin" WITH INHERIT TRUE GRANTED BY "supabase_admin";
GRANT "pg_read_all_data" TO "supabase_etl_admin" WITH INHERIT TRUE GRANTED BY "supabase_admin";
GRANT "supabase_privileged_role" TO "supabase_etl_admin" WITH INHERIT TRUE GRANTED BY "supabase_admin";

RESET ALL;
