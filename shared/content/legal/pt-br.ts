import type { LegalDocument } from './types';

export const termsPtBr: LegalDocument = {
    title: 'Termos de Uso',
    summary: 'As regras para usar o Kami no Discord e no site.',
    updatedAt: '28/10/2026',
    language: 'PT-BR',
    languageRoute: '/terms',
    languageLabel: 'READ IN ENGLISH',
    sections: [
        {
            title: '1. Sobre estes termos',
            paragraphs: [
                'Ao usar o Kami no Discord ou neste site, você concorda com estes termos. Se não concordar com alguma regra, não use o serviço.',
                'O Kami é um projeto independente e não é afiliado ao Discord.'
            ]
        },
        {
            title: '2. Registro de comandos',
            paragraphs: [
                'Os comandos usados no Kami ficam registrados. O registro inclui nome, tag e ID do usuário, o comando executado, os argumentos informados, anexos enviados, o idioma, o servidor ou DM de origem e o horário da execução.',
                'Esse registro é usado para segurança, identificação de raids e diagnóstico de erros. Quando um erro aparece no console, as informações do comando ajudam a corrigir o problema com mais rapidez.'
            ]
        },
        {
            title: '3. Mensagens na DM',
            paragraphs: [
                'Você pode receber mensagens na DM enviadas pela equipe do Kami e por alguns comandos.',
                'Se forem detectados erros repetidos causados por um usuário, a equipe pode enviar uma mensagem para ajudar com o comando ou entender o que aconteceu. Comandos com função secreta, como dados e insanidade, podem ser enviados na DM quando essa opção estiver ativada.'
            ]
        },
        {
            title: '4. Conteúdo das fichas',
            paragraphs: [
                'As informações que você adiciona nas fichas são de sua responsabilidade. As fichas devem conter apenas dados fictícios de personagens de RPG, nunca informações pessoais de pessoas reais.',
                'O uso das fichas para armazenar informações pessoais com a intenção de prejudicar alguém ou o serviço pode resultar em banimento permanente, sem direito a apelação.'
            ]
        },
        {
            title: '5. Conduta e moderação',
            paragraphs: [
                'Use o Kami de acordo com os Termos de Serviço e as Diretrizes da Comunidade do Discord. Não use o serviço para atividades que violem essas regras.',
                'A gravidade da violação define a duração da punição, que pode ir de algumas horas a um banimento permanente.'
            ]
        },
        {
            title: '6. Exclusão de dados',
            paragraphs: [
                'Você pode solicitar a exclusão dos seus dados a qualquer momento pelo servidor de suporte do Kami.',
                'A solicitação é analisada e executada conforme a legislação aplicável. Registros de segurança podem ser mantidos pelo período necessário para cumprir obrigações legais ou proteger o serviço.'
            ]
        },
        {
            title: '7. Disponibilidade e mudanças',
            paragraphs: [
                'O Kami pode passar por manutenção, mudanças e interrupções. Não há garantia de disponibilidade ininterrupta.',
                'Estes termos podem ser atualizados. Mudanças relevantes serão comunicadas no servidor de suporte e na página de atualizações do Discord.'
            ]
        },
        {
            title: '8. Contato',
            paragraphs: [
                'Dúvidas sobre estes termos podem ser enviadas pelo servidor de suporte do Kami. O link fica disponível no rodapé do site e no comando de suporte do bot.'
            ]
        }
    ]
};

export const privacyPtBr: LegalDocument = {
    title: 'Política de Privacidade',
    summary: 'Quais dados o Kami trata, por quê e como pedir a exclusão.',
    updatedAt: '28/10/2026',
    language: 'PT-BR',
    languageRoute: '/privacy',
    languageLabel: 'READ IN ENGLISH',
    sections: [
        {
            title: '1. Quais dados são tratados',
            paragraphs: [
                'Dados de identificação do Discord: nome, tag e ID do usuário que executa comandos.',
                'Dados de uso: comandos executados, argumentos, anexos, idioma, servidor ou DM de origem e horário.',
                'Dados das fichas: seções, atributos, imagens, listas, barras e demais informações que você adicionar.',
                'Configurações de servidor: idioma e opções do Kami no servidor.',
                'Dados técnicos do site: endereço IP, data e hora, navegador e página solicitada, usados para segurança e diagnóstico.'
            ]
        },
        {
            title: '2. Para que os dados são usados',
            paragraphs: [
                'Operar as fichas, a rolagem de dados e a sincronização da ficha ao vivo no Discord.',
                'Manter a segurança do serviço, identificar abusos e investigar erros.',
                'Responder solicitações de suporte e de exclusão de dados.',
                'Produzir estatísticas agregadas, sem dados pessoais, para a página pública do Kami.'
            ]
        },
        {
            title: '3. Onde os dados ficam',
            paragraphs: [
                'As fichas e os registros do bot ficam em um banco PostgreSQL compartilhado entre o bot e o site.',
                'As mensagens enviadas ao Discord também ficam armazenadas no Discord, conforme as regras da plataforma.',
                'A infraestrutura de hospedagem pode processar dados técnicos necessários para manter o site no ar.'
            ]
        },
        {
            title: '4. Cookies e rastreamento',
            paragraphs: [
                'O site não usa cookies de publicidade, analytics ou rastreamento de terceiros.',
                'Quando o login do site estiver disponível, será usado um cookie de sessão HttpOnly para manter você autenticado. Esse cookie não é acessível por JavaScript.'
            ]
        },
        {
            title: '5. Compartilhamento',
            paragraphs: [
                'Os dados não são vendidos. O compartilhamento acontece apenas com o Discord, com provedores de infraestrutura necessários para operar o serviço e com autoridades quando houver obrigação legal.',
                'Estatísticas públicas são agregadas e não identificam usuários.'
            ]
        },
        {
            title: '6. Retenção e exclusão',
            paragraphs: [
                'Os dados são mantidos pelo tempo necessário para operar o Kami, cumprir obrigações legais e proteger o serviço.',
                'Você pode pedir a exclusão dos seus dados pelo servidor de suporte. A solicitação é registrada e executada conforme a legislação aplicável.'
            ]
        },
        {
            title: '7. Seus direitos',
            paragraphs: [
                'Você pode solicitar informações sobre os dados tratados, correção de dados incorretos e exclusão dos dados que não precisam ser mantidos.',
                'Para exercer esses direitos, entre em contato pelo servidor de suporte do Kami.'
            ]
        },
        {
            title: '8. Segurança',
            paragraphs: [
                'O acesso ao banco é restrito, as conexões usam TLS quando disponível e os registros técnicos são tratados com cuidado.',
                'Nenhum sistema é totalmente imune a falhas. Se você identificar um problema de segurança, avise a equipe pelo suporte.'
            ]
        },
        {
            title: '9. Menores de idade',
            paragraphs: [
                'O Kami é usado dentro do Discord e segue a idade mínima exigida pela plataforma. O serviço não é direcionado a crianças.',
                'Se você acredita que dados de uma criança foram armazenados indevidamente, entre em contato pelo suporte para que a situação seja analisada.'
            ]
        },
        {
            title: '10. Mudanças nesta política',
            paragraphs: [
                'Esta política pode ser atualizada para refletir mudanças no serviço ou na legislação. A data de atualização aparece no topo desta página.',
                'Mudanças relevantes serão comunicadas no servidor de suporte.'
            ]
        },
        {
            title: '11. Contato',
            paragraphs: [
                'Dúvidas sobre privacidade podem ser enviadas pelo servidor de suporte do Kami. O link fica disponível no rodapé do site.'
            ]
        }
    ]
};
