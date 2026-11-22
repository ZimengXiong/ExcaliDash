// Bumped synchronously whenever the signed-in account changes (including in
// another tab). Deferred writes capture it and are dropped if it moved, so they
// never run under the next account's credentials.
let authSessionGeneration = 0;

export const getAuthSessionGeneration = (): number => authSessionGeneration;

export const bumpAuthSessionGeneration = (): void => {
  authSessionGeneration++;
};
