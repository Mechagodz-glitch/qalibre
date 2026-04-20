import { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '../../environments/environment';
import { getAuthStorageItem } from './auth.storage';

const authTokenStorageKey = 'qalibre.auth.idToken';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const token = getAuthStorageItem(authTokenStorageKey)?.trim();
  if (!token) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    }),
  );
};
