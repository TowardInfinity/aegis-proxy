# NextGen Guardians portal

SecOps UI for the NextGen Guardians proxy. The dev server listens on port 3000.

It proxies `/admin` to `127.0.0.1:8081` and adds `Authorization: Bearer $AEGIS_ADMIN_TOKEN`. `/v1` and `/healthz` go to `localhost:8080`. The token never enters browser code.

Start the proxy with the same `GUARDRAIL_ADMIN_TOKEN`, then run this from `web/portal`:

`AEGIS_ADMIN_TOKEN=demo-admin pnpm dev`
