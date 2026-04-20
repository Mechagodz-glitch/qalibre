import { HttpErrorResponse, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AuthenticationResult,
  BrowserCacheLocation,
  Configuration,
  PublicClientApplication,
} from '@azure/msal-browser';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { getAuthStorageItem, removeAuthStorageItem, setAuthStorageItem } from './auth.storage';
import type { AuthConfig, CurrentUserProfile } from './models';

const authTokenStorageKey = 'qalibre.auth.idToken';
const authReturnUrlStorageKey = 'qalibre.auth.returnUrl';
const authUserStorageKey = 'qalibre.auth.currentUser';

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function resolveAbsoluteUrl(path: string) {
  const origin = typeof window === 'undefined' ? 'http://localhost:4200' : window.location.origin;
  return new URL(path, origin).toString();
}

function getFriendlyErrorMessage(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 401) {
      return 'You are signed out or your session expired. Please sign in again.';
    }

    if (error.status === 403) {
      return (
        error.error?.message ??
        'Your Microsoft account is not enabled in QAlibre. Contact an administrator.'
      );
    }

    if (typeof error.error?.message === 'string' && error.error.message.trim()) {
      return error.error.message.trim();
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      errorCode?: unknown;
      errorMessage?: unknown;
      subError?: unknown;
      name?: unknown;
      message?: unknown;
    };

    const parts = [
      typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : '',
      typeof candidate.errorCode === 'string' && candidate.errorCode.trim() ? candidate.errorCode.trim() : '',
      typeof candidate.errorMessage === 'string' && candidate.errorMessage.trim()
        ? candidate.errorMessage.trim()
        : '',
      typeof candidate.message === 'string' && candidate.message.trim() ? candidate.message.trim() : '',
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join(': ');
    }
  }

  return 'Authentication could not be completed. Try signing in again.';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly loadingState = signal(true);
  private readonly authConfigState = signal<AuthConfig | null>(null);
  private readonly currentUserState = signal<CurrentUserProfile | null>(null);
  private readonly authErrorState = signal<string | null>(null);
  private readonly msalState = signal<PublicClientApplication | null>(null);
  private readonly initializedState = signal(false);
  private initializationPromise: Promise<void> | null = null;

  readonly loading = computed(() => this.loadingState());
  readonly initialized = computed(() => this.initializedState());
  readonly authConfig = computed(() => this.authConfigState());
  readonly currentUser = computed(() => this.currentUserState());
  readonly loginError = computed(() => this.authErrorState());
  readonly isAuthenticated = computed(() => Boolean(this.currentUserState()));
  readonly isAdmin = computed(() => this.currentUserState()?.role === 'ADMIN');

  readonly pageAccessDefinitions = computed(() => this.authConfigState()?.pageAccessDefinitions ?? []);

  async initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.loadingState.set(true);
    this.initializedState.set(false);

    this.initializationPromise = this.initializeInternal()
      .then(() => {
        this.authErrorState.set(null);
      })
      .catch((error: unknown) => {
        this.authErrorState.set(getFriendlyErrorMessage(error));
        this.initializationPromise = null;
        throw error;
      })
      .finally(() => {
        this.loadingState.set(false);
        this.initializedState.set(true);
      });

    return this.initializationPromise;
  }

  async ensureReady() {
    await this.initialize();
  }

  canAccessPage(pageKey: string) {
    const user = this.currentUserState();
    if (!user) {
      return false;
    }

    if (user.role === 'ADMIN') {
      return true;
    }

    return user.pageAccesses.includes(pageKey);
  }

  private isLocalAuthMode(config: AuthConfig | null = this.authConfigState()) {
    return !config || !config.clientId.trim() || !config.tenantId.trim() || !config.authority.trim();
  }

  async login(returnUrl = '/') {
    await this.ensureReady();
    const config = this.authConfigState();
    const instance = this.msalState();

    if (this.isLocalAuthMode(config)) {
      this.clearSession();
      this.authErrorState.set(null);
      await this.refreshCurrentUser();
      return;
    }

    if (!config || !instance) {
      throw new Error(this.authErrorState() ?? 'Authentication is not ready yet.');
    }

    await instance.clearCache().catch(() => void 0);
    this.clearSession();
    this.authErrorState.set(null);
    setAuthStorageItem(authReturnUrlStorageKey, returnUrl || '/');
    try {
      await instance.loginRedirect({
        scopes: config.scopes,
        redirectUri: resolveAbsoluteUrl(config.redirectPath),
        prompt: 'select_account',
      });
    } catch (error) {
      throw new Error(getFriendlyErrorMessage(error));
    }
  }

  async logout() {
    await this.ensureReady();
    const instance = this.msalState();

    this.clearSession();
    this.authErrorState.set(null);

    if (this.isLocalAuthMode()) {
      this.currentUserState.set(null);
      return;
    }

    if (instance) {
      await instance.clearCache().catch(() => void 0);
      instance.setActiveAccount(null);
    }
  }

  consumeReturnUrl() {
    const returnUrl = getAuthStorageItem(authReturnUrlStorageKey)?.trim();
    removeAuthStorageItem(authReturnUrlStorageKey);
    return returnUrl || '/';
  }

  setLoginError(message: string | null) {
    this.authErrorState.set(message);
  }

  async completeRedirect() {
    await this.ensureReady();
    const instance = this.msalState();

    if (this.isLocalAuthMode()) {
      this.authErrorState.set(null);
      if (!this.currentUserState()) {
        await this.refreshCurrentUser();
      }
      return this.currentUserState();
    }

    if (!instance) {
      throw new Error('Authentication is not ready yet.');
    }

    let result: AuthenticationResult | null;
    try {
      result = await instance.handleRedirectPromise();
    } catch (error) {
      throw new Error(getFriendlyErrorMessage(error));
    }
    if (result?.account) {
      instance.setActiveAccount(result.account);
    }

    if (result?.idToken) {
      this.storeIdToken(result.idToken);
    }

    if (result?.idToken || this.getStoredIdToken()) {
      try {
        return await this.refreshCurrentUser();
      } catch (error) {
        this.clearSession();
        throw error;
      }
    }

    if (this.currentUserState()) {
      return this.currentUserState();
    }

    return null;
  }

  async refreshCurrentUser() {
    await this.ensureReady();
    return this.fetchCurrentUser();
  }

  private async fetchCurrentUser() {
    try {
      const response = await firstValueFrom(
        this.http.get<{ user: CurrentUserProfile }>(`${stripTrailingSlash(environment.apiBaseUrl)}/auth/me`),
      );
      this.currentUserState.set(response.user);
      this.storeCurrentUser(response.user);
      return response.user;
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        throw error;
      }

      throw new Error(getFriendlyErrorMessage(error));
    }
  }

  async getCurrentUserOrNull() {
    await this.ensureReady();
    return this.currentUserState();
  }

  getAccessToken() {
    return this.getStoredIdToken();
  }

  private async initializeInternal() {
    const config = await firstValueFrom(
      this.http.get<AuthConfig>(`${stripTrailingSlash(environment.apiBaseUrl)}/auth/config`),
    );
    this.authConfigState.set(config);

    if (this.isLocalAuthMode(config)) {
      this.msalState.set(null);
      await this.fetchCurrentUser();
      return;
    }

    const instance = new PublicClientApplication(this.toMsalConfig(config));
    await instance.initialize();
    this.msalState.set(instance);

    const cachedAccount = instance.getAllAccounts()[0] ?? null;
    if (cachedAccount) {
      instance.setActiveAccount(cachedAccount);
    }

    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/auth/callback')) {
      return;
    }

    const storedUser = this.getStoredCurrentUser();
    if (storedUser) {
      this.currentUserState.set(storedUser);
    }

    const storedToken = this.getStoredIdToken();
    if (storedToken) {
      try {
        await this.fetchCurrentUser();
        return;
      } catch (error) {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.clearSession();
          return;
        }

        if (storedUser) {
          this.authErrorState.set(getFriendlyErrorMessage(error));
          return;
        }

        this.authErrorState.set(getFriendlyErrorMessage(error));
      }
    }

    if (cachedAccount) {
      try {
        const authResult = await instance.acquireTokenSilent({
          account: cachedAccount,
          scopes: config.scopes,
          redirectUri: resolveAbsoluteUrl(config.redirectPath),
        });

        if (authResult.idToken) {
          this.storeIdToken(authResult.idToken);
          await this.refreshCurrentUser();
        }
        return;
      } catch (error) {
        if (storedUser && !(error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403))) {
          this.authErrorState.set(getFriendlyErrorMessage(error));
          return;
        }

        this.clearSession();
      }
    }

    this.authErrorState.set(null);
  }

  private toMsalConfig(config: AuthConfig): Configuration {
    return {
      auth: {
        clientId: config.clientId,
        authority: config.authority,
        redirectUri: resolveAbsoluteUrl(config.redirectPath),
        postLogoutRedirectUri: resolveAbsoluteUrl(config.postLogoutRedirectPath),
        navigateToLoginRequestUrl: false,
      },
      cache: {
        cacheLocation: BrowserCacheLocation.SessionStorage,
        storeAuthStateInCookie: false,
      },
    };
  }

  private clearSession() {
    removeAuthStorageItem(authTokenStorageKey);
    removeAuthStorageItem(authReturnUrlStorageKey);
    removeAuthStorageItem(authUserStorageKey);
    this.currentUserState.set(null);
    const instance = this.msalState();
    if (instance) {
      instance.setActiveAccount(null);
    }
  }

  private getStoredIdToken() {
    return getAuthStorageItem(authTokenStorageKey)?.trim() || '';
  }

  private storeIdToken(token: string) {
    setAuthStorageItem(authTokenStorageKey, token);
  }

  private getStoredCurrentUser() {
    const raw = getAuthStorageItem(authUserStorageKey)?.trim();
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as CurrentUserProfile;
    } catch {
      return null;
    }
  }

  private storeCurrentUser(user: CurrentUserProfile) {
    setAuthStorageItem(authUserStorageKey, JSON.stringify(user));
  }
}
