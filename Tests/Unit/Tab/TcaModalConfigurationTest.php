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
use KonradMichalik\PagetreeFacets\Tab\{ContentElementTab, DoktypeTab, RecordsTab};
use KonradMichalik\Ttt\Attribute\WithTca;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Package\PackageManager;
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;

/**
 * TcaModalConfigurationTest.
 *
 * The TCA-driven parts of getModalConfiguration(), against a hand-written TCA
 * instead of the real one. This complements the functional
 * Tab\ModalConfigurationTest, which proves the tabs read the *real* TCA - here
 * we pin down the branches that a real TCA cannot produce: a declared but empty
 * item group, an item group missing from itemGroups, an item without a group,
 * a CType TCA that drops authMode, the icon/label fallback chains, and a table
 * the current user may not select.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class TcaModalConfigurationTest extends TestCase
{
    #[Test]
    #[WithTca('tt_content', ['columns' => ['CType' => ['config' => [
        'authMode' => 'explicitAllow',
        // Deliberately not the order the items below are declared in, and
        // "forms" is declared without ever being used by an item.
        'itemGroups' => ['special' => 'Special elements', 'forms' => 'Forms', 'default' => 'Regular elements'],
        'items' => [
            ['value' => 'text', 'label' => 'Text', 'group' => 'default'],
            ['value' => 'html', 'label' => 'HTML', 'group' => 'special'],
        ],
    ]]]])]
    public function contentElementFieldsFollowItemGroupsOrderAndSkipEmptyGroups(): void
    {
        $configuration = $this->contentElementTab()->getModalConfiguration($this->context());

        self::assertSame(
            ['Special elements', 'Regular elements'],
            array_column($configuration['fields'], 'label'),
            'Fields follow the itemGroups order, and a group without options produces no field',
        );
    }

    #[Test]
    #[WithTca('tt_content', ['columns' => ['CType' => ['config' => [
        'authMode' => 'explicitAllow',
        'itemGroups' => ['default' => 'Regular elements'],
        'items' => [
            ['value' => 'text', 'label' => 'Text'],
            ['value' => '--div--', 'label' => 'A divider'],
            ['value' => 'menu', 'label' => 'Menu', 'group' => 'lists'],
        ],
    ]]]])]
    public function contentElementBucketsUngroupedItemsIntoDefaultAndLabelsUnknownGroupsByIdentifier(): void
    {
        $configuration = $this->contentElementTab()->getModalConfiguration($this->context());

        // "lists" is not in itemGroups, so it keeps its identifier as the label
        // and lands after every declared group.
        self::assertSame(['Regular elements', 'lists'], array_column($configuration['fields'], 'label'));
        self::assertSame(['text'], array_column($configuration['fields'][0]['options'], 'value'));
        self::assertSame(['menu'], array_column($configuration['fields'][1]['options'], 'value'));
    }

    /**
     * The permission guard is conditional on authMode being a string, mirroring
     * the core's AbstractItemProvider. The real CType TCA always sets it, so
     * only a hand-written TCA can prove the guard is actually skipped rather
     * than silently denying everything.
     */
    #[Test]
    #[WithTca('tt_content', ['columns' => ['CType' => ['config' => [
        'itemGroups' => ['default' => 'Regular elements'],
        'items' => [['value' => 'text', 'label' => 'Text']],
    ]]]])]
    public function contentElementSkipsThePermissionCheckWhenTcaDropsAuthMode(): void
    {
        $backendUser = self::createMock(BackendUserAuthentication::class);
        $backendUser->expects(self::never())->method('checkAuthMode');

        $configuration = $this->contentElementTab()->getModalConfiguration(
            new FilterContext($backendUser, 0, null),
        );

        self::assertSame(['text'], array_column($configuration['fields'][0]['options'], 'value'));
    }

    #[Test]
    #[WithTca('pages', [
        'ctrl' => ['typeicon_classes' => [1 => 'icon-standard', 'default' => 'icon-fallback']],
        'columns' => ['doktype' => ['config' => ['items' => [
            ['value' => 1, 'label' => 'Standard'],
            ['value' => 4, 'label' => 'Shortcut', 'icon' => 'icon-explicit'],
            ['value' => 254, 'label' => 'Folder'],
        ]]]],
    ])]
    public function doktypeIconWalksTheTypeiconClassesFallbackChain(): void
    {
        $configuration = $this->doktypeTab()->getModalConfiguration($this->context());

        self::assertSame(
            [
                '1' => 'icon-standard',   // no item icon -> typeicon_classes[value]
                '4' => 'icon-explicit',   // an explicit item icon always wins
                '254' => 'icon-fallback', // no entry for 254 -> typeicon_classes[default]
            ],
            array_column($configuration['fields'][0]['options'], 'icon', 'value'),
        );
    }

    #[Test]
    #[WithTca('pages', ['columns' => ['doktype' => ['config' => ['items' => [
        ['value' => 1, 'label' => 'Standard'],
    ]]]]])]
    public function doktypeIconIsEmptyWithoutAnyIconInformation(): void
    {
        $configuration = $this->doktypeTab()->getModalConfiguration($this->context());

        self::assertSame('', $configuration['fields'][0]['options'][0]['icon']);
    }

    #[Test]
    #[WithTca('tt_content', ['ctrl' => ['title' => 'Content', 'typeicon_classes' => ['default' => 'icon-content']]])]
    #[WithTca('tx_example_hidden', ['ctrl' => ['title' => 'Hidden', 'hideTable' => true]])]
    #[WithTca('tx_example_bare', ['ctrl' => []])]
    public function recordsTableOptionsSkipHiddenTablesAndFallBackForTitleAndIcon(): void
    {
        $configuration = $this->recordsTab()->getModalConfiguration($this->context());

        // With bucketing, table options are spread across multiple fields.
        // Gather all options from all table-named fields.
        $allOptions = [];
        foreach ($configuration['fields'] as $field) {
            if ('table' === $field['name']) {
                $tableOptions = array_column($field['options'], null, 'value');
                $allOptions = array_merge($allOptions, $tableOptions);
            }
        }

        self::assertArrayNotHasKey('tx_example_hidden', $allOptions, 'ctrl.hideTable excludes a table');
        self::assertSame('Content', $allOptions['tt_content']['label']);
        self::assertSame('icon-content', $allOptions['tt_content']['icon']);
        // No ctrl.title and no typeicon_classes: the table name is the label and
        // the icon stays empty rather than becoming "0" or null.
        self::assertSame('tx_example_bare', $allOptions['tx_example_bare']['label']);
        self::assertSame('', $allOptions['tx_example_bare']['icon']);
    }

    #[Test]
    #[WithTca('tt_content', ['ctrl' => ['title' => 'Content']])]
    #[WithTca('tx_example_denied', ['ctrl' => ['title' => 'Denied']])]
    public function recordsTableOptionsAreRestrictedByTablesSelect(): void
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('check')->willReturnCallback(
            static fn (string $permission, string $table): bool => 'tt_content' === $table,
        );

        $configuration = $this->recordsTab()->getModalConfiguration(new FilterContext($backendUser, 0, null));

        // With bucketing, gather all table values from all table-named fields.
        $allTableValues = [];
        foreach ($configuration['fields'] as $field) {
            if ('table' === $field['name']) {
                $allTableValues = array_merge($allTableValues, array_column($field['options'], 'value'));
            }
        }

        self::assertSame(['tt_content'], $allTableValues);
    }

    private function contentElementTab(): ContentElementTab
    {
        return new ContentElementTab($this->queryHelper());
    }

    private function doktypeTab(): DoktypeTab
    {
        return new DoktypeTab($this->queryHelper());
    }

    private function recordsTab(): RecordsTab
    {
        $packageManager = self::createStub(PackageManager::class);
        $packageManager->method('getActivePackages')->willReturn([]);

        return new RecordsTab($this->queryHelper(), $packageManager);
    }

    /**
     * Neither tab touches the database while building its modal configuration,
     * so stubs are enough to satisfy the constructor.
     */
    private function queryHelper(): ContentQueryHelper
    {
        return new ContentQueryHelper(
            self::createStub(ConnectionPool::class),
            self::createStub(SearchableSchemaFieldsCollector::class),
        );
    }

    /**
     * A user that is allowed everything - the permission filtering itself is
     * covered functionally, against the real TCA and real group records.
     */
    private function context(): FilterContext
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('checkAuthMode')->willReturn(true);
        $backendUser->method('check')->willReturn(true);

        return new FilterContext($backendUser, 0, null);
    }
}
