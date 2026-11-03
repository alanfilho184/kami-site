import { describe, expect, it } from 'vitest';
import { isSameOriginValues } from '../../server/utils/request-origin';

describe('verificação de origem', () => {
    it('aceita Origin com o mesmo host e protocolo', () => {
        expect(
            isSameOriginValues({
                origin: 'https://kamiapp.com.br',
                referer: null,
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(true);
    });

    it('aceita host com porta', () => {
        expect(
            isSameOriginValues({
                origin: 'http://localhost:3000',
                referer: null,
                host: 'localhost:3000',
                protocol: 'http'
            })
        ).toBe(true);
    });

    it('usa o Referer quando o Origin não vem', () => {
        expect(
            isSameOriginValues({
                origin: null,
                referer: 'https://kamiapp.com.br/entrar',
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(true);
    });

    it('recusa outro host', () => {
        expect(
            isSameOriginValues({
                origin: 'https://malicioso.example',
                referer: null,
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(false);
    });

    it('recusa outro protocolo', () => {
        expect(
            isSameOriginValues({
                origin: 'http://kamiapp.com.br',
                referer: null,
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(false);
    });

    it('recusa quando não há Origin nem Referer', () => {
        expect(
            isSameOriginValues({
                origin: null,
                referer: null,
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(false);
    });

    it('recusa URL malformada', () => {
        expect(
            isSameOriginValues({
                origin: 'nao-e-uma-url',
                referer: null,
                host: 'kamiapp.com.br',
                protocol: 'https'
            })
        ).toBe(false);
    });
});
