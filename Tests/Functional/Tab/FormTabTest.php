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
use TYPO3\CMS\Core\Information\Typo3Version;

use function sprintf;

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
    /**
     * form_definition (database-stored form) soft-reference support was
     * added to TYPO3 Form in 14.2 - verified directly against core's
     * FormPersistenceIdentifierSoftReferenceParser.php, absent in 14.0/14.1.
     * This extension's own composer constraint stays ^14.0 (dropping 14.0/14.1
     * project-wide over one facet's newest branch would be disproportionate),
     * so the form_definition-specific test cases skip themselves on older
     * TYPO3 rather than asserting behavior core cannot yet produce.
     */
    private const string MIN_VERSION_FOR_FORM_DEFINITION_SOFTREF = '14.2.0';

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
        $this->skipUnlessFormDefinitionSoftReferenceIsSupported();
        self::assertSame([4], $this->resolve($this->get(FormTab::class), 'form:999'));
    }

    #[Test]
    public function anUnreferencedDatabaseStoredIdentifierResolvesToNoMatches(): void
    {
        $this->skipUnlessFormDefinitionSoftReferenceIsSupported();
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
        $this->skipUnlessFormDefinitionSoftReferenceIsSupported();
        self::assertSame(
            [2, 4],
            $this->resolve($this->get(FormTab::class), 'form:EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/contact.form.yaml,999'),
        );
    }

    /**
     * FormTab derives every option label purely from the identifier's own
     * shape (labelFromIdentifier()) - there is no "real" label loaded from
     * the form definition itself (see the class docblock for why that was
     * tried and removed), so a stale EXT: reference to a file that doesn't
     * exist on disk gets exactly the same kind of derived label as a
     * perfectly live form_definition reference.
     */
    #[Test]
    public function modalConfigurationOffersEachReferencedFormWithAnIdentifierDerivedLabel(): void
    {
        $this->skipUnlessFormDefinitionSoftReferenceIsSupported();
        $configuration = $this->get(FormTab::class)->getModalConfiguration($this->createContext());

        self::assertSame(
            [
                'EXT:typo3_pagetree_facets/Tests/Functional/Fixtures/contact.form.yaml',
                '999',
            ],
            array_column($configuration['fields'][0]['options'], 'value'),
        );
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

    private function skipUnlessFormDefinitionSoftReferenceIsSupported(): void
    {
        $version = $this->get(Typo3Version::class)->getVersion();
        if (version_compare($version, self::MIN_VERSION_FOR_FORM_DEFINITION_SOFTREF, '<')) {
            self::markTestSkipped(sprintf(
                'form_definition soft-reference support requires TYPO3 %s+, running %s.',
                self::MIN_VERSION_FOR_FORM_DEFINITION_SOFTREF,
                $version,
            ));
        }
    }
}
