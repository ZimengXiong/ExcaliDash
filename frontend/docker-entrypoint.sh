#!/bin/sh
# Alpine-based image uses /bin/sh (busybox ash), not bash
set -e

# Set default backend URL if not provided (host:port format, no protocol)
export BACKEND_URL="${BACKEND_URL:-backend:8000}"

echo "Configuring nginx with BACKEND_URL: ${BACKEND_URL}"

# Replace only our custom placeholder and preserve nginx runtime vars like $http_upgrade
ESCAPED_BACKEND_URL=$(printf '%s\n' "$BACKEND_URL" | sed 's/[\/&]/\\&/g')
sed "s/__BACKEND_URL__/${ESCAPED_BACKEND_URL}/g" /etc/nginx/nginx.conf.template > /tmp/nginx.conf

# Validate the generated nginx configuration before starting
echo "Validating nginx configuration..."
if ! nginx -t -c /tmp/nginx.conf; then
    echo "ERROR: nginx configuration validation failed" >&2
    exit 1
fi

# Execute the main command (nginx)
exec "$@"
