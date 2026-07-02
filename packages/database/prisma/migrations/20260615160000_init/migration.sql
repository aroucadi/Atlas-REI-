-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan_tier" TEXT NOT NULL DEFAULT 'starter',
    "default_currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "auth_provider" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "workspace_type" TEXT NOT NULL DEFAULT 'investment',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID,
    "workspace_id" UUID,
    "actor_user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "base_currency" CHAR(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "supports_residential" BOOLEAN NOT NULL DEFAULT true,
    "supports_commercial" BOOLEAN NOT NULL DEFAULT false,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "country_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_pack_id" UUID NOT NULL,
    "city_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "city_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_packs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_pack_id" UUID NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "connector_type" TEXT NOT NULL,
    "auth_config_json" JSONB NOT NULL DEFAULT '{}',
    "mapping_config_json" JSONB NOT NULL DEFAULT '{}',
    "refresh_policy_json" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_pack_id" UUID NOT NULL,
    "score_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "formula_json" JSONB NOT NULL,
    "weighting_json" JSONB NOT NULL DEFAULT '{}',
    "missing_data_policy_json" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_pack_id" UUID NOT NULL,
    "forecast_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "model_policy_json" JSONB NOT NULL DEFAULT '{}',
    "feature_policy_json" JSONB NOT NULL DEFAULT '{}',
    "confidence_policy_json" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "countries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" CHAR(3) NOT NULL,
    "region" TEXT,
    "geom" geometry(MultiPolygon, 4326),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_id" UUID NOT NULL,
    "city_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "geom" geometry(MultiPolygon, 4326),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "districts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "city_id" UUID NOT NULL,
    "district_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district_type" TEXT NOT NULL DEFAULT 'district',
    "parent_district_id" UUID,
    "geom" geometry(MultiPolygon, 4326),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "districts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "micro_markets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "district_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "geom" geometry(MultiPolygon, 4326),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "micro_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "developers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_id" UUID,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "developer_type" TEXT,
    "website_url" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "developers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "developer_id" UUID,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "name" TEXT NOT NULL,
    "project_type" TEXT,
    "status" TEXT,
    "launch_date" DATE,
    "completion_date" DATE,
    "geom" geometry(MultiPolygon, 4326),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID,
    "developer_id" UUID,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "micro_market_id" UUID,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "building_type" TEXT,
    "status" TEXT,
    "handover_date" DATE,
    "floors_count" INTEGER,
    "unit_count" INTEGER,
    "geom" geometry(Point, 4326),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "building_id" UUID,
    "project_id" UUID,
    "city_id" UUID NOT NULL,
    "district_id" UUID,
    "country_id" UUID,
    "external_property_ref" TEXT,
    "property_type" TEXT NOT NULL,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "interior_area_sqm" DECIMAL(12,2),
    "exterior_area_sqm" DECIMAL(12,2),
    "floor_number" INTEGER,
    "tenure_type" TEXT,
    "ownership_type" TEXT,
    "furnishing_status" TEXT,
    "occupancy_status" TEXT,
    "geom" geometry(Point, 4326),
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "country_pack_id" UUID,
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID,
    "listing_source_id" UUID NOT NULL,
    "external_listing_id" TEXT NOT NULL,
    "listing_type" TEXT NOT NULL,
    "listing_status" TEXT NOT NULL,
    "url" TEXT,
    "price_amount" DECIMAL(14,2),
    "price_currency" CHAR(3),
    "rent_frequency" TEXT,
    "listed_at" TIMESTAMPTZ,
    "removed_at" TIMESTAMPTZ,
    "broker_name" TEXT,
    "broker_company" TEXT,
    "raw_attributes_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "media_type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID,
    "building_id" UUID,
    "district_id" UUID,
    "source_name" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "price_amount" DECIMAL(14,2) NOT NULL,
    "price_currency" CHAR(3) NOT NULL,
    "price_per_sqm" DECIMAL(14,2),
    "buyer_type" TEXT,
    "seller_type" TEXT,
    "is_new_sale" BOOLEAN,
    "is_off_plan" BOOLEAN,
    "source_record_id" TEXT,
    "source_confidence" DECIMAL(5,2),
    "raw_record_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "property_id" UUID,
    "building_id" UUID,
    "district_id" UUID,
    "contract_start_date" DATE,
    "contract_end_date" DATE,
    "annual_rent_amount" DECIMAL(14,2) NOT NULL,
    "rent_currency" CHAR(3) NOT NULL,
    "rent_frequency" TEXT,
    "source_name" TEXT NOT NULL,
    "source_record_id" TEXT,
    "source_confidence" DECIMAL(5,2),
    "raw_record_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_charge_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "building_id" UUID NOT NULL,
    "effective_year" INTEGER NOT NULL,
    "charge_per_sqm" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_record_id" TEXT,
    "confidence" DECIMAL(5,2),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_charge_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_name" TEXT NOT NULL,
    "source_entity_type" TEXT NOT NULL,
    "source_record_id" TEXT NOT NULL,
    "raw_storage_path" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "source_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_source_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "source_record_id" UUID NOT NULL,
    "mapping_confidence" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_source_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_freshness" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_name" TEXT NOT NULL,
    "market_scope" TEXT,
    "entity_scope" TEXT,
    "last_success_at" TIMESTAMPTZ,
    "last_attempt_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "notes" TEXT,

    CONSTRAINT "data_freshness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "capital_available" DECIMAL(14,2) NOT NULL,
    "risk_tolerance" TEXT NOT NULL,
    "investment_horizon_months" INTEGER NOT NULL,
    "income_vs_growth_preference" TEXT NOT NULL,
    "financing_preference" TEXT NOT NULL,
    "target_countries_json" JSONB NOT NULL DEFAULT '[]',
    "constraints_json" JSONB NOT NULL DEFAULT '{}',
    "goals_json" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "investor_profile_id" UUID,
    "name" TEXT NOT NULL,
    "filters_json" JSONB NOT NULL DEFAULT '{}',
    "alert_policy_json" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "investor_profile_id" UUID,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shortlist_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "rank_position" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "country_pack_id" UUID,
    "score_key" TEXT NOT NULL,
    "score_value" DECIMAL(8,2) NOT NULL,
    "confidence_score" DECIMAL(5,2),
    "template_version" INTEGER,
    "freshness_timestamp" TIMESTAMPTZ,
    "contributors_json" JSONB NOT NULL DEFAULT '[]',
    "variables_json" JSONB NOT NULL DEFAULT '{}',
    "explanation_json" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "forecast_key" TEXT NOT NULL,
    "horizon_months" INTEGER NOT NULL,
    "scenario_key" TEXT NOT NULL,
    "forecast_value_json" JSONB NOT NULL DEFAULT '{}',
    "lower_bound_json" JSONB NOT NULL DEFAULT '{}',
    "upper_bound_json" JSONB NOT NULL DEFAULT '{}',
    "confidence_score" DECIMAL(5,2),
    "model_version" TEXT,
    "features_json" JSONB NOT NULL DEFAULT '{}',
    "limitations_json" JSONB NOT NULL DEFAULT '{}',
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "investor_profile_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence_score" DECIMAL(5,2),
    "thesis_summary" TEXT,
    "objections_summary" TEXT,
    "change_conditions_summary" TEXT,
    "decision_source" TEXT NOT NULL DEFAULT 'system',
    "approved_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_run_id" UUID,
    "underwrite_run_id" UUID,

    CONSTRAINT "investment_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_source_id" UUID,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ,
    "published_at" TIMESTAMPTZ,
    "severity" TEXT NOT NULL,
    "confidence" DECIMAL(5,2),
    "raw_event_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_impacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "impact_domain" TEXT NOT NULL,
    "impact_direction" TEXT NOT NULL,
    "impact_magnitude" DECIMAL(6,2),
    "confidence_score" DECIMAL(5,2),
    "rationale" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_briefs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "brief_date" DATE NOT NULL,
    "summary_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "portfolio_type" TEXT NOT NULL DEFAULT 'core',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_id" UUID NOT NULL,
    "property_id" UUID,
    "acquisition_date" DATE NOT NULL,
    "acquisition_price" DECIMAL(14,2) NOT NULL,
    "acquisition_currency" CHAR(3) NOT NULL,
    "ownership_share_pct" DECIMAL(5,2) NOT NULL DEFAULT 100.00,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financing_facilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_position_id" UUID NOT NULL,
    "lender_name" TEXT NOT NULL,
    "loan_type" TEXT NOT NULL,
    "principal_amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "interest_rate_type" TEXT NOT NULL,
    "interest_rate_value" DECIMAL(8,4) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "ltv_at_origination" DECIMAL(5,2),
    "start_date" DATE,
    "maturity_date" DATE,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financing_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_flow_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "portfolio_position_id" UUID NOT NULL,
    "entry_date" DATE NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" TEXT,
    "source_type" TEXT,
    "source_reference" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flow_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_user_id" UUID,
    "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_extractions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "extractor_version" TEXT NOT NULL,
    "fields_json" JSONB NOT NULL DEFAULT '{}',
    "confidence_json" JSONB NOT NULL DEFAULT '{}',
    "missing_items_json" JSONB NOT NULL DEFAULT '[]',
    "source_spans_json" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "job_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "input_json" JSONB NOT NULL DEFAULT '{}',
    "result_ref_json" JSONB NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID,
    "job_type" TEXT NOT NULL,
    "model_provider" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_ref_json" JSONB NOT NULL DEFAULT '{}',
    "output_ref_json" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "error_message" TEXT,
    "cost_estimate" DECIMAL(12,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "underwrite_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "assumptions_json" JSONB NOT NULL DEFAULT '{}',
    "metrics_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "underwrite_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key" ON "organization_memberships"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "country_packs_country_code_key" ON "country_packs"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "city_packs_country_pack_id_city_code_key" ON "city_packs"("country_pack_id", "city_code");

-- CreateIndex
CREATE UNIQUE INDEX "source_packs_country_pack_id_source_name_key" ON "source_packs"("country_pack_id", "source_name");

-- CreateIndex
CREATE UNIQUE INDEX "score_templates_country_pack_id_score_key_version_key" ON "score_templates"("country_pack_id", "score_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_templates_country_pack_id_forecast_key_version_key" ON "forecast_templates"("country_pack_id", "forecast_key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "countries_country_code_key" ON "countries"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "cities_country_id_city_code_key" ON "cities"("country_id", "city_code");

-- CreateIndex
CREATE UNIQUE INDEX "districts_city_id_district_code_key" ON "districts"("city_id", "district_code");

-- CreateIndex
CREATE UNIQUE INDEX "micro_markets_district_id_name_key" ON "micro_markets"("district_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "listing_sources_name_key" ON "listing_sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "listings_listing_source_id_external_listing_id_key" ON "listings"("listing_source_id", "external_listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_charge_records_building_id_effective_year_source_na_key" ON "service_charge_records"("building_id", "effective_year", "source_name");

-- CreateIndex
CREATE UNIQUE INDEX "source_records_source_name_source_entity_type_source_record_key" ON "source_records"("source_name", "source_entity_type", "source_record_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_freshness_source_name_market_scope_entity_scope_key" ON "data_freshness"("source_name", "market_scope", "entity_scope");

-- CreateIndex
CREATE UNIQUE INDEX "event_sources_name_key" ON "event_sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "daily_briefs_workspace_id_brief_date_key" ON "daily_briefs"("workspace_id", "brief_date");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city_packs" ADD CONSTRAINT "city_packs_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_packs" ADD CONSTRAINT "source_packs_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_templates" ADD CONSTRAINT "score_templates_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_templates" ADD CONSTRAINT "forecast_templates_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "districts" ADD CONSTRAINT "districts_parent_district_id_fkey" FOREIGN KEY ("parent_district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_markets" ADD CONSTRAINT "micro_markets_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "developers" ADD CONSTRAINT "developers_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_micro_market_id_fkey" FOREIGN KEY ("micro_market_id") REFERENCES "micro_markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_sources" ADD CONSTRAINT "listing_sources_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_listing_source_id_fkey" FOREIGN KEY ("listing_source_id") REFERENCES "listing_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_transactions" ADD CONSTRAINT "rental_transactions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_transactions" ADD CONSTRAINT "rental_transactions_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_transactions" ADD CONSTRAINT "rental_transactions_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charge_records" ADD CONSTRAINT "service_charge_records_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_source_links" ADD CONSTRAINT "entity_source_links_source_record_id_fkey" FOREIGN KEY ("source_record_id") REFERENCES "source_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_profiles" ADD CONSTRAINT "investor_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_profiles" ADD CONSTRAINT "investor_profiles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_fkey" FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_country_pack_id_fkey" FOREIGN KEY ("country_pack_id") REFERENCES "country_packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_decisions" ADD CONSTRAINT "investment_decisions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_decisions" ADD CONSTRAINT "investment_decisions_investor_profile_id_fkey" FOREIGN KEY ("investor_profile_id") REFERENCES "investor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_decisions" ADD CONSTRAINT "investment_decisions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_decisions" ADD CONSTRAINT "investment_decisions_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_decisions" ADD CONSTRAINT "investment_decisions_underwrite_run_id_fkey" FOREIGN KEY ("underwrite_run_id") REFERENCES "underwrite_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_event_source_id_fkey" FOREIGN KEY ("event_source_id") REFERENCES "event_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_impacts" ADD CONSTRAINT "event_impacts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_briefs" ADD CONSTRAINT "daily_briefs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financing_facilities" ADD CONSTRAINT "financing_facilities_portfolio_position_id_fkey" FOREIGN KEY ("portfolio_position_id") REFERENCES "portfolio_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_flow_entries" ADD CONSTRAINT "cash_flow_entries_portfolio_position_id_fkey" FOREIGN KEY ("portfolio_position_id") REFERENCES "portfolio_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwrite_runs" ADD CONSTRAINT "underwrite_runs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "underwrite_runs" ADD CONSTRAINT "underwrite_runs_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

