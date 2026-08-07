# `example_tab` — extending `typo3_pagetree_facets`

A minimal extension that exercises **both** extension points of
[`typo3_pagetree_facets`](../../../../../README.md) end to end:

| Path | What this extension adds |
|---|---|
| `FilterOptionInterface` + `RegisterFilterOptionsEvent` | `is:no-nav-title` — one more value in the **built-in** Page state tab |
| `FilterTabInterface` + `RegisterFilterTabsEvent` | `abstract:set` / `abstract:empty` — a tab of its own |

Every class here is commented method by method, including the priority semantics.
This is a development fixture and **not part of the released package**, so copy it
rather than depending on it. `ddev install` symlinks and sets it up automatically,
so both additions show up in the modal of a freshly installed instance.

## A single option in an existing tab

This is the smaller extension point, and usually the one you want: it adds one more
criterion to a token key that already exists, instead of a whole tab.

Implement `FilterOptionInterface` and register it via `RegisterFilterOptionsEvent`:

```php
#[AsEventListener(identifier: 'my-ext/register-option')]
final readonly class MyOptionListener
{
    public function __construct(private MyOption $myOption) {}

    public function __invoke(RegisterFilterOptionsEvent $event): void
    {
        $event->addOption($this->myOption);   // priority 0 = after the built-ins
    }
}
```

See [`Classes/EventListener/ExampleOptionListener.php`](Classes/EventListener/ExampleOptionListener.php)
and [`Classes/Option/MissingNavTitleOption.php`](Classes/Option/MissingNavTitleOption.php).

The option reports which key it extends (`getTokenKey()`), its own value, label,
icon and description, and resolves that value to page UIDs. Values of one token are
OR-combined, separate tokens AND-intersected — identical to a built-in, because the
built-in options use this same event.

Extending `AbstractPagesQueryOption` is optional and saves the query plumbing when
the criterion is a `pages` lookup: `fetchPageUids()` hands over a workspace- and
permission-aware `QueryBuilder`, and `getIcon()`/`getDescription()` already default
to `null`. Implement `FilterOptionInterface` directly when the criterion is not a
pages-table query.

> [!IMPORTANT]
> `getTokenKey()` + `getValue()` (e.g. `is:no-nav-title`) is the identifier
> administrators disable the option under, so treat it as public API. Renaming it
> silently invalidates existing favorites and `disableOptions` settings.

Only vocabulary tabs surface options — Page state (`is:`) and SEO (`seo:`).
TCA-derived tabs such as Page type or Records build their options dynamically and
ignore the event.

## A whole tab

Register a `FilterTabInterface` implementation via `RegisterFilterTabsEvent`
(`#[AsEventListener]`); the built-in tabs use the exact same path — there is no
private shortcut. A tab owns one or more token keys, resolves them to page UIDs,
and describes its modal UI declaratively, so the modal renders it without any
JavaScript on your side.

See [`Classes/EventListener/ExampleTabListener.php`](Classes/EventListener/ExampleTabListener.php)
and [`Classes/Tab/ExampleTab.php`](Classes/Tab/ExampleTab.php).

Built-in tabs occupy priorities 100 down to 40 in registration order; third-party
tabs default to priority 0, which places them after the built-ins in the modal
navigation. Extending `AbstractPagesQueryTab` is optional and provides a default
`serialize()`/`hydrate()` plus helpers such as `fetchPageUids()` and
`excludeNonContentDoktypes()`.

## Trying it out

```bash
ddev install 14   # symlinks this extension and sets it up
ddev launch
```

Open the page tree modal (<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>):
the **Example** tab appears in the navigation, and *Page state* carries an extra
*No navigation title* checkbox.
