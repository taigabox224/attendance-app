import { hasMinimumRole } from '../auth/permissions.js';
import { requireAuth } from './requireAuth.js';
export function requireRole(minimum) {
    return async (req, reply) => {
        await requireAuth(req, reply);
        if (reply.sent)
            return;
        if (!req.user || !hasMinimumRole(req.user.role, minimum)) {
            reply.code(403).send({ error: 'Forbidden' });
        }
    };
}
//# sourceMappingURL=requireRole.js.map