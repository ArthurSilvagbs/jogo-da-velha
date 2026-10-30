# Deploy na AWS — guia do zero

Tempo: uns 30 minutos (a maior parte é esperar a AWS).
Custo esperado: **R$ 0 a alguns centavos**. Mesmo assim, o passo 2 cria um alerta pra você nunca ter susto.

---

## O que vamos montar (em português claro)

```
 Você / plateia  ──►  CloudFront  ──►  S3
 (navegador)          (entrega rápida,  (onde os arquivos
                       perto de você)    do jogo ficam guardados)
```

- **S3** é um "HD na nuvem". Os arquivos do jogo (HTML, CSS, JS) ficam lá, num bucket **privado**: ninguém consegue acessar direto.
- **CloudFront** é a rede de entrega da AWS, com servidores no mundo todo (inclusive em São Paulo). Ele busca o jogo no S3, guarda uma cópia perto de quem acessa e entrega com HTTPS.
- **CloudFormation** monta tudo isso pra você a partir de uma "receita": o arquivo `infra/template.yaml`. Em vez de 40 cliques, você sobe um arquivo.

## Checklist antes de começar

- [ ] Um e-mail e um cartão de crédito (a AWS exige, mesmo no plano gratuito)
- [ ] Celular por perto (a AWS confirma sua identidade por SMS ou ligação)
- [ ] Node instalado (você já tem)

---

## Passo 1 — Criar a conta AWS

1. Acesse **https://aws.amazon.com/pt/free/** e clique em **Criar uma conta gratuita** (ou *Create an AWS account*).
2. Preencha e-mail, nome da conta (ex.: `arthur-pitch`) e senha.
3. Se ele perguntar o plano, escolha o **plano gratuito (Free)**.
4. Tipo de conta: **Pessoal**.
5. Coloque o cartão. A AWS pode fazer uma cobrança-teste de cerca de US$ 1, que é estornada.
6. Confirme pelo celular.
7. Plano de suporte: **Basic (gratuito)**.
8. Entre no console: **https://console.aws.amazon.com** → *Root user* → seu e-mail.

> **Segurança (recomendado, 2 minutos):** no canto superior direito, clique no nome da conta → **Security credentials** → **Assign MFA** e use um app autenticador (Google Authenticator, Authy). Isso protege a conta mesmo se a senha vazar.

## Passo 2 — Alerta de gastos (pra dormir tranquilo)

1. Na barra de busca do topo, digite **Budgets** e abra **Billing and Cost Management → Budgets**.
2. **Create budget** → escolha o modelo **Zero spend budget**.
3. Coloque seu e-mail → **Create budget**.

Pronto: se qualquer coisa custar mais de US$ 0,01, você recebe um e-mail.

## Passo 3 — Escolher a região São Paulo

No canto superior direito do console, ao lado do nome da conta, tem uma região (ex.: *N. Virginia*). Clique e escolha **América do Sul (São Paulo) — sa-east-1**.

> Região é a cidade onde fica o datacenter. São Paulo é a mais perto do público.

## Passo 4 — Gerar os arquivos do jogo

No terminal, dentro da pasta do projeto (`C:\Users\arthu\dev\velha-cloud`):

```bash
npm run build -- sa-east-1
```

Isso cria a pasta `dist/`, que é a que vai pra nuvem. Ela tem o jogo e um arquivo `cloud.json` que avisa ao jogo que ele está na AWS (é daí que vem o rodapé "Região sa-east-1 · São Paulo").

## Passo 5 — Criar a infraestrutura (CloudFormation)

1. Na busca do topo, digite **CloudFormation** e abra.
2. **Create stack** → **With new resources (standard)**.
3. Em *Prepare template*, deixe **Choose an existing template**.
4. Em *Template source*, escolha **Upload a template file** → **Choose file** → selecione `infra/template.yaml` → **Next**.
5. *Stack name*: `velha-cloud` → **Next**.
6. Na tela de opções, não mude nada → **Next**.
7. Revise e clique em **Submit**.
8. Espere o status ficar **CREATE_COMPLETE** (verde). Leva **5 a 10 minutos**, porque o CloudFront está sendo espalhado pelo mundo. Use o botão de atualizar (↻).
9. Abra a aba **Outputs**. Os links que você vai usar estão lá:
   - **SiteURL** → o endereço do jogo
   - **BucketLink** → atalho para o bucket

> Deu **ROLLBACK** (vermelho)? Abra a aba **Events**, copie a mensagem de erro e me mande.

## Passo 6 — Subir o jogo (S3)

1. Em *Outputs*, clique no link **BucketLink**.
2. Clique em **Upload**.
3. Abra a pasta `dist/` no Explorador de Arquivos, **selecione tudo que está DENTRO dela** (Ctrl+A) e arraste para a área de upload.
   - ⚠️ Arraste o **conteúdo**, não a pasta `dist` em si. O `index.html` precisa ficar na raiz do bucket.
   - Devem aparecer `index.html`, `cloud.json`, `ping.txt`, `favicon.svg`, `css/…` e `js/…`.
4. Clique em **Upload** e espere ficar *Succeeded*.

## Passo 7 — Jogar 🎮

Abra o **SiteURL** (algo como `https://d1abc2xyz.cloudfront.net`).

Confira se o boot mostra **Nuvem: AWS**, **Região: sa-east-1** e uma **Borda** (ex.: `GRU…`, que é o aeroporto de Guarulhos: o servidor do CloudFront em São Paulo). O rodapé mostra o ping ao vivo.

Esse link é público: você pode mandar pra plateia jogar no celular durante o pitch.

---

## Atualizar o jogo depois

1. `npm run build -- sa-east-1`
2. Faça o upload do conteúdo de `dist/` de novo (passo 6). Ele substitui os arquivos.
3. Em *Outputs*, clique em **InvalidationLink** → **Create invalidation** → digite `/*` → **Create invalidation**. Isso manda o CloudFront esquecer a cópia antiga. Leva cerca de 1 minuto.

## Apagar tudo depois do pitch

1. No bucket: selecione todos os arquivos → **Delete**. Ou use **Empty**, que esvazia o bucket inteiro.
2. CloudFormation → stack `velha-cloud` → **Delete**. A AWS remove o CloudFront e o bucket sozinha.

## Problemas comuns

| O que aparece | Causa | Solução |
|---|---|---|
| Página XML com `AccessDenied` | Os arquivos foram para dentro de uma pasta `dist/` no bucket, ou o upload ainda não terminou | Confira se o `index.html` está na raiz do bucket |
| Rodapé diz **Local** | Falta o `cloud.json` | Rode o `npm run build` e suba de novo |
| Mudei o jogo e nada mudou | O CloudFront está entregando a cópia antiga | Faça a invalidação `/*` |
| Stack em `ROLLBACK_COMPLETE` | Algum erro na criação | Aba **Events** → me mande o erro, depois apague a stack e crie de novo |

---

# Cola pro pitch

## Em 60 segundos

> "Esse jogo da velha está rodando na AWS agora. Os arquivos ficam no **Amazon S3**, num bucket privado em São Paulo. Quem entrega pra vocês é o **CloudFront**, a CDN da AWS: ele guarda uma cópia na borda mais próxima. Olhem o rodapé: essa é a borda que me atendeu, esse é o ping ao vivo, e *HIT* quer dizer que veio do cache, sem nem tocar no S3.
>
> A IA que joga contra mim, a NIMBUS, roda **no navegador de cada jogador**. Então, se mil pessoas jogarem agora, não existe servidor pra escalar: a nuvem só entrega arquivos estáticos, o que é barato e praticamente infinito.
>
> E nada disso foi criado no clique: um **template CloudFormation** descreve o bucket, a CDN e as permissões. É infraestrutura como código: dá pra recriar tudo do zero em minutos."

## Roteiro da demo

1. Abra o link e mostre o **boot**: região, borda e latência reais.
2. Jogue no **Impossível**. A NIMBUS mostra quantas posições analisou ("8.853 posições em 20 ms").
3. Aponte o **rodapé**: provedor, região, edge, cache e ping com gráfico.
4. Aperte **I**: abre o diagrama *Você → CloudFront → S3* com os dados ao vivo.
5. Surpresa: troque para **Velha infinita** (cada um só tem 3 peças).
6. Se der empate, aparece a **velha** 👵.
7. Bônus: mostre um QR code do link e chame a plateia pra jogar no celular.

## Perguntas que podem fazer

- **"Por que não um servidor (EC2)?"** Porque o jogo é só arquivo estático. Servidor custaria dinheiro 24h por dia, precisaria de atualização e de escalar. S3 + CloudFront é *serverless*: você paga só pelo que é entregue.
- **"Escala?"** O CloudFront tem centenas de pontos de presença no mundo. O processamento (a IA) acontece em cada navegador, então cresce sozinho com o número de jogadores.
- **"É seguro?"** O bucket é privado e só o CloudFront lê, via *Origin Access Control*. Tem HTTPS obrigatório, headers de segurança e criptografia no S3.
- **"Quanto custa?"** Para um pitch, centavos ou zero. O CloudFront tem uma cota gratuita mensal generosa.
- **"Como atualiza?"** Build, upload e invalidação do cache: um minuto.
