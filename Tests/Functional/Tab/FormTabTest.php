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
use TYPO3\CMS\Core\Core\Environment;
use TYPO3\CMS\Core\Database\{ConnectionPool, ReferenceIndex};
use TYPO3\CMS\Core\Information\Typo3Version;
use TYPO3\CMS\Core\Resource\StorageRepository;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Form\Slot\FilePersistenceSlot;

use function is_string;
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
    private const MIN_VERSION_FOR_FORM_DEFINITION_SOFTREF = '14.2.0';

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

    /**
     * The third persistenceIdentifier shape (see the class docblock): a FAL
     * combined identifier for a form stored in a file storage rather than as
     * an EXT: path or a database-stored form_definition. Exercised through a
     * real ResourceStorage/ReferenceIndex round trip for the same reason the
     * other two shapes are - to prove the real soft-reference parser produces
     * the ref_table='sys_file' refindex shape FormTab's SQL assumes.
     */
    #[Test]
    public function findsThePageEmbeddingTheFalStoredForm(): void
    {
        $combinedIdentifier = $this->createFalStoredForm();

        self::assertSame([5], $this->resolve($this->get(FormTab::class), 'form:'.$combinedIdentifier));
    }

    #[Test]
    public function anUnreferencedFalIdentifierResolvesToNoMatches(): void
    {
        self::assertSame(
            [],
            $this->resolve($this->get(FormTab::class), 'form:1:/does-not-exist.form.yaml'),
        );
    }

    /**
     * referencedForms() reconstructs FAL identifiers from sys_refindex's
     * ref_table='sys_file'/ref_uid columns via a second query against
     * sys_file - this is the one shape that needs a real storage/file to
     * prove that join, unlike the EXT: and form_definition shapes above.
     */
    #[Test]
    public function modalConfigurationIncludesAFalStoredFormWithAnIdentifierDerivedLabel(): void
    {
        $combinedIdentifier = $this->createFalStoredForm();

        $configuration = $this->get(FormTab::class)->getModalConfiguration($this->createContext());
        $options = array_column($configuration['fields'][0]['options'], 'label', 'value');

        self::assertSame('Newsletter Signup', $options[$combinedIdentifier] ?? null);
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

    /**
     * Creates a real local file storage, adds a form definition file to it,
     * points fixture content #300 at the resulting combined identifier, and
     * re-runs the reference index over it - mirroring what saving a
     * FAL-backed form in the backend actually produces in sys_refindex.
     */
    private function createFalStoredForm(): string
    {
        $basePath = 'typo3temp/var/tests/pagetree-facets-form-storage/';
        $absolutePath = Environment::getPublicPath().'/'.$basePath;
        // The instance's typo3temp/ directory is not reset between test
        // methods the way the database is - without this, a file left over
        // from an earlier test in this class would make addFile() below
        // rename around a collision instead of writing the identifier this
        // test expects.
        if (is_dir($absolutePath)) {
            GeneralUtility::rmdir($absolutePath, true);
        }
        GeneralUtility::mkdir_deep($absolutePath);
        $storageRepository = $this->get(StorageRepository::class);
        $storageUid = $storageRepository->createLocalStorage('Fixture forms', $basePath, 'relative');
        $storage = $storageRepository->getStorageObject($storageUid);

        $localFile = GeneralUtility::tempnam('pagetree-facets-form-');
        $content = 'type: Form';
        file_put_contents($localFile, $content);

        // EXT:form guards every write to a *.form.yaml file behind a one-time
        // allowance (see FilePersistenceSlot) so only its own persistence
        // manager can create form definitions - a plain addFile() must grant
        // itself the same allowance a real form save would.
        $combinedIdentifier = sprintf('%d:/newsletter-signup.form.yaml', $storageUid);
        $filePersistenceSlot = $this->get(FilePersistenceSlot::class);
        $filePersistenceSlot->allowInvocation(
            FilePersistenceSlot::COMMAND_FILE_ADD,
            $combinedIdentifier,
            $filePersistenceSlot->getContentSignature($content),
        );

        $file = $storage->addFile($localFile, $storage->getRootLevelFolder(), 'newsletter-signup.form.yaml');
        $combinedIdentifier = $file->getCombinedIdentifier();

        $this->get(ConnectionPool::class)->getConnectionForTable('tt_content')->update(
            'tt_content',
            ['pi_flexform' => str_replace(
                '__FAL_IDENTIFIER__',
                $combinedIdentifier,
                $this->flexformFor(300),
            )],
            ['uid' => 300],
        );
        $this->get(ReferenceIndex::class)->updateRefIndexTable('tt_content', 300);

        return $combinedIdentifier;
    }

    private function flexformFor(int $contentUid): string
    {
        $flexform = $this->get(ConnectionPool::class)->getConnectionForTable('tt_content')
            ->select(['pi_flexform'], 'tt_content', ['uid' => $contentUid])
            ->fetchOne();

        return is_string($flexform) ? $flexform : '';
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
