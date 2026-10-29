declare module 'sql-template-strings' {
    export interface SQLStatement {
        text: string;
        values: unknown[];
    }

    export default function SQL(strings: TemplateStringsArray, ...valores: unknown[]): SQLStatement;
}
