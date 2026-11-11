import { test as setup } from '@playwright/test';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;
const statePath = 'tests/e2e/.auth/sheets.json';

/**
 * Faz o login uma única vez e reutiliza o estado nos testes de fichas. Além de
 * acelerar a suíte, evita estourar o rate limit de login por e-mail.
 */
setup('prepara a sessão autenticada dos testes de fichas', async ({ page }) => {
    if (loginEmail && loginPassword) {
        await page.goto('/entrar');
        await page.waitForFunction(() =>
            Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
        );
        await page.getByLabel(/E-MAIL/).fill(loginEmail);
        await page.getByLabel(/SENHA/).fill(loginPassword);
        await page.getByRole('button', { name: 'ENTRAR' }).click();
        await page.waitForURL('**/painel');
    }

    await page.context().storageState({ path: statePath });
});
