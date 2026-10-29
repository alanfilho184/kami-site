# Deploy

A documentação completa está em [../docs/deploy.md](../docs/deploy.md).

Arquivos desta pasta:

- `nginx/kami-site.conf` - proxy reverso para `127.0.0.1:3000`, com TLS,
  cabeçalhos de segurança e preparação para o Socket.IO da D5.

O processo do PM2 fica na raiz do repositório: `ecosystem.config.cjs`.
