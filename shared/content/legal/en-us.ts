import type { LegalDocument } from './types';

export const termsEnUs: LegalDocument = {
    title: 'Terms of Use',
    summary: 'The rules for using Kami on Discord and on this website.',
    updatedAt: '2026-10-28',
    language: 'EN-US',
    languageRoute: '/termos',
    languageLabel: 'LER EM PORTUGUÊS',
    sections: [
        {
            title: '1. About these terms',
            paragraphs: [
                'By using Kami on Discord or on this website, you agree to these terms. If you do not agree with any rule, do not use the service.',
                'Kami is an independent project and is not affiliated with Discord.'
            ]
        },
        {
            title: '2. Command logging',
            paragraphs: [
                'Commands used on Kami are recorded. The record includes the name, tag and ID of the user, the command executed, the arguments provided, attachments sent, the language, the originating server or DM and the execution time.',
                'This record is used for security, raid identification and error diagnosis. When an error appears in the console, the command information helps fix the problem faster.'
            ]
        },
        {
            title: '3. Direct messages',
            paragraphs: [
                'You may receive direct messages sent by the Kami team and by some commands.',
                'If repeated errors caused by a user are detected, the team may send a message to help with the command or understand what happened. Commands with a secret function, such as dice and insanity, may be sent to your DM when that option is enabled.'
            ]
        },
        {
            title: '4. Sheet content',
            paragraphs: [
                'The information you add to sheets is your responsibility. Sheets must contain only fictional RPG character data, never personal information about real people.',
                'Using sheets to store personal information with the intent to harm someone or the service may result in a permanent ban without the right to appeal.'
            ]
        },
        {
            title: '5. Conduct and moderation',
            paragraphs: [
                'Use Kami in accordance with the Discord Terms of Service and Community Guidelines. Do not use the service for activities that violate those rules.',
                'The severity of the violation determines the duration of the punishment, which may range from a few hours to a permanent ban.'
            ]
        },
        {
            title: '6. Data deletion',
            paragraphs: [
                'You may request the deletion of your data at any time through the Kami support server.',
                'Requests are reviewed and handled in accordance with applicable law. Security records may be retained for the period necessary to comply with legal obligations or protect the service.'
            ]
        },
        {
            title: '7. Availability and changes',
            paragraphs: [
                'Kami may undergo maintenance, changes and interruptions. There is no guarantee of uninterrupted availability.',
                'These terms may be updated. Relevant changes will be communicated on the support server and in the Discord updates channel.'
            ]
        },
        {
            title: '8. Contact',
            paragraphs: [
                'Questions about these terms can be sent through the Kami support server. The link is available in the website footer and through the bot support command.'
            ]
        }
    ]
};

export const privacyEnUs: LegalDocument = {
    title: 'Privacy Policy',
    summary: 'What data Kami processes, why, and how to request deletion.',
    updatedAt: '2026-10-28',
    language: 'EN-US',
    languageRoute: '/privacidade',
    languageLabel: 'LER EM PORTUGUÊS',
    sections: [
        {
            title: '1. What data is processed',
            paragraphs: [
                'Discord identification data: name, tag and ID of the user executing commands.',
                'Usage data: commands executed, arguments, attachments, language, originating server or DM and time.',
                'Sheet data: sections, attributes, images, lists, bars and any other information you add.',
                'Server settings: language and Kami options on the server.',
                'Technical website data: IP address, date and time, browser and requested page, used for security and diagnostics.'
            ]
        },
        {
            title: '2. Why the data is used',
            paragraphs: [
                'To operate sheets, dice rolls and live sheet synchronization on Discord.',
                'To keep the service secure, identify abuse and investigate errors.',
                'To respond to support and data deletion requests.',
                'To produce aggregated statistics, without personal data, for the public Kami page.'
            ]
        },
        {
            title: '3. Where the data is stored',
            paragraphs: [
                'Sheets and bot records are stored in a PostgreSQL database shared between the bot and the website.',
                'Messages sent to Discord are also stored on Discord, according to the platform rules.',
                'The hosting infrastructure may process technical data necessary to keep the website online.'
            ]
        },
        {
            title: '4. Cookies and tracking',
            paragraphs: [
                'The website does not use advertising, analytics or third-party tracking cookies.',
                'When website login becomes available, an HttpOnly session cookie will be used to keep you authenticated. This cookie is not accessible through JavaScript.'
            ]
        },
        {
            title: '5. Sharing',
            paragraphs: [
                'Data is not sold. Sharing only happens with Discord, with infrastructure providers necessary to operate the service and with authorities when legally required.',
                'Public statistics are aggregated and do not identify users.'
            ]
        },
        {
            title: '6. Retention and deletion',
            paragraphs: [
                'Data is kept for the time necessary to operate Kami, comply with legal obligations and protect the service.',
                'You may request data deletion through the support server. The request is recorded and handled in accordance with applicable law.'
            ]
        },
        {
            title: '7. Your rights',
            paragraphs: [
                'You may request information about the processed data, correction of incorrect data and deletion of data that does not need to be retained.',
                'To exercise these rights, contact us through the Kami support server.'
            ]
        },
        {
            title: '8. Security',
            paragraphs: [
                'Database access is restricted, connections use TLS when available and technical records are handled carefully.',
                'No system is completely immune to failures. If you identify a security issue, please notify the team through support.'
            ]
        },
        {
            title: '9. Minors',
            paragraphs: [
                'Kami is used within Discord and follows the minimum age required by the platform. The service is not directed at children.',
                'If you believe a child’s data has been stored improperly, contact us through support so the situation can be reviewed.'
            ]
        },
        {
            title: '10. Changes to this policy',
            paragraphs: [
                'This policy may be updated to reflect changes in the service or legislation. The update date appears at the top of this page.',
                'Relevant changes will be communicated on the support server.'
            ]
        },
        {
            title: '11. Contact',
            paragraphs: [
                'Privacy questions can be sent through the Kami support server. The link is available in the website footer.'
            ]
        }
    ]
};
