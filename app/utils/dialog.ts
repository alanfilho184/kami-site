/**
 * Comportamento compartilhado dos diálogos: trava o scroll do documento,
 * prende o Tab dentro do dialog e devolve o foco ao gatilho quando fecha.
 *
 * O contador de locks permite diálogos empilhados (por exemplo, a prévia com o
 * lightbox aberto por cima): o scroll só volta quando o último fecha.
 */

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

let lockCount = 0;
let originalHtmlOverflow = '';
let originalBodyOverflow = '';
let originalBodyPaddingRight = '';

const focusStack: (HTMLElement | null)[] = [];

export function lockDialogScroll(): void {
    if (typeof document === 'undefined') {
        return;
    }

    if (lockCount === 0) {
        originalHtmlOverflow = document.documentElement.style.overflow;
        originalBodyOverflow = document.body.style.overflow;
        originalBodyPaddingRight = document.body.style.paddingRight;

        const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        if (scrollbarGap > 0) {
            document.body.style.paddingRight = `${scrollbarGap}px`;
        }
    }

    lockCount += 1;
}

export function unlockDialogScroll(): void {
    if (typeof document === 'undefined' || lockCount === 0) {
        return;
    }

    lockCount -= 1;

    if (lockCount === 0) {
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.overflow = originalBodyOverflow;
        document.body.style.paddingRight = originalBodyPaddingRight;
    }
}

export function rememberDialogFocus(): void {
    if (typeof document === 'undefined') {
        return;
    }

    focusStack.push(document.activeElement instanceof HTMLElement ? document.activeElement : null);
}

export function restoreDialogFocus(): void {
    const element = focusStack.pop();

    if (element && document.contains(element)) {
        element.focus();
    }
}

export function focusableIn(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        element => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
    );
}

export function focusDialog(container: HTMLElement | null): void {
    container?.focus();
}

export function trapDialogTab(event: KeyboardEvent, container: HTMLElement): void {
    if (event.key !== 'Tab') {
        return;
    }

    const focusable = focusableIn(container);

    if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
    }

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;

    if (active === container || !container.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
    }

    if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
        return;
    }

    if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}
