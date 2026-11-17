import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { HttpError } from './errors.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest();

function hashPassword(password, salt = crypto.randomBytes(16)) {
  return { salt, hash: crypto.scryptSync(password, salt, 32) };
}

export function createAuth(config) {
  const users = config.users.map((u) => ({
    username: u.username,
    role: u.role,
    ...hashPassword(u.password),
  }));
  // Only hashes of service tokens are kept in memory; comparison is constant-time.
  const services = config.serviceTokens.map((s) => ({ ...s, digest: sha256(s.token), token: undefined }));

  function login(username, password) {
    const user = users.find((u) => u.username === username);
    // Always run scrypt to keep timing similar for unknown users.
    const candidate = crypto.scryptSync(String(password), user?.salt ?? Buffer.alloc(16), 32);
    if (!user || !crypto.timingSafeEqual(candidate, user.hash)) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const token = jwt.sign({ sub: user.username, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
      issuer: 'crm-copilot-api',
    });
    return { token, tokenType: 'Bearer', expiresIn: config.jwtExpiresIn, role: user.role };
  }

  function authenticate(req, _res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(new HttpError(401, 'Missing Bearer token'));

    const digest = sha256(token);
    const service = services.find((s) => crypto.timingSafeEqual(s.digest, digest));
    if (service) {
      req.principal = { type: 'service', name: service.name, scopes: service.scopes };
      return next();
    }
    try {
      const claims = jwt.verify(token, config.jwtSecret, { issuer: 'crm-copilot-api' });
      req.principal = {
        type: 'user',
        name: claims.sub,
        scopes: config.roleScopes[claims.role] ?? [],
      };
      return next();
    } catch {
      return next(new HttpError(401, 'Invalid or expired token'));
    }
  }

  const requireScope = (scope) => (req, _res, next) =>
    req.principal.scopes.includes(scope)
      ? next()
      : next(new HttpError(403, `Forbidden: missing scope "${scope}"`));

  return { login, authenticate, requireScope };
}
