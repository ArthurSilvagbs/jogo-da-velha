# Jogo da Velha — Cloud Edition

Jogo da velha em pixel art (branco e vermelho) contra a **NIMBUS**, uma IA minimax com poda alfa-beta,
pronto para rodar na AWS (S3 + CloudFront) e mostrar a nuvem ao vivo no rodapé.

- **Modos:** vs NIMBUS (Fácil, Médio, Impossível) ou 2 jogadores; regra clássica ou **Velha infinita** (3 peças por jogador).
- **Teclado:** `1`–`9` joga, `R` nova rodada, `M` som, `I` diagrama da infra, `Enter` jogar de novo.
- **Nuvem ao vivo:** região, borda do CloudFront (`x-amz-cf-pop`), cache HIT/MISS e ping com gráfico.

## Rodar local

```bash
npm test
npm run dev
```

Depois abra http://localhost:5173. O rodapé mostra **Local**, porque fora da AWS não existe `cloud.json`.

## Deploy

Siga o [DEPLOY.md](DEPLOY.md): passo a passo do zero, mais a cola pro pitch.

## Estrutura

```
public/            site estático (é o que vai pra nuvem)
  js/game.js       regras + IA (puro, testado)
  js/sprites.js    pixel art
  js/engine.js     SVG dos sprites, sons chiptune, efeitos
  js/cloud.js      boot, HUD da nuvem, diagrama de infra
  js/main.js       interface da partida
infra/template.yaml  CloudFormation: S3 privado + CloudFront (OAC)
scripts/build.js     gera dist/ + cloud.json
tests/               node --test
```
