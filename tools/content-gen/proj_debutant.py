import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from projgen import project, step, T, dump

P = []

# ---------------------------------------------------------------- Calculatrice
P.append(project(
    'calculatrice', 1, 'Calculatrice',
    'Une calculatrice en ligne de commande : opérations, erreurs, mémoire et historique.',
    '''
    Tu construis une **calculatrice en console**, l’un des premiers vrais programmes de tout développeur.

    Chaque ligne d’entrée contient un calcul de la forme `a opérateur b` (nombres entiers, séparés par des espaces). Le programme affiche le résultat ou un message d’erreur clair, **sans jamais planter**.

    Le projet se fait en deux étapes : d’abord les quatre opérations, puis une mémoire (`ans`), de nouveaux opérateurs et un historique.
    ''',
    ['Lire et découper une ligne de texte', 'Convertir du texte en nombre', 'Choisir une opération selon un symbole', 'Gérer les cas d’erreur sans planter'],
    ['Entiers 64 bits (division entière, tronquée vers zéro)', 'Aucune bibliothèque externe', 'Un message d’erreur commence toujours par « Erreur : »'],
    [
        step('calc-base', 'Les quatre opérations',
             '''
             Pour chaque ligne `a op b` avec `op` parmi `+ - * /`, affiche le résultat.

             - Division par zéro → `Erreur : division par zéro`
             - Opérateur inconnu → `Erreur : opérateur inconnu`
             - Les lignes vides sont ignorées.
             ''',
             [T('12 + 30\n7 - 10\n6 * 7\n17 / 5\n-17 / 5\n1 / 0\n2 x 3', '42\n-3\n42\n3\n-3\nErreur : division par zéro\nErreur : opérateur inconnu'),
              T('\n100 / 7\n0 * 9', '14\n0', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn calculer(a: i64, op: &str, b: i64) -> Result<i64, &'static str> {
                 match op {
                     "+" => Ok(a + b),
                     "-" => Ok(a - b),
                     "*" => Ok(a * b),
                     "/" if b == 0 => Err("division par zéro"),
                     "/" => Ok(a / b),
                     _ => Err("opérateur inconnu"),
                 }
             }

             fn main() {
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<&str> = ligne.split_whitespace().collect();
                     if t.len() != 3 {
                         continue;
                     }
                     let (a, b): (i64, i64) = (t[0].parse().unwrap(), t[2].parse().unwrap());
                     match calculer(a, t[1], b) {
                         Ok(v) => println!("{}", v),
                         Err(e) => println!("Erreur : {}", e),
                     }
                 }
             }
             ''',
             cpp='''
             #include <iostream>
             #include <sstream>
             #include <string>
             using namespace std;

             int main() {
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     long long a, b;
                     string op;
                     if (!(in >> a >> op >> b)) continue;
                     if (op == "+") cout << a + b << "\\n";
                     else if (op == "-") cout << a - b << "\\n";
                     else if (op == "*") cout << a * b << "\\n";
                     else if (op == "/") {
                         if (b == 0) cout << "Erreur : division par zéro\\n";
                         else cout << a / b << "\\n";
                     } else cout << "Erreur : opérateur inconnu\\n";
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     while (sc.hasNextLine()) {
                         String[] t = sc.nextLine().trim().split("\\\\s+");
                         if (t.length != 3) continue;
                         long a = Long.parseLong(t[0]), b = Long.parseLong(t[2]);
                         switch (t[1]) {
                             case "+" -> System.out.println(a + b);
                             case "-" -> System.out.println(a - b);
                             case "*" -> System.out.println(a * b);
                             case "/" -> System.out.println(b == 0 ? "Erreur : division par zéro" : String.valueOf(a / b));
                             default -> System.out.println("Erreur : opérateur inconnu");
                         }
                     }
                 }
             }
             ''',
             hints=['Découpe la ligne sur les espaces : tu obtiens trois morceaux.', 'Vérifie le diviseur AVANT de diviser.']),
        step('calc-memoire', 'Mémoire et historique',
             '''
             Ajoute à ta calculatrice :

             - l’opérateur `%` (reste, même erreur que `/` si b vaut 0) et `^` (puissance ; exposant négatif → `Erreur : exposant négatif`) ;
             - l’opérande spécial `ans`, qui vaut le **dernier résultat réussi** (0 au départ) ;
             - la commande `historique`, qui affiche `N calcul(s) réussi(s)`.
             ''',
             [T('2 ^ 10\nans - 24\nans % 7\nans / 0\nans * ans\n3 ^ -1\nhistorique', '1024\n1000\n6\nErreur : division par zéro\n36\nErreur : exposant négatif\n4 calcul(s) réussi(s)'),
              T('ans + 5\n10 % 0\n2 ? 2\nhistorique', '5\nErreur : division par zéro\nErreur : opérateur inconnu\n1 calcul(s) réussi(s)', hidden=True),
              T('-2 ^ 3\nans ^ 0\nhistorique', '-8\n1\n2 calcul(s) réussi(s)', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn calculer(a: i64, op: &str, b: i64) -> Result<i64, &'static str> {
                 match op {
                     "+" => Ok(a + b),
                     "-" => Ok(a - b),
                     "*" => Ok(a * b),
                     "/" | "%" if b == 0 => Err("division par zéro"),
                     "/" => Ok(a / b),
                     "%" => Ok(a % b),
                     "^" if b < 0 => Err("exposant négatif"),
                     "^" => Ok(a.pow(b as u32)),
                     _ => Err("opérateur inconnu"),
                 }
             }

             fn main() {
                 let mut ans: i64 = 0;
                 let mut reussis = 0;
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<&str> = ligne.split_whitespace().collect();
                     if t.len() == 1 && t[0] == "historique" {
                         println!("{} calcul(s) réussi(s)", reussis);
                         continue;
                     }
                     if t.len() != 3 {
                         continue;
                     }
                     let lire = |s: &str| -> i64 { if s == "ans" { ans } else { s.parse().unwrap() } };
                     let (a, b) = (lire(t[0]), lire(t[2]));
                     match calculer(a, t[1], b) {
                         Ok(v) => {
                             ans = v;
                             reussis += 1;
                             println!("{}", v);
                         }
                         Err(e) => println!("Erreur : {}", e),
                     }
                 }
             }
             ''',
             cpp='''
             #include <iostream>
             #include <sstream>
             #include <string>
             using namespace std;

             int main() {
                 long long ans = 0;
                 int reussis = 0;
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     string sa, op, sb;
                     if (!(in >> sa)) continue;
                     if (sa == "historique") { cout << reussis << " calcul(s) réussi(s)\\n"; continue; }
                     if (!(in >> op >> sb)) continue;
                     auto lire = [&](const string& s) { return s == "ans" ? ans : stoll(s); };
                     long long a = lire(sa), b = lire(sb), r = 0;
                     string err;
                     if (op == "+") r = a + b;
                     else if (op == "-") r = a - b;
                     else if (op == "*") r = a * b;
                     else if ((op == "/" || op == "%") && b == 0) err = "division par zéro";
                     else if (op == "/") r = a / b;
                     else if (op == "%") r = a % b;
                     else if (op == "^") {
                         if (b < 0) err = "exposant négatif";
                         else { r = 1; for (long long i = 0; i < b; i++) r *= a; }
                     } else err = "opérateur inconnu";
                     if (err.empty()) { ans = r; reussis++; cout << r << "\\n"; }
                     else cout << "Erreur : " << err << "\\n";
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static long ans = 0;

                 static long lire(String s) { return s.equals("ans") ? ans : Long.parseLong(s); }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     int reussis = 0;
                     while (sc.hasNextLine()) {
                         String[] t = sc.nextLine().trim().split("\\\\s+");
                         if (t.length == 1 && t[0].equals("historique")) { System.out.println(reussis + " calcul(s) réussi(s)"); continue; }
                         if (t.length != 3) continue;
                         long a = lire(t[0]), b = lire(t[2]), r = 0;
                         String err = null;
                         switch (t[1]) {
                             case "+" -> r = a + b;
                             case "-" -> r = a - b;
                             case "*" -> r = a * b;
                             case "/", "%" -> { if (b == 0) err = "division par zéro"; else r = t[1].equals("/") ? a / b : a % b; }
                             case "^" -> { if (b < 0) err = "exposant négatif"; else { r = 1; for (long i = 0; i < b; i++) r *= a; } }
                             default -> err = "opérateur inconnu";
                         }
                         if (err == null) { ans = r; reussis++; System.out.println(r); }
                         else System.out.println("Erreur : " + err);
                     }
                 }
             }
             ''',
             hints=['Garde le dernier résultat réussi dans une variable déclarée hors de la boucle.', 'Remplace « ans » par cette variable avant de convertir les opérandes.'],
             xp=40),
    ]))

# ---------------------------------------------------------------- Convertisseur
P.append(project(
    'convertisseur-temperature', 1, 'Convertisseur de température',
    'Convertir entre Celsius, Fahrenheit et Kelvin, valider les entrées et générer des tables.',
    '''
    Un convertisseur de températures entre **Celsius (C)**, **Fahrenheit (F)** et **Kelvin (K)**.

    Formules utiles :

    | De | Vers Celsius |
    |---|---|
    | F | (F − 32) × 5 / 9 |
    | K | K − 273,15 |

    Astuce de conception : convertis **toujours** d’abord vers Celsius, puis de Celsius vers l’unité cible. Ainsi, 2 fonctions suffisent au lieu de 6.

    Les résultats s’affichent avec **2 décimales** et un point comme séparateur décimal.
    ''',
    ['Écrire des fonctions réutilisables', 'Manipuler des nombres à virgule', 'Formater un affichage', 'Valider des données'],
    ['Nombres à virgule double précision', '2 décimales à l’affichage', 'Aucune bibliothèque externe'],
    [
        step('temp-conversion', 'Conversions',
             '''
             Chaque ligne : `valeur DE VERS` (unités `C`, `F`, `K`). Affiche `résultat VERS` avec 2 décimales, par exemple `212.00 F`.

             Une unité inconnue → `Erreur : unité inconnue`.
             ''',
             [T('100 C F\n32 F C\n0 C K\n300 K C\n-40 F C\n98.6 F C', '212.00 F\n0.00 C\n273.15 K\n26.85 C\n-40.00 C\n37.00 C'),
              T('20 C C\n10 X C\n451 F K', '20.00 C\nErreur : unité inconnue\n505.93 K', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn vers_celsius(v: f64, u: &str) -> Option<f64> {
                 match u {
                     "C" => Some(v),
                     "F" => Some((v - 32.0) * 5.0 / 9.0),
                     "K" => Some(v - 273.15),
                     _ => None,
                 }
             }

             fn depuis_celsius(c: f64, u: &str) -> Option<f64> {
                 match u {
                     "C" => Some(c),
                     "F" => Some(c * 9.0 / 5.0 + 32.0),
                     "K" => Some(c + 273.15),
                     _ => None,
                 }
             }

             fn main() {
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<&str> = ligne.split_whitespace().collect();
                     if t.len() != 3 {
                         continue;
                     }
                     let v: f64 = t[0].parse().unwrap();
                     match vers_celsius(v, t[1]).and_then(|c| depuis_celsius(c, t[2])) {
                         Some(r) => println!("{:.2} {}", r, t[2]),
                         None => println!("Erreur : unité inconnue"),
                     }
                 }
             }
             ''',
             cpp='''
             #include <cstdio>
             #include <iostream>
             #include <optional>
             #include <sstream>
             #include <string>
             using namespace std;

             optional<double> versCelsius(double v, const string& u) {
                 if (u == "C") return v;
                 if (u == "F") return (v - 32) * 5 / 9;
                 if (u == "K") return v - 273.15;
                 return nullopt;
             }

             optional<double> depuisCelsius(double c, const string& u) {
                 if (u == "C") return c;
                 if (u == "F") return c * 9 / 5 + 32;
                 if (u == "K") return c + 273.15;
                 return nullopt;
             }

             int main() {
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     double v;
                     string de, vers;
                     if (!(in >> v >> de >> vers)) continue;
                     auto c = versCelsius(v, de);
                     auto r = c ? depuisCelsius(*c, vers) : nullopt;
                     if (r) printf("%.2f %s\\n", *r, vers.c_str());
                     else printf("Erreur : unité inconnue\\n");
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static Double versCelsius(double v, String u) {
                     return switch (u) { case "C" -> v; case "F" -> (v - 32) * 5 / 9; case "K" -> v - 273.15; default -> null; };
                 }

                 static Double depuisCelsius(double c, String u) {
                     return switch (u) { case "C" -> c; case "F" -> c * 9 / 5 + 32; case "K" -> c + 273.15; default -> null; };
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     while (sc.hasNextLine()) {
                         String[] t = sc.nextLine().trim().split("\\\\s+");
                         if (t.length != 3) continue;
                         Double c = versCelsius(Double.parseDouble(t[0]), t[1]);
                         Double r = c == null ? null : depuisCelsius(c, t[2]);
                         System.out.println(r == null ? "Erreur : unité inconnue" : String.format(Locale.US, "%.2f %s", r, t[2]));
                     }
                 }
             }
             ''',
             hints=['Deux fonctions : vers_celsius(valeur, unité) et depuis_celsius(valeur, unité).', 'Formate avec 2 décimales : {:.2} en Rust, %.2f en C++ et Java (Locale.US).']),
        step('temp-table', 'Validation et tables',
             '''
             Améliore le convertisseur :

             - une température **sous le zéro absolu** (moins de −273,15 °C) → `Erreur : sous le zéro absolu` ;
             - la commande `table DE VERS debut fin pas` (entiers) affiche une ligne `v DE = résultat VERS` pour v = debut, debut + pas… jusqu’à fin incluse.
             ''',
             [T('table C F 0 100 25\n-300 C K\n0 K C\n10 X C', '0 C = 32.00 F\n25 C = 77.00 F\n50 C = 122.00 F\n75 C = 167.00 F\n100 C = 212.00 F\nErreur : sous le zéro absolu\n-273.15 C\nErreur : unité inconnue'),
              T('table F C 32 50 9\n-1 K C\n-459.67 F K', '32 F = 0.00 C\n41 F = 5.00 C\n50 F = 10.00 C\nErreur : sous le zéro absolu\n0.00 K', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn vers_celsius(v: f64, u: &str) -> Option<f64> {
                 match u {
                     "C" => Some(v),
                     "F" => Some((v - 32.0) * 5.0 / 9.0),
                     "K" => Some(v - 273.15),
                     _ => None,
                 }
             }

             fn depuis_celsius(c: f64, u: &str) -> Option<f64> {
                 match u {
                     "C" => Some(c),
                     "F" => Some(c * 9.0 / 5.0 + 32.0),
                     "K" => Some(c + 273.15),
                     _ => None,
                 }
             }

             fn convertir(v: f64, de: &str, vers: &str) -> Result<f64, &'static str> {
                 let c = vers_celsius(v, de).ok_or("unité inconnue")?;
                 let r = depuis_celsius(c, vers).ok_or("unité inconnue")?;
                 if c < -273.15 - 1e-9 {
                     return Err("sous le zéro absolu");
                 }
                 Ok(r)
             }

             fn main() {
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<&str> = ligne.split_whitespace().collect();
                     if t.len() == 6 && t[0] == "table" {
                         let (debut, fin, pas): (i64, i64, i64) = (t[3].parse().unwrap(), t[4].parse().unwrap(), t[5].parse().unwrap());
                         let mut v = debut;
                         while v <= fin {
                             match convertir(v as f64, t[1], t[2]) {
                                 Ok(r) => println!("{} {} = {:.2} {}", v, t[1], r, t[2]),
                                 Err(e) => println!("Erreur : {}", e),
                             }
                             v += pas;
                         }
                     } else if t.len() == 3 {
                         match convertir(t[0].parse().unwrap(), t[1], t[2]) {
                             Ok(r) => println!("{:.2} {}", r, t[2]),
                             Err(e) => println!("Erreur : {}", e),
                         }
                     }
                 }
             }
             ''',
             cpp='''
             #include <cstdio>
             #include <iostream>
             #include <optional>
             #include <sstream>
             #include <string>
             using namespace std;

             optional<double> versCelsius(double v, const string& u) {
                 if (u == "C") return v;
                 if (u == "F") return (v - 32) * 5 / 9;
                 if (u == "K") return v - 273.15;
                 return nullopt;
             }

             optional<double> depuisCelsius(double c, const string& u) {
                 if (u == "C") return c;
                 if (u == "F") return c * 9 / 5 + 32;
                 if (u == "K") return c + 273.15;
                 return nullopt;
             }

             // Renvoie un message d'erreur vide en cas de succès.
             string convertir(double v, const string& de, const string& vers, double& r) {
                 auto c = versCelsius(v, de);
                 if (!c) return "unité inconnue";
                 auto res = depuisCelsius(*c, vers);
                 if (!res) return "unité inconnue";
                 if (*c < -273.15 - 1e-9) return "sous le zéro absolu";
                 r = *res;
                 return "";
             }

             int main() {
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     string premier;
                     if (!(in >> premier)) continue;
                     double r;
                     if (premier == "table") {
                         string de, vers;
                         long long debut, fin, pas;
                         in >> de >> vers >> debut >> fin >> pas;
                         for (long long v = debut; v <= fin; v += pas) {
                             string err = convertir(v, de, vers, r);
                             if (err.empty()) printf("%lld %s = %.2f %s\\n", v, de.c_str(), r, vers.c_str());
                             else printf("Erreur : %s\\n", err.c_str());
                         }
                     } else {
                         string de, vers;
                         in >> de >> vers;
                         string err = convertir(stod(premier), de, vers, r);
                         if (err.empty()) printf("%.2f %s\\n", r, vers.c_str());
                         else printf("Erreur : %s\\n", err.c_str());
                     }
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static Double versCelsius(double v, String u) {
                     return switch (u) { case "C" -> v; case "F" -> (v - 32) * 5 / 9; case "K" -> v - 273.15; default -> null; };
                 }

                 static Double depuisCelsius(double c, String u) {
                     return switch (u) { case "C" -> c; case "F" -> c * 9 / 5 + 32; case "K" -> c + 273.15; default -> null; };
                 }

                 static double convertir(double v, String de, String vers) {
                     Double c = versCelsius(v, de);
                     Double r = c == null ? null : depuisCelsius(c, vers);
                     if (r == null) throw new IllegalArgumentException("unité inconnue");
                     if (c < -273.15 - 1e-9) throw new IllegalArgumentException("sous le zéro absolu");
                     return r;
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     while (sc.hasNextLine()) {
                         String[] t = sc.nextLine().trim().split("\\\\s+");
                         try {
                             if (t.length == 6 && t[0].equals("table")) {
                                 long debut = Long.parseLong(t[3]), fin = Long.parseLong(t[4]), pas = Long.parseLong(t[5]);
                                 for (long v = debut; v <= fin; v += pas) {
                                     try { System.out.println(String.format(Locale.US, "%d %s = %.2f %s", v, t[1], convertir(v, t[1], t[2]), t[2])); }
                                     catch (IllegalArgumentException e) { System.out.println("Erreur : " + e.getMessage()); }
                                 }
                             } else if (t.length == 3) {
                                 System.out.println(String.format(Locale.US, "%.2f %s", convertir(Double.parseDouble(t[0]), t[1], t[2]), t[2]));
                             }
                         } catch (IllegalArgumentException e) {
                             System.out.println("Erreur : " + e.getMessage());
                         }
                     }
                 }
             }
             ''',
             hints=['Vérifie le zéro absolu sur la valeur convertie en Celsius.', 'Pour la table, une boucle de debut à fin avec un pas.']),
    ]))

# ---------------------------------------------------------------- Nombres aléatoires
LCG_NOTE = '''
Pour que les résultats soient **reproductibles** (et testables), tu vas programmer ton propre générateur pseudo-aléatoire : un **générateur congruentiel linéaire** (LCG), la méthode utilisée par la fonction `rand()` historique du C.

```
x(suivant) = (1103515245 × x + 12345) mod 2³¹
```

La valeur initiale `x` s’appelle la **graine** (*seed*). À graine égale, la suite est toujours la même : c’est ce qui permet de rejouer une partie ou de reproduire un bug.

Pour obtenir un nombre entre `min` et `max` : `min + x mod (max − min + 1)` (avec le nouvel `x`).
'''

P.append(project(
    'nombres-aleatoires', 2, 'Générateur de nombres aléatoires',
    'Programmer un générateur pseudo-aléatoire reproductible, puis simuler des lancers de dés.',
    LCG_NOTE,
    ['Comprendre le pseudo-aléatoire et les graines', 'Manipuler l’arithmétique modulaire sur 64 bits', 'Compter des occurrences', 'Afficher un histogramme'],
    ['Calculs sur des entiers 64 bits non signés (pas de dépassement : le produit tient sur 64 bits)', 'Pas de générateur aléatoire de la bibliothèque standard'],
    [
        step('alea-lcg', 'Le générateur',
             '''
             Chaque ligne : `graine n min max`. Affiche sur une ligne les `n` nombres générés à partir de cette graine, séparés par des espaces.
             ''',
             [T('42 5 1 100\n2026 8 1 6', '28 65 54 7 36\n4 5 4 3 4 1 2 1'),
              T('0 3 10 20', '13 12 20', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             struct Lcg {
                 x: u64,
             }

             impl Lcg {
                 fn suivant(&mut self) -> u64 {
                     self.x = (1103515245 * self.x + 12345) % (1 << 31);
                     self.x
                 }
                 fn entre(&mut self, min: i64, max: i64) -> i64 {
                     min + (self.suivant() % (max - min + 1) as u64) as i64
                 }
             }

             fn main() {
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<i64> = ligne.split_whitespace().map(|s| s.parse().unwrap()).collect();
                     if t.len() != 4 {
                         continue;
                     }
                     let mut g = Lcg { x: t[0] as u64 };
                     let v: Vec<String> = (0..t[1]).map(|_| g.entre(t[2], t[3]).to_string()).collect();
                     println!("{}", v.join(" "));
                 }
             }
             ''',
             cpp='''
             #include <cstdint>
             #include <iostream>
             #include <sstream>
             #include <string>
             using namespace std;

             struct Lcg {
                 uint64_t x;
                 uint64_t suivant() { x = (1103515245ULL * x + 12345) % (1ULL << 31); return x; }
                 long long entre(long long min, long long max) { return min + (long long)(suivant() % (uint64_t)(max - min + 1)); }
             };

             int main() {
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     long long graine, n, min, max;
                     if (!(in >> graine >> n >> min >> max)) continue;
                     Lcg g{(uint64_t)graine};
                     for (long long i = 0; i < n; i++) cout << (i ? " " : "") << g.entre(min, max);
                     cout << "\\n";
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static class Lcg {
                     long x;
                     Lcg(long graine) { x = graine; }
                     long suivant() { x = (1103515245L * x + 12345) % (1L << 31); return x; }
                     long entre(long min, long max) { return min + suivant() % (max - min + 1); }
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     while (sc.hasNextLine()) {
                         String l = sc.nextLine().trim();
                         if (l.isEmpty()) continue;
                         long[] t = Arrays.stream(l.split("\\\\s+")).mapToLong(Long::parseLong).toArray();
                         Lcg g = new Lcg(t[0]);
                         StringJoiner j = new StringJoiner(" ");
                         for (long i = 0; i < t[1]; i++) j.add(String.valueOf(g.entre(t[2], t[3])));
                         System.out.println(j);
                     }
                 }
             }
             ''',
             hints=['Le produit 1103515245 × x tient sur 64 bits car x < 2³¹.', 'Mets l’état du générateur dans une structure/classe avec une méthode suivant().']),
        step('alea-des', 'Simulation de dés',
             '''
             Chaque ligne : `graine n`. Simule `n` lancers d’un dé à 6 faces avec ton générateur (`entre(1, 6)`), puis affiche :

             - pour chaque face de 1 à 6 : `face : ### (k)` avec autant de `#` que d’occurrences ;
             - `moyenne : X.XX` ;
             - `plus fréquent : F` (la plus petite face en cas d’égalité).
             ''',
             [T('42 20', '1 : ### (3)\n2 : # (1)\n3 : #### (4)\n4 : ### (3)\n5 : ### (3)\n6 : ###### (6)\nmoyenne : 4.00\nplus fréquent : 6'),
              T('7 10', '1 : #### (4)\n2 : # (1)\n3 :  (0)\n4 : #### (4)\n5 : # (1)\n6 :  (0)\nmoyenne : 2.70\nplus fréquent : 1', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             struct Lcg {
                 x: u64,
             }

             impl Lcg {
                 fn suivant(&mut self) -> u64 {
                     self.x = (1103515245 * self.x + 12345) % (1 << 31);
                     self.x
                 }
                 fn entre(&mut self, min: i64, max: i64) -> i64 {
                     min + (self.suivant() % (max - min + 1) as u64) as i64
                 }
             }

             fn main() {
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let t: Vec<i64> = ligne.split_whitespace().map(|s| s.parse().unwrap()).collect();
                     if t.len() != 2 {
                         continue;
                     }
                     let mut g = Lcg { x: t[0] as u64 };
                     let mut compte = [0usize; 7];
                     let mut somme = 0;
                     for _ in 0..t[1] {
                         let f = g.entre(1, 6);
                         compte[f as usize] += 1;
                         somme += f;
                     }
                     let mut meilleur = 1;
                     for f in 1..=6 {
                         println!("{} : {} ({})", f, "#".repeat(compte[f]), compte[f]);
                         if compte[f] > compte[meilleur] {
                             meilleur = f;
                         }
                     }
                     println!("moyenne : {:.2}", somme as f64 / t[1] as f64);
                     println!("plus fréquent : {}", meilleur);
                 }
             }
             ''',
             cpp='''
             #include <cstdint>
             #include <cstdio>
             #include <iostream>
             #include <sstream>
             #include <string>
             using namespace std;

             struct Lcg {
                 uint64_t x;
                 uint64_t suivant() { x = (1103515245ULL * x + 12345) % (1ULL << 31); return x; }
                 long long entre(long long min, long long max) { return min + (long long)(suivant() % (uint64_t)(max - min + 1)); }
             };

             int main() {
                 string ligne;
                 while (getline(cin, ligne)) {
                     istringstream in(ligne);
                     long long graine, n;
                     if (!(in >> graine >> n)) continue;
                     Lcg g{(uint64_t)graine};
                     int compte[7] = {0};
                     long long somme = 0;
                     for (long long i = 0; i < n; i++) { long long f = g.entre(1, 6); compte[f]++; somme += f; }
                     int meilleur = 1;
                     for (int f = 1; f <= 6; f++) {
                         printf("%d : %s (%d)\\n", f, string(compte[f], '#').c_str(), compte[f]);
                         if (compte[f] > compte[meilleur]) meilleur = f;
                     }
                     printf("moyenne : %.2f\\n", (double)somme / n);
                     printf("plus fréquent : %d\\n", meilleur);
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static class Lcg {
                     long x;
                     Lcg(long graine) { x = graine; }
                     long suivant() { x = (1103515245L * x + 12345) % (1L << 31); return x; }
                     long entre(long min, long max) { return min + suivant() % (max - min + 1); }
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     while (sc.hasNextLine()) {
                         String l = sc.nextLine().trim();
                         if (l.isEmpty()) continue;
                         String[] t = l.split("\\\\s+");
                         Lcg g = new Lcg(Long.parseLong(t[0]));
                         int n = Integer.parseInt(t[1]);
                         int[] compte = new int[7];
                         long somme = 0;
                         for (int i = 0; i < n; i++) { int f = (int) g.entre(1, 6); compte[f]++; somme += f; }
                         int meilleur = 1;
                         for (int f = 1; f <= 6; f++) {
                             System.out.println(f + " : " + "#".repeat(compte[f]) + " (" + compte[f] + ")");
                             if (compte[f] > compte[meilleur]) meilleur = f;
                         }
                         System.out.println(String.format(Locale.US, "moyenne : %.2f", (double) somme / n));
                         System.out.println("plus fréquent : " + meilleur);
                     }
                 }
             }
             ''',
             hints=['Un tableau de 7 cases (indices 1 à 6) suffit pour compter.', 'Pour la moyenne, convertis en nombre à virgule AVANT de diviser.']),
    ]))

# ---------------------------------------------------------------- Nombre mystère
P.append(project(
    'nombre-mystere', 1, 'Le nombre mystère',
    'Le grand classique : deviner un nombre avec des indices « plus » ou « moins », puis gérer essais, erreurs et score.',
    '''
    Le jeu du **nombre mystère** : l’ordinateur choisit un nombre entre 1 et 100, le joueur propose des nombres et le programme répond « C’est plus ! » ou « C’est moins ! » jusqu’à ce qu’il trouve.

    Dans la vraie vie, le nombre serait tiré au hasard ; ici, pour pouvoir tester ton programme, il est d’abord **donné en entrée**, puis (étape 2) calculé avec un générateur pseudo-aléatoire à partir d’une graine.

    > 💡 Stratégie optimale : la **recherche dichotomique** (toujours proposer le milieu de l’intervalle restant) trouve n’importe quel nombre entre 1 et 100 en 7 essais au maximum.
    ''',
    ['Écrire une boucle de jeu', 'Comparer des valeurs', 'Compter des essais', 'Valider les saisies de l’utilisateur'],
    ['Aucune bibliothèque externe', 'Le programme ne doit jamais planter sur une saisie invalide (étape 2)'],
    [
        step('mystere-base', 'La partie',
             '''
             Première ligne : le nombre secret. Lignes suivantes : les propositions du joueur.

             Pour chaque proposition, affiche `C'est plus !`, `C'est moins !` ou, si c’est le bon nombre, `Bravo ! Trouvé en N essai(s).` et arrête de lire. Si l’entrée se termine sans que le joueur ait trouvé : `Perdu ! Le nombre était S.`
             ''',
             [T('42\n50\n25\n37\n43\n40\n42\n99', "C'est moins !\nC'est plus !\nC'est plus !\nC'est moins !\nC'est plus !\nBravo ! Trouvé en 6 essai(s)."),
              T('7\n7', 'Bravo ! Trouvé en 1 essai(s).', hidden=True),
              T('10\n5\n20', "C'est plus !\nC'est moins !\nPerdu ! Le nombre était 10.", hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn main() {
                 let stdin = io::stdin();
                 let mut lignes = stdin.lock().lines().map(|l| l.unwrap());
                 let secret: i64 = lignes.next().unwrap().trim().parse().unwrap();
                 let mut essais = 0;
                 for l in lignes {
                     let Ok(p) = l.trim().parse::<i64>() else { continue };
                     essais += 1;
                     if p < secret {
                         println!("C'est plus !");
                     } else if p > secret {
                         println!("C'est moins !");
                     } else {
                         println!("Bravo ! Trouvé en {} essai(s).", essais);
                         return;
                     }
                 }
                 println!("Perdu ! Le nombre était {}.", secret);
             }
             ''',
             cpp='''
             #include <iostream>
             using namespace std;

             int main() {
                 long long secret, p;
                 cin >> secret;
                 int essais = 0;
                 while (cin >> p) {
                     essais++;
                     if (p < secret) cout << "C'est plus !\\n";
                     else if (p > secret) cout << "C'est moins !\\n";
                     else { cout << "Bravo ! Trouvé en " << essais << " essai(s).\\n"; return 0; }
                 }
                 cout << "Perdu ! Le nombre était " << secret << ".\\n";
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     long secret = sc.nextLong();
                     int essais = 0;
                     while (sc.hasNextLong()) {
                         long p = sc.nextLong();
                         essais++;
                         if (p < secret) System.out.println("C'est plus !");
                         else if (p > secret) System.out.println("C'est moins !");
                         else { System.out.println("Bravo ! Trouvé en " + essais + " essai(s)."); return; }
                     }
                     System.out.println("Perdu ! Le nombre était " + secret + ".");
                 }
             }
             ''',
             starters={
                 'rust': 'use std::io::{self, BufRead};\n\nfn main() {\n    let stdin = io::stdin();\n    let mut lignes = stdin.lock().lines().map(|l| l.unwrap());\n    let secret: i64 = lignes.next().unwrap().trim().parse().unwrap();\n    // À toi de jouer : lis les propositions une par une\n    let _ = secret;\n}\n',
                 'cpp': '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long secret;\n    cin >> secret;\n    // À toi de jouer : lis les propositions une par une\n}\n',
                 'java': 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        long secret = sc.nextLong();\n        // À toi de jouer : lis les propositions une par une\n    }\n}\n',
             },
             hints=['Compte les essais dans une variable, incrémentée à chaque proposition.', 'Quitte le programme (ou la boucle) dès que le nombre est trouvé.']),
        step('mystere-complet', 'Partie complète avec score',
             '''
             Première ligne : une **graine**. Le secret vaut `x mod 100 + 1`, où `x` est la première valeur du générateur `x = (1103515245 × graine + 12345) mod 2³¹`.

             Règles :

             - une saisie non numérique → `Entrée invalide` (non comptée) ;
             - un nombre hors de 1..100 → `Hors limites` (non compté) ;
             - **7 essais** maximum : après le 7ᵉ échec, affiche `Perdu ! Le nombre était S.` et arrête ;
             - en cas de victoire, affiche `Bravo ! Trouvé en N essai(s).` puis `Score : P` avec P = (8 − N) × 10.

             Si l’entrée se termine avant la fin de la partie : `Partie abandonnée.`
             ''',
             [T('42\n50\nabc\n150\n25\n30\n28\n1', "C'est moins !\nEntrée invalide\nHors limites\nC'est plus !\nC'est moins !\nBravo ! Trouvé en 4 essai(s).\nScore : 40"),
              T('2026\n1\n2\n3\n4\n5\n6\n7\n8', "C'est plus !\n" * 7 + 'Perdu ! Le nombre était 48.', hidden=True),
              T('5\n0', 'Hors limites\nPartie abandonnée.', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             fn main() {
                 let stdin = io::stdin();
                 let mut lignes = stdin.lock().lines().map(|l| l.unwrap());
                 let graine: u64 = lignes.next().unwrap().trim().parse().unwrap();
                 let x = (1103515245 * graine + 12345) % (1 << 31);
                 let secret = (x % 100 + 1) as i64;
                 let mut essais = 0;
                 for l in lignes {
                     let Ok(p) = l.trim().parse::<i64>() else {
                         println!("Entrée invalide");
                         continue;
                     };
                     if !(1..=100).contains(&p) {
                         println!("Hors limites");
                         continue;
                     }
                     essais += 1;
                     if p == secret {
                         println!("Bravo ! Trouvé en {} essai(s).", essais);
                         println!("Score : {}", (8 - essais) * 10);
                         return;
                     }
                     println!("{}", if p < secret { "C'est plus !" } else { "C'est moins !" });
                     if essais == 7 {
                         println!("Perdu ! Le nombre était {}.", secret);
                         return;
                     }
                 }
                 println!("Partie abandonnée.");
             }
             ''',
             cpp='''
             #include <cstdint>
             #include <iostream>
             #include <string>
             using namespace std;

             bool estEntier(const string& s, long long& v) {
                 try {
                     size_t pos;
                     v = stoll(s, &pos);
                     return pos == s.size();
                 } catch (...) {
                     return false;
                 }
             }

             int main() {
                 string ligne;
                 getline(cin, ligne);
                 uint64_t graine = stoull(ligne);
                 uint64_t x = (1103515245ULL * graine + 12345) % (1ULL << 31);
                 long long secret = x % 100 + 1, p;
                 int essais = 0;
                 while (getline(cin, ligne)) {
                     if (!ligne.empty() && ligne.back() == '\\r') ligne.pop_back();
                     if (!estEntier(ligne, p)) { cout << "Entrée invalide\\n"; continue; }
                     if (p < 1 || p > 100) { cout << "Hors limites\\n"; continue; }
                     essais++;
                     if (p == secret) {
                         cout << "Bravo ! Trouvé en " << essais << " essai(s).\\n";
                         cout << "Score : " << (8 - essais) * 10 << "\\n";
                         return 0;
                     }
                     cout << (p < secret ? "C'est plus !" : "C'est moins !") << "\\n";
                     if (essais == 7) { cout << "Perdu ! Le nombre était " << secret << ".\\n"; return 0; }
                 }
                 cout << "Partie abandonnée.\\n";
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     long graine = Long.parseLong(sc.nextLine().trim());
                     long x = (1103515245L * graine + 12345) % (1L << 31);
                     long secret = x % 100 + 1;
                     int essais = 0;
                     while (sc.hasNextLine()) {
                         String l = sc.nextLine().trim();
                         long p;
                         try { p = Long.parseLong(l); } catch (NumberFormatException e) { System.out.println("Entrée invalide"); continue; }
                         if (p < 1 || p > 100) { System.out.println("Hors limites"); continue; }
                         essais++;
                         if (p == secret) {
                             System.out.println("Bravo ! Trouvé en " + essais + " essai(s).");
                             System.out.println("Score : " + (8 - essais) * 10);
                             return;
                         }
                         System.out.println(p < secret ? "C'est plus !" : "C'est moins !");
                         if (essais == 7) { System.out.println("Perdu ! Le nombre était " + secret + "."); return; }
                     }
                     System.out.println("Partie abandonnée.");
                 }
             }
             ''',
             hints=['Lis chaque proposition comme du texte, puis essaie de la convertir.', 'Ne compte un essai qu’après avoir validé la saisie.'],
             xp=40),
    ]))

# ---------------------------------------------------------------- Gestionnaire de tâches
P.append(project(
    'gestionnaire-taches', 2, 'Gestionnaire de tâches',
    'Une todo-list en console : ajouter, lister, terminer, supprimer, prioriser.',
    '''
    Tu développes un **gestionnaire de tâches** en ligne de commande, comme les applications de *todo-list*.

    Chaque ligne d’entrée est une commande. Les tâches reçoivent un **identifiant** unique et croissant (1, 2, 3…) qui ne change jamais, même si d’autres tâches sont supprimées.

    Tu vas manipuler une **liste de structures** (struct / classe) : c’est le cœur de presque toutes les applications.
    ''',
    ['Modéliser une donnée avec une structure ou une classe', 'Stocker des éléments dans une liste dynamique', 'Rechercher, modifier et supprimer un élément', 'Trier selon plusieurs critères'],
    ['Les identifiants ne sont jamais réutilisés', 'Le texte d’une tâche peut contenir des espaces', 'Aucune commande ne doit faire planter le programme'],
    [
        step('taches-base', 'Ajouter, lister, terminer',
             '''
             Commandes :

             - `ajouter TEXTE` → `Tâche N ajoutée`
             - `liste` → une ligne par tâche, `[ ] N. texte` ou `[x] N. texte` (ordre des identifiants), ou `Aucune tâche`
             - `fait N` → `Tâche N terminée`, ou `Tâche introuvable`
             ''',
             [T('liste\najouter Apprendre Rust\najouter Faire les courses\nfait 1\nfait 9\nliste', 'Aucune tâche\nTâche 1 ajoutée\nTâche 2 ajoutée\nTâche 1 terminée\nTâche introuvable\n[x] 1. Apprendre Rust\n[ ] 2. Faire les courses'),
              T('ajouter a\nfait 1\nfait 1\nliste', 'Tâche 1 ajoutée\nTâche 1 terminée\nTâche 1 terminée\n[x] 1. a', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             struct Tache {
                 id: u32,
                 texte: String,
                 faite: bool,
             }

             fn main() {
                 let mut taches: Vec<Tache> = Vec::new();
                 let mut prochain = 1;
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let (cmd, reste) = ligne.split_once(' ').unwrap_or((ligne.as_str(), ""));
                     match cmd {
                         "ajouter" => {
                             taches.push(Tache { id: prochain, texte: reste.to_string(), faite: false });
                             println!("Tâche {} ajoutée", prochain);
                             prochain += 1;
                         }
                         "liste" => {
                             if taches.is_empty() {
                                 println!("Aucune tâche");
                             }
                             for t in &taches {
                                 println!("[{}] {}. {}", if t.faite { 'x' } else { ' ' }, t.id, t.texte);
                             }
                         }
                         "fait" => {
                             let id: u32 = reste.trim().parse().unwrap_or(0);
                             match taches.iter_mut().find(|t| t.id == id) {
                                 Some(t) => {
                                     t.faite = true;
                                     println!("Tâche {} terminée", id);
                                 }
                                 None => println!("Tâche introuvable"),
                             }
                         }
                         _ => {}
                     }
                 }
             }
             ''',
             cpp='''
             #include <iostream>
             #include <string>
             #include <vector>
             using namespace std;

             struct Tache {
                 int id;
                 string texte;
                 bool faite = false;
             };

             int main() {
                 vector<Tache> taches;
                 int prochain = 1;
                 string ligne;
                 while (getline(cin, ligne)) {
                     size_t esp = ligne.find(' ');
                     string cmd = ligne.substr(0, esp), reste = esp == string::npos ? "" : ligne.substr(esp + 1);
                     if (cmd == "ajouter") {
                         taches.push_back({prochain, reste});
                         cout << "Tâche " << prochain++ << " ajoutée\\n";
                     } else if (cmd == "liste") {
                         if (taches.empty()) cout << "Aucune tâche\\n";
                         for (const auto& t : taches) cout << "[" << (t.faite ? 'x' : ' ') << "] " << t.id << ". " << t.texte << "\\n";
                     } else if (cmd == "fait") {
                         int id = atoi(reste.c_str());
                         bool trouve = false;
                         for (auto& t : taches) if (t.id == id) { t.faite = true; trouve = true; }
                         if (trouve) cout << "Tâche " << id << " terminée\\n";
                         else cout << "Tâche introuvable\\n";
                     }
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static class Tache {
                     final int id;
                     final String texte;
                     boolean faite;
                     Tache(int id, String texte) { this.id = id; this.texte = texte; }
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     List<Tache> taches = new ArrayList<>();
                     int prochain = 1;
                     while (sc.hasNextLine()) {
                         String[] p = sc.nextLine().split(" ", 2);
                         String reste = p.length > 1 ? p[1] : "";
                         switch (p[0]) {
                             case "ajouter" -> { taches.add(new Tache(prochain, reste)); System.out.println("Tâche " + prochain++ + " ajoutée"); }
                             case "liste" -> {
                                 if (taches.isEmpty()) System.out.println("Aucune tâche");
                                 for (Tache t : taches) System.out.println("[" + (t.faite ? "x" : " ") + "] " + t.id + ". " + t.texte);
                             }
                             case "fait" -> {
                                 Tache t = null;
                                 for (Tache x : taches) if (String.valueOf(x.id).equals(reste.trim())) t = x;
                                 if (t == null) System.out.println("Tâche introuvable");
                                 else { t.faite = true; System.out.println("Tâche " + t.id + " terminée"); }
                             }
                             default -> { }
                         }
                     }
                 }
             }
             ''',
             hints=['Sépare la commande (premier mot) du reste de la ligne.', 'Garde un compteur pour le prochain identifiant, indépendant de la taille de la liste.']),
        step('taches-priorites', 'Suppression, priorités et statistiques',
             '''
             Ajoute :

             - une priorité optionnelle à l’ajout : `ajouter !haute TEXTE`, `ajouter !basse TEXTE` (par défaut : `normale`) ;
             - `liste` affiche désormais `[ ] N. (priorité) texte`, triée par priorité (haute, normale, basse) puis par identifiant ;
             - `supprimer N` → `Tâche N supprimée` ou `Tâche introuvable` ;
             - `stats` → `X/Y terminée(s)` (et `0/0 terminée(s)` sans tâche).
             ''',
             [T('ajouter Lire un livre\najouter !haute Rendre le projet\najouter !basse Ranger\najouter !haute Payer le loyer\nfait 2\nsupprimer 1\nsupprimer 1\nliste\nstats', 'Tâche 1 ajoutée\nTâche 2 ajoutée\nTâche 3 ajoutée\nTâche 4 ajoutée\nTâche 2 terminée\nTâche 1 supprimée\nTâche introuvable\n[x] 2. (haute) Rendre le projet\n[ ] 4. (haute) Payer le loyer\n[ ] 3. (basse) Ranger\n1/3 terminée(s)'),
              T('stats\nliste\najouter x\nsupprimer 1\najouter y\nliste', '0/0 terminée(s)\nAucune tâche\nTâche 1 ajoutée\nTâche 1 supprimée\nTâche 2 ajoutée\n[ ] 2. (normale) y', hidden=True)],
             rust='''
             use std::io::{self, BufRead};

             struct Tache {
                 id: u32,
                 texte: String,
                 priorite: u8,
                 faite: bool,
             }

             const NOMS: [&str; 3] = ["haute", "normale", "basse"];

             fn main() {
                 let mut taches: Vec<Tache> = Vec::new();
                 let mut prochain = 1;
                 for ligne in io::stdin().lock().lines() {
                     let ligne = ligne.unwrap();
                     let (cmd, reste) = ligne.split_once(' ').unwrap_or((ligne.as_str(), ""));
                     let id: u32 = reste.trim().parse().unwrap_or(0);
                     match cmd {
                         "ajouter" => {
                             let (priorite, texte) = match reste.split_once(' ') {
                                 Some(("!haute", t)) => (0, t),
                                 Some(("!basse", t)) => (2, t),
                                 _ => (1, reste),
                             };
                             taches.push(Tache { id: prochain, texte: texte.to_string(), priorite, faite: false });
                             println!("Tâche {} ajoutée", prochain);
                             prochain += 1;
                         }
                         "liste" => {
                             if taches.is_empty() {
                                 println!("Aucune tâche");
                             }
                             let mut triees: Vec<&Tache> = taches.iter().collect();
                             triees.sort_by_key(|t| (t.priorite, t.id));
                             for t in triees {
                                 println!("[{}] {}. ({}) {}", if t.faite { 'x' } else { ' ' }, t.id, NOMS[t.priorite as usize], t.texte);
                             }
                         }
                         "fait" => match taches.iter_mut().find(|t| t.id == id) {
                             Some(t) => {
                                 t.faite = true;
                                 println!("Tâche {} terminée", id);
                             }
                             None => println!("Tâche introuvable"),
                         },
                         "supprimer" => match taches.iter().position(|t| t.id == id) {
                             Some(i) => {
                                 taches.remove(i);
                                 println!("Tâche {} supprimée", id);
                             }
                             None => println!("Tâche introuvable"),
                         },
                         "stats" => println!("{}/{} terminée(s)", taches.iter().filter(|t| t.faite).count(), taches.len()),
                         _ => {}
                     }
                 }
             }
             ''',
             cpp='''
             #include <algorithm>
             #include <iostream>
             #include <string>
             #include <vector>
             using namespace std;

             struct Tache {
                 int id;
                 string texte;
                 int priorite;
                 bool faite = false;
             };

             const string NOMS[] = {"haute", "normale", "basse"};

             int main() {
                 vector<Tache> taches;
                 int prochain = 1;
                 string ligne;
                 while (getline(cin, ligne)) {
                     size_t esp = ligne.find(' ');
                     string cmd = ligne.substr(0, esp), reste = esp == string::npos ? "" : ligne.substr(esp + 1);
                     int id = atoi(reste.c_str());
                     auto it = find_if(taches.begin(), taches.end(), [&](const Tache& t) { return t.id == id; });
                     if (cmd == "ajouter") {
                         int p = 1;
                         if (reste.rfind("!haute ", 0) == 0) { p = 0; reste = reste.substr(7); }
                         else if (reste.rfind("!basse ", 0) == 0) { p = 2; reste = reste.substr(7); }
                         taches.push_back({prochain, reste, p});
                         cout << "Tâche " << prochain++ << " ajoutée\\n";
                     } else if (cmd == "liste") {
                         if (taches.empty()) cout << "Aucune tâche\\n";
                         vector<Tache> triees = taches;
                         sort(triees.begin(), triees.end(), [](const Tache& a, const Tache& b) {
                             return a.priorite != b.priorite ? a.priorite < b.priorite : a.id < b.id;
                         });
                         for (const auto& t : triees) cout << "[" << (t.faite ? 'x' : ' ') << "] " << t.id << ". (" << NOMS[t.priorite] << ") " << t.texte << "\\n";
                     } else if (cmd == "fait") {
                         if (it == taches.end()) cout << "Tâche introuvable\\n";
                         else { it->faite = true; cout << "Tâche " << id << " terminée\\n"; }
                     } else if (cmd == "supprimer") {
                         if (it == taches.end()) cout << "Tâche introuvable\\n";
                         else { taches.erase(it); cout << "Tâche " << id << " supprimée\\n"; }
                     } else if (cmd == "stats") {
                         cout << count_if(taches.begin(), taches.end(), [](const Tache& t) { return t.faite; }) << "/" << taches.size() << " terminée(s)\\n";
                     }
                 }
             }
             ''',
             java='''
             import java.util.*;

             public class Main {
                 static final String[] NOMS = {"haute", "normale", "basse"};

                 static class Tache {
                     final int id, priorite;
                     final String texte;
                     boolean faite;
                     Tache(int id, int priorite, String texte) { this.id = id; this.priorite = priorite; this.texte = texte; }
                 }

                 public static void main(String[] args) {
                     Scanner sc = new Scanner(System.in);
                     List<Tache> taches = new ArrayList<>();
                     int prochain = 1;
                     while (sc.hasNextLine()) {
                         String[] p = sc.nextLine().split(" ", 2);
                         String reste = p.length > 1 ? p[1] : "";
                         Tache cible = null;
                         for (Tache t : taches) if (String.valueOf(t.id).equals(reste.trim())) cible = t;
                         switch (p[0]) {
                             case "ajouter" -> {
                                 int prio = 1;
                                 if (reste.startsWith("!haute ")) { prio = 0; reste = reste.substring(7); }
                                 else if (reste.startsWith("!basse ")) { prio = 2; reste = reste.substring(7); }
                                 taches.add(new Tache(prochain, prio, reste));
                                 System.out.println("Tâche " + prochain++ + " ajoutée");
                             }
                             case "liste" -> {
                                 if (taches.isEmpty()) System.out.println("Aucune tâche");
                                 taches.stream()
                                     .sorted(Comparator.comparingInt((Tache t) -> t.priorite).thenComparingInt(t -> t.id))
                                     .forEach(t -> System.out.println("[" + (t.faite ? "x" : " ") + "] " + t.id + ". (" + NOMS[t.priorite] + ") " + t.texte));
                             }
                             case "fait" -> {
                                 if (cible == null) System.out.println("Tâche introuvable");
                                 else { cible.faite = true; System.out.println("Tâche " + cible.id + " terminée"); }
                             }
                             case "supprimer" -> {
                                 if (cible == null) System.out.println("Tâche introuvable");
                                 else { taches.remove(cible); System.out.println("Tâche " + cible.id + " supprimée"); }
                             }
                             case "stats" -> System.out.println(taches.stream().filter(t -> t.faite).count() + "/" + taches.size() + " terminée(s)");
                             default -> { }
                         }
                     }
                 }
             }
             ''',
             hints=['Représente la priorité par un nombre (0 = haute, 1 = normale, 2 = basse) : trier devient facile.', 'Trie une copie de la liste pour l’affichage, sans modifier l’ordre de stockage.'],
             xp=40),
    ]))

dump(P, sys.argv[1], 'Projets — niveau débutant')
