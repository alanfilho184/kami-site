import { expect, test as teardown } from '@playwright/test';
import type { SheetListItem } from '../../shared/types/panel';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

/**
 * A conta de E2E tem limite de fichas. Este teardown apaga o que a suíte criou
 * para a próxima execução começar do zero.
 */
teardown('limpa as fichas criadas pela suíte', async ({ page }) => {
    if (!loginEmail) {
        return;
    }

    const response = await page.request.get('/api/fichas');

    expect(response.status()).toBe(200);

    const sheets = (await response.json()) as SheetListItem[];

    for (const sheet of sheets) {
        const deleted = await page.request.delete(`/api/fichas/${sheet.id}`, {
            data: { version: sheet.updatedAt },
            headers: { origin: baseUrl }
        });

        expect(deleted.status()).toBe(204);
    }
});
