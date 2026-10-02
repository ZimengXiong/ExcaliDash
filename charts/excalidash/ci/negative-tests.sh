#!/usr/bin/env bash
# Each case must FAIL `helm template` with the expected message. Run from the repo root.
set -u
CHART=charts/excalidash
J=ci-jwt-secret-0123456789abcdef0123456789abcdef
SEC=(--set secrets.jwtSecret=$J --set secrets.csrfSecret=c --set secrets.apiKeyHashPepper=p)
rc=0

expect_fail() {
  local want="$1"; shift
  local out
  if out=$(helm template ci "$CHART" "$@" 2>&1); then
    echo "FAIL (rendered): $want"; rc=1
  elif ! grep -qF -- "$want" <<<"$out"; then
    echo "FAIL (wrong error, wanted '$want'):"; echo "$out" | tail -3; rc=1
  else
    echo "ok: $want"
  fi
}

expect_fail "secrets are never generated"
expect_fail "not both" "${SEC[@]}" --set secrets.existingSecret=x
expect_fail "inline mode needs all" --set secrets.jwtSecret=$J
expect_fail "at least 32 characters" --set secrets.jwtSecret=short --set secrets.csrfSecret=c --set secrets.apiKeyHashPepper=p
expect_fail "oidcClientSecret is ignored" --set secrets.existingSecret=x --set secrets.oidcClientSecret=y
expect_fail "url or existingSecret, not both" "${SEC[@]}" --set global.externalDatabase.url=postgresql://a --set global.externalDatabase.existingSecret=x
expect_fail "passwords are never generated" "${SEC[@]}" --set postgresql.enabled=true
expect_fail "password or existingSecret, not both" "${SEC[@]}" --set postgresql.enabled=true --set postgresql.auth.password=abc --set postgresql.auth.existingSecret=x
expect_fail "may only contain" "${SEC[@]}" --set postgresql.enabled=true --set 'postgresql.auth.password=p@ss/word'
expect_fail "must be https://" "${SEC[@]}" --set oidc.enabled=true --set oidc.issuerUrl=https://i --set oidc.clientId=c \
  --set ingress.enabled=true --set 'ingress.hosts[0].host=a.example.com'
expect_fail "only supported with SQLite" "${SEC[@]}" --set backups.enabled=true --set global.externalDatabase.url=postgresql://a
expect_fail "requires oidc.enabled" "${SEC[@]}" --set backend.env.authMode=hybrid
expect_fail "replicaCount" "${SEC[@]}" --set backend.replicaCount=2
exit $rc
