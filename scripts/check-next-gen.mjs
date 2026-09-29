import { existsSync, readFileSync } from 'node:fs';

const passed = [];
const failed = [];
const manual = [
  'Confirmar matrícula activa y correo académico válido en Devpost.',
  'Hacer público el repositorio y mostrar la licencia en su sección About.',
  'Grabar un vídeo público en inglés o subtitulado, de menos de 2 minutos.',
  'Crear submission/screenshot-1179x2556.png sin marco de dispositivo.',
  'Completar en inglés la descripción y las instrucciones de evaluación.',
  'Demostrar en vídeo una compra de prueba de BeSeen Plus con RevenueCat.',
];

function check(condition, success, failure) {
  (condition ? passed : failed).push(condition ? success : failure);
}

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const source = readFileSync('App.tsx', 'utf8');
const iconPath = app.icon.replace(/^\.\//, '');
const icon = existsSync(iconPath) ? readFileSync(iconPath) : null;

check(existsSync('LICENSE'), 'Licencia open source incluida.', 'Falta LICENSE.');
check(Boolean(pkg.dependencies?.['react-native-purchases']), 'RevenueCat SDK incluido.', 'Falta RevenueCat SDK.');
check(source.includes('getPlusPackage') && source.includes('buyPlus'), 'Flujo de compra RevenueCat implementado.', 'Falta un flujo de compra RevenueCat verificable.');
check(Boolean(icon), 'Icono de entrega encontrado.', `No existe ${iconPath}.`);
if (icon) check(icon.readUInt32BE(16) === 1024 && icon.readUInt32BE(20) === 1024, 'Icono exacto de 1024×1024.', 'El icono no mide 1024×1024.');
check(!source.includes('ShipIcon') && !source.toLowerCase().includes('rocket'), 'Sin iconografía deliberadamente similar al patrocinador.', 'Queda iconografía de nave por revisar.');
check(existsSync('README.md') && /npm (?:install|ci)/.test(readFileSync('README.md', 'utf8')), 'Instrucciones de ejecución incluidas.', 'Faltan instrucciones para ejecutar el repositorio.');

console.log('\nBeSeen · comprobación Next Gen\n');
for (const item of passed) console.log(`  ✓ ${item}`);
for (const item of failed) console.log(`  ✗ ${item}`);
console.log('\nPendiente de forma manual:');
for (const item of manual) console.log(`  • ${item}`);
if (failed.length) process.exitCode = 1;
