#!/bin/sh
set -e

# If DATABASE_URL is provided, extract POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB
if [ -n "$DATABASE_URL" ]; then
    # Strip protocol (everything before ://)
    RAW="${DATABASE_URL#*://}"
    # Extract credentials (everything before @)
    CREDS="${RAW%%@*}"
    # Extract host, port, and db (everything after @)
    HOST_AND_DB="${RAW#*@}"
    
    # Extract User
    USER="${CREDS%%:*}"
    # Extract Password
    PASS="${CREDS#*:}"
    # Extract DB name (strip query params if any)
    DB_NAME="${HOST_AND_DB#*/}"
    DB_NAME="${DB_NAME%%\?*}"
    
    # URL-decode password (%40 -> @, %23 -> #, etc.)
    DECODED_PASS=$(printf '%b' "$(echo "$PASS" | sed 's/%\([0-9A-Fa-f]\{2\}\)/\\x\1/g')")
    
    export POSTGRES_USER="$USER"
    export POSTGRES_PASSWORD="$DECODED_PASS"
    export POSTGRES_DB="$DB_NAME"
fi

exec docker-entrypoint.sh "$@"

