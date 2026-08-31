# .ddev/.setup/project.sh — repo-owned customizations for `ddev install`.
#
# Sourced by utils.sh on every install; not add-on managed, so it survives
# `ddev add-on get` upgrades (see .setup/project.sh.example).

# Symlink the local-only fixture extensions into packages/ alongside the
# default Tests/Acceptance/Fixtures/packages/*.
FIXTURE_EXTENSION_DIRS=(
    'Tests/Functional/Fixtures/Extensions'
)

# Require them so they are actually installed/activated, not just resolvable
# through the packages/* path repository - symlinking alone leaves their
# event listeners and commands (pagetree-facets:seed-demo-content, the
# example tab) absent from the running instance.
ADDITIONAL_PACKAGES=(
    'konradmichalik/pagetree-facets-demo-content:*@dev'
    'konradmichalik/pagetree-facets-example-tab:*@dev'
)
