{{- define "excalidash.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "excalidash.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "excalidash.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "excalidash.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* usage: include "excalidash.selectorLabels" (dict "ctx" . "component" "backend") */}}
{{- define "excalidash.selectorLabels" -}}
app.kubernetes.io/name: {{ include "excalidash.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "excalidash.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "excalidash.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "excalidash.backendImage" -}}
{{- with .Values.image.backend -}}
{{- if .digest -}}{{ printf "%s@%s" .repository .digest }}{{- else -}}{{ printf "%s:%s" .repository (default $.Chart.AppVersion .tag) }}{{- end -}}
{{- end -}}
{{- end -}}

{{- define "excalidash.frontendImage" -}}
{{- with .Values.image.frontend -}}
{{- if .digest -}}{{ printf "%s@%s" .repository .digest }}{{- else -}}{{ printf "%s:%s" .repository (default $.Chart.AppVersion .tag) }}{{- end -}}
{{- end -}}
{{- end -}}

{{/* Database mode: external | bundled | sqlite. Fails on an unsatisfiable postgresql selection. */}}
{{- define "excalidash.dbMode" -}}
{{- $ext := .Values.global.externalDatabase -}}
{{- if or $ext.url $ext.existingSecret -}}external
{{- else if .Values.postgresql.enabled -}}bundled
{{- else if eq .Values.database.provider "postgresql" -}}
{{- fail "database.provider=postgresql requires global.externalDatabase.url/existingSecret or postgresql.enabled=true" -}}
{{- else -}}sqlite
{{- end -}}
{{- end -}}

{{- define "excalidash.secretName" -}}
{{- default (printf "%s-secrets" (include "excalidash.fullname" .)) .Values.secrets.existingSecret -}}
{{- end -}}

{{- define "excalidash.pgSecretName" -}}
{{- default (include "excalidash.pgHost" .) .Values.postgresql.auth.existingSecret -}}
{{- end -}}

{{/* Bundled PostgreSQL service name; must match "postgresql.fullname" in the subchart. */}}
{{- define "excalidash.pgHost" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "excalidash.databaseSecretName" -}}
{{- printf "%s-database" (include "excalidash.fullname" .) -}}
{{- end -}}

{{/* Public URL(s): explicit value, else every ingress host (only when ingress is enabled). */}}
{{- define "excalidash.frontendUrl" -}}
{{- if .Values.backend.env.frontendUrl -}}
{{- .Values.backend.env.frontendUrl -}}
{{- else if and .Values.ingress.enabled .Values.ingress.hosts -}}
{{- $scheme := ternary "https" "http" (not (empty .Values.ingress.tls)) -}}
{{- $urls := list -}}
{{- range .Values.ingress.hosts -}}
{{- $urls = append $urls (printf "%s://%s" $scheme .host) -}}
{{- end -}}
{{- join "," $urls -}}
{{- end -}}
{{- end -}}

{{/* First public URL; used for the OIDC redirect URI. */}}
{{- define "excalidash.primaryUrl" -}}
{{- (split "," (include "excalidash.frontendUrl" .))._0 | trim -}}
{{- end -}}

{{- define "excalidash.oidcRedirectUri" -}}
{{- if .Values.oidc.redirectUri -}}
{{- .Values.oidc.redirectUri -}}
{{- else -}}
{{- printf "%s/api/auth/oidc/callback" (include "excalidash.primaryUrl" .) -}}
{{- end -}}
{{- end -}}

{{/* Hops between the client and the backend: frontend nginx, plus the ingress when enabled. */}}
{{- define "excalidash.trustProxy" -}}
{{- $v := toString .Values.backend.env.trustProxy -}}
{{- if and (ne $v "") (ne $v "<nil>") -}}{{ $v }}{{- else if .Values.ingress.enabled -}}2{{- else -}}1{{- end -}}
{{- end -}}

{{/* Fails the render on invalid secret/database/OIDC/backup combinations. */}}
{{- define "excalidash.validate" -}}
{{- $s := .Values.secrets -}}
{{- $inline := or $s.jwtSecret $s.csrfSecret $s.apiKeyHashPepper -}}
{{- if and $s.existingSecret $inline -}}
{{- fail "secrets: set either secrets.existingSecret or the inline jwtSecret/csrfSecret/apiKeyHashPepper, not both" -}}
{{- end -}}
{{- if and $s.existingSecret $s.oidcClientSecret -}}
{{- fail "secrets.oidcClientSecret is ignored with secrets.existingSecret; put OIDC_CLIENT_SECRET in that Secret instead" -}}
{{- end -}}
{{- if not (or $s.existingSecret $inline) -}}
{{- fail "secrets: set secrets.existingSecret (JWT_SECRET, CSRF_SECRET, API_KEY_HASH_PEPPER) or inline secrets.jwtSecret, secrets.csrfSecret and secrets.apiKeyHashPepper; secrets are never generated" -}}
{{- end -}}
{{- if and (not $s.existingSecret) (not (and $s.jwtSecret $s.csrfSecret $s.apiKeyHashPepper)) -}}
{{- fail "secrets: inline mode needs all of secrets.jwtSecret, secrets.csrfSecret and secrets.apiKeyHashPepper" -}}
{{- end -}}
{{- if and $s.jwtSecret (lt (len $s.jwtSecret) 32) -}}
{{- fail "secrets.jwtSecret must be at least 32 characters (the backend refuses to start otherwise)" -}}
{{- end -}}
{{- $ext := .Values.global.externalDatabase -}}
{{- if and $ext.url $ext.existingSecret -}}
{{- fail "global.externalDatabase: set either url or existingSecret, not both" -}}
{{- end -}}
{{- $mode := include "excalidash.dbMode" . -}}
{{- if eq $mode "bundled" -}}
{{- $a := .Values.postgresql.auth -}}
{{- if and $a.password $a.existingSecret -}}
{{- fail "postgresql.auth: set either password or existingSecret, not both" -}}
{{- end -}}
{{- if not (or $a.password $a.existingSecret) -}}
{{- fail "postgresql.auth: set password or existingSecret; passwords are never generated" -}}
{{- end -}}
{{- if and $a.password (regexMatch "[^A-Za-z0-9._~-]" $a.password) -}}
{{- fail "postgresql.auth.password may only contain A-Z a-z 0-9 . _ ~ - (it is embedded in DATABASE_URL); the same applies to existingSecret values" -}}
{{- end -}}
{{- end -}}
{{- if and .Values.backups.enabled (ne $mode "sqlite") -}}
{{- fail "backups.enabled is only supported with SQLite; the backup scheduler cannot back up PostgreSQL" -}}
{{- end -}}
{{- if .Values.oidc.enabled -}}
{{- if not (and .Values.oidc.issuerUrl .Values.oidc.clientId) -}}
{{- fail "oidc.enabled=true requires oidc.issuerUrl and oidc.clientId" -}}
{{- end -}}
{{- $redirect := include "excalidash.oidcRedirectUri" . -}}
{{- if not (hasPrefix "https://" (lower $redirect)) -}}
{{- fail (printf "OIDC redirect URI %q must be https:// in production: set oidc.redirectUri, backend.env.frontendUrl or ingress.hosts with ingress.tls" $redirect) -}}
{{- end -}}
{{- end -}}
{{- if and (ne .Values.backend.env.authMode "local") (not .Values.oidc.enabled) -}}
{{- fail "backend.env.authMode other than 'local' requires oidc.enabled=true and the oidc.* values" -}}
{{- end -}}
{{- end -}}
