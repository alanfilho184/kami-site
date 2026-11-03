import { expect, request, test, type Page } from '@playwright/test';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

async function login(page: Page): Promise<void> {
    await page.goto('/entrar');
    await waitForHydration(page);
    await page.getByLabel(/E-MAIL/).fill(loginEmail!);
    await page.getByLabel(/SENHA/).fill(loginPassword!);
    await page.getByRole('button', { name: 'ENTRAR' }).click();
    await page.waitForURL('**/painel');
    await waitForHydration(page);
}

test('as rotas do painel redirecionam o visitante anônimo', async ({ request }) => {
    for (const route of ['/fichas', '/ao-vivo', '/macros', '/configuracoes']) {
        const response = await request.get(route, { maxRedirects: 0 });

        expect(response.status()).toBe(302);
        expect(response.headers()['location']).toContain('/entrar');
        expect(response.headers()['location']).toContain('redirecionar');
    }
});

test('o robots.txt bloqueia as rotas privadas do painel', async ({ request }) => {
    const response = await request.get('/robots.txt');
    const text = await response.text();

    expect(response.status()).toBe(200);
    for (const route of ['/fichas', '/ao-vivo', '/macros', '/configuracoes', '/sync']) {
        expect(text).toContain(`Disallow: ${route}`);
    }
});

test('o painel autenticado mostra conta, resumo e navegação', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await login(page);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('PAINEL');
    await expect(page.locator('.site-painel-nav').getByRole('link', { name: 'FICHAS' })).toBeVisible();
    await expect(page.locator('.site-painel-nav').getByRole('link', { name: 'AO VIVO' })).toBeVisible();
    await expect(page.locator('.site-painel-nav').getByRole('link', { name: 'MACROS' })).toBeVisible();
    await expect(page.locator('.site-painel-nav').getByRole('link', { name: 'CONFIGURAÇÕES' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CONTA', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'SAIR DA CONTA' })).toBeVisible();
});

test('as páginas internas do painel carregam com noindex', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await login(page);

    const routes = [
        { path: '/fichas', heading: 'FICHAS' },
        { path: '/ao-vivo', heading: 'AO VIVO' },
        { path: '/macros', heading: 'MACROS' },
        { path: '/configuracoes', heading: 'CONFIGURAÇÕES' }
    ];

    for (const route of routes) {
        const response = await page.goto(route.path);

        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(route.heading);
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    }

    await expect(page.locator('#config-usuario')).toBeVisible();
    await expect(page.locator('#config-senha-atual')).toBeVisible();
    await expect(page.locator('#config-senha-nova')).toBeVisible();
    await expect(page.locator('#config-senha-confirmacao')).toBeVisible();
});

test('o painel e as configurações não rolam horizontalmente em 360 px', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await login(page);
    await page.setViewportSize({ width: 360, height: 800 });

    for (const route of ['/painel', '/fichas', '/ao-vivo', '/macros', '/configuracoes']) {
        await page.goto(route);

        const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

        expect(scrolls).toBe(false);
    }

    await page.goto('/painel');
    await waitForHydration(page);
    await page.getByRole('button', { name: 'SAIR DA CONTA' }).click();
    await page.waitForURL('**/');
});
