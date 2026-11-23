import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import type { Clock } from './clock.ts';
import { SESSION_MS } from './clock.ts';
import { ServiceError } from './store.ts';
import type { Session, Store } from './store.ts';

export const SESSION_COOKIE = 'omokchess_session';
export function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function createSessions(store: Store, clock: Clock, config: Config) {
  function setCookie(reply: FastifyReply, token: string) {
    reply.setCookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/', maxAge: SESSION_MS / 1000 });
  }
  function authenticate(request: FastifyRequest, reply?: FastifyReply): Session | undefined {
    const token = request.cookies[SESSION_COOKIE];
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const session = store.authenticate(hashToken(token), clock.wallMs());
    if (session && reply) setCookie(reply, token);
    return session;
  }
  return {
    authenticate,
    require(request: FastifyRequest, reply?: FastifyReply): Session {
      const session = authenticate(request, reply);
      if (!session) throw new ServiceError('UNAUTHENTICATED', 401);
      return session;
    },
    create(nickname: string, reply: FastifyReply): Session {
      const token = randomBytes(32).toString('base64url');
      const session = { id: randomUUID(), nickname, expiresAt: clock.wallMs() + SESSION_MS };
      store.addSession(session.id, hashToken(token), nickname, clock.wallMs());
      setCookie(reply, token);
      return session;
    },
  };
}
