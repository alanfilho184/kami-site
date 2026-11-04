import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { SheetDetail } from '../../shared/types/sheet';

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
    return `Publica ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;
}

async function createSheetThroughApi(page: Page, name: string): Promise<SheetDetail> {
    const response = await page.request.post('/api/fichas', {
        data: { name },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(201);

    return (await response.json()) as SheetDetail;
}

async function deleteSheetThroughApi(page: Page, sheetId: number, version: string): Promise<void> {
    const response = await page.request.delete(`/api/fichas/${sheetId}`, {
        data: { version },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(204);
}

async function shareSheet(
    page: Page,
    sheet: SheetDetail,
    data: { isPublic: boolean; password?: string | null }
): Promise<SheetDetail> {
    const response = await page.request.patch(`/api/fichas/${sheet.id}/publicacao`, {
        data: { version: sheet.version, ...data },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(200);

    return (await response.json()) as SheetDetail;
}

function publicPath(sheet: SheetDetail): string {
    return `/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`;
}

function publicUrl(sheet: SheetDetail): string {
    return `${baseUrl}${publicPath(sheet)}`;
}

async function anonymousContext(page: Page): Promise<BrowserContext> {
    const browser = page.context().browser();

    if (!browser) {
        throw new Error('Navegador indisponível para o teste anônimo.');
    }

    return browser.newContext();
}

async function deleteCurrentSheet(page: Page, sheetId: number): Promise<void> {
    const current = await page.request.get(`/api/fichas/${sheetId}`);

    if (!current.ok()) {
        return;
    }

    const detail = (await current.json()) as SheetDetail;

    await deleteSheetThroughApi(page, sheetId, detail.version);
}

test('ficha privada responde 404 e o link público abre sem login e sem indexação', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    let sheet = await createSheetThroughApi(page, uniqueSheetName());
    const anonymous = await anonymousContext(page);

    try {
        const saved = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: sheet.version,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [
                                { name: 'Origem', type: 0, position: 0, value: 'Porto Cinza' },
                                {
                                    name: 'Vida',
                                    type: 4,
                                    position: 1,
                                    value: { actual: 5, max: 10, min: 0, step: 1 }
                                }
                            ]
                        }
                    ]
                }
            },
            headers: { origin: baseUrl }
        });

        expect(saved.status()).toBe(200);
        sheet = (await saved.json()) as SheetDetail;

        const privateResponse = await anonymous.request.get(
            `${baseUrl}/api/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`
        );
        expect(privateResponse.status()).toBe(404);

        const privatePage = await anonymous.newPage();
        const privateNavigation = await privatePage.goto(publicUrl(sheet));
        expect(privateNavigation?.status()).toBe(404);
        await privatePage.close();

        sheet = await shareSheet(page, sheet, { isPublic: true });
        expect(sheet.isPublic).toBe(true);

        const publicResponse = await anonymous.request.get(
            `${baseUrl}/api/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`
        );
        expect(publicResponse.status()).toBe(200);
        expect(publicResponse.headers()['x-robots-tag']).toContain('noindex');

        const publicPage = await anonymous.newPage();
        const publicNavigation = await publicPage.goto(publicUrl(sheet));

        expect(publicNavigation?.status()).toBe(200);
        await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
        await expect(publicPage.locator('.site-ficha-publica__titulo')).toHaveText(sheet.name);
        await expect(publicPage.getByText('Porto Cinza')).toBeVisible();
        await expect(publicPage.locator('.site-editor__topo')).toHaveCount(0);
        await expect(publicPage.locator('.site-sheetview__barra-btn')).toHaveCount(0);
        await expect(publicPage.locator('.site-sheetview__toggle-edicao')).toHaveCount(0);
        await publicPage.close();

        sheet = await shareSheet(page, sheet, { isPublic: false });

        const hiddenAgain = await anonymous.request.get(
            `${baseUrl}/api/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`
        );
        expect(hiddenAgain.status()).toBe(404);
    } finally {
        await anonymous.close();
        await deleteCurrentSheet(page, sheet.id);
    }
});

test('a senha da ficha pública libera o acesso por cookie e pode ser removida', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    let sheet = await createSheetThroughApi(page, uniqueSheetName());
    const anonymous = await anonymousContext(page);

    try {
        sheet = await shareSheet(page, sheet, { isPublic: true, password: 'segredo-e2e' });

        const blocked = await anonymous.request.get(
            `${baseUrl}/api/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`
        );
        const blockedBody = (await blocked.json()) as { code?: string };

        expect(blocked.status()).toBe(401);
        expect(blockedBody.code).toBe('sheet_password_required');

        const publicPage = await anonymous.newPage();
        await publicPage.goto(publicUrl(sheet));
        await waitForHydration(publicPage);

        await expect(publicPage.getByRole('heading', { name: 'Esta ficha precisa de senha.' })).toBeVisible();
        await expect(publicPage.locator('.site-sheetview')).toHaveCount(0);

        await publicPage.locator('#ficha-senha').fill('senha-errada');
        await publicPage.getByRole('button', { name: 'ABRIR FICHA' }).click();
        await expect(publicPage.getByRole('alert')).toHaveText('Senha incorreta.');
        await expect(publicPage.getByRole('heading', { name: 'Esta ficha precisa de senha.' })).toBeVisible();

        await publicPage.locator('#ficha-senha').fill('segredo-e2e');
        await publicPage.getByRole('button', { name: 'ABRIR FICHA' }).click();

        await expect(publicPage.locator('.site-ficha-publica__titulo')).toHaveText(sheet.name);
        await expect(publicPage.getByText('FICHA PROTEGIDA')).toHaveCount(0);

        const authorized = await anonymous.request.get(
            `${baseUrl}/api/ficha/${sheet.userId}/${encodeURIComponent(sheet.name)}`
        );
        expect(authorized.status()).toBe(200);

        sheet = await shareSheet(page, sheet, { isPublic: true, password: null });
        expect(sheet.hasPassword).toBe(false);

        await anonymous.clearCookies();
        await publicPage.goto(publicUrl(sheet));
        await expect(publicPage.locator('.site-ficha-publica__titulo')).toHaveText(sheet.name);
        await expect(publicPage.getByRole('heading', { name: 'Esta ficha precisa de senha.' })).toHaveCount(0);

        await publicPage.close();
    } finally {
        await anonymous.close();
        await deleteCurrentSheet(page, sheet.id);
    }
});

test('o modal de configurações publica a ficha e copia o link', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    let sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.goto(`/fichas/${sheet.id}`);
        await waitForHydration(page);

        await page.getByRole('button', { name: 'CONFIGURAÇÕES', exact: true }).click();

        const sharing = page.locator('.site-editor__config-secao').filter({ hasText: 'COMPARTILHAMENTO' });

        await expect(sharing).toBeVisible();
        await sharing.getByLabel('FICHA PÚBLICA').check();
        await sharing.locator('input[type="password"]').fill('senha-modal');
        await sharing.getByRole('button', { name: 'SALVAR COMPARTILHAMENTO' }).click();

        await expect(sharing.getByRole('status')).toHaveText('FICHA PÚBLICA ATUALIZADA.');

        const detail = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        sheet = detail;
        expect(detail.isPublic).toBe(true);
        expect(detail.hasPassword).toBe(true);

        await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
        await sharing.getByRole('button', { name: 'COPIAR LINK' }).click();
        await expect(sharing.getByRole('status')).toHaveText('LINK COPIADO.');

        const copied = await page.evaluate(() => navigator.clipboard.readText());

        expect(copied).toBe(`${baseUrl}${publicPath(sheet)}`);

        await sharing.getByLabel('REMOVER SENHA ATUAL').check();
        await sharing.getByRole('button', { name: 'SALVAR COMPARTILHAMENTO' }).click();
        await expect(sharing.getByRole('status')).toHaveText('FICHA PÚBLICA ATUALIZADA.');

        const withoutPassword = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        sheet = withoutPassword;
        expect(withoutPassword.hasPassword).toBe(false);
    } finally {
        await deleteCurrentSheet(page, sheet.id);
    }
});
