-- Runs once when the PostgreSQL container is first created.
-- Creates the application database and enables TimescaleDB.

\set ON_ERROR_STOP on

-- Database is already created by POSTGRES_DB env-var; just connect to it.
\connect signal_db

-- Enable TimescaleDB extension (required for hypertable in EF migration)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- pg_trgm for future full-text search on news headlines
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- uuid-ossp for uuid_generate_v4() if needed by raw SQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
