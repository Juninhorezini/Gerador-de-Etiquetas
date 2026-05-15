# Gerador de Etiquetas (Pack)

Aplicação web estática (sem build) para cadastro, pré-visualização, impressão e exportação em PDF de etiquetas do tipo Pack.

## Como rodar localmente

Abra o arquivo `index.html` no navegador.

Para evitar restrições de carregamento/local e testar como em produção, use um servidor local:

```bash
python -m http.server 8000
```

Depois acesse:

http://127.0.0.1:8000/

## Deploy (Netlify)

Este projeto é estático e não precisa de comando de build.

- **Build command**: (vazio)
- **Publish directory**: `.`

O arquivo `netlify.toml` já está configurado para isso.

## Estrutura do projeto

- `index.html`: interface do usuário
- `styles.css`: estilos (inclui regras de impressão)
- `app.js`: lógica do app (cadastro, pré-visualização, impressão e PDF)
- `netlify.toml`: configuração de deploy no Netlify

