import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureReady();

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: {
        returnUrl: state.url,
      },
    });
  }

  if (route.data['adminOnly'] === true && !auth.isAdmin()) {
    return router.createUrlTree(['/login'], {
      queryParams: {
        reason: 'forbidden',
      },
    });
  }

  const pageKey = route.data['pageKey'] as string | undefined;
  if (pageKey && !auth.canAccessPage(pageKey)) {
    return router.createUrlTree(['/login'], {
      queryParams: {
        reason: 'forbidden',
      },
    });
  }

  return true;
};
