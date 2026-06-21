import { COOKIE_NAME, verifyToken } from '../auth/jwt.js';
export async function requireAuth(req, reply) {
    const token = req.cookies[COOKIE_NAME];
    if (!token) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
    }
    try {
        req.user = verifyToken(token);
    }
    catch {
        reply.code(401).send({ error: 'Invalid token' });
    }
}
//# sourceMappingURL=requireAuth.js.map