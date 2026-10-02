{{/* Bundled PostgreSQL renders only when enabled and no external database is configured. */}}
{{- define "postgresql.shouldRender" -}}
{{- $ext := (.Values.global | default dict).externalDatabase | default dict -}}
{{- if and .Values.enabled (not $ext.url) (not $ext.existingSecret) -}}true{{- end -}}
{{- end -}}

{{- define "postgresql.fullname" -}}
{{- printf "%s-postgresql" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "postgresql.secretName" -}}
{{- default (include "postgresql.fullname" .) .Values.auth.existingSecret -}}
{{- end -}}

{{- define "postgresql.labels" -}}
app.kubernetes.io/name: postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/component: database
app.kubernetes.io/part-of: excalidash
{{- end -}}

{{- define "postgresql.selectorLabels" -}}
app.kubernetes.io/name: postgresql
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
