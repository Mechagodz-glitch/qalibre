function resolveApiBaseUrl() {
  return '/api';
}

export const environment = {
  production: false,
  apiBaseUrl: resolveApiBaseUrl(),
};
