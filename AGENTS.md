# AGENTS.md

## Project overview

TYPO3 extension `pagetree_facets` (`konradmichalik/typo3-pagetree-facets`). It adds a filterable page tree: tokens like `doktype:1 is:empty` typed into the backend page tree search field (or entered through a modal, `Ctrl/Cmd+Shift+L`) narrow the tree to matching pages. It hooks into the core `BeforePageTreeIsFilteredEvent` and exposes an extensible `FacetInterface` API so third parties can add facets the same way the built-in ones are registered.

- PHP: `~8.2 || ~8.3 || ~8.4 || ~8.5`
- TYPO3: `^13.4.0 || ^14.3.6` (`cms-core`, `cms-backend`)
- Docs for users and integrators: `Documentation/` (`USAGE.md`, `CONFIGURATION.md`, `EXTENDING.md`, `LIMITATIONS.md`)

## Structure

- `Classes/Token/` `TokenParser` (phrase to tokens), `TokenSerializer` (its inverse), `ModalStateTokenBuilder`
- `Classes/Api/` public extension contracts: `FacetInterface`, `FilterOptionInterface`, `FilterContext`
- `Classes/Tab/` built-in facets (`DoktypeTab`, `LayoutTab`, `PageStateTab`, `SeoTab`, `RecordsTab`, `RawQueryTab`, ...), most extend `AbstractPagesQueryTab`
- `Classes/Option/` built-in filter options for vocabulary facets
- `Classes/Event/` `RegisterFacetsEvent`, `RegisterFilterOptionsEvent`
- `Classes/EventListener/` `PageTreeFilterListener` (the filter engine), `SearchResultLabelListener`, `BuiltInTabsListener`, `BuiltInOptionsListener`, `BackendAssetsListener`
- `Classes/Service/` registries (`FacetRegistry`, `OptionRegistry`), scope services, query helper, favorites, session filter
- `Classes/Controller/FacetsModalController.php` AJAX endpoints for the modal (routes in `Configuration/Backend/AjaxRoutes.php`)
- `Classes/Compatibility/V13/` TYPO3 13 compatibility code
- `Resources/Public/JavaScript/` `facets-modal.js`, `facets-toolbar.js` and `Filter/` modules
- `Resources/Private/Language/` `locallang.xlf` (shipped inline to the client, keep server-only labels out), `locallang_settings.xlf` (`ext_conf_template.txt` labels, each reads `Title: Description`), `locallang_tree.xlf`
- `Tests/Unit/`, `Tests/Functional/`, `Tests/JavaScript/`, `Tests/Playwright/`
- `Tests/Functional/Fixtures/Extensions/` local-only fixture extensions: `example_tab` (third-party facet example) and `demo_content` (seeds demo pages)
- `Tests/CGL/` separate Composer project with linters, PHPStan and Rector

## Architecture notes

- Facets are registered through `RegisterFacetsEvent`. Built-ins use the same path as third parties, there is no private shortcut. Built-ins use priorities 100 down to 40, third parties default to 0
- Extension points: a new facet implements `FacetInterface`, a new option for an existing facet implements `FilterOptionInterface` and is registered on `RegisterFilterOptionsEvent`
- Token grammar changes belong in `TokenParser`, keep `TokenSerializer` as its inverse
- Modal UI is described declaratively by `getModalConfiguration()`, new field types are added in `Resources/Public/JavaScript/Filter/fields.js` only
- Changing a service constructor signature requires `ddev 14 typo3 cache:flush`, otherwise the stale compiled container throws a `TypeError`

## Development commands

Development runs in DDEV.

- `ddev start` and `ddev composer install` set up the project
- `ddev install 14` (or `13`, `all`) sets up a TYPO3 instance, `ddev launch` opens it
- `ddev 14 typo3 cache:flush` runs TYPO3 commands, `ddev all typo3 database:updateschema` runs them on all instances
- `ddev cgl lint` and `ddev cgl fix` run and fix all linters, `ddev cgl sca` runs PHPStan, `ddev cgl analyze` runs the dependency analyser, `ddev cgl migration` runs Rector

## Testing

- `ddev composer test:unit` runs PHPUnit unit tests (`phpunit.xml`), `ddev composer test` is an alias
- `ddev composer test:functional` runs functional tests (`phpunit.functional.xml`)
- `ddev composer test:coverage` runs both suites with coverage and merges the reports with `phpcov`
- Single file: `ddev exec vendor/bin/phpunit -c phpunit.xml Tests/Unit/Token/TokenParserTest.php`
- `ddev npm ci` then `ddev npm run test:js` runs Vitest with jsdom (`vitest.config.js`), `test:js:coverage` adds coverage. Modules importing `@typo3/*` need a stub under `Tests/JavaScript/Stubs/typo3/`
- E2E: `ddev exec npm ci`, `ddev exec npx playwright install chromium`, then `ddev exec npx playwright test`. It must run inside the container and needs the TYPO3 instance from `ddev install`. `TYPO3_VERSION=13` selects the v13 instance
- CI: `tests.yml` runs PHP 8.2 to 8.5 against TYPO3 13.4, 14.0 and 14.3 with highest and lowest dependencies, plus the Vitest suite. `e2e.yml` runs Playwright per TYPO3 version inside DDEV

## Code style and static analysis

- PHP CS Fixer, PHPStan level 8 (with baseline), Rector, `composer normalize`, EditorConfig lint and `composer-dependency-analyser`, all configured in `Tests/CGL/`
- Use `ddev cgl` instead of calling vendor binaries from the repository root
- The `cgl` GitHub workflow runs the checks on every push

## Git workflow

- Open a pull request that describes the change and ideally references an issue
- Commit format: `<type>: <description>` with type `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf` or `ci`
- One commit per logical change, single line message
- No co-author trailers
- Never skip hooks (`--no-verify`)
