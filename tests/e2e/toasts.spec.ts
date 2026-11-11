import { expect, test, type Page } from '@playwright/test';
import type { SheetDetail } from '../../shared/types/sheet';
import { sheetPath } from '../../shared/utils/sheet-url';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test.use({ storageState: 'tests/e2e/.auth/sheets.json' });

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

function uniqueSheetName(): string {
    return `Toast ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;
}

async function createSheetThroughApi(page: Page, name: string): Promise<SheetDetail> {
    const response = await page.request.post('/api/fichas', {
        data: { name },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(201);

    return (await response.json()) as SheetDetail;
}

async function patchSheetThroughApi(
    page: Page,
    sheet: SheetDetail,
    data: Record<string, unknown>
): Promise<SheetDetail> {
    const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
        data: { name: sheet.name, version: sheet.version, ...data },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(200);

    return (await response.json()) as SheetDetail;
}

async function deleteCurrentSheet(page: Page, sheetId: number): Promise<void> {
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

async function makeDraft(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'ADICIONAR ATRIBUTO' }).click();
    await page.locator('#atributo-nome-0-0').fill('Teste de toast');
    await page.locator('#atributo-valor-0-0').fill('Valor do toast');
}

test('mostra um toast de sucesso e permite fechar manualmente', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);
        await makeDraft(page);

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();

        const toast = page.locator('.kami-toast').filter({ hasText: 'FICHA SALVA.' });

        await expect(toast).toBeVisible();
        await expect(page.locator('.kami-toast--success')).toHaveAttribute('role', 'status');
        await expect(toast.getByRole('button', { name: 'Fechar notificação' })).toBeVisible();

        await toast.getByRole('button', { name: 'Fechar notificação' }).click();
        await expect(toast).toHaveCount(0);
    } finally {
        await deleteCurrentSheet(page, sheet.id);
    }
});

test('mostra um toast de erro quando o salvamento falha', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);
        await makeDraft(page);

        await page.route(`**/api/fichas/${sheet.id}`, async route => {
            if (route.request().method() !== 'PATCH') {
                await route.continue();
                return;
            }

            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ message: 'Falha simulada ao salvar.' })
            });
        });

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();

        const toast = page.locator('.kami-toast').filter({ hasText: 'Falha simulada ao salvar.' });

        await expect(toast).toBeVisible();
        await expect(page.locator('.kami-toast--error')).toHaveAttribute('role', 'alert');
        await expect(toast.getByRole('button', { name: 'Fechar notificação' })).toBeVisible();

        await toast.getByRole('button', { name: 'Fechar notificação' }).click();
        await expect(toast).toHaveCount(0);
    } finally {
        await page.unroute(`**/api/fichas/${sheet.id}`);
        await deleteCurrentSheet(page, sheet.id);
    }
});

test('a validação do rascunho usa toast em vez de banner inline', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        const invalidSheet: SheetDetail = {
            ...sheet,
            attributes: {
                sections: [
                    {
                        name: 'Galeria',
                        type: 4,
                        position: 0,
                        attributes: [{ name: 'Texto', type: 0, position: 0, value: 'Não é imagem.' }]
                    }
                ]
            },
            layout: null
        };

        await page.goto('/fichas');
        await waitForHydration(page);

        await page.route(`**/api/fichas/${sheet.id}`, async route => {
            if (route.request().method() !== 'GET') {
                await route.continue();
                return;
            }

            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(invalidSheet)
            });
        });

        await page.evaluate(
            async url => {
                const app = (
                    document.querySelector('#__nuxt') as {
                        __vue_app__?: {
                            config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } };
                        };
                    } | null
                )?.__vue_app__;

                await app?.config.globalProperties.$router.push(url);
            },
            `${sheetPath(sheet.userId, sheet.name)}?id=${sheet.id}`
        );
        await page.waitForURL(/\/\d+\/ficha\//);
        await waitForHydration(page);

        await page.locator('#ficha-nome').fill(`${sheet.name} 2`);
        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();

        const toast = page.locator('.kami-toast').filter({ hasText: 'A galeria aceita apenas imagens.' });

        await expect(toast).toBeVisible();
        await expect(page.locator('.kami-toast--warning')).toHaveAttribute('role', 'status');
        await expect(page.locator('.kami-field__error')).toHaveCount(0);

        await toast.getByRole('button', { name: 'Fechar notificação' }).click();
        await expect(toast).toHaveCount(0);
    } finally {
        await page.unroute(`**/api/fichas/${sheet.id}`);
        await deleteCurrentSheet(page, sheet.id);
    }
});

test('usa toast para regras do editor, sem banner inline', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    let sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        sheet = await patchSheetThroughApi(page, sheet, {
            attributes: {
                sections: [
                    {
                        name: 'Info',
                        type: 0,
                        position: 0,
                        attributes: [{ name: 'Origem', type: 0, position: 0, value: 'Porto Cinza' }]
                    }
                ]
            }
        });

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByLabel('TIPO', { exact: true }).selectOption('4');

        const toast = page.locator('.kami-toast').filter({
            hasText: 'A galeria aceita apenas imagens; remova os outros atributos antes.'
        });

        await expect(toast).toBeVisible();
        await expect(page.locator('.kami-toast--warning')).toHaveAttribute('role', 'status');

        await toast.getByRole('button', { name: 'Fechar notificação' }).click();
        await expect(toast).toHaveCount(0);
    } finally {
        await deleteCurrentSheet(page, sheet.id);
    }
});
