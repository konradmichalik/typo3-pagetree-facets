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

namespace KonradMichalik\PagetreeFacets\Tests\Functional\Tab;

use KonradMichalik\PagetreeFacets\Tab\FormTab;
use PHPUnit\Framework\Attributes\Test;
use TYPO3\CMS\Core\Database\ReferenceIndex;

/**
 * FormTabTest.
 *
 * Loads EXT:form for real and drives TYPO3's own ReferenceIndex over the
 * fixture's pi_flexform data - the point is to prove the real
 * formPersistenceIdentifier soft-reference parser produces the sys_refindex
 * shape FormTab's query logic assumes, not just that our own SQL is
 * internally consistent.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FormTabTest extends AbstractTabTestCase
{
    protected array $coreExtensionsToLoad = ['form'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__.'/../Fixtures/FormTab.csv');
        $this->get(ReferenceIndex::class)->updateRefIndexTable('tt_content', 200);
        $this->get(ReferenceIndex::class)->updateRefIndexTable('tt_content', 201);
        $this->get(ReferenceIndex::class)->updateRefIndexTable('tt_content', 202);
    }

    #[Test]
    public function findsThePageEmbeddingTheForm(): void
    {
        self::assertSame(
            [2],
            $this->resolve($this->get(FormTab::class), 'form:EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/contact.form.yaml'),
        );
    }

    #[Test]
    public function anUnreferencedIdentifierResolvesToNoMatches(): void
    {
        self::assertSame(
            [],
            $this->resolve($this->get(FormTab::class), 'form:EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/does-not-exist.form.yaml'),
        );
    }

    /**
     * The soft-reference parser records a bare-integer persistenceIdentifier
     * (a form_definition/database-storage form, TYPO3 v14's highest-priority
     * storage adapter and what the backend UI creates by default) as
     * ref_table='form_definition' rather than '_STRING' - a distinct branch
     * from the EXT: case above.
     */
    #[Test]
    public function findsThePageEmbeddingTheDatabaseStoredForm(): void
    {
        self::assertSame([4], $this->resolve($this->get(FormTab::class), 'form:999'));
    }

    #[Test]
    public function anUnreferencedDatabaseStoredIdentifierResolvesToNoMatches(): void
    {
        self::assertSame([], $this->resolve($this->get(FormTab::class), 'form:123456'));
    }

    /**
     * Multiple token values are OR-combined - one value matching through the
     * EXT: branch and another through the form_definition branch must both
     * contribute their pages to the result.
     */
    #[Test]
    public function multipleValuesAreOrCombinedAcrossBranches(): void
    {
        self::assertSame(
            [2, 4],
            $this->resolve($this->get(FormTab::class), 'form:EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/contact.form.yaml,999'),
        );
    }

    #[Test]
    public function modalConfigurationOffersTheReferencedFormWithAFallbackLabel(): void
    {
        $configuration = $this->get(FormTab::class)->getModalConfiguration($this->createContext());

        self::assertSame(
            [
                'EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/contact.form.yaml',
                '999',
            ],
            array_column($configuration['fields'][0]['options'], 'value'),
        );
        // The referenced file does not actually exist on disk, so
        // FormPersistenceManagerInterface::load() throws and the label falls
        // back to the identifier-derived one - this IS the case being
        // verified (a stale/orphaned reference stays filterable with a
        // sensible label, not just an unlabeled option). Same fallback path
        // for the bare-integer identifier, just a different derived label.
        $labels = array_column($configuration['fields'][0]['options'], 'label');
        self::assertContains('Contact', $labels);
        self::assertContains('Form #999', $labels);
    }

    #[Test]
    public function identityAndGroupingMetadataIsStable(): void
    {
        $tab = $this->get(FormTab::class);

        self::assertSame('form', $tab->getIdentifier());
        self::assertSame(['form'], $tab->getTokenKeys());
        self::assertSame('LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.form', $tab->getLabel());
        self::assertSame('LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:group.forms', $tab->getGroup());
    }
}
