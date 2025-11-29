#!/bin/sh
set -e

# Set default backend URL if not provided
export BACKEND_URL="${BACKEND_URL:-backend:8000}"

echo "Configuring nginx with BACKEND_URL: ${BACKEND_URL}"

# Substitute environment variables in nginx config template
# Only substitute BACKEND_URL, preserve nginx variables like $http_upgrade
envsubst '${BACKEND_URL}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Execute the main command (nginx)
exec "$@"

