import type { SheetAttributes, SheetLayout } from '../../types/sheet';

export interface StatItem {
    key: 'users' | 'activeUsers' | 'sheets' | 'interactions';
    label: string;
    sub: string;
}

export interface Feature {
    code: string;
    label: string;
    title: string;
    text: string;
    details: string[];
}

export interface Step {
    code: string;
    title: string;
    text: string;
}

export interface RoadmapItem {
    code: string;
    state: 'active' | 'planned';
    status: string;
    title: string;
    text: string;
    details: string[];
}

export interface FaqItem {
    question: string;
    answer: string;
}

export const landing = {
    meta: {
        title: 'Kami - Fichas de RPG Personalizáveis',
        description:
            'Crie e edite fichas de personagem no site, mantenha a ficha atualizada durante a sessão e, se quiser, use o bot do Discord para rolar dados e levar a ficha para a mesa.',
        ogTitle: 'Kami - Fichas de RPG Personalizáveis',
        ogDescription: 'Fichas personalizáveis no site, ficha ao vivo e o bot do Kami no Discord.'
    },
    topbar: {
        subtitle: 'FICHAS DE RPG PERSONALIZÁVEIS',
        cta: 'ENTRAR',
        shortCta: 'ENTRAR',
        support: 'SUPORTE',
        links: [
            { label: 'RECURSOS', href: '/#recursos' },
            { label: 'FICHA', href: '/#ficha' },
            { label: 'COMO FUNCIONA', href: '/#como-funciona' },
            { label: 'PERGUNTAS', href: '/#perguntas' }
        ]
    },
    hero: {
        eyebrow: 'PARA A SUA MESA',
        titleLines: ['FICHAS DO SEU JEITO.', 'DO SITE PARA A MESA.'],
        description:
            'Monte e mantenha a ficha do personagem no site, com atualizações em tempo real durante a sessão. Se quiser, o bot do Discord leva a ficha e as rolagens para a mesa.',
        note: 'GRATUITO · COMECE NO SITE',
        primaryCta: 'ENTRAR',
        secondaryCta: 'ADICIONAR O BOT'
    },
    stats: {
        label: 'O KAMI EM NÚMEROS',
        meta: 'DADOS DO KAMI',
        items: [
            { key: 'users', label: 'JOGADORES', sub: 'cadastrados no Kami' },
            { key: 'activeUsers', label: 'USUÁRIOS ATIVOS', sub: 'nos últimos 30 dias' },
            { key: 'sheets', label: 'FICHAS CRIADAS', sub: 'atualmente no Kami' },
            { key: 'interactions', label: 'INTERAÇÕES NO DISCORD', sub: 'desde o início do Kami' }
        ] as StatItem[],
        updatedNote: 'DADOS DO KAMI · ATUALIZADO EM',
        unavailableNote: 'ESTATÍSTICAS INDISPONÍVEIS · TENTANDO NOVAMENTE EM INSTANTES',
        legend: 'NÚMEROS REAIS DO KAMI · SEM DADOS PESSOAIS'
    },
    features: {
        label: 'O QUE DÁ PARA FAZER',
        meta: 'RECURSOS',
        title: 'Uma ficha que acompanha o ritmo da mesa.',
        description:
            'Monte e mantenha a ficha no site, sem planilha paralela. O bot do Discord é opcional e leva as rolagens e a ficha ao vivo para a mesa.',
        items: [
            {
                code: '01',
                label: 'FICHAS',
                title: 'Monte a ficha que o seu sistema pede.',
                text: 'Texto, número, imagem, lista, barra, status e tabela em seções livres. Se o seu sistema tem uma regra estranha, a ficha acompanha.',
                details: ['TEXTO', 'NÚMERO', 'IMAGEM', 'LISTA', 'BARRA', 'STATUS', 'TABELA']
            },
            {
                code: '02',
                label: 'DADOS NO DISCORD',
                title: 'Role com o bot, sem sair da mesa.',
                text: 'As rolagens acontecem pelo bot do Discord: expressões com soma, vantagem, desvantagem e comparadores. A ficha continua no site.',
                details: ['2d6 + 3', 'VANTAGEM', 'COMPARADOR']
            },
            {
                code: '03',
                label: 'FICHA AO VIVO',
                title: 'A ficha muda, a mesa acompanha.',
                text: 'Compartilhe a ficha por link ou envie para o Discord pelo bot. As mudanças feitas no site aparecem na hora; pelo bot, são até três exibições sincronizadas por ficha.',
                details: ['LINK PÚBLICO', 'SINCRONIZAÇÃO', 'ATÉ 3 EXIBIÇÕES']
            }
        ] as Feature[],
        roadmap: {
            label: 'PRÓXIMAS ATUALIZAÇÕES',
            items: [
                {
                    code: '01',
                    state: 'active',
                    status: 'EM DESENVOLVIMENTO',
                    title: 'Macros',
                    text: 'Salve as jogadas que se repetem como atalhos com nome. O macro guarda a expressão de dados e fica à mão na ficha do site, sem redigitar a fórmula a cada turno.',
                    details: ['ROLAGENS SALVAS', 'ATALHOS NA FICHA']
                },
                {
                    code: '02',
                    state: 'planned',
                    status: 'PLANEJADO',
                    title: 'Campanhas',
                    text: 'Reúna as fichas e os personagens do grupo em uma campanha. A ideia é ter um painel da história com o elenco à mão, sem procurar link por link entre as sessões.',
                    details: ['GRUPO E FICHAS', 'PAINEL DA CAMPANHA']
                }
            ] as RoadmapItem[]
        }
    },
    sample: {
        label: 'FICHA DE AMOSTRA',
        meta: 'AMOSTRA',
        tag: 'PERSONAGEM FICTÍCIO · DADOS DEMONSTRATIVOS',
        name: 'Lyra Voss',
        footer: 'TEXTO · NÚMERO · IMAGEM · LISTA · BARRA · STATUS · TABELA',
        attributes: {
            sections: [
                {
                    name: 'Identidade',
                    type: 2,
                    position: 0,
                    attributes: [
                        { name: 'Nome', type: 0, position: 0, value: 'Lyra Voss' },
                        { name: 'Resumo', type: 0, position: 1, value: 'Cartógrafa de ruínas · Nível 4' },
                        { name: 'Retrato', type: 2, position: 2, value: '/placeholders/placeholder.webp' },
                        { name: 'Origem', type: 0, position: 3, value: 'Porto Cinza' },
                        {
                            name: 'Conceito',
                            type: 0,
                            position: 4,
                            value: 'Leitora de mapas que não deveriam existir'
                        },
                        {
                            name: 'Descrição',
                            type: 0,
                            position: 5,
                            value: 'Lyra mapeia ruínas que não aparecem em nenhum mapa e desconfia de qualquer porta já aberta.'
                        }
                    ]
                },
                {
                    name: 'Atributos',
                    type: 0,
                    position: 1,
                    attributes: [
                        { name: 'AGILIDADE', type: 1, position: 0, value: 4 },
                        { name: 'PRECISÃO', type: 1, position: 1, value: 3 },
                        { name: 'VONTADE', type: 1, position: 2, value: 5 },
                        { name: 'PRESENÇA', type: 1, position: 3, value: 2 }
                    ]
                },
                {
                    name: 'Recursos',
                    type: 0,
                    position: 2,
                    attributes: [
                        {
                            name: 'VITALIDADE',
                            type: 4,
                            position: 0,
                            value: {
                                actual: 12,
                                max: 16,
                                min: 0,
                                step: 1,
                                color: '#ff2b1d',
                                pattern: 'segmented'
                            }
                        },
                        {
                            name: 'SANIDADE',
                            type: 4,
                            position: 1,
                            value: {
                                actual: 6,
                                max: 8,
                                min: 0,
                                step: 1,
                                color: '#0082ff'
                            }
                        }
                    ]
                },
                {
                    name: 'Condição',
                    type: 3,
                    position: 3,
                    attributes: [
                        {
                            name: 'Estado',
                            type: 5,
                            position: 0,
                            value: {
                                items: [
                                    {
                                        id: 'ferido',
                                        name: 'Ferido',
                                        color: '#ff2b1d',
                                        blink: false,
                                        active: true
                                    },
                                    {
                                        id: 'focado',
                                        name: 'Focado',
                                        color: '#0082ff',
                                        blink: false,
                                        active: true
                                    },
                                    {
                                        id: 'exausto',
                                        name: 'Exausto',
                                        color: '#ffaa00',
                                        blink: false,
                                        active: false
                                    }
                                ]
                            }
                        }
                    ]
                },
                {
                    name: 'Inventário',
                    type: 0,
                    position: 4,
                    attributes: [
                        {
                            name: 'Itens',
                            type: 3,
                            position: 0,
                            value: {
                                items: [
                                    { name: 'Corda de seda', quantity: '1' },
                                    { name: 'Lanterna a óleo', quantity: '2' },
                                    { name: 'Ração de viagem', quantity: '4' },
                                    { name: 'Bússola quebrada', quantity: '1' }
                                ]
                            }
                        }
                    ]
                },
                {
                    name: 'Anotações',
                    type: 1,
                    position: 5,
                    attributes: [
                        {
                            name: 'Texto',
                            type: 0,
                            position: 0,
                            value: 'A porta só abre com a marcação certa. Lyra já viu esse símbolo em três ruínas - e nas três, alguém chegou antes.'
                        }
                    ]
                },
                {
                    name: 'Perícias',
                    type: 5,
                    position: 6,
                    attributes: [
                        {
                            name: 'Tabela',
                            type: 6,
                            position: 0,
                            value: {
                                columns: ['PERÍCIA', 'BÔNUS'],
                                rows: [
                                    ['Investigação', '+5'],
                                    ['Sobrevivência', '+4'],
                                    ['Furtividade', '+3'],
                                    ['Percepção', '+2']
                                ]
                            }
                        }
                    ]
                }
            ]
        } as SheetAttributes,
        layout: {
            sections: {
                Identidade: {
                    columns: 12,
                    span: 12,
                    header: {
                        title: 'Nome',
                        subtitle: 'Resumo',
                        image: 'Retrato',
                        imageWidth: 3,
                        titleSize: 48
                    },
                    attributes: {
                        Origem: { span: 6, rows: 1 },
                        Conceito: { span: 6, rows: 1 },
                        Descrição: { span: 12, rows: 1 }
                    }
                },
                Atributos: { columns: 4, span: 6 },
                Recursos: { columns: 2, span: 3 },
                Condição: { columns: 3, span: 3 },
                Inventário: { columns: 4, span: 4 },
                Anotações: { columns: 12, span: 8 },
                Perícias: { columns: 12, span: 12 }
            }
        } as SheetLayout
    },
    howItWorks: {
        label: 'COMO FUNCIONA',
        meta: '3 PASSOS',
        title: 'Da ficha à mesa em poucos minutos.',
        steps: [
            {
                code: '01',
                title: 'COMECE NO SITE',
                text: 'Crie sua conta e monte a ficha no editor do site. O bot do Discord é opcional.'
            },
            {
                code: '02',
                title: 'MONTE A FICHA',
                text: 'Crie seções e atributos com texto, número, imagem, lista, barra, status e tabela. Nomeie do jeito que o seu sistema nomeia.'
            },
            {
                code: '03',
                title: 'LEVE PARA A MESA',
                text: 'Compartilhe o link da ficha ou envie para o Discord pelo bot. As alterações feitas no site acompanham a sessão.'
            }
        ] as Step[],
        note: 'COMECE NO SITE · O BOT DO DISCORD É OPCIONAL'
    },
    faq: {
        label: 'PERGUNTAS FREQUENTES',
        meta: 'FAQ',
        title: 'O que costumam perguntar antes de começar.',
        items: [
            {
                question: 'O Kami é gratuito?',
                answer: 'Sim. Todos os recursos atuais do Kami são gratuitos.'
            },
            {
                question: 'Preciso criar conta?',
                answer: 'Para usar o editor e os recursos do site, sim. A conta é gratuita e pode ser criada com e-mail e senha. Para jogar apenas pelo Discord, o bot do Kami pode ser usado sem conta no site.'
            },
            {
                question: 'Serve para qualquer sistema de RPG?',
                answer: 'Sim. As fichas são personalizáveis: você cria as seções e os atributos que o seu sistema usa, sem ficar preso a um modelo.'
            },
            {
                question: 'O que é a ficha ao vivo?',
                answer: 'É a ficha que você edita no site e compartilha com a mesa. O link público abre no navegador e se atualiza em tempo real; pelo bot do Discord, a ficha também pode ser enviada e sincronizada, com até três exibições por ficha.'
            },
            {
                question: 'Minhas fichas ficam públicas?',
                answer: 'Não são listadas em diretórios nem aparecem em buscadores. A ficha pode ser configurada para que qualquer pessoa tenha acesso de leitura, sem ou com senha, ou ser mantida privada.'
            },
            {
                question: 'Tem versão em inglês?',
                answer: 'O site está em português do Brasil; a versão em inglês está planejada. O bot do Discord já funciona em português e inglês, com o idioma configurável por servidor.'
            },
            {
                question: 'Posso usar no celular?',
                answer: 'Sim. A ficha do site funciona no navegador do celular, e o bot do Discord pode ser usado no app.'
            }
        ] as FaqItem[]
    },
    finalCta: {
        label: 'PRONTO PARA A PRÓXIMA SESSÃO',
        title: 'Leve o Kami para a sua mesa.',
        text: 'Crie sua conta, monte a ficha no site e compartilhe com a mesa. O bot do Discord é opcional para levar a ficha e as rolagens para o servidor.',
        cta: 'ENTRAR NO SITE',
        secondaryCta: 'ADICIONAR O BOT'
    }
};

export type LandingContent = typeof landing;
