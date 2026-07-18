import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearOidcAutoLoginSuppression,
  isOidcAutoLoginSuppressed,
  suppressOidcAutoLogin,
} from './oidcLogout';

describe('OIDC explicit logout state', () => {
  beforeEach(() => sessionStorage.clear());

  it('suppresses automatic login until the user explicitly signs in again', () => {
    expect(isOidcAutoLoginSuppressed()).toBe(false);
    suppressOidcAutoLogin();
    expect(isOidcAutoLoginSuppressed()).toBe(true);
    clearOidcAutoLoginSuppression();
    expect(isOidcAutoLoginSuppressed()).toBe(false);
  });
});
