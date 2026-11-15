# 🤝 Contributing

Thanks for helping! Bug reports, ideas, docs fixes and code are all welcome.

## Before you start
- Look through the [issues](https://github.com/nexoradev-stack/Custom-Email-Template-Builder-Gmail/issues) first. For anything bigger than a small fix, open an issue to talk it through.
- Please be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Run it locally
```bash
cd engine
npm ci
npm test            # unit tests (node:test)
```
The engine needs Google Cloud (Firestore, Cloud Storage) to run fully. Most work on the pipeline, blocks and editors can be tested with the unit tests and by opening the pages with sample data.

## Pull requests
1. Fork, then branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep changes focused, and add or update tests for engine logic.
3. `npm test` must pass. CI runs it on every pull request.
4. Explain **what** changed and **why** in the description, with a screenshot for anything visual.

## Style
- Plain JavaScript (Node 20 on the server, ES5-style browser scripts in `*.client.js`), no build step.
- Messages people see should be short, friendly and say what to do next.
- Never commit `env.yaml`, keys, tokens or real company data.
