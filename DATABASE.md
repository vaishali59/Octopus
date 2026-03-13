# Database Management

## Overview

The database schema is defined in `schema.sql` and is **NOT tracked by git**. This prevents issues with database state conflicts during development.

## How It Works

1. **Schema is tracked** (`schema.sql`) - All table definitions are in git
2. **Database file is ignored** (`*.db` in `.gitignore`) - The actual database is not tracked
3. **Auto-initialization** - When the app starts, `init_db()` creates the database from `schema.sql` if it doesn't exist

## Recovering from Issues

### If you messed up the database:

```bash
# Option 1: Reset to clean state (deletes all data)
python3 -c "from app import reset_db; reset_db()"

# Option 2: Manually delete and let app recreate it
rm chat_app.db
# Next time you run the app, it will auto-initialize
```

### If you messed up the code:

```bash
# Revert code changes (schema.sql is tracked)
git checkout -- .

# Reset database to match current schema
python3 -c "from app import reset_db; reset_db()"
```

## Development Workflow

1. **Make code changes** → tracked by git
2. **Make schema changes** → update `schema.sql` → tracked by git
3. **Database gets corrupted/out-of-sync** → run `reset_db()` to recreate from schema
4. **Need to go back to previous state** → `git checkout -- .` + `reset_db()`

## Important Notes

- **Development data is NOT preserved** - If you reset the database, all test data is lost
- **This is intentional** - The schema is the source of truth, not the database file
- **For production**, you would implement proper migrations instead
