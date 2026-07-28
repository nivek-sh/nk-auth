export const coreSchema = {
    user: {
        fields: {
            emailVerified: "email_verified",
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    },
    session: {
        fields: {
            createdAt: "created_at",
            updatedAt: "updated_at",
            userId: "user_id",
            expiresAt: "expires_at",
            ipAddress: "ip_address",
            userAgent: "user_agent",
        },
    },
    account: {
        fields: {
            createdAt: "created_at",
            updatedAt: "updated_at",
            userId: "user_id",
            providerId: "provider_id",
            accountId: "account_id",
            refreshToken: "refresh_token",
            accessToken: "access_token",
            idToken: "id_token",
            accessTokenExpiresAt: "access_token_expires_at",
            refreshTokenExpiresAt: "refresh_token_expires_at",
        },
    },
    verification: {
        fields: {
            createdAt: "created_at",
            updatedAt: "updated_at",
            expiresAt: "expires_at",
        },
    },
} as const;

export const adminSchema = {
    user: {
        fields: {
            banReason: "ban_reason",
            banExpires: "ban_expires",
        },
    },
    session: {
        fields: {
            impersonatedBy: "impersonated_by",
        },
    },
} as const;

export const organizationSchema = {
    session: {
        fields: {
            activeOrganizationId: "active_organization_id",
        },
    },
    organization: {
        fields: {
            createdAt: "created_at",
        },
    },
    member: {
        fields: {
            organizationId: "organization_id",
            userId: "user_id",
            createdAt: "created_at",
        },
    },
    invitation: {
        fields: {
            organizationId: "organization_id",
            expiresAt: "expires_at",
            createdAt: "created_at",
            inviterId: "inviter_id",
        },
    },
} as const;

export const usernameSchema = {
    user: {
        fields: {
            username: "username",
            displayUsername: "display_username",
        },
    },
} as const;

export const jwtSchema = {
    jwks: {
        modelName: "jwks",
        fields: {
            publicKey: "public_key",
            privateKey: "private_key",
            createdAt: "created_at",
            expiresAt: "expires_at",
        },
    },
} as const;

export const oauthSchema = {
    oauthClient: {
        modelName: "oauth_client",
        fields: {
            clientId: "client_id",
            clientSecret: "client_secret",
            skipConsent: "skip_consent",
            enableEndSession: "enable_end_session",
            subjectType: "subject_type",
            userId: "user_id",
            createdAt: "created_at",
            updatedAt: "updated_at",
            softwareId: "software_id",
            softwareVersion: "software_version",
            softwareStatement: "software_statement",
            redirectUris: "redirect_uris",
            postLogoutRedirectUris: "post_logout_redirect_uris",
            tokenEndpointAuthMethod: "token_endpoint_auth_method",
            grantTypes: "grant_types",
            responseTypes: "response_types",
            requirePKCE: "require_pkce",
            referenceId: "reference_id",
        },
    },
    oauthRefreshToken: {
        modelName: "oauth_refresh_token",
        fields: {
            clientId: "client_id",
            sessionId: "session_id",
            userId: "user_id",
            referenceId: "reference_id",
            expiresAt: "expires_at",
            createdAt: "created_at",
            authTime: "auth_time",
        },
    },
    oauthAccessToken: {
        modelName: "oauth_access_token",
        fields: {
            clientId: "client_id",
            sessionId: "session_id",
            userId: "user_id",
            referenceId: "reference_id",
            refreshId: "refresh_id",
            expiresAt: "expires_at",
            createdAt: "created_at",
        },
    },
    oauthConsent: {
        modelName: "oauth_consent",
        fields: {
            clientId: "client_id",
            userId: "user_id",
            referenceId: "reference_id",
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    },
} as const;

export const twoFactorSchema = {
    user: {
        fields: {
            twoFactorEnabled: "two_factor_enabled",
        },
    },
    twoFactor: {
        modelName: "two_factor",
        fields: {
            userId: "user_id",
            backupCodes: "backup_codes",
        },
    },
} as const;

export const passkeySchema = {
    passkey: {
        modelName: "passkey",
        fields: {
            publicKey: "public_key",
            userId: "user_id",
            credentialID: "credential_id",
            deviceType: "device_type",
            backedUp: "backed_up",
            createdAt: "created_at",
        },
    },
} as const;
