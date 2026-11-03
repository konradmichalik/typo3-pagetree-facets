/**
 * This file is part of the "typo3_pagetree_facets" TYPO3 CMS extension.
 *
 * (c) 2026 Konrad Michalik <hej@konradmichalik.dev>
 */
import { renderChip } from '@konradmichalik/pagetree-facets/Filter/chip.js';
import { format, lang, uniqueId } from '@konradmichalik/pagetree-facets/Filter/form-controls.js';
import { attachPopover } from '@konradmichalik/pagetree-facets/Filter/popover.js';

/**
 * The criteria row keeps to two rows of chips. The chips past that are hidden
 * and collected behind `+N more`, which opens a popover listing every criterion
 * grouped by facet, each with its own ×, plus Clear all.
 *
 * How many chips fit is measured, never clipped: the row is laid out with every
 * chip, the chips beyond the second row are hidden, and the button and the
 * actions are measured again until they fit as well. The measuring is a
 * function of its own so the fitting can be tested without a layout engine.
 */

const MAX_ROWS = 2;

/**
 * @param {{chips: HTMLElement, actions: HTMLElement, onRemove: (criterion: object) => void,
 *   onClearAll: () => void, onFocusLost: () => void,
 *   measure?: (elements: HTMLElement[]) => number[], observe?: (element: HTMLElement, callback: () => void) => void}} deps -
 *   `chips` holds the row's chip nodes in criteria order; `onFocusLost` takes the
 *   focus when the popover closes under it; `measure` returns the row index of
 *   each element, `observe` calls back whenever the row's size changes
 * @returns {{element: HTMLElement, update: (criteria: Array<object>) => void, close: () => void,
 *   focusButton: () => void}}
 */
export function buildCriteriaOverflow({
  chips, actions, onRemove, onClearAll, onFocusLost, measure = measureRows, observe = observeResize,
}) {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__overflow';
  element.hidden = true;

  const panel = buildPanel();
  const button = buildButton(panel.element.id);
  const popover = attachPopover({ trigger: button, panel: panel.element, onOpen: () => panel.element.focus() });
  panel.clearAll.addEventListener('click', onClearAll);
  element.append(button, panel.element);

  let current = [];

  function layout() {
    const nodes = [...chips.children];
    nodes.forEach((chip) => { chip.hidden = false; });
    element.hidden = true;
    const rows = measure([...nodes, actions]);
    let visible = nodes.filter((_, index) => rows[index] < MAX_ROWS).length;
    if (visible === nodes.length && rows[nodes.length] < MAX_ROWS) {
      return;
    }
    // The button and the actions need a place on the second row as well, so at
    // least one chip goes behind the button.
    visible = Math.min(visible, nodes.length - 1);
    showHidden(nodes, visible);
    while (visible > 0 && !measure([...nodes.slice(0, visible), button, actions]).every((row) => row < MAX_ROWS)) {
      visible -= 1;
      showHidden(nodes, visible);
    }
  }

  function showHidden(nodes, visible) {
    nodes.forEach((chip, index) => { chip.hidden = index >= visible; });
    element.hidden = false;
    const count = nodes.length - visible;
    button.textContent = format('pagetreeFacets.modal.overflow.more', '+%d more', count);
    button.setAttribute('aria-label', format('pagetreeFacets.modal.overflow.show', 'Show %d more criteria', count));
  }

  function update(criteria) {
    current = criteria;
    // Where focus sits before the layout hides a chip or the list is rebuilt.
    const focused = document.activeElement;
    const chip = [...chips.children].find((node) => node.contains(focused));
    const entry = panel.entries().indexOf(focused);
    const inside = element.contains(focused);
    layout();
    if (element.hidden) {
      panel.render([], { onRemove });
      popover.close();
      if (inside) {
        onFocusLost();
      }
      return;
    }
    panel.render(criteria, { onRemove });
    if (chip?.hidden) {
      // A resize took the chip behind the button, which is where it now lives.
      button.focus();
    } else if (entry >= 0) {
      panel.entries()[Math.min(entry, panel.entries().length - 1)].focus();
    }
  }

  observe(chips.parentElement, () => update(current));

  return {
    element,
    update,
    close: () => popover.close(),
    focusButton: () => button.focus(),
  };
}

function buildButton(panelId) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pagetree-facets__overflow-button';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', panelId);

  return button;
}

// A dialog named by its heading; focus lands on it, so the name is announced.
function buildPanel() {
  const element = document.createElement('div');
  element.className = 'pagetree-facets__overflow-panel';
  element.id = uniqueId('pagetree-facets__overflow');
  element.hidden = true;
  element.setAttribute('role', 'dialog');
  element.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'pagetree-facets__overflow-head';
  const title = document.createElement('h3');
  title.className = 'pagetree-facets__overflow-title';
  title.id = uniqueId('pagetree-facets__overflow-title');
  element.setAttribute('aria-labelledby', title.id);
  const clearAll = document.createElement('button');
  clearAll.type = 'button';
  clearAll.className = 'btn btn-sm btn-link pagetree-facets__overflow-clear';
  clearAll.textContent = lang('pagetreeFacets.modal.clearAll', 'Clear all');
  head.append(title, clearAll);

  const list = document.createElement('dl');
  list.className = 'pagetree-facets__overflow-list';
  element.append(head, list);

  return {
    element,
    clearAll,
    entries: () => [...list.querySelectorAll('.pagetree-facets__chip-remove')],
    render: (criteria, { onRemove }) => {
      title.textContent = format('pagetreeFacets.modal.overflow.title', 'All %d criteria', criteria.length);
      list.replaceChildren(...renderGroups(criteria, onRemove));
    },
  };
}

// One group per facet in the order the criteria come, the chips without the
// facet prefix since the term already names it.
function renderGroups(criteria, onRemove) {
  const groups = new Map();
  for (const criterion of criteria) {
    if (!groups.has(criterion.prefix)) {
      groups.set(criterion.prefix, []);
    }
    groups.get(criterion.prefix).push(criterion);
  }

  return [...groups].map(([prefix, members]) => {
    const group = document.createElement('div');
    group.className = 'pagetree-facets__overflow-group';
    const term = document.createElement('dt');
    term.textContent = prefix;
    const values = document.createElement('dd');
    values.append(...members.map((criterion) => renderChip(criterion, () => onRemove(criterion), { withPrefix: false })));
    group.append(term, values);

    return group;
  });
}

// Items on one flex line share a top edge; half a chip of tolerance covers
// the centring of items of different heights. The elements come in DOM order,
// so a new top edge is always the next row.
function measureRows(elements) {
  const tops = [];

  return elements.map((element) => {
    const top = element.offsetTop;
    const index = tops.findIndex((known) => Math.abs(known - top) < 13);
    if (index >= 0) {
      return index;
    }
    tops.push(top);

    return tops.length - 1;
  });
}

function observeResize(element, callback) {
  new ResizeObserver(callback).observe(element);
}
