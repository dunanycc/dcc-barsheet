import type { OAuthConfig } from "@auth/core/providers";

export type YahooProfile = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export function Yahoo(options: { clientId?: string; clientSecret?: string } = {}): OAuthConfig<YahooProfile> {
  return {
    id: "yahoo",
    name: "Yahoo",
    type: "oidc",
    issuer: "https://api.login.yahoo.com",
    authorization: { params: { scope: "openid email profile" } },
    client: { token_endpoint_auth_method: "client_secret_post" },
    checks: ["pkce", "state", "nonce"],
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    profile(profile) {
      return {
        id: profile.sub,
        email: profile.email,
        name: profile.name || [profile.given_name, profile.family_name].filter(Boolean).join(" ") || profile.email,
        image: profile.picture,
      };
    },
  };
}
