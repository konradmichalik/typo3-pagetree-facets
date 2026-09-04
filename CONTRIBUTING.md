# Contributing

Thank you for considering contributing to this project! Every contribution is welcome and helps improve the quality of the project. To ensure a smooth process and maintain high code quality, please follow the steps below.

## Requirements

- [DDEV](https://ddev.readthedocs.io/en/stable/)

## Preparation

```bash
# Clone repository
git clone https://github.com/konradmichalik/typo3-pagetree-facets.git
cd typo3-pagetree-facets

# Start the project with DDEV
ddev start

# Install dependencies
ddev composer install
```

## Run linters

```bash
# All linters
ddev cgl lint

# Specific linters
ddev cgl lint:composer
ddev cgl lint:editorconfig
ddev cgl lint:php

# Fix all CGL issues
ddev cgl fix

# Fix specific CGL issues
ddev cgl fix:composer
ddev cgl fix:editorconfig
ddev cgl fix:php
```

## Run static code analysis

```bash
# All static code analyzers
ddev cgl sca

# Specific static code analyzers
ddev cgl sca:php
```

## Run tests

The test suite has three layers: PHPUnit (unit + functional), Vitest (JavaScript
unit tests, jsdom), and Playwright (end-to-end, against a running ddev instance).

```bash
# Unit tests
ddev composer test:unit

# Functional tests
ddev composer test:functional

# Unit tests with code coverage
ddev composer test:coverage
```

```bash
# JavaScript unit tests
ddev npm ci                      # first time only
ddev npm run test:js
ddev npm run test:js:coverage
```

End-to-end tests need the TYPO3 instance from the section below and must run
**inside** the container:

```bash
ddev exec npm ci                                     # first time only
ddev exec sudo npx playwright install-deps chromium  # after every container rebuild
ddev exec npx playwright install chromium            # after every container rebuild
ddev exec npx playwright test                        # whole E2E suite (against v14)
ddev exec npx playwright test Tests/Playwright/tests/toolbar.spec.ts
ddev exec env TYPO3_VERSION=13 npx playwright test    # against the v13 instance
```

Chromium and its system libraries are installed into the container's own
filesystem rather than a mounted volume, so `ddev restart` discards them and both
steps have to be repeated — the symptom is
`browserType.launch: Executable doesn't exist`. Adding the libraries to
`webimage_extra_packages` in `.ddev/config.yaml` would make them survive, at the
cost of installing them for everyone who never runs the E2E suite.

## TYPO3 Setup

For testing the extension in a running backend, you need to set up the TYPO3 instance.

```bash
# Install a supported TYPO3 version
ddev install 14
ddev install 13

# Install both at once
ddev install all

# Open the overview page
ddev launch

# Run TYPO3 specific commands
ddev 14 typo3 cache:flush
ddev 14 composer install
ddev all typo3 database:updateschema
```

## Submit a pull request

After completing your work, **open a pull request** and provide a description of your changes. Ideally, your PR should reference an issue that explains the problem you are addressing.

All mentioned code quality tools will run automatically on every pull request. For more details, see the relevant [workflows][1].

[1]: .github/workflows
