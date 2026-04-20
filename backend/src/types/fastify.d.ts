import 'fastify';

import type { AuthenticatedAppUser } from '../modules/auth/auth.types.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthenticatedAppUser | null;
  }
}
