import type { AppPageAccessKey } from './auth.constants.js';

export type AuthenticatedAppUser = {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  isActive: boolean;
  pageAccesses: AppPageAccessKey[];
  contributor: {
    id: string;
    name: string;
    roleTitle: string | null;
  } | null;
  contributorId: string | null;
  contributorName: string | null;
  accessiblePages: AppPageAccessKey[];
  isAdmin: boolean;
  lastLoginAt: string | null;
};
