import { expect, test, type Page } from '@playwright/test';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test.use({ storageState: 'tests/e2e/.auth/sheets.json' });

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

test('usuário autenticado envia um reporte de problema pela topbar', async ({ page }) => {
    await page.goto('/painel');
    await waitForHydration(page);

    let reportBody: { message?: string; page?: string } | null = null;

    await page.route('**/api/suporte/reportar', async route => {
        reportBody = route.request().postDataJSON() as { message?: string; page?: string };
        await route.fulfill({ status: 204, body: '' });
    });

    await page
        .getByRole('button', { name: /REPORTAR PROBLEMA/ })
        .first()
        .click();

    const dialog = page.getByRole('dialog', { name: 'REPORTAR PROBLEMA' });

    await expect(dialog).toBeVisible();
    await dialog.locator('#report-message').fill('A ficha não salvou a descrição.');
    await dialog.getByRole('button', { name: 'ENVIAR REPORTE' }).click();

    await expect(page.getByText('REPORTE ENVIADO.', { exact: true })).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => reportBody?.message).toBe('A ficha não salvou a descrição.');
    expect(reportBody?.page).toContain(`${baseUrl}/painel`);
});
