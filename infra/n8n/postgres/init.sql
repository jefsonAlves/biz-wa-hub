\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS n8n AUTHORIZATION n8n;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA n8n TO n8n;

COMMENT ON SCHEMA n8n IS 'Schema dedicado aos dados internos do n8n; não contém dados de negócio do Biz WA Hub.';
