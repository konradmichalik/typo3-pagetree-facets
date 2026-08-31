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
use KonradMichalik\PagetreeFacets\Tab\RecordsTab;
use KonradMichalik\PagetreeFacets\Token\Token;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;
use TYPO3\CMS\Core\Database\ConnectionPool;
use TYPO3\CMS\Core\Package\{MetaData, PackageInterface, PackageManager};
use TYPO3\CMS\Core\Schema\SearchableSchemaFieldsCollector;

/**
 * RecordsTabTest.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RecordsTabTest extends TestCase
{
    /** @var array<string, mixed>|null */
    private ?array $originalTca = null;

    protected function setUp(): void
    {
        $this->originalTca = $GLOBALS['TCA'] ?? null;
    }

    protected function tearDown(): void
    {
        $GLOBALS['TCA'] = $this->originalTca;
    }

    #[Test]
    public function coreTablesShareOneBucket(): void
    {
        $GLOBALS['TCA'] = $this->fakeTca(['pages', 'tt_content', 'sys_category', 'be_dashboards', 'fe_groups']);

        $fields = $this->modalFields($this->createTab());

        self::assertCount(1, $fields);
        self::assertSame('records.group.core', $this->lllKey($fields[0]['label']));
        self::assertSame(
            ['pages', 'tt_content', 'sys_category', 'be_dashboards', 'fe_groups'],
            array_column($fields[0]['options'], 'value'),
        );
    }

    #[Test]
    public function extensionTableBucketsUnderResolvedPackageTitle(): void
    {
        $GLOBALS['TCA'] = $this->fakeTca(['tx_news_domain_model_news']);
        $newsPackage = $this->fakePackage('news', 'News');

        $fields = $this->modalFields($this->createTab([$newsPackage]));

        self::assertCount(1, $fields);
        self::assertSame('News (news)', $fields[0]['label']);
        self::assertSame(['tx_news_domain_model_news'], array_column($fields[0]['options'], 'value'));
    }

    #[Test]
    public function extensionKeyWithUnderscoresMatchesStrippedTablePrefix(): void
    {
        // Extension key "static_info_tables" -> table prefix "tx_staticinfotables_",
        // NOT "tx_static_info_tables_" - a naive split-on-underscore heuristic
        // would miss this. No title on the package -> label falls back to the
        // bare extension key.
        $GLOBALS['TCA'] = $this->fakeTca(['tx_staticinfotables_country']);
        $package = $this->fakePackage('static_info_tables', null);

        $fields = $this->modalFields($this->createTab([$package]));

        self::assertCount(1, $fields);
        self::assertSame('static_info_tables', $fields[0]['label']);
        self::assertSame(['tx_staticinfotables_country'], array_column($fields[0]['options'], 'value'));
    }

    #[Test]
    public function unmatchedTableFallsIntoOtherBucket(): void
    {
        $GLOBALS['TCA'] = $this->fakeTca(['tx_totally_unknown_thing']);

        $fields = $this->modalFields($this->createTab());

        self::assertCount(1, $fields);
        self::assertSame('records.group.other', $this->lllKey($fields[0]['label']));
        self::assertSame(['tx_totally_unknown_thing'], array_column($fields[0]['options'], 'value'));
    }

    #[Test]
    public function hideTableIsStillRespectedAcrossAllBuckets(): void
    {
        $GLOBALS['TCA'] = $this->fakeTca(['pages', 'sys_file_reference']);
        $GLOBALS['TCA']['sys_file_reference']['ctrl']['hideTable'] = true;

        $fields = $this->modalFields($this->createTab());

        self::assertSame(['pages'], array_column($fields[0]['options'], 'value'));
    }

    #[Test]
    public function rootLevelOnlyTablesAreHiddenFromTheModal(): void
    {
        // be_groups lives on pid 0 only (rootLevel = 1) - it can never match
        // the pid > 0 record queries, so offering it would be a dead option.
        // rootLevel = -1 (both) tables can have records on pages and stay.
        $GLOBALS['TCA'] = $this->fakeTca(['pages', 'be_groups', 'sys_category']);
        $GLOBALS['TCA']['be_groups']['ctrl']['rootLevel'] = 1;
        $GLOBALS['TCA']['sys_category']['ctrl']['rootLevel'] = -1;

        $fields = $this->modalFields($this->createTab());

        self::assertSame(['pages', 'sys_category'], array_column($fields[0]['options'], 'value'));
    }

    #[Test]
    public function bucketsAppearInFirstSeenTcaOrder(): void
    {
        $GLOBALS['TCA'] = $this->fakeTca(['tx_news_domain_model_news', 'pages', 'tx_news_domain_model_category']);
        $newsPackage = $this->fakePackage('news', 'News');

        $fields = $this->modalFields($this->createTab([$newsPackage]));

        self::assertSame('News (news)', $fields[0]['label'], 'The news extension bucket is first-seen, so it must be the first field');
        self::assertSame('records.group.core', $this->lllKey($fields[1]['label']));
        self::assertSame(
            ['tx_news_domain_model_news', 'tx_news_domain_model_category'],
            array_column($fields[0]['options'], 'value'),
        );
    }

    #[Test]
    public function resolveRecordReturnsNoUidsWithoutAColon(): void
    {
        $tab = new RecordsTab($this->queryHelperThatMustNotBeCalled(), self::createStub(PackageManager::class));

        $uids = $tab->resolvePageUids(new Token('record', ['noColonAtAll'], 'record:noColonAtAll'), $this->context());

        self::assertSame([], $uids);
    }

    #[Test]
    public function resolveRecordReturnsNoUidsForANonPositiveUid(): void
    {
        $tab = new RecordsTab($this->queryHelperThatMustNotBeCalled(), self::createStub(PackageManager::class));

        $uids = $tab->resolvePageUids(new Token('record', ['pages:0'], 'record:pages:0'), $this->context());

        self::assertSame([], $uids);
    }

    /**
     * @param list<PackageInterface> $activePackages
     */
    private function createTab(array $activePackages = []): RecordsTab
    {
        $queryHelper = new ContentQueryHelper(
            self::createStub(ConnectionPool::class),
            self::createStub(SearchableSchemaFieldsCollector::class),
        );
        $packageManager = self::createStub(PackageManager::class);
        $packageManager->method('getActivePackages')->willReturn($activePackages);

        return new RecordsTab($queryHelper, $packageManager);
    }

    private function queryHelperThatMustNotBeCalled(): ContentQueryHelper&MockObject
    {
        $queryHelper = $this->createMock(ContentQueryHelper::class);
        $queryHelper->expects(self::never())->method('getPageUidsWithRecords');
        $queryHelper->expects(self::never())->method('createQueryBuilder');

        return $queryHelper;
    }

    private function context(): FilterContext
    {
        return new FilterContext(self::createStub(BackendUserAuthentication::class), 0, null);
    }

    private function fakePackage(string $key, ?string $title): PackageInterface
    {
        $metaData = self::createStub(MetaData::class);
        $metaData->method('getTitle')->willReturn($title);
        $package = self::createStub(PackageInterface::class);
        $package->method('getPackageKey')->willReturn($key);
        $package->method('getPackageMetaData')->willReturn($metaData);

        return $package;
    }

    /**
     * @param list<string> $tables
     *
     * @return array<string, mixed>
     */
    private function fakeTca(array $tables): array
    {
        $tca = [];
        foreach ($tables as $table) {
            $tca[$table] = ['ctrl' => ['title' => $table]];
        }

        return $tca;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function modalFields(RecordsTab $tab): array
    {
        $backendUser = self::createStub(BackendUserAuthentication::class);
        $backendUser->method('check')->willReturn(true);
        $context = new FilterContext($backendUser, 0, null);

        $fields = $tab->getModalConfiguration($context)['fields'];

        // Drop the trailing "text" field (unrelated to table bucketing) so
        // tests only see table-bucket fields at predictable indices.
        return array_values(array_filter($fields, static fn (array $field): bool => 'table' === $field['name']));
    }

    private function lllKey(string $lllReference): string
    {
        $pos = strrpos($lllReference, ':');

        return false !== $pos ? substr($lllReference, $pos + 1) : '';
    }
}
