export interface LegalSection {
    title: string;
    paragraphs: string[];
}

export interface LegalDocument {
    title: string;
    summary: string;
    updatedAt: string;
    language: string;
    languageRoute: string;
    languageLabel: string;
    sections: LegalSection[];
}

export const legalReviewPending = false;
