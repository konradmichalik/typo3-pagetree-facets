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

namespace KonradMichalik\PagetreeFacets\Tests\Unit\Fixture;

use Psr\Http\Message\{ResponseInterface, ServerRequestInterface};
use Psr\Http\Server\RequestHandlerInterface;
use TYPO3\CMS\Core\Http\JsonResponse;

use function is_string;

/**
 * RecordingRequestHandler.
 *
 * Stands in for the rest of the backend middleware stack: records whether it was
 * reached at all and with which search phrase, which is the entire observable
 * effect of PageTreeFilterMiddleware.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final class RecordingRequestHandler implements RequestHandlerInterface
{
    public bool $wasCalled = false;

    public ?string $receivedPhrase = null;

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $this->wasCalled = true;
        $phrase = $request->getQueryParams()['q'] ?? null;
        $this->receivedPhrase = is_string($phrase) ? $phrase : null;

        return new JsonResponse([]);
    }
}
