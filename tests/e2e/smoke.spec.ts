import { expect, test } from '@playwright/test';

test('a landing responde e apresenta o produto', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle('Kami - Fichas de RPG Personalizáveis');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('FICHAS DO SEU JEITO.');
    await expect(
        page.getByRole('heading', { level: 2, name: 'Uma ficha que acompanha o ritmo da mesa.' })
    ).toBeVisible();
});

test('a home publica Open Graph com a origem real da requisição', async ({ page, baseURL }) => {
    await page.goto('/');

    const origin = new URL(baseURL!).origin;

    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', `${origin}/og/kami-site.png`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `${origin}/`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/`);
});

test('o roadmap apresenta macros e campanhas', async ({ page }) => {
    await page.goto('/');

    const roadmap = page.locator('.site-roadmap');

    await expect(roadmap).toContainText('PRÓXIMAS ATUALIZAÇÕES');
    await expect(roadmap.locator('.site-roadmap__item')).toHaveCount(2);
    await expect(roadmap.getByRole('heading', { level: 3, name: 'MACROS' })).toBeVisible();
    await expect(roadmap.getByRole('heading', { level: 3, name: 'CAMPANHAS' })).toBeVisible();
    await expect(roadmap.locator('.site-roadmap__status--active')).toHaveText('EM DESENVOLVIMENTO');
    await expect(roadmap.locator('.site-roadmap__status--planned')).toHaveText('PLANEJADO');
});

test('a prévia da mesa usa a captura do Discord', async ({ page }) => {
    await page.goto('/');

    const image = page.locator('.site-hero__previa img');

    await expect(image).toBeVisible();
    await expect(image).toHaveAttribute('src', '/exemplos/exemplo-discord.webp');
    await expect(image).toHaveAttribute('alt', /ficha de Lyra Voss/);
    await expect(image).toHaveAttribute('width', '607');
    await expect(image).toHaveAttribute('height', '659');

    const loaded = await image.evaluate(element => {
        const img = element as HTMLImageElement;
        return img.complete && img.naturalWidth > 0;
    });

    expect(loaded).toBe(true);
});

test('a topbar mantém respiro lateral em telas pequenas e grandes', async ({ page }) => {
    for (const width of [360, 1024]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');

        const measurements = await page.locator('.site-topbar .kami-topbar__inner').evaluate(element => {
            const style = getComputedStyle(element);

            return {
                left: parseFloat(style.paddingLeft),
                right: parseFloat(style.paddingRight)
            };
        });

        expect(measurements.left).toBeGreaterThanOrEqual(16);
        expect(measurements.right).toBeGreaterThanOrEqual(16);
    }
});

test('o rodapé mantém os itens alinhados no mobile', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');

    const assinatura = page.locator('.site-rodape__assinatura');
    const links = page.locator('.site-rodape__links a');
    const meta = page.locator('.site-rodape__meta');

    const alturaAssinatura = await assinatura.evaluate(element => Math.round(element.getBoundingClientRect().height));
    const tops = await links.evaluateAll(elements =>
        elements.map(element => Math.round(element.getBoundingClientRect().top))
    );

    expect(alturaAssinatura).toBeLessThan(20);
    expect(new Set(tops).size).toBe(1);

    const alinhamento = await meta.evaluate(element => {
        const container = element.closest('.site-rodape__interno');

        if (!container) {
            return Number.POSITIVE_INFINITY;
        }

        const metaRight = Math.round(element.getBoundingClientRect().right);
        const containerRight = Math.round(
            container.getBoundingClientRect().right - parseFloat(getComputedStyle(container).paddingRight)
        );

        return Math.abs(metaRight - containerRight);
    });

    expect(alinhamento).toBeLessThanOrEqual(1);
});

test('o skip link move o foco para o conteúdo', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');

    const active = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;

        return {
            tag: element?.tagName ?? '',
            id: element?.id ?? ''
        };
    });

    expect(active.tag).toBe('MAIN');
    expect(active.id).toBe('content');
});

test('a landing não rola horizontalmente em telas pequenas', async ({ page }) => {
    for (const width of [360, 390, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/');

        const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

        expect(scrolls).toBe(false);
    }
});

test('a landing não expõe telemetria ou dados de deploy', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText('ESTADO DA FUNDAÇÃO')).toHaveCount(0);
    await expect(page.getByText('TELEMETRIA')).toHaveCount(0);
    await expect(page.getByText('/api/ready')).toHaveCount(0);
    await expect(page.locator('.site-rodape__meta')).not.toContainText(/v\d+\.\d+\.\d+/);
});

test('a faixa de estatísticas mostra números ou indisponibilidade, nunca zero falso', async ({ page }) => {
    await page.goto('/');

    const band = page.locator('section[aria-labelledby="statistics-title"]');

    await expect(band).toBeVisible();
    await expect(band).toContainText('O KAMI EM NÚMEROS');
    await expect(band).toContainText('ATIVOS');
    await expect(band).toContainText('INTERAÇÕES');

    const values = band.locator('.site-faixa__valor');

    await expect(values).toHaveCount(4);

    for (const value of await values.allTextContents()) {
        expect(value.trim()).toMatch(/^(\d{1,3}(\.\d{3})*|-)$/);
    }
});

test('a ficha de amostra exibe os cinco tipos de atributo', async ({ page }) => {
    await page.goto('/');

    const sheet = page.locator('#ficha');

    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.site-ficha__tag')).toHaveText('AMOSTRA');
    await expect(sheet.getByRole('heading', { level: 3, name: 'LYRA VOSS' })).toBeVisible();

    const portrait = sheet.locator('.site-ficha__retrato img');

    await expect(portrait).toHaveAttribute('src', '/placeholders/placeholder.webp');
    await expect(portrait).toHaveAttribute('alt', /Símbolo do Kami/);
    await expect(sheet.locator('.site-ficha__tipo')).toHaveText('DESCRIÇÃO');
    await expect(sheet.locator('.site-ficha__descricao')).toContainText('Lyra mapeia ruínas');

    for (const type of ['TEXTO', 'NÚMERO', 'IMAGEM', 'LISTA', 'BARRA']) {
        await expect(sheet.getByText(type, { exact: true }).first()).toBeVisible();
    }
});

test('as páginas jurídicas em PT-BR e EN-US respondem', async ({ page }) => {
    const documents = [
        { route: '/termos', title: 'Termos de Uso', language: 'pt-BR', switchLanguage: 'en-US' },
        {
            route: '/privacidade',
            title: 'Política de Privacidade',
            language: 'pt-BR',
            switchLanguage: 'en-US'
        },
        { route: '/terms', title: 'Terms of Use', language: 'en-US', switchLanguage: 'pt-BR' },
        { route: '/privacy', title: 'Privacy Policy', language: 'en-US', switchLanguage: 'pt-BR' }
    ];

    for (const document of documents) {
        const response = await page.goto(document.route);

        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1, name: document.title })).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', document.language);
        await expect(page.locator('.site-documento__cabecalho .site-documento__idioma')).toBeVisible();
        await expect(page.locator('.site-documento__idioma')).toHaveAttribute('lang', document.switchLanguage);
    }
});

test('a rota de ficha mostra o aviso de desenvolvimento', async ({ page }) => {
    for (const route of ['/ficha', '/ficha/123/lyra-voss']) {
        const response = await page.goto(route);

        expect(response?.status()).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Em desenvolvimento.');
        await expect(page.locator('.site-ficha-dev__selo')).toContainText('EM DESENVOLVIMENTO');
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
        await expect(page.getByRole('link', { name: 'VER A FICHA DE AMOSTRA' })).toBeVisible();
    }
});

test('a antiga página de comandos responde 410', async ({ page }) => {
    const response = await page.goto('/comandos');

    expect(response?.status()).toBe(410);
    await expect(page.getByText('CONTEÚDO REMOVIDO')).toBeVisible();
});

test('os redirects de compatibilidade apontam para o destino certo', async ({ request }) => {
    const invite = await request.get('/convite', { maxRedirects: 0 });
    expect(invite.status()).toBe(302);
    expect(invite.headers()['location']).toContain('discord.com');

    const support = await request.get('/suporte', { maxRedirects: 0 });
    expect(support.status()).toBe(302);
    expect(support.headers()['location']).toContain('discord');

    const tutorials = await request.get('/tutoriais', { maxRedirects: 0 });
    expect(tutorials.status()).toBe(302);

    const tutorial = await request.get('/tutoriais/primeiros-passos', { maxRedirects: 0 });
    expect(tutorial.status()).toBe(302);
});

test('robots.txt e sitemap.xml estão publicados', async ({ request }) => {
    const robots = await request.get('/robots.txt');

    expect(robots.status()).toBe(200);
    expect(await robots.text()).toContain('Sitemap:');
    expect(await robots.text()).toContain('Disallow: /ficha');

    const sitemap = await request.get('/sitemap.xml');

    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain('/termos');
});

test('o health responde 200 sem banco', async ({ request }) => {
    const response = await request.get('/api/health');

    expect(response.status()).toBe(200);

    const body = await response.json();

    expect(body.status).toBe('ok');
    expect(typeof body.version).toBe('string');
    expect(typeof body.timestamp).toBe('string');
});

test('o ready responde com o contrato de prontidão', async ({ request }) => {
    const response = await request.get('/api/ready');

    expect([200, 503]).toContain(response.status());

    const body = await response.json();

    expect(typeof body.database.ok).toBe('boolean');
    expect(body.status).toBe(body.database.ok ? 'ok' : 'unavailable');
});

test('as estatísticas públicas seguem o contrato de disponibilidade', async ({ request }) => {
    const response = await request.get('/api/estatisticas');

    expect([200, 503]).toContain(response.status());

    const body = await response.json();

    expect(typeof body.available).toBe('boolean');

    if (body.available) {
        expect(response.status()).toBe(200);
        expect(typeof body.data.users).toBe('number');
        expect(typeof body.data.activeUsers).toBe('number');
        expect(typeof body.data.sheets).toBe('number');
        expect(typeof body.data.interactions).toBe('number');
        expect(typeof body.updatedAt).toBe('string');
    } else {
        expect(response.status()).toBe(503);
        expect(response.headers()['retry-after']).toBe('30');
        expect(body.data).toBeNull();
        expect(body.source).toBe('unavailable');
    }
});

test('uma rota inexistente responde 404', async ({ page }) => {
    const response = await page.goto('/rota-que-nao-existe');

    expect(response?.status()).toBe(404);
    await expect(page.getByText('ROTA NÃO ENCONTRADA')).toBeVisible();
});
