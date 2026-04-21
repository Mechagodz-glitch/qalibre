import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { getAuthStorageItem } from './auth.storage';

const authTokenStorageKey = 'qalibre.auth.idToken';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const token = getAuthStorageItem(authTokenStorageKey)?.trim();
  const requestToSend = token
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : request;

  return next(requestToSend).pipe(
    catchError((error) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        auth.handleUnauthorizedSession();
      }

      return throwError(() => error);
    }),
  );
};
