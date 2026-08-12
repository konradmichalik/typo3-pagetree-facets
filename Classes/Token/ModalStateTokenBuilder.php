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

namespace KonradMichalik\PagetreeFacets\Token;

use KonradMichalik\PagetreeFacets\Service\FacetRegistry;
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

/**
 * ModalStateTokenBuilder.
 *
 * The third leg alongside TokenParser (phrase -> tokens) and TokenSerializer
 * (tokens -> phrase): turns the modal's posted state - one facet-owned value
 * set per non-empty tab, plus the site/page-scope/freetext values the engine
 * treats as scope rather than criteria (see PageTreeFilterListener) - into
 * the same `list<Token>` shape both of those work with. Used identically by
 * FacetsModalController::serialize() and ::count(), which is the point: one
 * implementation of "what does this posted state mean as tokens," not two.
 *
 * Extracted out of FacetsModalController rather than kept as a private
 * method there: that controller's class-level cognitive complexity was at
 * PHPStan's ceiling once count() was added, and this orchestration - loop
 * over facets, four conditionals - was the largest single contributor left.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class ModalStateTokenBuilder
{
    public function __construct(
        private FacetRegistry $facetRegistry,
    ) {}

    /**
     * @param array<string, mixed> $body
     *
     * @return list<Token>
     */
    public function build(array $body, BackendUserAuthentication $backendUser): array
    {
        $states = (array) ($body['states'] ?? []);
        $siteIdentifier = (string) ($body['site'] ?? '');
        $pageScope = (int) ($body['pageScope'] ?? 0);
        $freetext = trim((string) ($body['freetext'] ?? ''));

        $tokens = [];
        foreach ($this->facetRegistry->getFacets($backendUser) as $facet) {
            $state = (array) ($states[$facet->getIdentifier()] ?? []);
            if ([] !== $state) {
                $tokens = array_merge($tokens, $facet->serialize($state));
            }
        }
        if ('' !== $siteIdentifier) {
            $tokens[] = new Token('site', [$siteIdentifier], 'site:'.$siteIdentifier);
        }
        if ($pageScope > 0) {
            $tokens[] = new Token('under', [(string) $pageScope], 'under:'.$pageScope);
        }
        if ('' !== $freetext) {
            $tokens[] = new Token(Token::FREETEXT, [$freetext], $freetext);
        }

        return $tokens;
    }
}
