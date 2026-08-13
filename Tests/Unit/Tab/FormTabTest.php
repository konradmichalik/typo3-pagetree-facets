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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Tab;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use KonradMichalik\PagetreeFacets\Tab\FormTab;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;
use RuntimeException;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Form\Mvc\Persistence\FormPersistenceManagerInterface;

/**
 * FormTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class FormTabTest extends TestCase
{
    protected function tearDown(): void
    {
        GeneralUtility::purgeInstances();
    }

    #[Test]
    public function identityAndGroupingMetadataIsStable(): void
    {
        $tab = $this->createTab();

        self::assertSame('form', $tab->getIdentifier());
        self::assertSame(['form'], $tab->getTokenKeys());
        self::assertSame('LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:tab.form', $tab->getLabel());
        self::assertSame('LLL:EXT:typo3_pagetree_facets/Resources/Private/Language/locallang.xlf:group.forms', $tab->getGroup());
    }

    #[Test]
    public function labelFromIdentifierStripsExtensionAndTitleCases(): void
    {
        $tab = $this->createTab();

        self::assertSame('Contact Form', $this->labelFromIdentifier($tab, 'EXT:my_ext/Resources/Private/Forms/contact_form.form.yaml'));
        self::assertSame('Newsletter Signup', $this->labelFromIdentifier($tab, '1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function labelFromIdentifierFallsBackToTheWholeValueWhenThereIsNoFilename(): void
    {
        $tab = $this->createTab();

        self::assertSame('', $this->labelFromIdentifier($tab, ''));
    }

    #[Test]
    public function labelFromIdentifierRendersAFormHashForABareIntegerIdentifier(): void
    {
        // A bare integer is a form_definition (database storage) persistence
        // identifier, not a path - there is no filename to derive a title
        // from.
        $tab = $this->createTab();

        self::assertSame('Form #999', $this->labelFromIdentifier($tab, '999'));
    }

    #[Test]
    public function formLabelUsesTheLoadedDefinitionsLabelWhenAvailable(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willReturn(['label' => 'Newsletter Signup']);
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $this->formLabel($tab, '1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function formLabelFallsBackToTheIdentifierWhenLoadThrows(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willThrowException(new RuntimeException('storage gone'));
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $this->formLabel($tab, '1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function formLabelFallsBackToTheIdentifierWhenTheLoadedLabelIsEmpty(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willReturn(['label' => '']);
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $this->formLabel($tab, '1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function resolvePageUidsReturnsNoUidsWithoutAnyValues(): void
    {
        $tab = new FormTab($this->queryHelperThatMustNotBeCalled());

        self::assertSame([], $tab->resolvePageUids(new Token('form', [], 'form:'), $this->context()));
    }

    /**
     * resolveFileUid()'s own parsing checks (colon presence, storage uid
     * positivity, non-empty path) all short-circuit before it ever asks the
     * query helper for a QueryBuilder - covered directly via reflection here,
     * DB-free. The complementary "valid input resolves to a real uid" case
     * needs an actual sys_file row and stays with the functional suite (see
     * the class docblock's rationale for keeping FAL storage out of the unit
     * layer entirely).
     */
    #[Test]
    public function resolveFileUidReturnsNullForAnIdentifierWithoutAColon(): void
    {
        $tab = new FormTab($this->queryHelperThatMustNotBeCalled());

        self::assertNull($this->resolveFileUid($tab, 'no-colon-at-all'));
    }

    #[Test]
    public function resolveFileUidReturnsNullForANonPositiveStorageUid(): void
    {
        $tab = new FormTab($this->queryHelperThatMustNotBeCalled());

        self::assertNull($this->resolveFileUid($tab, '0:some/path.form.yaml'));
        self::assertNull($this->resolveFileUid($tab, '-1:some/path.form.yaml'));
    }

    #[Test]
    public function resolveFileUidReturnsNullForAnEmptyPath(): void
    {
        $tab = new FormTab($this->queryHelperThatMustNotBeCalled());

        self::assertNull($this->resolveFileUid($tab, '1:'));
    }

    private function createTab(): FormTab
    {
        $queryHelper = new ContentQueryHelper(
            self::createStub(ConnectionPool::class),
            self::createStub(SearchableSchemaFieldsCollector::class),
        );

        return new FormTab($queryHelper);
    }

    private function queryHelperThatMustNotBeCalled(): ContentQueryHelper
    {
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::never())->method('createQueryBuilder');
        $queryHelper->expects(self::never())->method('getPageUidsWithRecords');

        return $queryHelper;
    }

    private function context(): FilterContext
    {
        return new FilterContext(self::createStub(BackendUserAuthentication::class), 0);
    }

    private function labelFromIdentifier(FormTab $tab, string $persistenceIdentifier): string
    {
        return (new ReflectionMethod($tab, 'labelFromIdentifier'))->invoke($tab, $persistenceIdentifier);
    }

    private function formLabel(FormTab $tab, string $persistenceIdentifier): string
    {
        return (new ReflectionMethod($tab, 'formLabel'))->invoke($tab, $persistenceIdentifier);
    }

    private function resolveFileUid(FormTab $tab, string $persistenceIdentifier): ?int
    {
        return (new ReflectionMethod($tab, 'resolveFileUid'))->invoke($tab, $persistenceIdentifier, $this->context());
    }
}
