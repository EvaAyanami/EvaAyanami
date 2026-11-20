/**
 * Registre des langages supportés par le service d'exécution.
 *
 * Ajouter un langage = ajouter une entrée ici + une image Docker dans
 * `images/<id>/Dockerfile` contenant la chaîne de compilation et le harnais
 * commun (`images/common/harness.sh`).
 */
export interface LanguageSpec {
  id: string;
  label: string;
  /** Nom du fichier source principal écrit dans le bac à sable. */
  fileName: string;
  /** Image Docker utilisée pour compiler et exécuter. */
  image: string;
  /** Commande de compilation (shell), exécutée dans le répertoire de travail. Vide = pas de compilation. */
  compile: string;
  /** Commande d'exécution (shell). L'entrée standard du test est branchée dessus. */
  run: string;
  /** Mémoire allouée au conteneur (Docker --memory). */
  memory: string;
  /** Délai maximal de compilation (secondes). */
  compileTimeout: number;
  /** Délai maximal d'exécution par test (secondes). */
  runTimeout: number;
}

const env = (k: string, d: string) => process.env[k] ?? d;

export const LANGUAGES: Record<string, LanguageSpec> = {
  rust: {
    id: 'rust',
    label: 'Rust',
    fileName: 'main.rs',
    image: env('RUNNER_IMAGE_RUST', 'codemori/sandbox-rust:latest'),
    // Les crates pré-compilées (tokio, rand, serde…) sont disponibles via un fichier
    // d'arguments présent uniquement dans l'image Docker.
    compile:
      'rustc --edition 2021 -C opt-level=1 -C debuginfo=0 -o main main.rs $(cat /opt/codemori/rust-externs 2>/dev/null)',
    run: './main',
    memory: env('RUNNER_MEMORY_RUST', '512m'),
    compileTimeout: 30,
    runTimeout: 5,
  },
  cpp: {
    id: 'cpp',
    label: 'C++',
    fileName: 'main.cpp',
    image: env('RUNNER_IMAGE_CPP', 'codemori/sandbox-cpp:latest'),
    compile: 'g++ -std=c++23 -O1 -Wall -Wextra -pthread -fdiagnostics-color=never -o main main.cpp',
    run: './main',
    memory: env('RUNNER_MEMORY_CPP', '384m'),
    compileTimeout: 30,
    runTimeout: 5,
  },
  java: {
    id: 'java',
    label: 'Java',
    fileName: 'Main.java',
    image: env('RUNNER_IMAGE_JAVA', 'codemori/sandbox-java:latest'),
    compile: 'javac -encoding UTF-8 -Xlint:none -J-Xmx256m -J-XX:+UseSerialGC -d out Main.java',
    run: 'java -Xmx192m -Xss8m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8 -cp out Main',
    memory: env('RUNNER_MEMORY_JAVA', '640m'),
    compileTimeout: 40,
    runTimeout: 8,
  },
};

export function getLanguage(id: string): LanguageSpec | undefined {
  return LANGUAGES[id];
}
