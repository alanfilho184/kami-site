import { expect, test, type Page } from '@playwright/test';
import type { DiscordLinkState } from '../../shared/types/discord';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

test.use({ storageState: 'tests/e2e/.auth/sheets.json' });

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

test('gera e cancela um código de vínculo pelo site', async ({ page }) => {
    const stateResponse = await page.request.get('/api/conta/discord');
    const state = (await stateResponse.json()) as DiscordLinkState;

    test.skip(state.status === 'linked', 'A conta de E2E já está vinculada ao Discord');

    await page.request.delete('/api/conta/discord/codigo', {
        headers: { origin: baseUrl }
    });

    await page.goto('/configuracoes');
    await waitForHydration(page);

    const panel = page.locator('.kami-panel').filter({
        has: page.getByRole('heading', { name: 'DISCORD', exact: true })
    });

    await panel.getByRole('button', { name: 'GERAR CÓDIGO DE VÍNCULO' }).click();
    await expect(panel.locator('.site-config__discord-codigo')).toHaveText(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await expect(panel.locator('.site-config__discord-comando')).toContainText('/vincular');

    await panel.getByRole('button', { name: 'CANCELAR' }).click();
    await expect(panel.getByRole('button', { name: 'GERAR CÓDIGO DE VÍNCULO' })).toBeVisible();
});
