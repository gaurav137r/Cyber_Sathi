# Supabase in GitHub Actions

The `Supabase migrations` workflow runs manually from GitHub Actions. It always
previews pending migrations first. Leave `Apply pending migrations after the
dry run` unchecked to preview only; check it only when the preview is expected
and you want to change the hosted database.

Configure these repository Actions values:

| Type | Name | Value |
| --- | --- | --- |
| Variable | `SUPABASE_PROJECT_REF` | The project ref from the Supabase project URL |
| Secret | `SUPABASE_ACCESS_TOKEN` | A Supabase personal access token scoped to this project and the required CI operations |
| Secret | `SUPABASE_DB_PASSWORD` | The hosted Postgres password for the project |

Keep the PAT and database password in GitHub Actions Secrets. Do not commit
them, put them in Actions variables, or paste them into chat. The project ref
is an identifier and can be stored as a variable.

This workflow does not deploy automatically on every push. The repository
currently has no Supabase CLI config or verified remote migration baseline, so
the first dry run must be reviewed before enabling automatic production
migrations.
