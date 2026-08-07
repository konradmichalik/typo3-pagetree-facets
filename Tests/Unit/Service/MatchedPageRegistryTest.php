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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Service;

use KonradMichalik\PagetreeFacets\Service\MatchedPageRegistry;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * MatchedPageRegistryTest.
 *
 * The two states that matter downstream: "no facet filter ran" (the label
 * listener must keep its hands off the tree) versus "a facet filter ran and
 * these are its hits" - including the case where it ran and matched nothing.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class MatchedPageRegistryTest extends TestCase
{
    #[Test]
    public function anUntouchedRegistryIsInactive(): void
    {
        $registry = new MatchedPageRegistry();

        self::assertFalse($registry->isActive());
        self::assertFalse($registry->matches(10));
    }

    #[Test]
    public function recordedUidsMatch(): void
    {
        $registry = new MatchedPageRegistry();
        $registry->record([10, 20]);

        self::assertTrue($registry->isActive());
        self::assertTrue($registry->matches(10));
        self::assertTrue($registry->matches(20));
        self::assertFalse($registry->matches(30));
    }

    #[Test]
    public function recordingAnEmptyResultStillCountsAsActive(): void
    {
        // A filter that matched nothing is not the same as no filter at all:
        // the tree renders its entry points either way, and only the "active"
        // flag tells the two apart.
        $registry = new MatchedPageRegistry();
        $registry->record([]);

        self::assertTrue($registry->isActive());
        self::assertFalse($registry->matches(10));
    }

    #[Test]
    public function repeatedRecordingAddsUpInsteadOfReplacing(): void
    {
        // record() is called once per web mount, because the core dispatches
        // BeforePageTreeIsFilteredEvent per entry point.
        $registry = new MatchedPageRegistry();
        $registry->record([10]);
        $registry->record([20]);

        self::assertTrue($registry->matches(10));
        self::assertTrue($registry->matches(20));
    }
}
