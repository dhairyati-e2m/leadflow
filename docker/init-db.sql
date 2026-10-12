-- ==============================================================================
-- LeadFlow Database Initialization Script (Initial Container Provisioning)
-- Runs automatically on first startup via /docker-entrypoint-initdb.d/
-- ==============================================================================

-- 1. Create dedicated non-superuser application user
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles WHERE rolname = 'leadflow_app'
   ) THEN
      CREATE ROLE leadflow_app WITH LOGIN PASSWORD 'leadflow_dev_password';
   END IF;
END
$do$;

-- Revoke superuser and bypassrls to guarantee RLS enforcement
ALTER ROLE leadflow_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- 2. Create test database if it does not exist
SELECT 'CREATE DATABASE leadflow_test OWNER leadflow_app'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'leadflow_test')\gexec

-- 3. Grant schema permissions on primary database (leadflow)
\connect leadflow
GRANT ALL PRIVILEGES ON DATABASE leadflow TO leadflow_app;
GRANT ALL ON SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO leadflow_app;

-- 4. Grant schema permissions on test database (leadflow_test)
\connect leadflow_test
GRANT ALL PRIVILEGES ON DATABASE leadflow_test TO leadflow_app;
GRANT ALL ON SCHEMA public TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO leadflow_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO leadflow_app;
