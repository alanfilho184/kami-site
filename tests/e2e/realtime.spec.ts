import { expect, test, type Page } from '@playwright/test';
import type { SheetDetail } from '../../shared/types/sheet';
import { sheetPath } from '../../shared/utils/sheet-url';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test.use({ storageState: 'tests/e2e/.auth/sheets.json' });

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

async function createSheet(page: Page, name: string): Promise<SheetDetail> {
    const response = await page.request.post('/api/fichas', {
        data: { name },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(201);

    return (await response.json()) as SheetDetail;
}

async function deleteSheet(page: Page, sheetId: number): Promise<void> {
    const response = await page.request.get(`/api/fichas/${sheetId}`);

    if (!response.ok()) {
        return;
    }

    const sheet = (await response.json()) as SheetDetail;

    await page.request.delete(`/api/fichas/${sheetId}`, {
        data: { version: sheet.version },
        headers: { origin: baseUrl }
    });
}

test('o painel atualiza as fichas recentes sem recarregar', async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto('/painel');
    await waitForHydration(page);
    await expect(page.locator('[data-panel-realtime="connected"]')).toBeVisible({ timeout: 10_000 });

    const name = `Painel ${Date.now().toString(36)}`;
    const sheet = await createSheet(page, name);
    const recent = page.locator('.site-painel-lista__link').filter({ hasText: name });

    try {
        await expect(recent).toBeVisible();
    } finally {
        await deleteSheet(page, sheet.id);
    }

    await expect(recent).toHaveCount(0);
});

test('duas abas veem a mesma alteração de ficha sem recarregar', async ({ page }) => {
    test.setTimeout(60_000);

    const name = `Realtime ${Date.now().toString(36)}`;
    const sheet = await createSheet(page, name);
    const editorPath = sheetPath(sheet.userId, sheet.name);

    const secondPage = await page.context().newPage();

    try {
        for (const currentPage of [page, secondPage]) {
            await currentPage.goto(editorPath);
            await waitForHydration(currentPage);
            await expect(currentPage.locator('[data-realtime-sheet="subscribed"]')).toBeVisible({ timeout: 10_000 });
        }

        const updatedName = `${name} editada`;

        await page.locator('#ficha-nome').fill(updatedName);
        await page.keyboard.press('Control+s');
        await expect(page.getByText('FICHA SALVA.').last()).toBeVisible();

        await expect(secondPage.locator('#ficha-nome')).toHaveValue(updatedName);
    } finally {
        await secondPage.close();
        await deleteSheet(page, sheet.id);
    }
});
