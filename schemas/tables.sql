CREATE TABLE "user" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" BOOLEAN NOT NULL,
  "image" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "role" TEXT,
  "banned" BOOLEAN,
  "ban_reason" TEXT,
  "ban_expires" TIMESTAMPTZ,
  "username" TEXT UNIQUE,
  "display_username" TEXT,
  "two_factor_enabled" BOOLEAN,
  "phone" TEXT,
  "plan" TEXT
);
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "impersonated_by" TEXT,
  "active_organization_id" TEXT
);
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "account" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMPTZ,
  "refresh_token_expires_at" TIMESTAMPTZ,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "verification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "organization" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "logo" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL,
  "metadata" TEXT
);
ALTER TABLE "organization" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "member" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "role" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL
);
ALTER TABLE "member" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "invitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organization" ("id") ON DELETE CASCADE,
  "email" TEXT NOT NULL,
  "role" TEXT,
  "status" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "inviter_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);
ALTER TABLE "invitation" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "jwks" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "public_key" TEXT NOT NULL,
  "private_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "expires_at" TIMESTAMPTZ
);
ALTER TABLE "jwks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "oauth_client" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL UNIQUE,
  "client_secret" TEXT,
  "disabled" BOOLEAN,
  "skip_consent" BOOLEAN,
  "enable_end_session" BOOLEAN,
  "subject_type" TEXT,
  "scopes" JSONB,
  "user_id" TEXT REFERENCES "user" ("id") ON DELETE CASCADE,
  "created_at" TIMESTAMPTZ,
  "updated_at" TIMESTAMPTZ,
  "name" TEXT,
  "uri" TEXT,
  "icon" TEXT,
  "contacts" JSONB,
  "tos" TEXT,
  "policy" TEXT,
  "software_id" TEXT,
  "software_version" TEXT,
  "software_statement" TEXT,
  "redirect_uris" JSONB NOT NULL,
  "post_logout_redirect_uris" JSONB,
  "token_endpoint_auth_method" TEXT,
  "grant_types" JSONB,
  "response_types" JSONB,
  "public" BOOLEAN,
  "type" TEXT,
  "require_pkce" BOOLEAN,
  "reference_id" TEXT,
  "metadata" JSONB
);
ALTER TABLE "oauth_client" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "oauth_refresh_token" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("client_id") ON DELETE CASCADE,
  "session_id" TEXT REFERENCES "session" ("id") ON DELETE SET NULL,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "reference_id" TEXT,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "revoked" TIMESTAMPTZ,
  "auth_time" TIMESTAMPTZ,
  "scopes" JSONB NOT NULL
);
ALTER TABLE "oauth_refresh_token" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "oauth_access_token" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("client_id") ON DELETE CASCADE,
  "session_id" TEXT REFERENCES "session" ("id") ON DELETE SET NULL,
  "user_id" TEXT REFERENCES "user" ("id") ON DELETE CASCADE,
  "reference_id" TEXT,
  "refresh_id" TEXT REFERENCES "oauth_refresh_token" ("id") ON DELETE CASCADE,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "scopes" JSONB NOT NULL
);
ALTER TABLE "oauth_access_token" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "oauth_consent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "client_id" TEXT NOT NULL REFERENCES "oauth_client" ("client_id") ON DELETE CASCADE,
  "user_id" TEXT REFERENCES "user" ("id") ON DELETE CASCADE,
  "reference_id" TEXT,
  "scopes" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL
);
ALTER TABLE "oauth_consent" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "two_factor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "secret" TEXT NOT NULL,
  "backup_codes" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "verified" BOOLEAN
);
ALTER TABLE "two_factor" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "passkey" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT,
  "public_key" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "credential_id" TEXT NOT NULL,
  "counter" INTEGER NOT NULL,
  "device_type" TEXT NOT NULL,
  "backed_up" BOOLEAN NOT NULL,
  "transports" TEXT,
  "created_at" TIMESTAMPTZ,
  "aaguid" TEXT
);
ALTER TABLE "passkey" ENABLE ROW LEVEL SECURITY;

CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" ("slug");
CREATE INDEX "member_organization_id_idx" ON "member" ("organization_id");
CREATE INDEX "member_user_id_idx" ON "member" ("user_id");
CREATE INDEX "invitation_organization_id_idx" ON "invitation" ("organization_id");
CREATE INDEX "invitation_email_idx" ON "invitation" ("email");
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" ("user_id");
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" ("client_id");
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" ("session_id");
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" ("user_id");
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" ("client_id");
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token" ("session_id");
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" ("user_id");
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" ("refresh_id");
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" ("client_id");
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" ("user_id");
CREATE INDEX "two_factor_secret_idx" ON "two_factor" ("secret");
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" ("user_id");
CREATE INDEX "passkey_user_id_idx" ON "passkey" ("user_id");
CREATE INDEX "passkey_credential_id_idx" ON "passkey" ("credential_id");
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" ("provider_id", "account_id");
CREATE INDEX "session_expires_at_idx" ON "session" ("expires_at");
CREATE INDEX "user_phone_idx" ON "user" ("phone");
