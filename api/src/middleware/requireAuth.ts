import type { FastifyReply, FastifyRequest } from 'fastify';
import { COOKIE_NAME, verifyToken, type JwtPayload } from '../auth/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[COOKIE_NAME];
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  try {
    req.user = verifyToken(token);
  } catch {
    reply.code(401).send({ error: 'Invalid token' });
  }
}
