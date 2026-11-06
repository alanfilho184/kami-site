import { expect, request, test, type Page } from '@playwright/test';

const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

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

async function createSheet(page: Page, name: string): Promise<{ id: number; name: string; version: string }> {
    const response = await page.request.post('/api/fichas', {
        data: { name },
        headers: { origin: baseUrl }
    });

    expect(response.status()).toBe(201);

    return (await response.json()) as { id: number; name: string; version: string };
}

async function deleteSheet(page: Page, sheetId: number): Promise<void> {
    const response = await page.request.get(`/api/fichas/${sheetId}`);

    if (!response.ok()) {
        return;
    }

    const sheet = (await response.json()) as { version: string };

    await page.request.delete(`/api/fichas/${sheetId}`, {
        data: { version: sheet.version },
        headers: { origin: baseUrl }
    });
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

test('o painel oferece acessos rápidos e abre a ficha recente', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await login(page);
    const name = `Painel ${Date.now().toString(36)}`;
    const sheet = await createSheet(page, name);

    try {
        await page.goto('/painel');
        await waitForHydration(page);

        await expect(page.getByRole('link', { name: 'NOVA FICHA' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'VER TODAS AS FICHAS' })).toBeVisible();
        await expect(page.locator('.site-painel-acesso')).toHaveCount(4);

        const recent = page.locator('.site-painel-lista__link').filter({ hasText: name });

        await expect(recent).toBeVisible();
        await expect(recent).toHaveAttribute('href', `/fichas/${sheet.id}`);
        await expect(recent.getByText('ABRIR', { exact: false })).toBeVisible();

        await recent.click();
        await page.waitForURL(/\/\d+\/ficha\//);
    } finally {
        await deleteSheet(page, sheet.id);
    }
});

test('os filtros de fichas e o foco de nova ficha funcionam', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await login(page);
    const suffix = Date.now().toString(36);
    const privateSheet = await createSheet(page, `Privada ${suffix}`);
    let publicSheet = await createSheet(page, `Pública ${suffix}`);

    try {
        const shared = await page.request.patch(`/api/fichas/${publicSheet.id}/publicacao`, {
            data: { version: publicSheet.version, isPublic: true },
            headers: { origin: baseUrl }
        });

        expect(shared.status()).toBe(200);
        publicSheet = (await shared.json()) as typeof publicSheet;

        await page.goto('/fichas?filtro=publicas');
        await waitForHydration(page);

        const publicItem = page.locator('.site-fichas__card').filter({ hasText: publicSheet.name });
        const privateItem = page.locator('.site-fichas__card').filter({ hasText: privateSheet.name });

        await expect(publicItem).toBeVisible();
        await expect(privateItem).toHaveCount(0);

        await page.locator('.site-fichas__filtros').getByRole('button', { name: /TODAS/ }).click();
        await expect(privateItem).toBeVisible();

        await page.locator('#fichas-busca').fill(publicSheet.name);
        await expect(publicItem).toBeVisible();
        await expect(privateItem).toHaveCount(0);

        await page.locator('#fichas-busca').fill('');
        await expect(privateItem).toBeVisible();

        await page.goto('/fichas?nova=1');
        await waitForHydration(page);
        await expect(page.locator('#nova-ficha')).toBeFocused();
    } finally {
        await deleteSheet(page, privateSheet.id);
        await deleteSheet(page, publicSheet.id);
    }
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

    const panelHeights = await page
        .locator('.site-config__grade .kami-panel')
        .evaluateAll(panels => panels.map(panel => panel.getBoundingClientRect().height));

    expect(panelHeights).toHaveLength(2);
    expect(Math.abs(panelHeights[0]! - panelHeights[1]!)).toBeLessThanOrEqual(1);
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
