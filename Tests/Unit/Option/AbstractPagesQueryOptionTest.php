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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Option;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Option\AbstractPagesQueryOption;
use KonradMichalik\PagetreeFacets\Service\ContentQueryHelper;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * AbstractPagesQueryOptionTest.
 *
 * Covers the presentation defaults of the option base class. Every built-in
 * option overrides both of them, so these defaults are reachable only through a
 * third-party option - which is exactly why they are part of the public
 * extension point's contract and worth pinning down: implementors may omit an
 * icon and a description and still get a valid option.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class AbstractPagesQueryOptionTest extends TestCase
{
    #[Test]
    public function iconAndDescriptionDefaultToNull(): void
    {
        self::assertNull($this->createMinimalOption()->getIcon());
        self::assertNull($this->createMinimalOption()->getDescription());
    }

    /**
     * An option implementing nothing but the required interface members, so the
     * base class supplies everything else.
     */
    private function createMinimalOption(): AbstractPagesQueryOption
    {
        return new class(self::createStub(ContentQueryHelper::class)) extends AbstractPagesQueryOption {
            public function getTokenKey(): string
            {
                return 'is';
            }

            public function getValue(): string
            {
                return 'third-party';
            }

            public function getLabel(): string
            {
                return 'Third party';
            }

            public function resolvePageUids(FilterContext $context): array
            {
                return [];
            }
        };
    }
}
