import { expect, request, test } from '@playwright/test';

/**
 * Os testes de login bem-sucedido usam uma conta de teste local e só rodam
 * quando E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD estão definidos. Nunca use uma
 * conta real de produção nesses testes.
 */
const loginEmail = process.env.E2E_AUTH_EMAIL;
const loginPassword = process.env.E2E_AUTH_PASSWORD;

test('a página de entrada responde, não indexa e mostra o formulário', async ({ page }) => {
    const response = await page.goto('/entrar');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ENTRE NA SUA CONTA');
    await expect(page.getByLabel(/E-MAIL/)).toBeVisible();
    await expect(page.getByLabel(/SENHA/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
    await expect(page.getByText(/primeiro acesso pelo site/i)).toBeVisible();
});

test('a página de entrada não rola horizontalmente em 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/entrar');

    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    expect(scrolls).toBe(false);
});

test('as rotas antigas de autenticação redirecionam', async ({ request }) => {
    const login = await request.get('/login', { maxRedirects: 0 });
    expect(login.status()).toBe(302);
    expect(login.headers()['location']).toBe('/entrar');

    const logout = await request.get('/logout', { maxRedirects: 0 });
    expect(logout.status()).toBe(302);
    expect(logout.headers()['location']).toBe('/sair');

    const dashboard = await request.get('/dashboard', { maxRedirects: 0 });
    expect(dashboard.status()).toBe(302);
    expect(dashboard.headers()['location']).toBe('/painel');
});

test('o painel anônimo redireciona para a entrada', async ({ request }) => {
    const response = await request.get('/painel', { maxRedirects: 0 });

    expect(response.status()).toBe(302);
    expect(response.headers()['location']).toContain('/entrar');
    expect(response.headers()['location']).toContain('redirecionar');
});

test('a página de saída anônima explica que não há sessão', async ({ page }) => {
    const response = await page.goto('/sair');

    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('VOCÊ NÃO ESTÁ CONECTADO');
    await expect(page.getByRole('main').getByRole('link', { name: 'ENTRAR' })).toBeVisible();
});

test('a API de login recusa mutação sem origem', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
        data: {
            email: 'nao-existe@example.com',
            password: 'senha-qualquer'
        }
    });

    expect(response.status()).toBe(403);
});

test('o login inválido não distingue e-mail de senha', async ({ request, baseURL }) => {
    const ready = await request.get('/api/ready');

    test.skip(ready.status() !== 200, 'Banco indisponível para o teste de login');

    const origin = new URL(baseURL!).origin;
    const response = await request.post('/api/auth/login', {
        headers: { origin },
        data: {
            email: `nao-existe-${Date.now()}@example.com`,
            password: 'senha-qualquer'
        }
    });

    expect(response.status()).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'E-mail ou senha inválidos.' });
});

test('o login válido cria cookie HttpOnly, abre a sessão e o logout a encerra', async ({ baseURL }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const api = await request.newContext({ baseURL });
    const origin = new URL(baseURL!).origin;

    try {
        const login = await api.post('/api/auth/login', {
            headers: { origin },
            data: {
                email: loginEmail!,
                password: loginPassword!
            }
        });

        expect(login.status()).toBe(200);

        const setCookie = login.headers()['set-cookie'] ?? '';
        expect(setCookie).toContain('kami_sessao=');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toMatch(/SameSite=Lax/i);
        expect(setCookie).toContain('Path=/');

        const session = await api.get('/api/auth/session');
        expect(session.status()).toBe(200);

        const body = await session.json();
        expect(body.user.email).toBe(loginEmail);

        const logout = await api.post('/api/auth/logout', {
            headers: { origin }
        });
        expect(logout.status()).toBe(204);

        const afterLogout = await api.get('/api/auth/session');
        expect(afterLogout.status()).toBe(401);
    } finally {
        await api.dispose();
    }
});

test('o cookie de sessão não fica acessível pelo JavaScript da página', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    await page.goto('/entrar');
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );
    await page.getByLabel(/E-MAIL/).fill(loginEmail!);
    await page.getByLabel(/SENHA/).fill(loginPassword!);
    await page.getByRole('button', { name: 'ENTRAR' }).click();
    await page.waitForURL('**/painel');
    await page.waitForFunction(() =>
        Boolean((document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null)?.__vue_app__)
    );

    const cookieHeader = await page.evaluate(() => document.cookie);
    expect(cookieHeader).not.toContain('kami_sessao');

    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(cookie => cookie.name === 'kami_sessao');

    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe('Lax');

    await page.getByRole('button', { name: 'SAIR DA CONTA' }).click();
    await page.waitForURL('**/');
});
