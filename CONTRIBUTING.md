# Contributing to ailabsaudit-tracker

Thank you for your interest in contributing!

## How to contribute

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-feature`.
3. Make your changes — follow the existing code style of the collector you're modifying.
4. Add or update tests where applicable.
5. Commit with a clear message: `git commit -m "feat(wordpress): add custom event support"`.
6. Push and open a Pull Request against `main`.

## Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

feat(wordpress): add WooCommerce integration
fix(node): handle timeout on slow networks
docs(spec): clarify HMAC signing flow
```

Scopes: `wordpress`, `php`, `node`, `python`, `cloudflare`, `pixel`, `spec`, `ci`.

## Reporting issues

Open an issue with:
- Collector name and version
- WordPress / PHP / Node version (if applicable)
- Steps to reproduce
- Expected vs actual behavior

## Code style

- **PHP**: WordPress Coding Standards (WPCS)
- **JavaScript**: ESLint with Prettier
- **Python**: Black + Ruff

## Security vulnerabilities

Please report security issues privately — see [SECURITY.md](SECURITY.md).
