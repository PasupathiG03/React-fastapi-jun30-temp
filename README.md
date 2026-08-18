# AI Report Platform

## Backend

### Run Server

```bash
cd backend

# Development (auto-reload on file changes) — default
./scripts/run.sh

# or explicitly
./scripts/run.sh dev

# Production (4 workers, no reload)
./scripts/run.sh prod
```

### Database Migrations

```bash
cd backend

# Apply all pending migrations
./scripts/db_migrate.sh upgrade

# Generate a new migration after model changes
./scripts/db_migrate.sh revision "add_reports_table"

# Roll back 1 migration
./scripts/db_migrate.sh downgrade

# Roll back 3 migrations
./scripts/db_migrate.sh downgrade -3

# Check current version
./scripts/db_migrate.sh current

# View full history
./scripts/db_migrate.sh history
```

### Create a User

```bash
cd backend
python scripts/create_user.py
```
