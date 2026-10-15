# Prospecção · Fernando Solutions

Site da equipe para prospectar estabelecimentos de Ribeirão Pires, Mauá, Paranapiacaba e Rio Grande da Serra que ainda não têm cardápio digital, loja virtual ou automação. Projeto independente do gerador de planos de aula.

## Como rodar no computador

Precisa do Node.js 22.13 ou mais novo.

Dê dois cliques em **`Iniciar Prospeccao.bat`**. Ele instala o que falta, liga o servidor e abre http://localhost:3001. Deixe a janela preta aberta enquanto usa o site.

Pelo terminal:

```bash
npm install
npm start
```

## Contas

- Administrador: login `Admin`, senha `1905`. A conta é criada na primeira vez que o servidor sobe. Para usar outra senha, defina a variável `PROSP_ADMIN_SENHA` **antes** dessa primeira vez.
- O funcionário clica em **Criar cadastro** e informa login, e-mail profissional e senha (duas vezes). Ele só consegue entrar depois que o Admin aprova, na aba **Cadastros**.
- Na aba **Cadastros**, o Admin aprova, rejeita ou bloqueia contas e define uma senha nova. As senhas ficam criptografadas e não aparecem na tela.
- Cada funcionário recebe uma cor. Toda marcação, exclusão, anotação ou estabelecimento incluído mostra a bolinha dessa cor; passando o mouse, aparece o login e a hora.

## Para hospedar online (Render + Turso)

1. Crie um banco **novo** no Turso, separado do banco do gerador de planos.
2. Suba esta pasta para um repositório **novo** no GitHub.
3. No Render, crie o serviço a partir do repositório (o `render.yaml` já traz a configuração) e preencha `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` e `PROSP_ADMIN_SENHA`.

## Estrutura

| Pasta/arquivo | O que faz |
|---|---|
| `src/server.js` | Servidor e sessão |
| `src/prospeccao.js` | Login, cadastro, aprovação, progresso e estabelecimentos novos |
| `src/prospeccao-dados.json` | Lista dos 94 estabelecimentos pesquisados |
| `src/db.js` | Banco SQLite local (`dados/prospeccao.db`) ou Turso online |
| `paginas/index.html` | A página do site |
| `public/` | CSS, JavaScript e logo |

---
Dev by Fernando Quinelato
