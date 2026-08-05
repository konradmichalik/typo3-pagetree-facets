<?php

declare(strict_types=1);

/*
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeFacets\Tab;

use KonradMichalik\PagetreeFacets\Api\{FilterContext, FilterOptionInterface};
use KonradMichalik\PagetreeFacets\Service\OptionRegistry;
use KonradMichalik\PagetreeFacets\Token\Token;

/**
 * SupportsFilterOptions.
 *
 * The vocabulary-tab side of the option API: turns a checkbox-group tab into a
 * thin container whose values - built-in and third-party alike - come from the
 * OptionRegistry. A tab opts in by using this trait, injecting an
 * OptionRegistry and implementing optionRegistry().
 *
 * Two seams, mirroring the two halves of a checkbox:
 *  - appendOptions() merges the registered options into the modal field,
 *  - resolveViaOptions() resolves a token entirely through those options.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
trait SupportsFilterOptions
{
    abstract protected function optionRegistry(): OptionRegistry;

    /**
     * Append the registered options for $tokenKey to the checkbox-group field
     * named $tokenKey. Resolution stays the tab's job (resolveViaOptions), so
     * the option's UID logic and its checkbox never drift apart.
     *
     * @param array{fields: list<array<string, mixed>>} $config
     *
     * @return array{fields: list<array<string, mixed>>}
     */
    protected function appendOptions(array $config, string $tokenKey, FilterContext $context): array
    {
        $extra = array_map(
            static fn (FilterOptionInterface $option): array => array_filter([
                'value' => $option->getValue(),
                'label' => $option->getLabel(),
                'icon' => $option->getIcon(),
                'description' => $option->getDescription(),
            ], static fn (mixed $value): bool => null !== $value),
            $this->optionRegistry()->getOptions($tokenKey, $context->backendUser),
        );
        if ([] === $extra) {
            return $config;
        }

        foreach ($config['fields'] as $index => $field) {
            if (($field['name'] ?? null) === $tokenKey && 'checkbox-group' === ($field['type'] ?? null)) {
                $config['fields'][$index]['options'] = [...$field['options'], ...$extra];
                break;
            }
        }

        return $config;
    }

    /**
     * Resolve a token whose every value is provided by a registered option.
     * Values within one token are OR-combined, matching the engine's
     * within-token semantics; an unclaimed value contributes nothing.
     *
     * @return list<int>
     */
    protected function resolveViaOptions(Token $token, FilterContext $context): array
    {
        $sets = [];
        foreach ($token->values as $value) {
            $option = $this->optionRegistry()->findOption($token->key, $value, $context->backendUser);
            if (null !== $option) {
                $sets[] = $option->resolvePageUids($context);
            }
        }

        return [] === $sets ? [] : array_values(array_unique(array_merge(...$sets)));
    }
}
