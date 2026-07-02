-- Atlas REI MVP starter schema
-- Target: PostgreSQL 15+ with PostGIS enabled

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ---------------------------------------------------------------------------
-- Utility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Identity and tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan_tier text NOT NULL DEFAULT 'starter',
  default_currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  auth_provider text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  workspace_type text NOT NULL DEFAULT 'investment',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Country pack configuration
-- ---------------------------------------------------------------------------

CREATE TABLE country_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  base_currency char(3) NOT NULL,
  timezone text NOT NULL,
  supports_residential boolean NOT NULL DEFAULT true,
  supports_commercial boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE city_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_pack_id uuid NOT NULL REFERENCES country_packs(id) ON DELETE CASCADE,
  city_code text NOT NULL,
  name text NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_pack_id, city_code)
);

CREATE TABLE source_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_pack_id uuid NOT NULL REFERENCES country_packs(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  source_type text NOT NULL,
  connector_type text NOT NULL,
  auth_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  refresh_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_pack_id, source_name)
);

CREATE TABLE score_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_pack_id uuid NOT NULL REFERENCES country_packs(id) ON DELETE CASCADE,
  score_key text NOT NULL,
  version integer NOT NULL,
  formula_json jsonb NOT NULL,
  weighting_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_data_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_pack_id, score_key, version)
);

CREATE TABLE forecast_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_pack_id uuid NOT NULL REFERENCES country_packs(id) ON DELETE CASCADE,
  forecast_key text NOT NULL,
  version integer NOT NULL,
  model_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_pack_id, forecast_key, version)
);

-- ---------------------------------------------------------------------------
-- Geography
-- ---------------------------------------------------------------------------

CREATE TABLE countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code char(2) NOT NULL UNIQUE,
  name text NOT NULL,
  currency_code char(3) NOT NULL,
  region text,
  geom geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  city_code text NOT NULL,
  name text NOT NULL,
  timezone text NOT NULL,
  geom geometry(MultiPolygon, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, city_code)
);

CREATE TABLE districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  district_code text NOT NULL,
  name text NOT NULL,
  district_type text NOT NULL DEFAULT 'district',
  parent_district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  geom geometry(MultiPolygon, 4326),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_id, district_code)
);

CREATE TABLE micro_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  name text NOT NULL,
  geom geometry(MultiPolygon, 4326),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (district_id, name)
);

-- ---------------------------------------------------------------------------
-- Market entities
-- ---------------------------------------------------------------------------

CREATE TABLE developers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid REFERENCES countries(id) ON DELETE SET NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  developer_type text,
  website_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid REFERENCES developers(id) ON DELETE SET NULL,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  name text NOT NULL,
  project_type text,
  status text,
  launch_date date,
  completion_date date,
  geom geometry(MultiPolygon, 4326),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  developer_id uuid REFERENCES developers(id) ON DELETE SET NULL,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  micro_market_id uuid REFERENCES micro_markets(id) ON DELETE SET NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  building_type text,
  status text,
  handover_date date,
  floors_count integer,
  unit_count integer,
  geom geometry(Point, 4326),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  country_id uuid REFERENCES countries(id) ON DELETE SET NULL,
  external_property_ref text,
  property_type text NOT NULL,
  bedrooms integer,
  bathrooms integer,
  interior_area_sqm numeric(12,2),
  exterior_area_sqm numeric(12,2),
  floor_number integer,
  tenure_type text,
  ownership_type text,
  furnishing_status text,
  occupancy_status text,
  geom geometry(Point, 4326),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Listings and transactions
-- ---------------------------------------------------------------------------

CREATE TABLE listing_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_pack_id uuid REFERENCES country_packs(id) ON DELETE CASCADE,
  name text NOT NULL UNIQUE,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  listing_source_id uuid NOT NULL REFERENCES listing_sources(id) ON DELETE CASCADE,
  external_listing_id text NOT NULL,
  listing_type text NOT NULL,
  listing_status text NOT NULL,
  url text,
  price_amount numeric(14,2),
  price_currency char(3),
  rent_frequency text,
  listed_at timestamptz,
  removed_at timestamptz,
  broker_name text,
  broker_company text,
  raw_attributes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_source_id, external_listing_id)
);

CREATE TABLE listing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_type text NOT NULL,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sale_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  transaction_date date NOT NULL,
  price_amount numeric(14,2) NOT NULL,
  price_currency char(3) NOT NULL,
  price_per_sqm numeric(14,2),
  buyer_type text,
  seller_type text,
  is_new_sale boolean,
  is_off_plan boolean,
  source_record_id text,
  source_confidence numeric(5,2),
  raw_record_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rental_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  district_id uuid REFERENCES districts(id) ON DELETE SET NULL,
  contract_start_date date,
  contract_end_date date,
  annual_rent_amount numeric(14,2) NOT NULL,
  rent_currency char(3) NOT NULL,
  rent_frequency text,
  source_name text NOT NULL,
  source_record_id text,
  source_confidence numeric(5,2),
  raw_record_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_charge_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  effective_year integer NOT NULL,
  charge_per_sqm numeric(12,2) NOT NULL,
  currency char(3) NOT NULL,
  source_name text NOT NULL,
  source_record_id text,
  confidence numeric(5,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, effective_year, source_name)
);

-- ---------------------------------------------------------------------------
-- Provenance and freshness
-- ---------------------------------------------------------------------------

CREATE TABLE source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_entity_type text NOT NULL,
  source_record_id text NOT NULL,
  raw_storage_path text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  checksum text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_name, source_entity_type, source_record_id)
);

CREATE TABLE entity_source_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  source_record_id uuid NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  mapping_confidence numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_freshness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  market_scope text,
  entity_scope text,
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  status text NOT NULL DEFAULT 'unknown',
  notes text,
  UNIQUE (source_name, market_scope, entity_scope)
);

-- ---------------------------------------------------------------------------
-- Investor profile and workflow
-- ---------------------------------------------------------------------------

CREATE TABLE investor_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_currency char(3) NOT NULL,
  capital_available numeric(14,2) NOT NULL,
  risk_tolerance text NOT NULL,
  investment_horizon_months integer NOT NULL,
  income_vs_growth_preference text NOT NULL,
  financing_preference text NOT NULL,
  target_countries_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  constraints_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  goals_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  investor_profile_id uuid REFERENCES investor_profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shortlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  investor_profile_id uuid REFERENCES investor_profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shortlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id uuid NOT NULL REFERENCES shortlists(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  rank_position integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Scores, forecasts, decisions
-- ---------------------------------------------------------------------------

CREATE TABLE score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  country_pack_id uuid REFERENCES country_packs(id) ON DELETE SET NULL,
  score_key text NOT NULL,
  score_value numeric(8,2) NOT NULL,
  confidence_score numeric(5,2),
  template_version integer,
  freshness_timestamp timestamptz,
  contributors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  explanation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE forecast_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  forecast_key text NOT NULL,
  horizon_months integer NOT NULL,
  scenario_key text NOT NULL,
  forecast_value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  lower_bound_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  upper_bound_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(5,2),
  model_version text,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  limitations_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE investment_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  investor_profile_id uuid REFERENCES investor_profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  verdict text NOT NULL,
  confidence_score numeric(5,2),
  thesis_summary text,
  objections_summary text,
  change_conditions_summary text,
  decision_source text NOT NULL DEFAULT 'system',
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Events and intelligence
-- ---------------------------------------------------------------------------

CREATE TABLE event_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_source_id uuid REFERENCES event_sources(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  occurred_at timestamptz,
  published_at timestamptz,
  severity text NOT NULL,
  confidence numeric(5,2),
  raw_event_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE event_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  impact_domain text NOT NULL,
  impact_direction text NOT NULL,
  impact_magnitude numeric(6,2),
  confidence_score numeric(5,2),
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE daily_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  brief_date date NOT NULL,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, brief_date)
);

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------

CREATE TABLE portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_currency char(3) NOT NULL,
  portfolio_type text NOT NULL DEFAULT 'core',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portfolio_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  acquisition_date date NOT NULL,
  acquisition_price numeric(14,2) NOT NULL,
  acquisition_currency char(3) NOT NULL,
  ownership_share_pct numeric(5,2) NOT NULL DEFAULT 100.00,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE financing_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_position_id uuid NOT NULL REFERENCES portfolio_positions(id) ON DELETE CASCADE,
  lender_name text NOT NULL,
  loan_type text NOT NULL,
  principal_amount numeric(14,2) NOT NULL,
  currency char(3) NOT NULL,
  interest_rate_type text NOT NULL,
  interest_rate_value numeric(8,4) NOT NULL,
  term_months integer NOT NULL,
  ltv_at_origination numeric(5,2),
  start_date date,
  maturity_date date,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cash_flow_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_position_id uuid NOT NULL REFERENCES portfolio_positions(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  entry_type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  currency char(3) NOT NULL,
  description text,
  source_type text,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Documents and extraction
-- ---------------------------------------------------------------------------

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  document_type text NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extractor_version text NOT NULL,
  fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_items_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_spans_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Async jobs and AI runs
-- ---------------------------------------------------------------------------

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  progress_pct integer NOT NULL DEFAULT 0,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_ref_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  model_provider text NOT NULL,
  model_name text NOT NULL,
  prompt_version text NOT NULL,
  input_ref_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_ref_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  cost_estimate numeric(12,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_workspaces_organization_id ON workspaces (organization_id);
CREATE INDEX idx_cities_country_id ON cities (country_id);
CREATE INDEX idx_districts_city_id ON districts (city_id);
CREATE INDEX idx_micro_markets_district_id ON micro_markets (district_id);
CREATE INDEX idx_projects_city_id ON projects (city_id);
CREATE INDEX idx_buildings_city_id ON buildings (city_id);
CREATE INDEX idx_buildings_district_id ON buildings (district_id);
CREATE INDEX idx_properties_building_id ON properties (building_id);
CREATE INDEX idx_properties_district_id ON properties (district_id);
CREATE INDEX idx_properties_property_type ON properties (property_type);
CREATE INDEX idx_listings_property_id ON listings (property_id);
CREATE INDEX idx_listings_status_listed_at ON listings (listing_status, listed_at DESC);
CREATE INDEX idx_sale_transactions_property_id_date ON sale_transactions (property_id, transaction_date DESC);
CREATE INDEX idx_sale_transactions_building_id_date ON sale_transactions (building_id, transaction_date DESC);
CREATE INDEX idx_rental_transactions_property_id_date ON rental_transactions (property_id, contract_start_date DESC);
CREATE INDEX idx_service_charge_records_building_year ON service_charge_records (building_id, effective_year DESC);
CREATE INDEX idx_score_snapshots_entity_key_date ON score_snapshots (entity_type, entity_id, score_key, generated_at DESC);
CREATE INDEX idx_forecast_snapshots_entity_key_horizon ON forecast_snapshots (entity_type, entity_id, forecast_key, horizon_months, generated_at DESC);
CREATE INDEX idx_events_type_date ON events (event_type, occurred_at DESC);
CREATE INDEX idx_event_impacts_entity ON event_impacts (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_portfolio_positions_portfolio_id ON portfolio_positions (portfolio_id);
CREATE INDEX idx_cash_flow_entries_position_date ON cash_flow_entries (portfolio_position_id, entry_date DESC);
CREATE INDEX idx_jobs_workspace_status ON jobs (workspace_id, status, created_at DESC);

CREATE INDEX idx_countries_geom ON countries USING GIST (geom);
CREATE INDEX idx_cities_geom ON cities USING GIST (geom);
CREATE INDEX idx_districts_geom ON districts USING GIST (geom);
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX idx_properties_geom ON properties USING GIST (geom);

-- ---------------------------------------------------------------------------
-- Updated-at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_workspaces_updated_at
BEFORE UPDATE ON workspaces
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_country_packs_updated_at
BEFORE UPDATE ON country_packs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_city_packs_updated_at
BEFORE UPDATE ON city_packs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_source_packs_updated_at
BEFORE UPDATE ON source_packs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_countries_updated_at
BEFORE UPDATE ON countries
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cities_updated_at
BEFORE UPDATE ON cities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_districts_updated_at
BEFORE UPDATE ON districts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_micro_markets_updated_at
BEFORE UPDATE ON micro_markets
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_developers_updated_at
BEFORE UPDATE ON developers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_buildings_updated_at
BEFORE UPDATE ON buildings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_properties_updated_at
BEFORE UPDATE ON properties
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_listing_sources_updated_at
BEFORE UPDATE ON listing_sources
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_listings_updated_at
BEFORE UPDATE ON listings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_investor_profiles_updated_at
BEFORE UPDATE ON investor_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_saved_searches_updated_at
BEFORE UPDATE ON saved_searches
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shortlists_updated_at
BEFORE UPDATE ON shortlists
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_portfolios_updated_at
BEFORE UPDATE ON portfolios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_portfolio_positions_updated_at
BEFORE UPDATE ON portfolio_positions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_financing_facilities_updated_at
BEFORE UPDATE ON financing_facilities
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
