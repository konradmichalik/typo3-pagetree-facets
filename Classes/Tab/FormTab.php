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
use KonradMichalik\PagetreeFacets\Token\Token;
use TYPO3\CMS\Core\Database\Connection;
use TYPO3\CMS\Core\Database\Query\QueryBuilder;

use function ctype_digit;
use function is_int;
use function is_string;
use function sprintf;
use function strlen;

/**
 * FormTab.
 *
 * Pages embedding a specific TYPO3 Form Framework form (form:), identified
 * by the form's persistenceIdentifier. Resolution goes through sys_refindex
 * (populated by core's own formPersistenceIdentifier soft-reference parser
 * on every save of a form_formframework content element) rather than
 * parsing pi_flexform XML directly - see the class docblock on the private
 * resolution methods below for the exact refindex shape this depends on.
 *
 * A persistenceIdentifier takes one of three shapes, mirroring
 * FormPersistenceIdentifierSoftReferenceParser's own three branches: an
 * "EXT:..." extension-file path (ref_table '_STRING'), a "<storageUid>:<path>"
 * FAL-storage path (ref_table 'sys_file'), or - TYPO3 v14's newer database
 * storage, the highest-priority storage adapter and what a form created via
 * the backend UI gets by default - a bare integer (ref_table
 * 'form_definition', matched by ref_uid). No other ref_table value is
 * expected for this softref key; any row with one is skipped rather than
 * guessed at.
 *
 * Registered only when EXT:form is loaded (BuiltInTabsListener) - like
 * SeoTab, this tab therefore never checks isLoaded() itself, since the
 * engine only ever routes a "form:" token here when it was registered.
 * typo3/cms-form stays a dev-only dependency (see composer.json): this class
 * has no PHP dependency on it whatsoever - it only needs EXT:form to be
 * loaded for form_formframework/its soft-reference parser to exist and
 * populate sys_refindex in the first place, which is a runtime/registration
 * concern handled entirely by BuiltInTabsListener's isLoaded('form') check
 * (and, for tests, coreExtensionsToLoad). An earlier version of this class
 * tried to enrich the option label via
 * FormPersistenceManagerInterface::load() (through GeneralUtility::
 * makeInstance() with the interface referenced only via ::class, to avoid a
 * real type-hint); that never actually worked because EXT:form's service
 * definitions are not public, so makeInstance() could never resolve a real
 * instance in any context - it was removed rather than fixed, since making
 * cms-form a hard require just to enable constructor injection would have
 * defeated the point of keeping it optional. labelFromIdentifier() is the
 * only label source now.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FormTab extends AbstractPagesQueryTab
{
    private const string SOFTREF_KEY = 'formPersistenceIdentifier';

    public function getIdentifier(): string
    {
        return 'form';
    }

    public function getLabel(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.form';
    }

    public function getGroup(): string
    {
        return 'LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:group.forms';
    }

    public function getTokenKeys(): array
    {
        return ['form'];
    }

    public function resolvePageUids(Token $token, FilterContext $context): array
    {
        if ([] === $token->values) {
            return [];
        }

        $uids = [];
        foreach (array_unique($token->values) as $persistenceIdentifier) {
            $uids[] = $this->pageUidsReferencingForm($persistenceIdentifier, $context);
        }

        return array_values(array_unique(array_merge(...$uids)));
    }

    /**
     * @return array{fields: list<array<string, mixed>>}
     */
    public function getModalConfiguration(FilterContext $context): array
    {
        $options = [];
        foreach ($this->referencedForms($context) as $persistenceIdentifier) {
            $options[] = [
                'value' => $persistenceIdentifier,
                'label' => $this->labelFromIdentifier($persistenceIdentifier),
                'description' => $persistenceIdentifier,
            ];
        }
        usort($options, static fn (array $a, array $b): int => strcasecmp($a['label'], $b['label']));

        return [
            'fields' => [
                [
                    'type' => 'checkbox-group',
                    'name' => 'form',
                    'label' => $this->getLabel(),
                    'options' => $options,
                ],
            ],
        ];
    }

    /**
     * Friendly name derived purely from the identifier's own shape - the
     * only label source (see the class docblock: a real load()'d label was
     * tried and removed, since EXT:form's non-public service definitions
     * make it unreachable in any context).
     */
    protected function labelFromIdentifier(string $persistenceIdentifier): string
    {
        // A bare integer is a form_definition (database storage) uid, not a
        // path - there is no filename to derive a title from, so this is the
        // clearest label available for that shape.
        if ('' !== $persistenceIdentifier && ctype_digit($persistenceIdentifier)) {
            return sprintf('Form #%s', $persistenceIdentifier);
        }

        $basename = basename($persistenceIdentifier);
        if ('' === $basename) {
            return '';
        }
        $withoutExtension = str_ends_with($basename, '.form.yaml') ? substr($basename, 0, -strlen('.form.yaml')) : $basename;

        return ucwords(str_replace(['-', '_'], ' ', $withoutExtension));
    }

    /**
     * QueryBuilder for sys_refindex pre-filtered to the fixed prefix every
     * query in this class shares (the one softref this facet cares about,
     * on the one field it lives in). Callers add their own select()/from()/
     * distinct() and any further andWhere() on top.
     */
    private function refindexQueryBuilder(FilterContext $context): QueryBuilder
    {
        $queryBuilder = $this->queryHelper->createQueryBuilder('sys_refindex', $context);
        $queryBuilder->where(
            $queryBuilder->expr()->eq('tablename', $queryBuilder->createNamedParameter('tt_content')),
            $queryBuilder->expr()->eq('field', $queryBuilder->createNamedParameter('pi_flexform')),
            $queryBuilder->expr()->eq('softref_key', $queryBuilder->createNamedParameter(self::SOFTREF_KEY)),
        );

        return $queryBuilder;
    }

    /**
     * Distinct persistenceIdentifiers of every form currently referenced by
     * a form_formframework element anywhere - reconstructed from
     * sys_refindex rather than enumerated via FormPersistenceManagerInterface
     * (see the design spec's "Dependency handling" section for why: the
     * enumeration path there needs a chain of @internal EXT:form classes
     * this facet deliberately avoids).
     *
     * @return list<string>
     */
    private function referencedForms(FilterContext $context): array
    {
        $queryBuilder = $this->refindexQueryBuilder($context);
        $queryBuilder->select('ref_table', 'ref_uid', 'ref_string')->distinct()->from('sys_refindex')->andWhere(
            // Narrows to the three ref_table shapes this softref key can ever
            // produce (see the class docblock), pushed into SQL rather than
            // left to the PHP-side branching below alone.
            $queryBuilder->expr()->in('ref_table', $queryBuilder->createNamedParameter(
                ['_STRING', 'sys_file', 'form_definition'],
                Connection::PARAM_STR_ARRAY,
            )),
        );
        $rows = $queryBuilder->executeQuery()->fetchAllAssociative();

        $stringIdentifiers = [];
        $fileUids = [];
        $formDefinitionIdentifiers = [];
        foreach ($rows as $row) {
            if ('_STRING' === $row['ref_table']) {
                $stringIdentifiers[] = (string) $row['ref_string'];
            } elseif ('sys_file' === $row['ref_table']) {
                $fileUids[] = (int) $row['ref_uid'];
            } elseif ('form_definition' === $row['ref_table']) {
                $formDefinitionIdentifiers[] = (string) $row['ref_uid'];
            }
            // Any other ref_table value is unexpected for this softref key -
            // skip it rather than miscategorizing it as one of the above.
        }

        return array_values(array_unique([
            ...array_filter($stringIdentifiers, static fn (string $v): bool => '' !== $v),
            ...$this->fileIdentifiersFor($fileUids, $context),
            ...$formDefinitionIdentifiers,
        ]));
    }

    /**
     * @param list<int> $fileUids
     *
     * @return list<string> combined FAL identifiers ("<storage>:<identifier>")
     */
    private function fileIdentifiersFor(array $fileUids, FilterContext $context): array
    {
        if ([] === $fileUids) {
            return [];
        }

        $queryBuilder = $this->queryHelper->createQueryBuilder('sys_file', $context);
        $queryBuilder->select('storage', 'identifier')
            ->from('sys_file')
            ->where($queryBuilder->expr()->in('uid', $queryBuilder->createNamedParameter($fileUids, Connection::PARAM_INT_ARRAY)));

        $identifiers = [];
        foreach ($queryBuilder->executeQuery()->fetchAllAssociative() as $row) {
            $identifiers[] = $row['storage'].':'.$row['identifier'];
        }

        return $identifiers;
    }

    /**
     * @return list<int>
     */
    private function pageUidsReferencingForm(string $persistenceIdentifier, FilterContext $context): array
    {
        $queryBuilder = $this->refindexQueryBuilder($context);
        $queryBuilder->select('recuid')->distinct()->from('sys_refindex');

        if (str_starts_with($persistenceIdentifier, 'EXT:')) {
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq('ref_table', $queryBuilder->createNamedParameter('_STRING')),
                $queryBuilder->expr()->eq('ref_string', $queryBuilder->createNamedParameter($persistenceIdentifier)),
            );
        } elseif (ctype_digit($persistenceIdentifier) && (int) $persistenceIdentifier > 0) {
            // Bare integer: a form_definition (database storage) uid - must be
            // intercepted here, before the FAL branch below, since it has no
            // colon and would otherwise silently resolve to "no match".
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq('ref_table', $queryBuilder->createNamedParameter('form_definition')),
                $queryBuilder->expr()->eq('ref_uid', $queryBuilder->createNamedParameter((int) $persistenceIdentifier, Connection::PARAM_INT)),
            );
        } else {
            $fileUid = $this->resolveFileUid($persistenceIdentifier, $context);
            if (null === $fileUid) {
                return [];
            }
            $queryBuilder->andWhere(
                $queryBuilder->expr()->eq('ref_table', $queryBuilder->createNamedParameter('sys_file')),
                $queryBuilder->expr()->eq('ref_uid', $queryBuilder->createNamedParameter($fileUid, Connection::PARAM_INT)),
            );
        }

        $contentUids = array_map(intval(...), $queryBuilder->executeQuery()->fetchFirstColumn());
        if ([] === $contentUids) {
            return [];
        }

        $contentQueryBuilder = $this->queryHelper->createQueryBuilder('tt_content', $context);

        return $this->queryHelper->getPageUidsWithRecords(
            'tt_content',
            $context,
            $contentQueryBuilder->expr()->in('uid', ':facetsFormContentUids'),
            ['facetsFormContentUids' => $contentUids],
            ['facetsFormContentUids' => Connection::PARAM_INT_ARRAY],
        );
    }

    /**
     * Parses a combined FAL identifier ("<storageUid>:<path>") and resolves
     * it to the matching sys_file.uid directly - no ResourceFactory/FAL API
     * involved, since we only need the row's own uid column, not a usable
     * File object.
     */
    private function resolveFileUid(string $persistenceIdentifier, FilterContext $context): ?int
    {
        $separator = strpos($persistenceIdentifier, ':');
        if (false === $separator) {
            return null;
        }
        $storageUid = (int) substr($persistenceIdentifier, 0, $separator);
        $identifier = substr($persistenceIdentifier, $separator + 1);
        if ($storageUid <= 0 || '' === $identifier) {
            return null;
        }

        $queryBuilder = $this->queryHelper->createQueryBuilder('sys_file', $context);
        $queryBuilder->select('uid')
            ->from('sys_file')
            ->where(
                $queryBuilder->expr()->eq('storage', $queryBuilder->createNamedParameter($storageUid, Connection::PARAM_INT)),
                $queryBuilder->expr()->eq('identifier', $queryBuilder->createNamedParameter($identifier)),
            );
        $uid = $queryBuilder->executeQuery()->fetchOne();

        return is_string($uid) || is_int($uid) ? (int) $uid : null;
    }
}
