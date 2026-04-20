const browserStorage =
  typeof window === 'undefined'
    ? null
    : {
        getItem(key: string) {
          return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
        },
        setItem(key: string, value: string) {
          window.localStorage.setItem(key, value);
          window.sessionStorage.setItem(key, value);
        },
        removeItem(key: string) {
          window.localStorage.removeItem(key);
          window.sessionStorage.removeItem(key);
        },
      };

export function getAuthStorageItem(key: string) {
  return browserStorage?.getItem(key) ?? null;
}

export function setAuthStorageItem(key: string, value: string) {
  browserStorage?.setItem(key, value);
}

export function removeAuthStorageItem(key: string) {
  browserStorage?.removeItem(key);
}
