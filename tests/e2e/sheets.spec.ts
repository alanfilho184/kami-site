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
    return `Teste D3 ${Date.now().toString(36)} ${Math.random().toString(36).slice(2, 6)}`;
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

async function getSheetThroughApi(page: Page, sheetId: number): Promise<SheetDetail> {
    const response = await page.request.get(`/api/fichas/${sheetId}`);

    expect(response.status()).toBe(200);

    return (await response.json()) as SheetDetail;
}

async function getSheetIdByName(page: Page, name: string): Promise<number> {
    const response = await page.request.get('/api/fichas');

    expect(response.status()).toBe(200);

    const items = (await response.json()) as { id: number; name: string }[];
    const item = items.find(entry => entry.name === name);

    if (!item) {
        throw new Error(`Ficha "${name}" não encontrada na listagem.`);
    }

    return item.id;
}

test('cria, edita, salva, recarrega e exclui uma ficha pelo editor', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheetName = uniqueSheetName();

    await page.goto('/fichas');
    await waitForHydration(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

    await page.setViewportSize({ width: 360, height: 800 });
    const listScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(listScrolls).toBe(false);

    await page.locator('#nova-ficha').fill(sheetName);
    await page.getByRole('button', { name: 'CRIAR FICHA' }).click();
    await page.waitForURL(/\/\d+\/ficha\//);
    await waitForHydration(page);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');

    const editorScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(editorScrolls).toBe(false);

    await page.getByRole('button', { name: 'ADICIONAR ATRIBUTO' }).click();
    await page.locator('#atributo-nome-0-0').fill('Registro de Força');
    await page.locator('#atributo-valor-0-0').fill('Levantou 12 pedras.');

    await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
    await expect(page.getByText('FICHA SALVA.')).toBeVisible();

    await page.reload();
    await waitForHydration(page);
    await expect(page.locator('#atributo-nome-0-0')).toHaveValue('Registro de Força');
    await expect(page.locator('#atributo-valor-0-0')).toHaveValue('Levantou 12 pedras.');

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('button', { name: 'ADICIONAR SEÇÃO' }).click();
    await page.getByRole('button', { name: 'POSICIONAMENTO', exact: true }).click();
    await expect(page.locator('.site-editor__posicionamento-card')).toHaveCount(2);

    await page.locator('.site-editor__posicionamento-item').first().locator('select').selectOption('1');
    await expect(
        page.locator('.site-editor__posicionamento-card').nth(1).locator('.site-editor__posicionamento-item')
    ).toHaveCount(1);

    await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();
    await page.locator('.site-editor__secao-link').filter({ hasText: 'Nova seção 2' }).click();
    await page.getByRole('button', { name: '8', exact: true }).click();
    await page.getByLabel('Colunas de atributos da seção').selectOption('2');
    await page.getByLabel('Linhas da seção').selectOption('3');
    await page.getByLabel('PREENCHER ESPAÇOS VAZIOS').check();
    await page.getByLabel('Largura de Registro de Força').fill('2');
    await page.getByLabel('Largura de Registro de Força').blur();
    await page.getByLabel('Altura de Registro de Força').fill('2');
    await page.getByLabel('Altura de Registro de Força').blur();

    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__secao--selecionada')).toHaveAttribute(
        'style',
        /--sheet-span: 8/
    );
    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__tipo').first()).toBeVisible();
    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__secao-largura').first()).toBeVisible();
    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__grade--rows')).toHaveAttribute(
        'style',
        /--sheet-rows: 3/
    );
    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__grade--dense')).toHaveCount(1);
    await expect(page.locator('.site-editor__estrutura-canvas .site-sheetview__atributo').first()).toHaveAttribute(
        'style',
        /--attr-rows: 2/
    );

    await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
    await expect(page.getByText('FICHA SALVA.')).toBeVisible();

    const sheetId = await getSheetIdByName(page, sheetName);
    const saved = (await (await page.request.get(`/api/fichas/${sheetId}`)).json()) as SheetDetail;

    expect(saved.attributes.sections[0].attributes).toHaveLength(0);
    expect(saved.attributes.sections[1].attributes[0].name).toBe('Registro de Força');
    expect(saved.layout).toEqual({
        sections: {
            'Nova seção 2': {
                columns: 2,
                rows: 3,
                dense: true,
                attributes: { 'Registro de Força': { span: 2, rows: 2 } },
                span: 8
            }
        }
    });

    await page
        .getByRole('group', { name: 'Modo do editor' })
        .getByRole('button', { name: 'EDITAR', exact: true })
        .click();
    await page.getByLabel('TIPO', { exact: true }).selectOption('1');
    await expect(page.locator('.site-editor__atributos')).toHaveCount(0);
    await expect(page.locator('#descricao-texto')).toHaveValue('Levantou 12 pedras.');

    // No modo de visualização (ESTRUTURA) o campo tem o mesmo atalho dos atributos de lista.
    await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

    const descricao = page
        .locator('.site-editor__estrutura-canvas .site-sheetview__secao')
        .filter({ hasText: 'Nova seção 2' });

    await expect(descricao.locator('.site-sheetview__descricao')).toHaveText('Levantou 12 pedras.');
    await descricao.locator('.site-sheetview__toggle-edicao').click();
    await descricao.locator('.site-sheetview__descricao-edicao').fill('Descrição da seção de teste.');
    await descricao.locator('.site-sheetview__toggle-edicao').click();
    await expect(descricao.locator('.site-sheetview__descricao')).toHaveText('Descrição da seção de teste.');

    await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
    await expect(page.getByText('FICHA SALVA.')).toBeVisible();

    const described = (await (await page.request.get(`/api/fichas/${sheetId}`)).json()) as SheetDetail;

    expect(described.attributes.sections[1].type).toBe(1);
    expect(described.attributes.sections[1].attributes).toHaveLength(1);
    expect(described.attributes.sections[1].attributes[0].value).toBe('Descrição da seção de teste.');

    // No modo leitura, o tipo e a largura da seção não aparecem.
    await page.getByRole('button', { name: 'VISUALIZAR', exact: true }).click();
    await expect(page.locator('.site-editor__leitura')).toBeVisible();
    await expect(page.locator('.site-editor__leitura .site-sheetview__tipo')).toHaveCount(0);
    await expect(page.locator('.site-editor__leitura .site-sheetview__secao-largura')).toHaveCount(0);
    await expect(page).toHaveURL(/ver=1/);
    await page.locator('.site-editor__leitura-acoes').getByRole('button', { name: 'EDITAR', exact: true }).click();
    await expect(page.locator('.site-editor__leitura')).toHaveCount(0);
    await expect(page.locator('.site-editor__topo')).toBeVisible();

    await page.getByRole('button', { name: 'CONFIGURAÇÕES', exact: true }).click();
    await page.getByRole('button', { name: 'EXCLUIR FICHA', exact: true }).click();
    await page.getByRole('button', { name: 'CONFIRMAR EXCLUSÃO' }).click();
    await page.waitForURL('**/fichas');
    await expect(page.locator('.site-fichas__item').filter({ hasText: sheetName })).toHaveCount(0);
});

test('o modo leitura preserva o rascunho e alterna pelo atalho', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByRole('button', { name: 'ADICIONAR ATRIBUTO' }).click();
        await page.locator('#atributo-nome-0-0').fill('Rascunho');
        await page.locator('#atributo-valor-0-0').fill('Ainda não salvo.');

        await page.getByRole('button', { name: 'VISUALIZAR', exact: true }).click();
        await expect(page.locator('.site-editor__leitura')).toBeVisible();
        await expect(page.locator('.site-editor__leitura .site-sheetview__texto')).toContainText('Ainda não salvo.');
        await expect(page.locator('.site-editor__topo')).toHaveCount(0);
        await expect(page).toHaveURL(/ver=1/);

        await page.keyboard.press('Control+Shift+V');
        await expect(page.locator('.site-editor__leitura')).toHaveCount(0);
        await expect(page.locator('.site-editor__topo')).toBeVisible();
        await expect(page.locator('#atributo-valor-0-0')).toHaveValue('Ainda não salvo.');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, sheet.version);
    }
});

test('renomear no editor atualiza a URL canônica da aba', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    const newName = uniqueSheetName();

    try {
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.locator('#ficha-nome').fill(newName);
        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();

        await expect(page).toHaveURL(
            new RegExp(sheetPath(sheet.userId, newName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        );

        const renamed = await getSheetThroughApi(page, sheet.id);

        expect(renamed.name).toBe(newName);
    } finally {
        const current = await getSheetThroughApi(page, sheet.id);

        await deleteSheetThroughApi(page, sheet.id, current.version);
    }
});

test('o modo leitura do dono edita barra, lista, descrição e status com salvamento automático', async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());

    try {
        const saved = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: sheet.version,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [
                                {
                                    name: 'Vida',
                                    type: 4,
                                    position: 0,
                                    value: { actual: 5, max: 10, min: 0, step: 1 }
                                }
                            ]
                        },
                        {
                            name: 'Inventário',
                            type: 0,
                            position: 1,
                            attributes: [
                                {
                                    name: 'Itens',
                                    type: 3,
                                    position: 0,
                                    value: { items: [{ name: 'Corda', quantity: '2' }] }
                                }
                            ]
                        },
                        {
                            name: 'História',
                            type: 1,
                            position: 2,
                            attributes: [{ name: 'Texto', type: 0, position: 0, value: 'Antes.' }]
                        },
                        {
                            name: 'Condição',
                            type: 3,
                            position: 3,
                            attributes: [
                                {
                                    name: 'Status',
                                    type: 5,
                                    position: 0,
                                    value: {
                                        items: [
                                            {
                                                id: 'st-1',
                                                name: 'Ferido',
                                                color: '#ff2b1d',
                                                blink: false,
                                                active: false
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            headers: { origin: baseUrl }
        });

        expect(saved.status()).toBe(200);

        await page.goto(`${sheetPath(sheet.userId, sheet.name)}?ver=1`);
        await waitForHydration(page);

        const reading = page.locator('.site-editor__leitura');

        await expect(reading).toBeVisible();

        const info = reading.locator('.site-sheetview__secao').filter({ hasText: 'Info' });
        const aumentarVida = info.getByRole('button', { name: 'Aumentar Vida' });

        await expect(aumentarVida).toBeVisible();
        await aumentarVida.click();

        await expect
            .poll(async () => {
                const detail = await getSheetThroughApi(page, sheet.id);
                const value = detail.attributes.sections[0]?.attributes[0]?.value as { actual: number };

                return value.actual;
            })
            .toBe(6);

        const inventario = reading.locator('.site-sheetview__secao').filter({ hasText: 'Inventário' });
        const editarLista = inventario.getByRole('button', { name: 'EDITAR', exact: true });

        await expect(editarLista).toBeVisible();
        await editarLista.click();
        await expect(inventario.getByRole('button', { name: 'CONCLUIR', exact: true })).toBeVisible();

        await inventario.getByRole('button', { name: 'Aumentar Corda' }).click();

        await expect
            .poll(async () => {
                const detail = await getSheetThroughApi(page, sheet.id);
                const value = detail.attributes.sections[1]?.attributes[0]?.value as {
                    items: { quantity: string }[];
                };

                return value.items[0]?.quantity;
            })
            .toBe('3');

        const historia = reading.locator('.site-sheetview__secao').filter({ hasText: 'História' });

        await historia.getByRole('button', { name: 'EDITAR', exact: true }).click();

        const descricao = historia.locator('.site-sheetview__descricao-edicao');

        await expect(descricao).toBeVisible();
        await descricao.fill('Descrição atualizada no modo leitura.');

        await expect
            .poll(async () => {
                const detail = await getSheetThroughApi(page, sheet.id);

                return detail.attributes.sections[2]?.attributes[0]?.value;
            })
            .toBe('Descrição atualizada no modo leitura.');

        const condicao = reading.locator('.site-sheetview__secao').filter({ hasText: 'Condição' });
        const ferido = condicao.getByRole('button', { name: 'Ferido' });

        await expect(ferido).toHaveAttribute('aria-pressed', 'false');
        await ferido.click();

        await expect
            .poll(async () => {
                const detail = await getSheetThroughApi(page, sheet.id);
                const value = detail.attributes.sections[3]?.attributes[0]?.value as {
                    items: { active: boolean }[];
                };

                return value.items[0]?.active;
            })
            .toBe(true);

        await expect(reading.getByRole('status')).toHaveText('SALVO AUTOMATICAMENTE.');
        await expect(reading.getByText('ALTERAÇÕES NÃO SALVAS · VISUALIZANDO O RASCUNHO')).toHaveCount(0);

        await page.reload();
        await waitForHydration(page);

        await expect(page.locator('.site-editor__leitura')).toBeVisible();
        await expect(page.locator('.site-editor__leitura .site-sheetview__descricao')).toHaveText(
            'Descrição atualizada no modo leitura.'
        );
    } finally {
        const current = await page.request.get(`/api/fichas/${sheet.id}`);

        if (current.ok()) {
            const detail = (await current.json()) as SheetDetail;

            await deleteSheetThroughApi(page, sheet.id, detail.version);
        }
    }
});

test('a barra guarda a cor escolhida e o preenchimento usa essa cor', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: currentVersion,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [
                                {
                                    name: 'Vida',
                                    type: 4,
                                    position: 0,
                                    value: { actual: 7, max: 10, min: 0, step: 1, color: '#22c55e' }
                                }
                            ]
                        }
                    ]
                }
            },
            headers: { origin: baseUrl }
        });

        expect(response.status()).toBe(200);
        currentVersion = ((await response.json()) as SheetDetail).version;

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByRole('button', { name: 'Ajustes da barra Vida' }).click();
        await expect(page.getByLabel('Cor da barra Vida')).toHaveValue('#22c55e');
        await page.getByRole('button', { name: 'Cor Vermelho' }).click();
        await page.getByRole('button', { name: 'SEGMENTADA', exact: true }).click();

        await page.getByLabel('Fundo da barra Vida').evaluate(element => {
            const input = element as HTMLInputElement;

            input.value = '#1a0b0b';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const alerta = page.getByRole('spinbutton', { name: 'Piscar quando abaixo de' });

        await alerta.fill('80');
        await alerta.blur();

        await page.getByRole('button', { name: 'FECHAR', exact: true }).click();
        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const barra = page.locator('.site-editor__estrutura-canvas .site-sheetview__barra').first();
        const trilho = barra.locator('.site-sheetview__barra-trilho');

        await expect(trilho).toHaveClass(/site-sheetview__barra-trilho--alerta/);
        await expect(trilho).toHaveAttribute('style', /--bar-color: #ff2b1d/);
        await expect(trilho).toHaveAttribute('style', /--bar-bg: #1a0b0b/);
        await expect(trilho.locator('.site-sheetview__barra-segmentos')).toBeVisible();
        await expect(trilho.locator('.site-sheetview__barra-segmento')).toHaveCount(10);
        await expect(trilho.locator('.site-sheetview__barra-segmento--cheio')).toHaveCount(7);

        const detail = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = detail.version;
        expect(detail.attributes.sections[0].attributes[0].value).toMatchObject({
            color: '#ff2b1d',
            background: '#1a0b0b',
            pattern: 'segmented',
            flashBelow: 80
        });

        await page
            .getByRole('group', { name: 'Modo do editor' })
            .getByRole('button', { name: 'EDITAR', exact: true })
            .click();
        await page.getByRole('button', { name: 'Ajustes da barra Vida' }).click();
        await page.locator('.site-editor__barra-alerta input[type="checkbox"]').uncheck();
        await page.getByRole('button', { name: 'FECHAR', exact: true }).click();
        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();
        await expect(
            page.locator('.site-editor__estrutura-canvas .site-sheetview__barra-trilho').first()
        ).not.toHaveClass(/site-sheetview__barra-trilho--alerta/);

        const semBlink = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = semBlink.version;
        expect(semBlink.attributes.sections[0].attributes[0].value).toMatchObject({ blink: false });
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('cria uma seção de cabeçalho com título, imagem opcional e atributos livres', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByRole('button', { name: 'ADICIONAR SEÇÃO' }).click();
        await page.getByLabel('TIPO', { exact: true }).selectOption('2');
        await page.getByLabel('Título do cabeçalho', { exact: true }).fill('Lyra Voss');
        await page.getByLabel('Subtítulo do cabeçalho', { exact: true }).fill('Cartógrafa de ruínas');
        await page.getByLabel('URL da imagem do cabeçalho', { exact: true }).fill(`${baseUrl}/marca/logo-256.webp`);

        await page.getByRole('button', { name: 'ADICIONAR ATRIBUTO' }).click();
        await page.locator('#atributo-nome-1-3').fill('Origem');
        await page.locator('#atributo-valor-1-3').fill('Porto Cinza');

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        const saved = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = saved.version;
        expect(saved.attributes.sections[1].type).toBe(2);
        expect(saved.attributes.sections[1].attributes.map(attribute => attribute.name)).toEqual([
            'Título',
            'Subtítulo',
            'Imagem',
            'Origem'
        ]);
        expect(saved.layout?.sections['Nova seção 2']?.header).toMatchObject({
            title: 'Título',
            subtitle: 'Subtítulo',
            image: 'Imagem'
        });

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const cabecalho = page.locator('.site-editor__estrutura-canvas .site-sheetview__secao--cabecalho');

        await expect(cabecalho.locator('.site-sheetview__cabecalho-titulo')).toHaveText('Lyra Voss');
        await expect(cabecalho.locator('.site-sheetview__cabecalho-subtitulo')).toHaveText('Cartógrafa de ruínas');
        await expect(cabecalho.locator('.site-sheetview__cabecalho-imagem img')).toBeVisible();
        await expect(cabecalho.locator('.site-sheetview__grade .site-sheetview__atributo-nome')).toHaveText('Origem');

        await page
            .getByRole('group', { name: 'Modo do editor' })
            .getByRole('button', { name: 'EDITAR', exact: true })
            .click();
        await page.getByLabel('URL da imagem do cabeçalho', { exact: true }).fill('');
        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();
        await expect(
            page.locator('.site-editor__estrutura-canvas .site-sheetview__secao--cabecalho-sem-imagem')
        ).toHaveCount(1);
        await expect(cabecalho.locator('.site-sheetview__cabecalho-imagem')).toHaveCount(0);

        const semImagem = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = semImagem.version;
        expect(semImagem.layout?.sections['Nova seção 2']?.header).toMatchObject({
            title: 'Título',
            subtitle: 'Subtítulo'
        });
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('a seção de status alterna o estado ativo no editor e salva na ficha', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: currentVersion,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [{ name: 'Nome', type: 0, position: 0, value: 'Lyra' }]
                        },
                        {
                            name: 'Condição',
                            type: 3,
                            position: 1,
                            attributes: [
                                {
                                    name: 'Status',
                                    type: 5,
                                    position: 0,
                                    value: {
                                        items: [
                                            {
                                                id: 'st-1',
                                                name: 'Ferido',
                                                color: '#ff2b1d',
                                                blink: true,
                                                active: false
                                            },
                                            {
                                                id: 'st-2',
                                                name: 'Curado',
                                                color: '#00ff88',
                                                blink: false,
                                                active: true
                                            }
                                        ]
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            headers: { origin: baseUrl }
        });

        expect(response.status()).toBe(200);
        currentVersion = ((await response.json()) as SheetDetail).version;

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByRole('button', { name: 'POSICIONAMENTO', exact: true }).click();

        const statusCard = page.locator('.site-editor__posicionamento-card').filter({ hasText: 'Condição' });
        const infoCard = page.locator('.site-editor__posicionamento-card').filter({ hasText: 'Info' });

        await expect(statusCard).toContainText('SEÇÃO DE STATUS — BLOCO ÚNICO. NÃO ACEITA ATRIBUTOS.');
        await expect(statusCard.locator('.site-editor__posicionamento-item')).toHaveCount(0);
        await expect(infoCard.locator('select option', { hasText: 'Condição' })).toHaveCount(0);

        await page
            .getByRole('group', { name: 'Modo do editor' })
            .getByRole('button', { name: 'EDITAR', exact: true })
            .click();

        await page.locator('.site-editor__secao-link').filter({ hasText: 'Condição' }).click();
        await page.getByLabel('URL do ícone do status').first().fill(`${baseUrl}/marca/logo-256.webp`);

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const secao = page
            .locator('.site-editor__estrutura-canvas .site-sheetview__secao')
            .filter({ hasText: 'Condição' });

        await expect(secao.locator('.site-sheetview__status-chip')).toHaveCount(2);

        const ferido = secao.locator('.site-sheetview__status-chip').filter({ hasText: 'Ferido' });
        const curado = secao.locator('.site-sheetview__status-chip').filter({ hasText: 'Curado' });

        await expect(ferido.locator('.site-sheetview__status-icone img')).toBeVisible();
        await expect(curado.locator('.site-sheetview__status-icone-padrao')).toBeVisible();

        await expect(ferido).not.toHaveClass(/site-sheetview__status-chip--ativo/);
        await ferido.click();
        await expect(ferido).toHaveClass(/site-sheetview__status-chip--ativo/);
        await expect(ferido).toHaveClass(/site-sheetview__status-chip--blink/);

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        const saved = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;
        const items = saved.attributes.sections[1].attributes[0].value as {
            items: { id: string; active: boolean; icon?: string }[];
        };

        currentVersion = saved.version;
        expect(items.items[0]).toMatchObject({
            id: 'st-1',
            active: true,
            icon: `${baseUrl}/marca/logo-256.webp`
        });
        expect(items.items[1]).toMatchObject({ id: 'st-2', active: true });
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('a galeria respeita as colunas por imagem e abre o lightbox com teclado e botões', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    const image = `${baseUrl}/marca/logo-256.webp`;
    let currentVersion = sheet.version;

    try {
        const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: currentVersion,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [{ name: 'Nome', type: 0, position: 0, value: 'Lyra' }]
                        },
                        {
                            name: 'Aparência',
                            type: 4,
                            position: 1,
                            attributes: [
                                { name: 'Rosto', type: 2, position: 0, value: image },
                                { name: 'Corpo', type: 2, position: 1, value: image }
                            ]
                        }
                    ]
                },
                layout: {
                    sections: {
                        Aparência: {
                            columns: 3,
                            attributes: { Corpo: { span: 2, rows: 1 } }
                        }
                    }
                }
            },
            headers: { origin: baseUrl }
        });

        expect(response.status()).toBe(200);
        currentVersion = ((await response.json()) as SheetDetail).version;

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        // No posicionamento, a galeria só aparece como destino para imagens.
        await page.getByRole('button', { name: 'POSICIONAMENTO', exact: true }).click();
        await expect(
            page.getByLabel('Mover Nome para outra seção').locator('option', { hasText: 'Aparência' })
        ).toHaveCount(0);
        await expect(
            page.getByLabel('Mover Rosto para outra seção').locator('option', { hasText: 'Info' })
        ).toHaveCount(1);

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const galeria = page
            .locator('.site-editor__estrutura-canvas .site-sheetview__secao')
            .filter({ hasText: 'Aparência' });

        await expect(galeria.locator('.site-sheetview__galeria')).toHaveAttribute('style', /--gallery-cols: 3/);
        await expect(galeria.locator('.site-sheetview__galeria-item')).toHaveCount(2);
        await expect(galeria.locator('.site-sheetview__galeria-item').nth(1)).toHaveAttribute(
            'style',
            /grid-column: span 2/
        );

        await galeria.locator('.site-sheetview__galeria-botao').first().click();

        const lightbox = page.locator('.site-sheetview__lightbox');

        await expect(lightbox).toBeVisible();
        await expect(lightbox.locator('figcaption')).toContainText('Rosto');

        await page.keyboard.press('ArrowRight');
        await expect(lightbox.locator('figcaption')).toContainText('Corpo');
        await expect(lightbox.locator('figcaption')).toContainText('2 / 2');

        await lightbox.locator('.site-sheetview__lightbox-nav--anterior').click();
        await expect(lightbox.locator('figcaption')).toContainText('Rosto');

        await page.keyboard.press('Escape');
        await expect(lightbox).toHaveCount(0);

        // O inspetor limita a galeria a 6 colunas e aplica a mudança no canvas.
        await galeria.locator('.site-sheetview__secao-nome').click();
        await page.getByLabel('Colunas da galeria').selectOption('2');
        await expect(galeria.locator('.site-sheetview__galeria')).toHaveAttribute('style', /--gallery-cols: 2/);

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        const saved = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;

        currentVersion = saved.version;
        expect(saved.layout?.sections['Aparência']).toMatchObject({
            columns: 2,
            attributes: { Corpo: { span: 2, rows: 1 } }
        });
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('qualquer imagem abre o lightbox sem o carrossel', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    const image = `${baseUrl}/marca/logo-256.webp`;
    let currentVersion = sheet.version;

    try {
        const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: currentVersion,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [{ name: 'Retrato', type: 2, position: 0, value: image }]
                        },
                        {
                            name: 'Apresentação',
                            type: 2,
                            position: 1,
                            attributes: [
                                { name: 'Título', type: 0, position: 0, value: 'Lyra Voss' },
                                { name: 'Imagem', type: 2, position: 1, value: image }
                            ]
                        }
                    ]
                },
                layout: {
                    sections: {
                        Apresentação: { columns: 1, header: { title: 'Título', image: 'Imagem' } }
                    }
                }
            },
            headers: { origin: baseUrl }
        });

        expect(response.status()).toBe(200);
        currentVersion = ((await response.json()) as SheetDetail).version;

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);
        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const canvas = page.locator('.site-editor__estrutura-canvas');
        const lightbox = page.locator('.site-sheetview__lightbox');

        await canvas.locator('.site-sheetview__imagem-botao').click();
        await expect(lightbox).toBeVisible();
        await expect(lightbox.locator('figcaption')).toContainText('Retrato');
        await expect(lightbox.locator('.site-sheetview__lightbox-nav')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(lightbox).toHaveCount(0);

        await canvas.locator('.site-sheetview__cabecalho-imagem-botao').click();
        await expect(lightbox).toBeVisible();
        await expect(lightbox.locator('figcaption')).toContainText('Imagem');
        await expect(lightbox.locator('.site-sheetview__lightbox-nav')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(lightbox).toHaveCount(0);
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('a tabela edita células, linhas e colunas e é salva na ficha', async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheet = await createSheetThroughApi(page, uniqueSheetName());
    let currentVersion = sheet.version;

    try {
        const response = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: {
                name: sheet.name,
                version: currentVersion,
                attributes: {
                    sections: [
                        {
                            name: 'Info',
                            type: 0,
                            position: 0,
                            attributes: [{ name: 'Nome', type: 0, position: 0, value: 'Lyra' }]
                        },
                        {
                            name: 'Inventário',
                            type: 5,
                            position: 1,
                            attributes: [
                                {
                                    name: 'Tabela',
                                    type: 6,
                                    position: 0,
                                    value: {
                                        columns: ['Item', 'Qtd.'],
                                        rows: [['Corda', '2']]
                                    }
                                }
                            ]
                        }
                    ]
                }
            },
            headers: { origin: baseUrl }
        });

        expect(response.status()).toBe(200);
        currentVersion = ((await response.json()) as SheetDetail).version;

        await page.goto(sheetPath(sheet.userId, sheet.name));
        await waitForHydration(page);

        await page.getByRole('button', { name: 'POSICIONAMENTO', exact: true }).click();

        const tableCard = page.locator('.site-editor__posicionamento-card').filter({ hasText: 'Inventário' });

        await expect(tableCard).toContainText('SEÇÃO DE TABELA — BLOCO ÚNICO. NÃO ACEITA ATRIBUTOS.');
        await expect(tableCard.locator('.site-editor__posicionamento-item')).toHaveCount(0);

        await page
            .getByRole('group', { name: 'Modo do editor' })
            .getByRole('button', { name: 'EDITAR', exact: true })
            .click();

        await page.locator('.site-editor__secao-link').filter({ hasText: 'Inventário' }).click();

        const tabela = page.locator('.site-editor__tabela');

        await expect(tabela.locator('th')).toHaveCount(2);
        await expect(tabela.locator('tbody input')).toHaveCount(2);

        await tabela.locator('tbody input').nth(1).fill('3');
        await tabela.getByRole('button', { name: /LINHA/ }).click();
        await expect(tabela.locator('tbody tr')).toHaveCount(2);
        await expect(tabela.locator('tbody input')).toHaveCount(4);

        await tabela.getByRole('button', { name: /COLUNA/ }).click();
        await expect(tabela.locator('th')).toHaveCount(3);

        await tabela.getByLabel('Nome da coluna').nth(2).fill('Notas');

        await page.getByRole('button', { name: 'SALVAR', exact: true }).click();
        await expect(page.getByText('FICHA SALVA.')).toBeVisible();

        const saved = (await (await page.request.get(`/api/fichas/${sheet.id}`)).json()) as SheetDetail;
        const value = saved.attributes.sections[1].attributes[0].value as {
            columns: string[];
            rows: string[][];
        };

        currentVersion = saved.version;
        expect(value).toEqual({
            columns: ['Item', 'Qtd.', 'Notas'],
            rows: [
                ['Corda', '3', ''],
                ['', '', '']
            ]
        });

        await page.getByRole('button', { name: 'ESTRUTURA', exact: true }).click();

        const secao = page
            .locator('.site-editor__estrutura-canvas .site-sheetview__secao')
            .filter({ hasText: 'Inventário' });

        await expect(secao.locator('.site-sheetview__tabela th')).toHaveCount(3);
        await expect(secao.locator('.site-sheetview__tabela th').nth(2)).toHaveText('Notas');
        await expect(secao.locator('.site-sheetview__tabela tbody td').first()).toHaveText('Corda');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('a API de fichas guarda versão, renomeia e detecta conflito de escrita', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheetName = uniqueSheetName();

    const sheet = await createSheetThroughApi(page, sheetName);
    let currentVersion = sheet.version;

    try {
        const detail = await page.request.get(`/api/fichas/${sheet.id}`);

        expect(detail.status()).toBe(200);
        expect(((await detail.json()) as SheetDetail).name).toBe(sheetName);

        const saved = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: { name: sheetName, attributes: sheet.attributes, version: currentVersion },
            headers: { origin: baseUrl }
        });

        expect(saved.status()).toBe(200);
        currentVersion = ((await saved.json()) as SheetDetail).version;

        const renamed = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: { name: `${sheetName} 2`, version: currentVersion },
            headers: { origin: baseUrl }
        });

        expect(renamed.status()).toBe(200);
        expect(((await renamed.json()) as SheetDetail).name).toBe(`${sheetName} 2`);
        currentVersion = ((await renamed.json()) as SheetDetail).version;

        const stale = await page.request.patch(`/api/fichas/${sheet.id}`, {
            data: { name: sheetName, attributes: sheet.attributes, version: sheet.version },
            headers: { origin: baseUrl }
        });
        const staleBody = (await stale.json()) as { message?: string; code?: string };

        expect(stale.status()).toBe(409);
        expect(staleBody.code).toBe('sheet_conflict');
        expect(typeof staleBody.message).toBe('string');
    } finally {
        await deleteSheetThroughApi(page, sheet.id, currentVersion);
    }
});

test('ficha ao vivo abre em modo somente leitura com mock de IRT', async ({ page }) => {
    test.skip(!loginEmail || !loginPassword, 'Defina E2E_AUTH_EMAIL e E2E_AUTH_PASSWORD');

    const sheetName = uniqueSheetName();

    await page.goto('/fichas');
    await waitForHydration(page);

    await page.locator('#nova-ficha').fill(sheetName);
    await page.getByRole('button', { name: 'CRIAR FICHA' }).click();
    await page.waitForURL(/\/\d+\/ficha\//);
    await waitForHydration(page);

    const sheetId = await getSheetIdByName(page, sheetName);
    const authenticSheet = (await (await page.request.get(`/api/fichas/${sheetId}`)).json()) as SheetDetail;

    try {
        await page.locator('.site-editor__voltar').click();
        await page.waitForURL('**/fichas');

        const liveSheet: SheetDetail = {
            ...authenticSheet,
            isLive: true
        };

        await page.route(`**/api/fichas/${sheetId}`, async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(liveSheet)
            });
        });

        await page.evaluate(
            async url => {
                const app = (
                    document.querySelector('#__nuxt') as {
                        __vue_app__?: {
                            config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } };
                        };
                    } | null
                )?.__vue_app__;

                await app?.config.globalProperties.$router.push(url);
            },
            `${sheetPath(authenticSheet.userId, authenticSheet.name)}?id=${sheetId}`
        );
        await page.waitForURL(/\/\d+\/ficha\//);

        await expect(page.getByText('SOMENTE LEITURA', { exact: true })).toBeVisible();
        await expect(page.locator('.site-editor__selos').getByText('AO VIVO', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'SALVAR' })).toHaveCount(0);
        await expect(page.locator('.site-sheetview__tipo')).toHaveCount(0);
        await expect(page.locator('.site-sheetview__secao-largura')).toHaveCount(0);
    } finally {
        await deleteSheetThroughApi(page, sheetId, authenticSheet.version);
    }
});
