<?php

declare(strict_types=1);

/*
 * This file is part of the "pagetree_lens" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

namespace KonradMichalik\PagetreeLens\Tab;

use KonradMichalik\PagetreeLens\Api\FilterContext;
use KonradMichalik\PagetreeLens\Token\Token;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Site\SiteFinder;
use KonradMichalik\PagetreeLens\Service\ContentQueryHelper;

/**
 * Pages with no translation record for the given language (page level).
 * Content-element-level gaps ("page translated but CEs missing", connected
 * vs. free mode) are a documented v2 item.
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
        return 'LLL:EXT:pagetree_lens/Resources/Private/Language/locallang.xlf:tab.translations';
    }

    public function getGroup(): ?string
    {
        return 'quality';
    }

    public function getTokenKeys(): array
    {
        return ['untranslated'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        $languageIds = array_values(array_filter(array_map(intval(...), $token->values), static fn (int $id): bool => $id > 0));
        if ($languageIds === []) {
            return [];
        }

        $sets = [];
        foreach ($languageIds as $languageId) {
            $translatedParents = $this->fetchTranslatedParentUids($languageId, $context);
            $translated = array_flip($translatedParents);
            $defaultLanguagePages = $this->fetchPageUids($context, function ($queryBuilder): void {
                $queryBuilder->andWhere(
                    $queryBuilder->expr()->eq('sys_language_uid', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
                );
                $this->excludeNonContentDoktypes($queryBuilder);
            });
            $sets[] = array_values(array_filter($defaultLanguagePages, static fn (int $uid): bool => !isset($translated[$uid])));
        }

        // Values within one token are OR-combined (untranslated in ANY of the languages).
        return array_values(array_unique(array_merge(...$sets)));
    }

    /**
     * @return list<int>
     */
    private function fetchTranslatedParentUids(int $languageId, FilterContext $context): array
    {
        $queryBuilder = $this->queryHelper->createQueryBuilder('pages', $context);
        $queryBuilder
            ->select('l10n_parent')
            ->distinct()
            ->from('pages')
            ->where(
                $queryBuilder->expr()->eq('sys_language_uid', $queryBuilder->createNamedParameter($languageId, Connection::PARAM_INT)),
                $queryBuilder->expr()->gt('l10n_parent', $queryBuilder->createNamedParameter(0, Connection::PARAM_INT)),
            );

        return array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
    }

    public function getModalConfiguration(FilterContext $context): array
    {
        // Language options from the site languages - pairs naturally with the
        // site: scope; without one, offer the union of all accessible sites.
        $options = [];
        $seen = [];
        foreach ($this->siteFinder->getAllSites() as $site) {
            if ($context->siteIdentifier !== null && $site->getIdentifier() !== $context->siteIdentifier) {
                continue;
            }
            foreach ($site->getAllLanguages() as $language) {
                $languageId = $language->getLanguageId();
                if ($languageId === 0 || isset($seen[$languageId])) {
                    continue;
                }
                $seen[$languageId] = true;
                $options[] = [
                    'value' => (string)$languageId,
                    'label' => $language->getTitle(),
                    'icon' => $language->getFlagIdentifier(),
                ];
            }
        }

        return [
            'fields' => [
                ['type' => 'checkbox-group', 'name' => 'untranslated', 'label' => $this->getLabel(), 'options' => $options],
            ],
        ];
    }
}
