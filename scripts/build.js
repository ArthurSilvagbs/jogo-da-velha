/*
 * Gera a pasta dist/ pronta para subir no S3.
 * Uso: npm run build -- sa-east-1     (a região do seu bucket; padrão sa-east-1)
 * Copia public/ e cria dist/cloud.json, que o jogo lê para mostrar a nuvem no rodapé.
 */
const fs = require('node:fs');
const path = require('node:path');

const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/;
const root = path.join(__dirname, '..');
const src = path.join(root, 'public');
const out = path.join(root, 'dist');
const region = process.argv[2] || process.env.AWS_REGION || 'sa-east-1';

if (!REGION_PATTERN.test(region)) {
  console.error(`Região inválida: "${region}". Exemplo: sa-east-1`);
  process.exit(1);
}

const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const meta = {
  provider: 'AWS',
  service: 'S3 + CloudFront',
  region,
  version,
  deployedAt: new Date().toISOString(),
};

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.writeFileSync(path.join(out, 'cloud.json'), `${JSON.stringify(meta, null, 2)}\n`);

const count = fs.readdirSync(out, { recursive: true }).filter((f) => fs.statSync(path.join(out, f)).isFile()).length;
console.log(`dist/ pronta: ${count} arquivos · região ${region} · versão ${version}`);
console.log('Próximo passo: arraste o CONTEÚDO de dist/ para o bucket S3 (veja DEPLOY.md, passo 4).');
