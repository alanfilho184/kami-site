import { expect, request, test, type Page } from '@playwright/test';

async function waitForHydration(page: Page): Promise<void> {
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
}

test('a página de cadastro responde, não indexa e mostra o formulário', async ({ page }) => {
    const response = await page.goto('/cadastrar');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('CRIE SUA CONTA');
    await expect(page.locator('#cadastro-usuario')).toBeVisible();
    await expect(page.locator('#cadastro-email')).toBeVisible();
    await expect(page.locator('#cadastro-senha')).toBeVisible();
    await expect(page.locator('#cadastro-senha-confirmacao')).toBeVisible();
    await expect(page.getByRole('checkbox')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('a página de cadastro não rola horizontalmente em 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/cadastrar');

    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    expect(scrolls).toBe(false);
});

test('a API de cadastro recusa mutação sem origem', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
        data: {
            username: 'teste_cadastro',
            email: 'nao-existe@example.com',
            password: 'senha-qualquer',
            acceptedTerms: true
        }
    });

    expect(response.status()).toBe(403);
});

test('o formulário valida username, senha curta, confirmação e aceite dos termos', async ({ page }) => {
    await page.goto('/cadastrar');
    await waitForHydration(page);

    await page.locator('#cadastro-usuario').fill('ab');
    await page.locator('#cadastro-email').fill('cadastro-e2e@example.com');
    await page.locator('#cadastro-senha').fill('senha-e2e-2026');
    await page.locator('#cadastro-senha-confirmacao').fill('senha-e2e-2026');
    await page.getByRole('button', { name: 'CRIAR CONTA' }).click();
    await expect(page.getByRole('alert')).toContainText('entre 3 e 32 caracteres');

    await page.locator('#cadastro-usuario').fill('cadastro_e2e');
    await page.locator('#cadastro-senha').fill('curta');
    await page.locator('#cadastro-senha-confirmacao').fill('curta');
    await page.getByRole('button', { name: 'CRIAR CONTA' }).click();
    await expect(page.getByRole('alert')).toContainText('pelo menos 8 caracteres');

    await page.locator('#cadastro-senha').fill('senha-e2e-2026');
    await page.locator('#cadastro-senha-confirmacao').fill('senha-diferente');
    await page.getByRole('button', { name: 'CRIAR CONTA' }).click();
    await expect(page.getByRole('alert')).toContainText('não coincidem');

    await page.locator('#cadastro-senha-confirmacao').fill('senha-e2e-2026');
    await page.getByRole('button', { name: 'CRIAR CONTA' }).click();
    await expect(page.getByRole('alert')).toContainText('Aceite os termos');
});

test('o cadastro válido cria a conta, abre a sessão e permite entrar depois', async ({ baseURL }) => {
    test.skip(process.env.E2E_REGISTER !== '1', 'Defina E2E_REGISTER=1 para criar uma conta de teste');

    const suffix = Date.now();
    const username = `e2e_${suffix}`;
    const email = `e2e-cadastro-${suffix}@example.com`;
    const password = 'senha-e2e-2026';
    const api = await request.newContext({ baseURL });
    const origin = new URL(baseURL!).origin;

    try {
        const register = await api.post('/api/auth/register', {
            headers: { origin },
            data: { username, email, password, acceptedTerms: true }
        });

        expect(register.status()).toBe(201);

        const body = await register.json();
        expect(body.user.username).toBe(username);
        expect(body.user.email).toBe(email);

        const session = await api.get('/api/auth/session');
        expect(session.status()).toBe(200);

        const logout = await api.post('/api/auth/logout', {
            headers: { origin }
        });
        expect(logout.status()).toBe(204);

        const login = await api.post('/api/auth/login', {
            headers: { origin },
            data: { email, password }
        });
        expect(login.status()).toBe(200);

        const afterLogin = await api.get('/api/auth/session');
        expect(afterLogin.status()).toBe(200);

        await api.post('/api/auth/logout', {
            headers: { origin }
        });
    } finally {
        await api.dispose();
    }
});
