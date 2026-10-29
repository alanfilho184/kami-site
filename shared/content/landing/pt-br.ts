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

export interface SampleAttribute {
    name: string;
    value: number;
}

export interface SampleBar {
    name: string;
    current: number;
    max: number;
    min: number;
}

export interface InventoryItem {
    name: string;
    quantity: string;
}

export const landing = {
    meta: {
        title: 'Kami - Fichas de RPG Personalizáveis',
        description:
            'Crie fichas de personagem do seu jeito, role dados e mantenha a ficha atualizada durante a sessão. Gratuito, em português e inglês.',
        ogTitle: 'Kami - Fichas de RPG Personalizáveis',
        ogDescription: 'Fichas personalizáveis, rolagem de dados e ficha ao vivo.'
    },
    topbar: {
        subtitle: 'FICHAS DE RPG PERSONALIZÁVEIS',
        cta: 'ADICIONAR O KAMI',
        shortCta: 'ADICIONAR',
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
        titleLines: ['FICHAS DO SEU JEITO.', 'DADOS NA HORA.'],
        description:
            'O Kami organiza as fichas do seu personagem, rola os dados e mantém tudo sincronizado - durante e entre as sessões.',
        note: 'GRATUITO · PT-BR E EN-US',
        primaryCta: 'ADICIONAR O KAMI',
        secondaryCta: 'VER UMA FICHA'
    },
    stats: {
        label: 'O KAMI EM NÚMEROS',
        meta: 'DADOS DO KAMI',
        items: [
            { key: 'users', label: 'JOGADORES', sub: 'cadastrados no Kami' },
            { key: 'activeUsers', label: 'ATIVOS', sub: 'nos últimos 30 dias' },
            { key: 'sheets', label: 'FICHAS CRIADAS', sub: 'atualmente no Kami' },
            { key: 'interactions', label: 'INTERAÇÕES', sub: 'executadas desde o início do Kami' }
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
            'Sem planilha paralela e sem decorar comando. O Kami cuida da ficha para você olhar para a história.',
        items: [
            {
                code: '01',
                label: 'FICHAS',
                title: 'Monte a ficha que o seu sistema pede.',
                text: 'Texto, número, imagem, lista e barra em seções livres. Se o seu sistema tem uma regra estranha, a ficha acompanha.',
                details: ['TEXTO', 'NÚMERO', 'IMAGEM', 'LISTA', 'BARRA']
            },
            {
                code: '02',
                label: 'DADOS',
                title: 'Role sem sair da mesa.',
                text: 'Expressões com soma, vantagem, desvantagem e comparadores. Salve as jogadas de sempre em botões.',
                details: ['2d6 + 3', 'VANTAGEM', 'COMPARADOR']
            },
            {
                code: '03',
                label: 'FICHA AO VIVO',
                title: 'A ficha muda, a mesa acompanha.',
                text: 'Envie a ficha para a mesa e deixe-a se atualizar sozinha quando o personagem mudar. Até três exibições por ficha.',
                details: ['SINCRONIZAÇÃO', 'ATÉ 3 EXIBIÇÕES']
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
                    text: 'Salve as jogadas que se repetem como atalhos com nome. A macro guarda a expressão de dados e fica à mão na ficha, sem redigitar a fórmula a cada turno.',
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
        portrait: {
            src: '/placeholders/placeholder.webp',
            alt: 'Símbolo do Kami, um dado de vinte faces azul sobre um mapa topográfico, usado como imagem de exemplo.'
        },
        name: 'LYRA VOSS',
        summary: 'Cartógrafa de ruínas · Nível 4',
        description:
            'Lyra mapeia ruínas que não aparecem em nenhum mapa. Carrega um caderno de rotas incompletas e desconfia de qualquer porta que já esteja aberta.',
        origin: 'Porto Cinza',
        concept: 'Leitora de mapas que não deveriam existir',
        attributes: [
            { name: 'AGILIDADE', value: 4 },
            { name: 'PRECISÃO', value: 3 },
            { name: 'VONTADE', value: 5 },
            { name: 'PRESENÇA', value: 2 }
        ] as SampleAttribute[],
        resources: [
            { name: 'VITALIDADE', current: 12, max: 16, min: 0 },
            { name: 'SANIDADE', current: 6, max: 8, min: 0 }
        ] as SampleBar[],
        inventory: [
            { name: 'Corda de seda', quantity: '×1' },
            { name: 'Lanterna a óleo', quantity: '×2' },
            { name: 'Ração de viagem', quantity: '×4' },
            { name: 'Bússola quebrada', quantity: '×1' }
        ] as InventoryItem[],
        notes: 'A porta só abre com a marcação certa. Lyra já viu esse símbolo em três ruínas - e nas três, alguém chegou antes.',
        footer: 'TEXTO · NÚMERO · IMAGEM · LISTA · BARRA'
    },
    howItWorks: {
        label: 'COMO FUNCIONA',
        meta: '3 PASSOS',
        title: 'Da ficha à primeira rolagem em poucos minutos.',
        steps: [
            {
                code: '01',
                title: 'ADICIONE',
                text: 'Adicione o Kami ao servidor e comece a montar a ficha.'
            },
            {
                code: '02',
                title: 'MONTE A FICHA',
                text: 'Crie seções e atributos com os cinco tipos. Nomeie do jeito que o seu sistema nomeia.'
            },
            {
                code: '03',
                title: 'LEVE PARA A MESA',
                text: 'Envie a ficha para a mesa e role os dados durante a sessão.'
            }
        ] as Step[],
        note: 'O MESMO KAMI EM PT-BR E EN-US'
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
                answer: 'Não. Hoje o Kami funciona pelo Discord; o login no site chega na próxima etapa e não é necessário para jogar.'
            },
            {
                question: 'Serve para qualquer sistema de RPG?',
                answer: 'Sim. As fichas são personalizáveis: você cria as seções e os atributos que o seu sistema usa, sem ficar preso a um modelo.'
            },
            {
                question: 'O que é a ficha ao vivo?',
                answer: 'É a ficha compartilhada com a mesa. Quando você edita o personagem, ela se atualiza sozinha. Cada ficha pode ter até três exibições sincronizadas.'
            },
            {
                question: 'Minhas fichas ficam públicas?',
                answer: 'Não são listadas em diretórios nem aparecem em buscadores. O acesso acontece pelo link da própria ficha, quando ele é compartilhado.'
            },
            {
                question: 'Tem versão em inglês?',
                answer: 'Sim. O Kami funciona em português do Brasil e inglês, com o idioma configurável por servidor.'
            },
            {
                question: 'Posso usar no celular?',
                answer: 'Sim. A ficha e os dados funcionam no celular, onde você estiver.'
            }
        ] as FaqItem[]
    },
    finalCta: {
        label: 'PRONTO PARA A PRÓXIMA SESSÃO',
        title: 'Leve o Kami para a sua mesa.',
        text: 'As fichas, os dados e as anotações do personagem ficam no mesmo lugar - da criação à última rolagem.',
        cta: 'ADICIONAR O KAMI',
        secondaryCta: 'ENTRAR NO SERVIDOR DE SUPORTE'
    }
};

export type LandingContent = typeof landing;
