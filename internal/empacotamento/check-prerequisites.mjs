import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const run = (command, args = []) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
};

const major = Number(process.versions.node.split('.')[0]);
const xcodeVersion = run('xcodebuild', ['-version']);
const xcodeLicenseAccepted = run('xcodebuild', ['-checkFirstLaunchStatus']) !== null;
const androidStudioPath = run('/usr/bin/mdfind', ['kMDItemCFBundleIdentifier == "com.google.android.studio"']);
const adbVersion = run('adb', ['version']);
const java21Home = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
const androidSdkRoot = join(homedir(), 'Library', 'Android', 'sdk');
const checks = [
  {
    item: 'Node.js 22+',
    ok: major >= 22,
    detail: `v${process.versions.node}`,
  },
  {
    item: 'Xcode',
    ok: Boolean(xcodeVersion) && xcodeLicenseAccepted,
    detail: !xcodeVersion
      ? 'não localizado'
      : xcodeLicenseAccepted
        ? xcodeVersion
        : `${xcodeVersion.replaceAll('\n', ' | ')}; aceite a licença com sudo xcodebuild -license accept`,
  },
  {
    item: 'Android Studio',
    ok: Boolean(androidStudioPath),
    detail: androidStudioPath || 'não localizado',
  },
  {
    item: 'Android Debug Bridge',
    ok: Boolean(adbVersion),
    detail: adbVersion?.split('\n')[0] || 'não localizado',
  },
  {
    item: 'Java 21 LTS',
    ok: existsSync(java21Home),
    detail: existsSync(java21Home) ? java21Home : 'não localizado',
  },
  {
    item: 'Android SDK 36',
    ok: existsSync(join(androidSdkRoot, 'platforms', 'android-36')),
    detail: existsSync(join(androidSdkRoot, 'platforms', 'android-36'))
      ? androidSdkRoot
      : 'não localizado',
  },
];

console.log('Pré-requisitos do empacotamento Universo Cursos e Consultoria\n');
for (const check of checks) {
  console.log(`${check.ok ? 'OK ' : 'PENDENTE'}  ${check.item}`);
  console.log(`          ${check.detail.replaceAll('\n', ' | ')}`);
}

if (checks.some((check) => !check.ok)) {
  console.log('\nAinda não gere os projetos nativos. Resolva os itens pendentes primeiro.');
  process.exitCode = 1;
} else {
  console.log('\nAmbiente básico pronto para gerar os projetos nativos.');
}
