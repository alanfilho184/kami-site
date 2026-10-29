"""Gera o card Open Graph padrão do kami-site em public/og/kami-site.png.

Uso: python scripts/gerar-og.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
FONTES = RAIZ / 'public' / 'fonts'
SAIDA = RAIZ / 'public' / 'og' / 'kami-site.png'

LARGURA = 1200
ALTURA = 630
MARGEM = 96
FUNDO = (5, 7, 10)
GRADE = (12, 17, 25)
LINHA = (19, 26, 38)
TEXTO = (244, 246, 250)
SUAVE = (154, 164, 178)
AZUL = (47, 143, 255)


def fonte(nome: str, tamanho: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTES / nome), tamanho)


def desenhar_fundo(imagem: Image.Image) -> None:
    desenho = ImageDraw.Draw(imagem)
    desenho.rectangle((0, 0, LARGURA, ALTURA), fill=FUNDO)

    for x in range(0, LARGURA, 60):
        desenho.line((x, 0, x, ALTURA), fill=GRADE)
    for y in range(0, ALTURA, 60):
        desenho.line((0, y, LARGURA, y), fill=GRADE)

    desenho.rectangle((0, 0, LARGURA, 3), fill=AZUL)


def desenhar_marca(imagem: Image.Image, desenho: ImageDraw.ImageDraw) -> None:
    logo = Image.open(RAIZ / 'public' / 'marca' / 'logo-256.webp').convert('RGBA')
    logo = logo.resize((72, 72), Image.Resampling.LANCZOS)
    imagem.alpha_composite(logo, (MARGEM, 60))

    desenho.text(
        (MARGEM + 100, 104),
        'KAMI',
        font=fonte('Oswald-SemiBold.ttf', 46),
        fill=TEXTO,
        anchor='ls'
    )
    desenho.text(
        (MARGEM + 100, 134),
        'FICHAS E DADOS PARA RPG',
        font=fonte('FiraCode-Regular.ttf', 15),
        fill=AZUL,
        anchor='ls'
    )


def desenhar_conteudo(desenho: ImageDraw.ImageDraw) -> None:
    desenho.rectangle((MARGEM, 214, MARGEM + 96, 217), fill=AZUL)

    titulo = fonte('Oswald-Bold.ttf', 104)
    desenho.text((MARGEM, 330), 'FICHAS DO SEU JEITO.', font=titulo, fill=TEXTO, anchor='ls')
    desenho.text((MARGEM, 436), 'DADOS NA HORA.', font=titulo, fill=TEXTO, anchor='ls')

    desenho.text(
        (MARGEM, 496),
        'Fichas personalizáveis, rolagem de dados e ficha ao vivo no Discord.',
        font=fonte('Barlow-Regular.ttf', 29),
        fill=SUAVE,
        anchor='ls'
    )


def desenhar_rodape(desenho: ImageDraw.ImageDraw) -> None:
    desenho.line((MARGEM, 548, LARGURA - MARGEM, 548), fill=LINHA)

    rodape = fonte('FiraCode-Regular.ttf', 16)
    desenho.text((MARGEM, 586), 'kamiapp.com.br', font=rodape, fill=SUAVE, anchor='ls')
    desenho.text(
        (LARGURA - MARGEM, 586),
        'GRATUITO / PT-BR / EN-US',
        font=rodape,
        fill=SUAVE,
        anchor='rs'
    )


def main() -> None:
    imagem = Image.new('RGBA', (LARGURA, ALTURA), (0, 0, 0, 0))
    desenhar_fundo(imagem)
    desenho = ImageDraw.Draw(imagem)
    desenhar_marca(imagem, desenho)
    desenhar_conteudo(desenho)
    desenhar_rodape(desenho)

    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    imagem.convert('RGB').save(SAIDA, 'PNG', optimize=True)
    print(f'{SAIDA.relative_to(RAIZ)}: {LARGURA}x{ALTURA}, {SAIDA.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
