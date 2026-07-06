# Gerador de Etiquetas (Pack)

Aplicação web estática (sem build) para cadastro, pré-visualização, impressão e exportação em PDF de etiquetas do tipo Pack.

Agora o app tambem pode sincronizar automaticamente os produtos com a aba `Packs` de uma planilha Google Sheets, mantendo o `localStorage` como cache local para uso em qualquer navegador ou computador.

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

## Sincronizacao com Google Sheets

O fluxo de sincronizacao funciona assim:

- O app continua carregando os produtos do `localStorage`.
- Ao abrir a pagina, ele tenta buscar a aba `Packs` no Google Sheets por meio de um Web App do Google Apps Script.
- Os registros vindos da planilha sao inseridos ou atualizados localmente sem remover cadastros que existam apenas no navegador.
- Se a sincronizacao falhar, o app continua operando com os dados locais.

### Estrutura esperada da aba `Packs`

A primeira linha da aba deve conter os cabecalhos. Os nomes mais recomendados sao:

- `ean`
- `codigo`
- `descricao`
- `cor`
- `quantidade`

O script tambem aceita aliases comuns como `produto`, `sku`, `qtd` e `pack`.

### Publicar o Apps Script

1. Abra a planilha Google Sheets informada.
2. Entre em `Extensoes > Apps Script`.
3. Crie um projeto ou use um projeto existente vinculado a essa planilha.
4. Copie o conteudo de [pack-sync.gs](file:///workspace/google-apps-script/pack-sync.gs) para o editor do Apps Script.
5. Salve o projeto.
6. Clique em `Implantar > Nova implantacao`.
7. Escolha `Aplicativo da web`.
8. Configure:
   - `Executar como`: voce mesmo
   - `Quem tem acesso`: qualquer pessoa com o link
9. Conclua a implantacao e copie a URL final do Web App.

### Ligar o app ao endpoint

1. Abra [index.html](file:///workspace/index.html).
2. Localize a meta tag abaixo no `<head>`:

```html
<meta name="pack-sync-endpoint" content="" />
```

3. Cole a URL do Web App no atributo `content`, por exemplo:

```html
<meta
  name="pack-sync-endpoint"
  content="https://script.google.com/macros/s/SEU_WEB_APP_ID/exec"
/>
```

4. Publique novamente o app estatico.

### Resultado esperado

- Ao abrir o app, o status `Google Sheets` mostrara o andamento da sincronizacao.
- Novas linhas da aba `Packs` serao adicionadas ao cadastro local.
- Linhas ja existentes com a mesma chave `codigo + cor` serao atualizadas localmente com os dados da planilha.
- As funcoes atuais de cadastro, busca, impressao, PDF, importacao CSV e exportacao JSON continuam disponiveis.

## Estrutura do projeto

- `index.html`: interface do usuário
- `styles.css`: estilos (inclui regras de impressão)
- `app.js`: lógica do app (cadastro, pré-visualização, impressão e PDF)
- `google-apps-script/pack-sync.gs`: endpoint do Google Apps Script para expor a aba `Packs` em JSON
- `netlify.toml`: configuração de deploy no Netlify
