export const ALL_SCOPES = ['customers:read', 'customers:write', 'customers:delete'];

export function loadConfig(env = process.env) {
  return {
    port: Number(env.API_PORT || 3000),
    jwtSecret: env.JWT_SECRET || 'dev-only-secret-change-me',
    jwtExpiresIn: env.JWT_EXPIRES_IN || '1h',
    mongoUri: env.MONGODB_URI || '',
    mongoDb: env.MONGODB_DB || 'crm_copilot',
    rateLimit: {
      windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60_000),
      max: Number(env.RATE_LIMIT_MAX || 60),
      loginMax: Number(env.LOGIN_RATE_LIMIT_MAX || 10),
    },
    // Service tokens: machine identities with least-privilege scopes.
    // The MCP server gets read+write only; deleting requires the admin token.
    serviceTokens: [
      {
        name: 'mcp-server',
        token: env.MCP_SERVICE_TOKEN || 'dev-mcp-token',
        scopes: ['customers:read', 'customers:write'],
      },
      {
        name: 'admin-service',
        token: env.ADMIN_SERVICE_TOKEN || 'dev-admin-token',
        scopes: ALL_SCOPES,
      },
    ],
    users: [
      { username: 'admin', password: env.ADMIN_PASSWORD || 'admin123', role: 'admin' },
      { username: 'viewer', password: env.VIEWER_PASSWORD || 'viewer123', role: 'viewer' },
    ],
    roleScopes: {
      admin: ALL_SCOPES,
      viewer: ['customers:read'],
    },
  };
}
