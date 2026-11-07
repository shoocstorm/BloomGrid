import { h } from './dom';
import { icon } from './icons';

/**
 * A small ✕ in a popup's top-right corner (D-128): every notification, alert card and request can be closed.
 * `label` names what it closes, for the tooltip and screen readers.
 */
export function closeX(label: string, onClose: () => void): HTMLButtonElement {
  return h(
    'button',
    {
      class: 'pop-x icon-btn',
      title: `Close ${label}`,
      'aria-label': `Close ${label}`,
      onClick: (e: Event) => {
        e.stopPropagation();
        onClose();
      },
    },
    icon('close'),
  ) as HTMLButtonElement;
}
