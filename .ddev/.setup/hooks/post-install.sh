# Seed the demo pages and content elements to filter against.
#
# Runs last, after update_typo3, since the seed command writes records and
# needs the schema to exist first. It is idempotent - it deletes the pages
# from a prior run by title, then recreates them - so re-installing is safe.
#
# A missing command means the demo_content fixture is not installed -
# reported rather than silently skipped, since "no demo pages" is otherwise
# indistinguishable from success.
if $TYPO3_BIN list 2>/dev/null | grep -q 'pagetree-facets:seed-demo-content'; then
    summary=$($TYPO3_BIN pagetree-facets:seed-demo-content 2>&1 | grep -v 'JIT' | grep -v '^$' | tail -2)
    printf "Demo content: %s\n" "$(echo "$summary" | tr '\n' ' ')"
else
    printf "No demo content: the demo_content fixture is not installed\n"
fi
