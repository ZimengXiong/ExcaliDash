const OIDC_LOGOUT_MARKER = 'excalidash-oidc-explicit-logout';

export const suppressOidcAutoLogin = (): void => {
  sessionStorage.setItem(OIDC_LOGOUT_MARKER, '1');
};

export const clearOidcAutoLoginSuppression = (): void => {
  sessionStorage.removeItem(OIDC_LOGOUT_MARKER);
};

export const isOidcAutoLoginSuppressed = (): boolean =>
  sessionStorage.getItem(OIDC_LOGOUT_MARKER) === '1';
