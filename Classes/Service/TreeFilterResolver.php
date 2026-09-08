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

namespace KonradMichalik\PagetreeFacets\Service;

use KonradMichalik\PagetreeFacets\Api\FilterContext;
use KonradMichalik\PagetreeFacets\Token\{Token, TokenParser};
use TYPO3\CMS\Core\Authentication\BackendUserAuthentication;

/**
 * TreeFilterResolver.
 *
 * Everything a tree request needs to turn a search phrase into a hit list -
 * permission gate, parse, scope extraction, resolution, hand-over to the render
 * phase - minus the part that talks to a specific core API.
 *
 * It exists because there are two of those core APIs. On v14 the entry point is
 * BeforePageTreeIsFilteredEvent ({@see PageTreeFilterListener}); on v13, which
 * has no such event, it is a middleware that rewrites the filter request
 * ({@see \KonradMichalik\PagetreeFacets\Compatibility\V13\PageTreeFilterMiddleware}).
 * Both must produce byte-identical hit lists for the same phrase, so the
 * decision logic lives here and the two adapters own nothing but the
 * translation into their respective core shape - the same reason
 * FilterResolutionService is shared between the tree and the modal's live count.
 *
 * @author Konrad Michalik <hej@konradmichalik.dev>
 */
final readonly class TreeFilterResolver
{
    public function __construct(
        private TokenParser $tokenParser,
        private FacetRegistry $facetRegistry,
        private FilterResolutionService $filterResolutionService,
        private MatchedPageRegistry $matchedPages,
    ) {}

    /**
     * Resolve a raw tree search phrase into the pages it matches.
     *
     * The three outcomes are distinct and callers must keep them apart:
     * `null` means "not ours" - no backend user, feature disabled, freetext
     * only, or nothing but unknown/scope tokens - and the core search has to run
     * untouched. An empty list means the criteria resolved and matched nothing,
     * which is a hard no-match the caller has to enforce. A non-empty list is
     * the complete result set.
     *
     * @return list<int>|null
     */
    public function resolve(string $phrase): ?array
    {
        $backendUser = $this->getBackendUser();
        if (null === $backendUser || $this->facetRegistry->isDisabledForUser($backendUser)) {
            return null;
        }

        $tokens = $this->tokenParser->parse($phrase);
        if (!$this->tokenParser->hasKeyedTokens($tokens)) {
            // Freetext only -> core title/uid search stays untouched.
            return null;
        }

        $context = new FilterContext(
            $backendUser,
            $backendUser->workspace,
            $this->extractSiteScope($tokens),
        );

        $uids = $this->filterResolutionService->resolve($tokens, $context);
        if (null === $uids) {
            return null; // only unknown/scope tokens -> behave like core
        }

        // Hand the hit list to the rendering phase before the caller turns it
        // into whatever its core API needs - by then the no-match substitutions
        // would be indistinguishable from real hits. SearchResultLabelListener
        // picks it up from here to tell hits apart from the rootline rendered
        // around them.
        $this->matchedPages->record($uids);

        return $uids;
    }

    /**
     * @param list<Token> $tokens
     */
    private function extractSiteScope(array $tokens): ?string
    {
        foreach ($tokens as $token) {
            if ('site' === $token->key) {
                return $token->firstValue();
            }
        }

        return null;
    }

    private function getBackendUser(): ?BackendUserAuthentication
    {
        $backendUser = $GLOBALS['BE_USER'] ?? null;

        return $backendUser instanceof BackendUserAuthentication ? $backendUser : null;
    }
}
