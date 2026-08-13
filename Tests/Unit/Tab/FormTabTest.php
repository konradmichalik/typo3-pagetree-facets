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
use RuntimeException;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Form\Mvc\Persistence\FormPersistenceManagerInterface;

/**
 * TestableFormTab.
 *
 * @internal test seam only - exposes FormTab's protected label helpers for
 * direct assertions, without going through the DB-touching modal/resolve
 * entry points that call them
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class TestableFormTab extends FormTab
{
    public function labelFromIdentifierForTesting(string $persistenceIdentifier): string
    {
        return $this->labelFromIdentifier($persistenceIdentifier);
    }

    public function formLabelForTesting(string $persistenceIdentifier): string
    {
        return $this->formLabel($persistenceIdentifier);
    }
}

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

        self::assertSame('Contact Form', $tab->labelFromIdentifierForTesting('EXT:my_ext/Resources/Private/Forms/contact_form.form.yaml'));
        self::assertSame('Newsletter Signup', $tab->labelFromIdentifierForTesting('1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function labelFromIdentifierFallsBackToTheWholeValueWhenThereIsNoFilename(): void
    {
        $tab = $this->createTab();

        self::assertSame('', $tab->labelFromIdentifierForTesting(''));
    }

    #[Test]
    public function formLabelUsesTheLoadedDefinitionsLabelWhenAvailable(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willReturn(['label' => 'Newsletter Signup']);
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $tab->formLabelForTesting('1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function formLabelFallsBackToTheIdentifierWhenLoadThrows(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willThrowException(new RuntimeException('storage gone'));
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $tab->formLabelForTesting('1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function formLabelFallsBackToTheIdentifierWhenTheLoadedLabelIsEmpty(): void
    {
        $manager = self::createStub(FormPersistenceManagerInterface::class);
        $manager->method('load')->willReturn(['label' => '']);
        GeneralUtility::addInstance(FormPersistenceManagerInterface::class, $manager);

        $tab = $this->createTab();

        self::assertSame('Newsletter Signup', $tab->formLabelForTesting('1:/form_definitions/newsletter-signup.form.yaml'));
    }

    #[Test]
    public function resolvePageUidsReturnsNoUidsWithoutAnyValues(): void
    {
        $tab = new FormTab($this->queryHelperThatMustNotBeCalled());

        self::assertSame([], $tab->resolvePageUids(new Token('form', [], 'form:'), $this->context()));
    }

    private function createTab(): TestableFormTab
    {
        $queryHelper = new ContentQueryHelper(
            self::createStub(ConnectionPool::class),
            self::createStub(SearchableSchemaFieldsCollector::class),
        );

        return new TestableFormTab($queryHelper);
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
}
