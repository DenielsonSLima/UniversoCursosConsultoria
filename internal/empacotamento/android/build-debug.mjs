import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const javaHome = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';

if (!existsSync(javaHome)) {
  console.error('Java 21 não localizado. Instale com: brew install openjdk@21');
  process.exit(1);
}

const result = spawnSync('./gradlew', ['assembleDebug'], {
  cwd: new URL('../../../android/', import.meta.url),
  env: {
    ...process.env,
    JAVA_HOME: javaHome,
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
