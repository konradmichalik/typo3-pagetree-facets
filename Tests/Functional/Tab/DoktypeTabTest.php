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

namespace KonradMichalik\PagetreeLens\Tests\Functional\Tab;

use KonradMichalik\PagetreeLens\Tab\DoktypeTab;
use PHPUnit\Framework\Attributes\Test;

final class DoktypeTabTest extends AbstractTabTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->importCSVDataSet(__DIR__ . '/../Fixtures/DoktypeTab.csv');
    }

    #[Test]
    public function findsPagesBySingleDoktype(): void
    {
        self::assertSame([3], $this->resolve($this->get(DoktypeTab::class), 'doktype:254'));
    }

    #[Test]
    public function commaValuesAreOrCombined(): void
    {
        self::assertSame([3, 4], $this->resolve($this->get(DoktypeTab::class), 'doktype:4,254'));
    }

    #[Test]
    public function deletedPagesAreExcluded(): void
    {
        // uid 5 is a deleted sysfolder - must not appear.
        self::assertSame([3], $this->resolve($this->get(DoktypeTab::class), 'doktype:254'));
    }
}
