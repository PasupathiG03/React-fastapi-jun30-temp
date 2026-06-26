# AI Report Platform

## Backend

### Run Server

```bash
cd backend

# Development (auto-reload on file changes) — default
./run.sh

# or explicitly
./run.sh dev

# Production (4 workers, no reload)
./run.sh prod
```

### Database Migrations

```bash
cd backend

# Apply all pending migrations
./db_migrate.sh upgrade

# Generate a new migration after model changes
./db_migrate.sh revision "add_reports_table"

# Roll back 1 migration
./db_migrate.sh downgrade

# Roll back 3 migrations
./db_migrate.sh downgrade -3

# Check current version
./db_migrate.sh current

# View full history
./db_migrate.sh history
```

### Create a User

```bash
cd backend
python create_user.py
```
