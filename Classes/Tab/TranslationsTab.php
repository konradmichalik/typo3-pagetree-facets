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

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;
use TYPO3\CMS\Core\Site\SiteFinder;

/**
 * TranslationsTab.
 *
 * Pages with no translation record for the given language (page level).
 * Content-element-level gaps ("page translated but CEs missing", connected
 * vs. free mode) are a documented v2 item.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class TranslationsTab extends AbstractPagesQueryTab
{
    public function __construct(
        ContentQueryHelper $queryHelper,
        private readonly SiteFinder $siteFinder,
    ) {
        parent::__construct($queryHelper);
    }

    public function getIdentifier(): string
    {
        return 'translations';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.translations';
    }

    public function getGroup(): string
    {
        return 'quality';
    }

    public function getTokenKeys(): array
    {
        return ['untranslated', 'translated'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $languageIds = array_values(array_filter(array_map(intval(...), $token->values), static fn (int $id): bool => $id > 0));
        if ([] === $languageIds) {
            return [];
        }

        // The two keys are exact inverses over the same candidate set, so both
        // run through one code path - which also guarantees "translated" honours
        // the doktype exclusion instead of leaking folders that happen to carry
        // a translation record. Each language is a correlated (NOT) EXISTS on
        // the aliased pages self-join, OR-combined (missing from - or present
        // in - ANY of the languages), so everything resolves as ONE query
        // instead of one full default-language set plus one translated set per
        // language in PHP.
        $wantTranslated = 'translated' === $token->key;

        return $this->fetchPageUids($context, function (QueryBuilder $queryBuilder) use ($context, $languageIds, $wantTranslated): void {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq('sys_language_uid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
            );
            $this->excludeNonContentDoktypes($queryBuilder);

            $terms = [];
            foreach ($languageIds as $languageId) {
                $exists = $this->queryHelper->createRecordsExistExpression(
                    'pages',
                    'l10n_parent',
                    $context,
                    $queryBuilder->expr()->eq(
                        'translation.sys_language_uid',
                        $queryBuilder->createNamedParameter($languageId, Connection::PARAM_INT),
                    ),
                    'translation',
                );
                $terms[] = $wantTranslated ? $exists : 'NOT '.$exists;
            }
            $queryBuilder->andWhere($queryBuilder->expr()->or(...$terms));
        });
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        // Language options from the site languages - pairs naturally with the
        // site: scope; without one, offer the union of all accessible sites.
        $options = [];
        $seen = [];
        $backendUser = $context->backendUser;
        foreach ($this->siteFinder->getAllSites() as $site) {
            // Same web-mount boundary as the modal's site options: a non-admin
            // must not see language titles of sites outside their mounts.
            if (!$backendUser->isAdmin() && null === $backendUser->isInWebMount($site->getRootPageId())) {
                continue;
            }
            if (null !== $context->siteIdentifier && $site->getIdentifier() !== $context->siteIdentifier) {
                continue;
            }
            foreach ($site->getAllLanguages() as $language) {
                $languageId = $language->getLanguageId();
                if (0 === $languageId || isset($seen[$languageId])) {
                    continue;
                }
                $seen[$languageId] = true;
                $options[] = [
                    'value' => (string) $languageId,
                    'label' => $language->getTitle(),
                    'icon' => $language->getFlagIdentifier(),
                ];
            }
        }

        $lll = 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:translations.';

        // Two fields, one per direction. Never the tab label: the legend has to
        // say which way the filter runs, otherwise a bare language list reads as
        // "pages that have this language". Distinct names, so the two are
        // independent criteria the engine ANDs - "missing Danish but has German"
        // is a legitimate query.
        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'untranslated',
                    'label' => $lll.'untranslated',
                    'options' => $options,
                ],
                [
                    'type' => 'checkbox-group',
                    'name' => 'translated',
                    'label' => $lll.'translated',
                    'options' => $options,
                ],
            ],
        ];
    }

}
