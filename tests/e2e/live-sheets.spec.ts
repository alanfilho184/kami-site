import { expect, test, type Page } from '@playwright/test';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;

test.use({ storageState: 'tests/e2e/.auth/sheets.json' });

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

test('a página ao vivo mostra os vínculos em cards com ação de abrir', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const suffix = Date.now().toString(36);
    const firstName = `Ao vivo ${suffix} A`;
    const secondName = `Ao vivo ${suffix} B`;

    await page.goto('/painel');
    await waitForHydration(page);

    await page.route('**/api/ao-vivo', route => {
        void route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 7,
                    sheetId: 123,
                    sheetName: firstName,
                    channelId: '222222222222222222',
                    messageId: '333333333333333333',
                    lastUse: '2026-11-06T14:44:00.000Z'
                },
                {
                    id: 8,
                    sheetId: 124,
                    sheetName: secondName,
                    channelId: '444444444444444444',
                    messageId: '555555555555555555',
                    lastUse: '2026-11-05T18:30:00.000Z'
                }
            ])
        });
    });

    await page.locator('.site-painel-nav').getByRole('link', { name: 'AO VIVO' }).click();
    await page.waitForURL('**/ao-vivo');
    await waitForHydration(page);

    await expect(page.locator('.site-fichas__card')).toHaveCount(2);

    const firstCard = page.locator('.site-fichas__card').filter({ hasText: firstName });
    const secondCard = page.locator('.site-fichas__card').filter({ hasText: secondName });

    await expect(firstCard.getByText('AO VIVO', { exact: true })).toBeVisible();
    await expect(firstCard.getByText('MENSAGEM 333333333333333333', { exact: true })).toBeVisible();
    await expect(firstCard.getByRole('link', { name: 'ABRIR' })).toHaveAttribute('href', '/fichas/123');
    await expect(secondCard.getByText('MENSAGEM 555555555555555555', { exact: true })).toBeVisible();
    await expect(secondCard.getByRole('link', { name: 'ABRIR' })).toHaveAttribute('href', '/fichas/124');
});
