import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasMinimumRole, type Role } from '../auth/permissions.js';
import { requireAuth } from './requireAuth.js';

export function requireRole(minimum: Role) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!req.user || !hasMinimumRole(req.user.role, minimum)) {
      reply.code(403).send({ error: 'Forbidden' });
    }
  };
}
