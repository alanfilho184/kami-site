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
    return `Mobile ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;
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

async function patchSheet(page: Page, sheet: SheetDetail, data: Record<string, unknown>): Promise<SheetDetail> {
    const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
        data: { name: sheet.name, version: sheet.version, ...data },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(200);

    return (await response.json()) as SheetDetail;
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    expect(scrolls).toBe(false);
}

async function saveSheet(page: Page): Promise<void> {
    const saveButton = page.locator('.site-editor__acoes-fixas').getByRole('button', { name: 'SALVAR' });
    const topo = page.locator('.site-editor__topo');
    const previousVersion = await topo.getAttribute('data-sheet-version');
    const saved = page.waitForResponse(response => {
        const path = new URL(response.url()).pathname;

        return (
            response.request().method() === 'PATCH' && /^\/api\/fichas\/\d+$/.test(path) && response.status() === 200
        );
    });

    await saveButton.click();
    await saved;
    await expect(topo).not.toHaveAttribute('data-sheet-version', previousVersion ?? '');
}

test('mobile: barra inferior fixa salva a ficha e não duplica as ações do topo', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await expect(page.locator('.site-editor__acoes-fixas')).toBeVisible();
        await expect(page.locator('.site-editor__topo-acoes')).toBeHidden();
        await expect(page.getByRole('button', { name: 'SALVAR', exact: true })).toHaveCount(1);
        await expectNoHorizontalScroll(page);

        const addAttribute = page.getByRole('button', { name: 'ADICIONAR ATRIBUTO' });

        await addAttribute.scrollIntoViewIfNeeded();
        await addAttribute.click();
        await page.locator('#atributo-nome-0-0').fill('Registro');
        await page.locator('#atributo-valor-0-0').fill('Teste mobile.');

        await saveSheet(page);
        await expect(page.getByText('FICHA SALVA.').last()).toBeVisible();

        await page.locator('.site-editor__acoes-fixas').getByRole('button', { name: 'Visualizar ficha' }).click();
        await expect(page.locator('.site-editor__leitura')).toBeVisible();
        await expect(page.locator('.site-editor__acoes-fixas')).toHaveCount(0);
        await expectNoHorizontalScroll(page);
        await page.getByRole('button', { name: 'EDITAR', exact: true }).click();
        await expect(page.locator('.site-editor__acoes-fixas')).toBeVisible();

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

        const footerLinks = await page.locator('.site-rodape__links').boundingBox();
        const bar = await page.locator('.site-editor__acoes-fixas').boundingBox();

        expect(footerLinks).not.toBeNull();
        expect(bar).not.toBeNull();

        if (footerLinks && bar) {
            expect(footerLinks.y + footerLinks.height).toBeLessThanOrEqual(bar.y + 1);
        }

        const firstFooterLink = await page.locator('.site-rodape__links a').first().boundingBox();
        const footerMeta = await page.locator('.site-rodape__meta').boundingBox();

        expect(firstFooterLink?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(footerMeta).not.toBeNull();

        if (footerLinks && footerMeta) {
            expect(footerMeta.y).toBeGreaterThanOrEqual(footerLinks.y + footerLinks.height - 1);
        }

        const saved = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = saved.version;
        expect(saved.attributes.sections[0]?.attributes[0]).toMatchObject({
            name: 'Registro',
            value: 'Teste mobile.'
        });
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('mobile: posicionamento fica compacto, sem arraste nativo e sem rolagem horizontal', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        const patched = await patchSheet(page, sheet, {
            attributes: {
                sections: [
                    {
                        name: 'Info',
                        type: 0,
                        position: 0,
                        attributes: [
                            { name: 'Nome', type: 0, position: 0, value: 'Lyra' },
                            { name: 'Nível', type: 1, position: 1, value: '3' }
                        ]
                    },
                    {
                        name: 'Inventário',
                        type: 0,
                        position: 1,
                        attributes: [{ name: 'Itens', type: 3, position: 0, value: { items: [] } }]
                    }
                ]
            }
        });

        currentVersion = patched.version;

        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);
        await page.locator('#modo-editor').selectOption('posicionamento');

        await expectNoHorizontalScroll(page);

        const infoCard = page.locator('.site-editor__posicionamento-card').first();
        const item = infoCard.locator('.site-editor__posicionamento-item').first();

        await expect(item).toHaveAttribute('draggable', 'false');
        await expect(item.locator('.site-editor__posicionamento-item-acoes')).toBeVisible();
        await expect(item.locator('.site-editor__alca')).toBeHidden();
        await expect(item.getByLabel('Mover Nome para outra seção')).toBeVisible();

        const option = await item.getByLabel('Mover Nome para outra seção').locator('option').allTextContents();

        expect(option).toContain('MOVER PARA…');
        expect(option).toContain('Inventário');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('mobile: configurações prendem o foco e travam o scroll', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.locator('.site-editor__acoes-fixas').getByRole('button', { name: 'Configurações da ficha' }).click();

        const dialog = page.locator('.site-editor__config');

        await expect(dialog).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');

        const focusedInside = () =>
            page.evaluate(() => Boolean(document.activeElement?.closest('.site-editor__config')));

        expect(await focusedInside()).toBe(true);

        await page.keyboard.press('Shift+Tab');
        expect(await focusedInside()).toBe(true);

        for (let index = 0; index < 12; index += 1) {
            await page.keyboard.press('Tab');
        }

        expect(await focusedInside()).toBe(true);

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, sheet.version);
    }
});

test('mobile: lightbox prende o foco e trava o scroll', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    const image = `${baseUrl}/marca/logo-256.webp`;
    let currentVersion = sheet.version;

    try {
        const patched = await patchSheet(page, sheet, {
            attributes: {
                sections: [
                    {
                        name: 'Info',
                        type: 0,
                        position: 0,
                        attributes: [{ name: 'Retrato', type: 2, position: 0, value: image }]
                    }
                ]
            }
        });

        currentVersion = patched.version;

        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);
        await page.locator('#modo-editor').selectOption('estrutura');

        await page.locator('.site-editor__estrutura-canvas .site-sheetview__imagem-botao').click();

        const lightbox = page.locator('.site-sheetview__lightbox');

        await expect(lightbox).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden');

        const focusedInside = () =>
            page.evaluate(() => Boolean(document.activeElement?.closest('.site-sheetview__lightbox')));

        expect(await focusedInside()).toBe(true);

        await page.keyboard.press('Tab');
        expect(await focusedInside()).toBe(true);

        await page.keyboard.press('Escape');
        await expect(lightbox).toHaveCount(0);
        await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe('');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('mobile: navbar do painel usa abas curtas e some dentro do editor', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.setViewportSize({ width: 360, height: 800 });
        await page.goto('/painel');
        await waitForHydration(page);

        const nav = page.locator('.site-painel-nav');

        await expect(nav).toBeVisible();
        await expect(nav.locator('.site-painel-nav__short').first()).toBeVisible();
        await expect(nav.locator('.site-painel-nav__label').first()).toBeHidden();
        await expect(nav.getByRole('link', { name: 'AJUSTES' })).toBeVisible();
        await expectNoHorizontalScroll(page);

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await expect(page.locator('.site-painel-nav--editor')).toBeHidden();
        await expect(page.locator('.site-editor__acoes-fixas')).toBeVisible();
    } finally {
        await deleteSheetThroughApi(page, sheet.id, sheet.version);
    }
});
