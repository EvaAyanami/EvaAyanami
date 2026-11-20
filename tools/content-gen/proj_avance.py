import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from projgen import project, step, T, dump

P = []

# ====================================================================== API REST
A_RUST = r'''
use std::collections::{BTreeMap, HashMap};
use std::io::{self, BufRead};

#[derive(Clone)]
struct Livre {
    id: u64,
    titre: String,
    auteur: String,
    annee: i64,
}

fn echapper(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn json(l: &Livre) -> String {
    format!("{{\"id\":{},\"titre\":\"{}\",\"auteur\":\"{}\",\"annee\":{}}}", l.id, echapper(&l.titre), echapper(&l.auteur), l.annee)
}

fn erreur(code: u16, msg: &str) -> String {
    format!("{} {{\"erreur\":\"{}\"}}", code, msg)
}

/// « a=1&b=deux+mots » → dictionnaire (le « + » encode un espace).
fn formulaire(s: &str) -> HashMap<String, String> {
    s.split('&')
        .filter(|kv| !kv.is_empty())
        .map(|kv| {
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            (k.to_string(), v.replace('+', " "))
        })
        .collect()
}

/// Valide un corps complet (POST, PUT).
fn valider(f: &HashMap<String, String>) -> Result<(String, String, i64), String> {
    for champ in ["titre", "auteur", "annee"] {
        if f.get(champ).map_or(true, |v| v.is_empty()) {
            return Err(format!("champ manquant : {}", champ));
        }
    }
    let annee = f["annee"].parse::<i64>().map_err(|_| "annee invalide".to_string())?;
    Ok((f["titre"].clone(), f["auteur"].clone(), annee))
}

struct Api {
    livres: BTreeMap<u64, Livre>,
    prochain: u64,
}

impl Api {
    fn traiter(&mut self, methode: &str, cible: &str, corps: &str) -> String {
        let (chemin, qs) = cible.split_once('?').unwrap_or((cible, ""));
        let seg: Vec<&str> = chemin.trim_matches('/').split('/').collect();
        if seg[0] != "livres" || seg.len() > 2 {
            return erreur(404, "ressource inconnue");
        }
        if seg.len() == 1 {
            return match methode {
                "GET" => self.lister(&formulaire(qs)),
                "POST" => match valider(&formulaire(corps)) {
                    Err(e) => erreur(422, &e),
                    Ok((titre, auteur, annee)) => {
                        let l = Livre { id: self.prochain, titre, auteur, annee };
                        self.prochain += 1;
                        let r = format!("201 {}", json(&l));
                        self.livres.insert(l.id, l);
                        r
                    }
                },
                _ => erreur(405, "méthode non autorisée"),
            };
        }
        let Ok(id) = seg[1].parse::<u64>() else {
            return erreur(400, "identifiant invalide");
        };
        if !["GET", "PUT", "PATCH", "DELETE"].contains(&methode) {
            return erreur(405, "méthode non autorisée");
        }
        let Some(livre) = self.livres.get_mut(&id) else {
            return erreur(404, "livre introuvable");
        };
        match methode {
            "GET" => format!("200 {}", json(livre)),
            "PUT" => match valider(&formulaire(corps)) {
                Err(e) => erreur(422, &e),
                Ok((titre, auteur, annee)) => {
                    *livre = Livre { id, titre, auteur, annee };
                    format!("200 {}", json(livre))
                }
            },
            //@@PATCH
            _ => {
                self.livres.remove(&id);
                "204".to_string()
            }
        }
    }

    //@@LISTER
}

fn main() {
    let mut api = Api { livres: BTreeMap::new(), prochain: 1 };
    for ligne in io::stdin().lock().lines() {
        let ligne = ligne.unwrap();
        let p: Vec<&str> = ligne.splitn(3, ' ').collect();
        if p.len() < 2 {
            continue;
        }
        println!("{}", api.traiter(p[0], p[1], p.get(2).copied().unwrap_or("")));
    }
}
'''

A1_RUST_LISTER = '''fn lister(&self, _q: &HashMap<String, String>) -> String {
        let v: Vec<String> = self.livres.values().map(json).collect();
        format!("200 [{}]", v.join(","))
    }
'''

A2_RUST_LISTER = '''fn lister(&self, q: &HashMap<String, String>) -> String {
        let nombre = |k: &str, defaut: usize| q.get(k).map_or(Some(defaut), |v| v.parse::<usize>().ok().filter(|n| *n > 0));
        let (Some(page), Some(taille)) = (nombre("page", 1), nombre("taille", 10)) else {
            return erreur(400, "pagination invalide");
        };
        let mut v: Vec<&Livre> = self.livres.values().filter(|l| q.get("auteur").map_or(true, |a| &l.auteur == a)).collect();
        let tri = q.get("tri").map(String::as_str).unwrap_or("id");
        let (desc, champ) = match tri.strip_prefix('-') {
            Some(c) => (true, c),
            None => (false, tri),
        };
        v.sort_by(|a, b| {
            let o = match champ {
                "titre" => a.titre.cmp(&b.titre),
                "annee" => a.annee.cmp(&b.annee),
                _ => a.id.cmp(&b.id),
            };
            (if desc { o.reverse() } else { o }).then(a.id.cmp(&b.id))
        });
        let total = v.len();
        let elements: Vec<String> = v.into_iter().skip((page - 1) * taille).take(taille).map(json).collect();
        format!("200 {{\\"total\\":{},\\"page\\":{},\\"taille\\":{},\\"livres\\":[{}]}}", total, page, taille, elements.join(","))
    }
'''

A2_RUST_PATCH = '''            "PATCH" => {
                let f = formulaire(corps);
                let annee = match f.get("annee") {
                    Some(a) => match a.parse::<i64>() {
                        Ok(n) => Some(n),
                        Err(_) => return erreur(422, "annee invalide"),
                    },
                    None => None,
                };
                if let Some(t) = f.get("titre").filter(|t| !t.is_empty()) {
                    livre.titre = t.clone();
                }
                if let Some(a) = f.get("auteur").filter(|a| !a.is_empty()) {
                    livre.auteur = a.clone();
                }
                if let Some(a) = annee {
                    livre.annee = a;
                }
                format!("200 {}", json(livre))
            }
'''

A1_RUST = A_RUST.replace('    //@@LISTER\n', '    ' + A1_RUST_LISTER).replace('            //@@PATCH\n', '            "PATCH" => erreur(405, "méthode non autorisée"),\n')
A2_RUST = A_RUST.replace('    //@@LISTER\n', '    ' + A2_RUST_LISTER).replace('            //@@PATCH\n', A2_RUST_PATCH)

A_CPP = r'''
#include <algorithm>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

struct Livre {
    long long id;
    string titre, auteur;
    long long annee;
};

string echapper(const string& s) {
    string r;
    for (char c : s) {
        if (c == '\\' || c == '"') r += '\\';
        r += c;
    }
    return r;
}

string json(const Livre& l) {
    return "{\"id\":" + to_string(l.id) + ",\"titre\":\"" + echapper(l.titre) + "\",\"auteur\":\"" + echapper(l.auteur) + "\",\"annee\":" + to_string(l.annee) + "}";
}

string erreur(int code, const string& msg) { return to_string(code) + " {\"erreur\":\"" + msg + "\"}"; }

// « a=1&b=deux+mots » → dictionnaire (le « + » encode un espace).
map<string, string> formulaire(const string& s) {
    map<string, string> f;
    stringstream ss(s);
    for (string kv; getline(ss, kv, '&');) {
        if (kv.empty()) continue;
        size_t e = kv.find('=');
        string v = e == string::npos ? "" : kv.substr(e + 1);
        replace(v.begin(), v.end(), '+', ' ');
        f[kv.substr(0, e)] = v;
    }
    return f;
}

optional<long long> entier(const string& s) {
    try {
        size_t pos;
        long long v = stoll(s, &pos);
        if (pos == s.size()) return v;
    } catch (...) {
    }
    return nullopt;
}

// Valide un corps complet (POST, PUT) : renvoie un message d'erreur vide si tout va bien.
string valider(map<string, string>& f, Livre& l) {
    for (string champ : {"titre", "auteur", "annee"})
        if (f[champ].empty()) return "champ manquant : " + champ;
    auto a = entier(f["annee"]);
    if (!a) return "annee invalide";
    l.titre = f["titre"];
    l.auteur = f["auteur"];
    l.annee = *a;
    return "";
}

map<long long, Livre> livres;
long long prochain = 1;

//@@LISTER

string traiter(const string& methode, const string& cible, const string& corps) {
    size_t q = cible.find('?');
    string chemin = cible.substr(0, q), qs = q == string::npos ? "" : cible.substr(q + 1);
    vector<string> seg;
    stringstream ss(chemin);
    for (string s; getline(ss, s, '/');)
        if (!s.empty()) seg.push_back(s);
    if (seg.empty() || seg[0] != "livres" || seg.size() > 2) return erreur(404, "ressource inconnue");
    if (seg.size() == 1) {
        if (methode == "GET") return lister(formulaire(qs));
        if (methode != "POST") return erreur(405, "méthode non autorisée");
        auto f = formulaire(corps);
        Livre l{prochain};
        string err = valider(f, l);
        if (!err.empty()) return erreur(422, err);
        livres[prochain++] = l;
        return "201 " + json(l);
    }
    auto id = entier(seg[1]);
    if (!id || *id < 0) return erreur(400, "identifiant invalide");
    if (methode != "GET" && methode != "PUT" && methode != "PATCH" && methode != "DELETE") return erreur(405, "méthode non autorisée");
    auto it = livres.find(*id);
    if (it == livres.end()) return erreur(404, "livre introuvable");
    Livre& livre = it->second;
    if (methode == "GET") return "200 " + json(livre);
    if (methode == "PUT") {
        auto f = formulaire(corps);
        Livre l{*id};
        string err = valider(f, l);
        if (!err.empty()) return erreur(422, err);
        livre = l;
        return "200 " + json(livre);
    }
    //@@PATCH
    livres.erase(it);
    return "204";
}

int main() {
    string ligne;
    while (getline(cin, ligne)) {
        istringstream in(ligne);
        string methode, cible, corps;
        if (!(in >> methode >> cible)) continue;
        getline(in >> ws, corps);
        cout << traiter(methode, cible, corps) << "\n";
    }
}
'''

A1_CPP_LISTER = '''string lister(const map<string, string>&) {
    string r = "200 [";
    for (const auto& [id, l] : livres) r += (r.size() > 5 ? "," : "") + json(l);
    return r + "]";
}
'''

A2_CPP_LISTER = '''string lister(map<string, string> q) {
    auto nombre = [&](const string& k, long long defaut) -> long long {
        if (!q.count(k)) return defaut;
        auto v = entier(q[k]);
        return v && *v > 0 ? *v : -1;
    };
    long long page = nombre("page", 1), taille = nombre("taille", 10);
    if (page < 0 || taille < 0) return erreur(400, "pagination invalide");
    vector<Livre> v;
    for (const auto& [id, l] : livres)
        if (!q.count("auteur") || l.auteur == q["auteur"]) v.push_back(l);
    string tri = q.count("tri") ? q["tri"] : "id";
    bool desc = !tri.empty() && tri[0] == '-';
    if (desc) tri = tri.substr(1);
    stable_sort(v.begin(), v.end(), [&](const Livre& a, const Livre& b) {
        int o = tri == "titre" ? a.titre.compare(b.titre) : tri == "annee" ? (a.annee > b.annee) - (a.annee < b.annee) : (a.id > b.id) - (a.id < b.id);
        if (desc) o = -o;
        return o != 0 ? o < 0 : a.id < b.id;
    });
    string elements;
    for (long long i = (page - 1) * taille; i < (long long)v.size() && i < page * taille; i++) elements += (elements.empty() ? "" : ",") + json(v[i]);
    return "200 {\\"total\\":" + to_string(v.size()) + ",\\"page\\":" + to_string(page) + ",\\"taille\\":" + to_string(taille) + ",\\"livres\\":[" + elements + "]}";
}
'''

A2_CPP_PATCH = '''    if (methode == "PATCH") {
        auto f = formulaire(corps);
        optional<long long> annee;
        if (f.count("annee")) {
            annee = entier(f["annee"]);
            if (!annee) return erreur(422, "annee invalide");
        }
        if (!f["titre"].empty()) livre.titre = f["titre"];
        if (!f["auteur"].empty()) livre.auteur = f["auteur"];
        if (annee) livre.annee = *annee;
        return "200 " + json(livre);
    }
'''

A1_CPP = A_CPP.replace('//@@LISTER\n', A1_CPP_LISTER).replace('    //@@PATCH\n', '    if (methode == "PATCH") return erreur(405, "méthode non autorisée");\n')
A2_CPP = A_CPP.replace('//@@LISTER\n', A2_CPP_LISTER).replace('    //@@PATCH\n', A2_CPP_PATCH)

A_JAVA = r'''
import java.util.*;
import java.util.stream.*;

public class Main {
    record Livre(long id, String titre, String auteur, long annee) {
        String json() { return "{\"id\":" + id + ",\"titre\":\"" + echapper(titre) + "\",\"auteur\":\"" + echapper(auteur) + "\",\"annee\":" + annee + "}"; }
    }

    static String echapper(String s) { return s.replace("\\", "\\\\").replace("\"", "\\\""); }

    static String erreur(int code, String msg) { return code + " {\"erreur\":\"" + msg + "\"}"; }

    /** « a=1&b=deux+mots » → dictionnaire (le « + » encode un espace). */
    static Map<String, String> formulaire(String s) {
        Map<String, String> f = new HashMap<>();
        for (String kv : s.split("&")) {
            if (kv.isEmpty()) continue;
            int e = kv.indexOf('=');
            f.put(e < 0 ? kv : kv.substring(0, e), e < 0 ? "" : kv.substring(e + 1).replace('+', ' '));
        }
        return f;
    }

    static class ErreurApi extends Exception {
        final int code;
        ErreurApi(int code, String m) { super(m); this.code = code; }
    }

    /** Valide un corps complet (POST, PUT). */
    static Livre valider(long id, Map<String, String> f) throws ErreurApi {
        for (String champ : List.of("titre", "auteur", "annee"))
            if (f.getOrDefault(champ, "").isEmpty()) throw new ErreurApi(422, "champ manquant : " + champ);
        try {
            return new Livre(id, f.get("titre"), f.get("auteur"), Long.parseLong(f.get("annee")));
        } catch (NumberFormatException e) {
            throw new ErreurApi(422, "annee invalide");
        }
    }

    static final TreeMap<Long, Livre> livres = new TreeMap<>();
    static long prochain = 1;

    //@@LISTER

    static String traiter(String methode, String cible, String corps) throws ErreurApi {
        int q = cible.indexOf('?');
        String chemin = q < 0 ? cible : cible.substring(0, q), qs = q < 0 ? "" : cible.substring(q + 1);
        String[] seg = Arrays.stream(chemin.split("/")).filter(s -> !s.isEmpty()).toArray(String[]::new);
        if (seg.length == 0 || !seg[0].equals("livres") || seg.length > 2) throw new ErreurApi(404, "ressource inconnue");
        if (seg.length == 1) {
            if (methode.equals("GET")) return lister(formulaire(qs));
            if (!methode.equals("POST")) throw new ErreurApi(405, "méthode non autorisée");
            Livre l = valider(prochain, formulaire(corps));
            livres.put(prochain++, l);
            return "201 " + l.json();
        }
        long id;
        try { id = Long.parseLong(seg[1]); } catch (NumberFormatException e) { throw new ErreurApi(400, "identifiant invalide"); }
        if (!List.of("GET", "PUT", "PATCH", "DELETE").contains(methode)) throw new ErreurApi(405, "méthode non autorisée");
        Livre livre = livres.get(id);
        if (livre == null) throw new ErreurApi(404, "livre introuvable");
        switch (methode) {
            case "GET": return "200 " + livre.json();
            case "PUT": {
                Livre l = valider(id, formulaire(corps));
                livres.put(id, l);
                return "200 " + l.json();
            }
            //@@PATCH
            default:
                livres.remove(id);
                return "204";
        }
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            String[] p = sc.nextLine().split(" ", 3);
            if (p.length < 2) continue;
            try { System.out.println(traiter(p[0], p[1], p.length > 2 ? p[2] : "")); }
            catch (ErreurApi e) { System.out.println(erreur(e.code, e.getMessage())); }
        }
    }
}
'''

A1_JAVA_LISTER = '''static String lister(Map<String, String> q) {
        return "200 [" + livres.values().stream().map(Livre::json).collect(Collectors.joining(",")) + "]";
    }
'''

A2_JAVA_LISTER = '''static long nombre(Map<String, String> q, String k, long defaut) throws ErreurApi {
        if (!q.containsKey(k)) return defaut;
        try {
            long v = Long.parseLong(q.get(k));
            if (v > 0) return v;
        } catch (NumberFormatException e) { }
        throw new ErreurApi(400, "pagination invalide");
    }

    static String lister(Map<String, String> q) throws ErreurApi {
        long page = nombre(q, "page", 1), taille = nombre(q, "taille", 10);
        String tri = q.getOrDefault("tri", "id");
        boolean desc = tri.startsWith("-");
        String champ = desc ? tri.substring(1) : tri;
        Comparator<Livre> cmp = switch (champ) {
            case "titre" -> Comparator.comparing(Livre::titre);
            case "annee" -> Comparator.comparingLong(Livre::annee);
            default -> Comparator.comparingLong(Livre::id);
        };
        if (desc) cmp = cmp.reversed();
        List<Livre> v = livres.values().stream()
            .filter(l -> !q.containsKey("auteur") || l.auteur().equals(q.get("auteur")))
            .sorted(cmp.thenComparingLong(Livre::id)).toList();
        String elements = v.stream().skip((page - 1) * taille).limit(taille).map(Livre::json).collect(Collectors.joining(","));
        return "200 {\\"total\\":" + v.size() + ",\\"page\\":" + page + ",\\"taille\\":" + taille + ",\\"livres\\":[" + elements + "]}";
    }
'''

A2_JAVA_PATCH = '''            case "PATCH": {
                Map<String, String> f = formulaire(corps);
                long annee = livre.annee();
                if (f.containsKey("annee")) {
                    try { annee = Long.parseLong(f.get("annee")); } catch (NumberFormatException e) { throw new ErreurApi(422, "annee invalide"); }
                }
                Livre l = new Livre(id,
                    f.getOrDefault("titre", "").isEmpty() ? livre.titre() : f.get("titre"),
                    f.getOrDefault("auteur", "").isEmpty() ? livre.auteur() : f.get("auteur"),
                    annee);
                livres.put(id, l);
                return "200 " + l.json();
            }
'''

A1_JAVA = A_JAVA.replace('    //@@LISTER\n', '    ' + A1_JAVA_LISTER).replace('            //@@PATCH\n', '            case "PATCH": throw new ErreurApi(405, "méthode non autorisée");\n')
A2_JAVA = A_JAVA.replace('    //@@LISTER\n', '    ' + A2_JAVA_LISTER).replace('            //@@PATCH\n', A2_JAVA_PATCH)

L = lambda i, t, a, y: '{"id":%d,"titre":"%s","auteur":"%s","annee":%d}' % (i, t, a, y)

P.append(project(
    'api-rest', 4, 'API REST de bibliothèque',
    'Concevoir le cœur d’une API REST : ressources, verbes, codes de statut, validation, JSON, filtres et pagination.',
    '''
    Tu implémentes la logique d’une **API REST** qui gère les livres d’une bibliothèque. Pour la tester sans réseau, chaque ligne d’entrée est une requête simplifiée :

    ```
    MÉTHODE /chemin[?paramètres] [corps]
    ```

    Le corps est au format *formulaire* : `titre=Dune&auteur=Frank+Herbert&annee=1965` (le `+` représente un espace). Chaque réponse tient sur une ligne : le **code de statut**, un espace, puis le **JSON** (sauf `204`, sans corps).

    Un livre en JSON : `{"id":1,"titre":"Dune","auteur":"Frank Herbert","annee":1965}` — les guillemets et barres obliques inverses des chaînes sont échappés. Les erreurs : `{"erreur":"message"}`.

    | Situation | Code |
    |---|---|
    | création | 201 |
    | suppression | 204 |
    | identifiant non numérique | 400 |
    | ressource ou livre inexistant | 404 |
    | méthode non permise | 405 |
    | données invalides | 422 |
    ''',
    ['Appliquer les conventions REST (ressources, verbes, statuts)', 'Valider des données d’entrée', 'Produire du JSON correctement échappé', 'Filtrer, trier et paginer une collection'],
    ['Identifiants attribués à partir de 1, jamais réutilisés', 'Aucune bibliothèque JSON externe', 'Ordre des contrôles : chemin, identifiant, méthode, existence, validation'],
    [
        step('api-crud', 'CRUD complet',
             '''
             Routes :

             - `GET /livres` → `200 [livres triés par id]`
             - `POST /livres CORPS` → `201 {livre}` ; champ absent ou vide → `422 {"erreur":"champ manquant : CHAMP"}` (dans l’ordre titre, auteur, annee) ; année non entière → `422 {"erreur":"annee invalide"}`
             - `GET /livres/ID` → `200 {livre}` ; `PUT /livres/ID CORPS` (remplacement complet, mêmes validations) → `200 {livre}` ; `DELETE /livres/ID` → `204`
             - livre inexistant → `404 {"erreur":"livre introuvable"}` ; ID non numérique → `400 {"erreur":"identifiant invalide"}`
             - autre chemin → `404 {"erreur":"ressource inconnue"}` ; autre méthode (dont `PATCH` à cette étape) → `405 {"erreur":"méthode non autorisée"}`
             ''',
             [T('GET /livres\nPOST /livres titre=Dune&auteur=Frank+Herbert&annee=1965\nPOST /livres titre=Fondation&auteur=Isaac+Asimov\nPOST /livres titre=X&auteur=Y&annee=mille\nPOST /livres titre=Le+\"Hobbit\"&auteur=Tolkien&annee=1937\nGET /livres/2\nPUT /livres/2 titre=The+Hobbit&auteur=J.R.R.+Tolkien&annee=1937\nGET /livres/abc\nDELETE /livres/1\nDELETE /livres/1\nPATCH /livres/2 annee=1938\nGET /auteurs\nPUT /livres\nGET /livres',
                '\n'.join(['200 []', '201 ' + L(1, 'Dune', 'Frank Herbert', 1965), '422 {"erreur":"champ manquant : annee"}', '422 {"erreur":"annee invalide"}', '201 ' + L(2, 'Le \\"Hobbit\\"', 'Tolkien', 1937), '200 ' + L(2, 'Le \\"Hobbit\\"', 'Tolkien', 1937), '200 ' + L(2, 'The Hobbit', 'J.R.R. Tolkien', 1937), '400 {"erreur":"identifiant invalide"}', '204', '404 {"erreur":"livre introuvable"}', '405 {"erreur":"méthode non autorisée"}', '404 {"erreur":"ressource inconnue"}', '405 {"erreur":"méthode non autorisée"}', '200 [' + L(2, 'The Hobbit', 'J.R.R. Tolkien', 1937) + ']'])),
              T('POST /livres auteur=a&annee=1\nPOST /livres titre=&auteur=a&annee=1\nPUT /livres/9 titre=a&auteur=b&annee=1\nPOST /livres titre=a&auteur=b&annee=-50\nPUT /livres/1 titre=a', '422 {"erreur":"champ manquant : titre"}\n422 {"erreur":"champ manquant : titre"}\n404 {"erreur":"livre introuvable"}\n201 ' + L(1, 'a', 'b', -50) + '\n422 {"erreur":"champ manquant : auteur"}', hidden=True)],
             rust=A1_RUST, cpp=A1_CPP, java=A1_JAVA,
             hints=['Découpe le chemin sur « / » : 1 segment = la collection, 2 segments = un élément.', 'Écris une seule fonction de validation, partagée par POST et PUT.'],
             xp=60),
        step('api-requetes', 'Filtres, tri, pagination et PATCH',
             '''
             Fais évoluer l’API :

             - `GET /livres` renvoie désormais une **enveloppe** : `200 {"total":N,"page":P,"taille":T,"livres":[…]}` où `total` est le nombre de livres après filtrage ;
             - paramètres : `auteur=NOM` (égalité exacte, `+` = espace), `tri=id|titre|annee` (préfixe `-` pour l’ordre décroissant ; égalités départagées par id croissant), `page` (défaut 1) et `taille` (défaut 10) — entiers strictement positifs, sinon `400 {"erreur":"pagination invalide"}` ;
             - `PATCH /livres/ID CORPS` : modification **partielle** (seuls les champs présents et non vides changent ; une année non entière → 422).
             ''',
             [T('POST /livres titre=Dune&auteur=Frank+Herbert&annee=1965\nPOST /livres titre=Fondation&auteur=Isaac+Asimov&annee=1951\nPOST /livres titre=Les+Robots&auteur=Isaac+Asimov&annee=1950\nPOST /livres titre=Hyperion&auteur=Dan+Simmons&annee=1989\nGET /livres?auteur=Isaac+Asimov&tri=annee\nGET /livres?tri=-annee&page=2&taille=2\nGET /livres?tri=titre&taille=1\nGET /livres?page=0\nPATCH /livres/4 annee=1990\nPATCH /livres/4 annee=bientot\nPATCH /livres/4 titre=Hyperion+Cantos',
                '\n'.join(['201 ' + L(1, 'Dune', 'Frank Herbert', 1965), '201 ' + L(2, 'Fondation', 'Isaac Asimov', 1951), '201 ' + L(3, 'Les Robots', 'Isaac Asimov', 1950), '201 ' + L(4, 'Hyperion', 'Dan Simmons', 1989),
                           '200 {"total":2,"page":1,"taille":10,"livres":[' + L(3, 'Les Robots', 'Isaac Asimov', 1950) + ',' + L(2, 'Fondation', 'Isaac Asimov', 1951) + ']}',
                           '200 {"total":4,"page":2,"taille":2,"livres":[' + L(2, 'Fondation', 'Isaac Asimov', 1951) + ',' + L(3, 'Les Robots', 'Isaac Asimov', 1950) + ']}',
                           '200 {"total":4,"page":1,"taille":1,"livres":[' + L(1, 'Dune', 'Frank Herbert', 1965) + ']}',
                           '400 {"erreur":"pagination invalide"}',
                           '200 ' + L(4, 'Hyperion', 'Dan Simmons', 1990), '422 {"erreur":"annee invalide"}', '200 ' + L(4, 'Hyperion Cantos', 'Dan Simmons', 1990)])),
              T('GET /livres?taille=x\nGET /livres?page=3\nPOST /livres titre=B&auteur=a&annee=2\nPOST /livres titre=A&auteur=a&annee=2\nGET /livres?tri=-annee', '400 {"erreur":"pagination invalide"}\n200 {"total":0,"page":3,"taille":10,"livres":[]}\n201 ' + L(1, 'B', 'a', 2) + '\n201 ' + L(2, 'A', 'a', 2) + '\n200 {"total":2,"page":1,"taille":10,"livres":[' + L(1, 'B', 'a', 2) + ',' + L(2, 'A', 'a', 2) + ']}', hidden=True)],
             rust=A2_RUST, cpp=A2_CPP, java=A2_JAVA,
             hints=['Filtre d’abord, compte le total, trie, puis découpe la page : éléments de (page−1)×taille à page×taille.', 'Pour le tri décroissant, inverse la comparaison du champ mais garde l’id croissant pour départager.'],
             xp=70),
    ]))

# ====================================================================== TCP
TCP1_RUST = r'''
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

fn main() {
    // Port 0 : le système choisit un port libre.
    let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = ecoute.local_addr().unwrap().port();

    let serveur = thread::spawn(move || {
        let (flux, _) = ecoute.accept().unwrap();
        let mut lecteur = BufReader::new(flux.try_clone().unwrap());
        let mut ecrivain = flux;
        let mut traites = 0;
        let mut ligne = String::new();
        while lecteur.read_line(&mut ligne).unwrap() > 0 {
            writeln!(ecrivain, "{}", ligne.trim_end().to_uppercase()).unwrap();
            traites += 1;
            ligne.clear();
        }
        traites
    });

    let flux = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let mut lecteur = BufReader::new(flux.try_clone().unwrap());
    let mut ecrivain = flux;
    for l in io::stdin().lock().lines() {
        let l = l.unwrap();
        writeln!(ecrivain, "{}", l).unwrap();
        let mut reponse = String::new();
        lecteur.read_line(&mut reponse).unwrap();
        println!("envoyé : {} | reçu : {}", l, reponse.trim_end());
    }
    // Fermer la connexion : le serveur lit alors une fin de flux.
    drop(ecrivain);
    drop(lecteur);
    let traites = serveur.join().unwrap();
    println!("connexion fermée ({} message(s) traité(s))", traites);
}
'''

TCP2_RUST = r'''
use std::collections::HashMap;
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

/// Exécute une commande du protocole ; None = fermer la connexion.
fn executer(store: &mut HashMap<String, String>, cmd: &str) -> (String, bool) {
    let p: Vec<&str> = cmd.splitn(3, ' ').collect();
    let r = match p.as_slice() {
        ["SET", k, v] => {
            store.insert(k.to_string(), v.to_string());
            "OK".to_string()
        }
        ["GET", k] => store.get(*k).map_or("INTROUVABLE".to_string(), |v| format!("VALEUR {}", v)),
        ["DEL", k] => (if store.remove(*k).is_some() { "SUPPRIMÉ" } else { "INTROUVABLE" }).to_string(),
        ["COUNT"] => format!("{} clé(s)", store.len()),
        ["QUIT"] => return ("AU REVOIR".to_string(), true),
        _ => "ERREUR commande invalide".to_string(),
    };
    (r, false)
}

fn main() {
    // Lecture des sessions : « --- nouveau client » sépare les clients.
    let mut sessions: Vec<Vec<String>> = vec![vec![]];
    for l in io::stdin().lock().lines() {
        let l = l.unwrap();
        if l == "--- nouveau client" {
            sessions.push(vec![]);
        } else if !l.trim().is_empty() {
            sessions.last_mut().unwrap().push(l);
        }
    }

    let ecoute = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = ecoute.local_addr().unwrap().port();
    let nb_clients = sessions.len();
    let serveur = thread::spawn(move || {
        let mut store = HashMap::new();
        let mut commandes = 0;
        for _ in 0..nb_clients {
            let (flux, _) = ecoute.accept().unwrap();
            let mut lecteur = BufReader::new(flux.try_clone().unwrap());
            let mut ecrivain = flux;
            let mut ligne = String::new();
            while lecteur.read_line(&mut ligne).unwrap() > 0 {
                commandes += 1;
                let (reponse, fin) = executer(&mut store, ligne.trim_end());
                writeln!(ecrivain, "{}", reponse).unwrap();
                ligne.clear();
                if fin {
                    break;
                }
            }
        }
        commandes
    });

    for (i, session) in sessions.iter().enumerate() {
        let flux = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut lecteur = BufReader::new(flux.try_clone().unwrap());
        let mut ecrivain = flux;
        for cmd in session {
            writeln!(ecrivain, "{}", cmd).unwrap();
            let mut reponse = String::new();
            lecteur.read_line(&mut reponse).unwrap();
            println!("[client {}] {} -> {}", i + 1, cmd, reponse.trim_end());
            if cmd == "QUIT" {
                break;
            }
        }
    }
    let commandes = serveur.join().unwrap();
    println!("serveur arrêté : {} connexion(s), {} commande(s)", nb_clients, commandes);
}
'''

TCP_CPP_HEAD = r'''
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

// Lit une ligne (jusqu'à '\n') depuis une socket ; false en fin de connexion.
bool lireLigne(int fd, string& out) {
    out.clear();
    char c;
    while (true) {
        ssize_t n = recv(fd, &c, 1, 0);
        if (n <= 0) return !out.empty();
        if (c == '\n') return true;
        out += c;
    }
}

void envoyer(int fd, const string& s) {
    string m = s + "\n";
    send(fd, m.data(), m.size(), MSG_NOSIGNAL);
}

// Socket d'écoute sur 127.0.0.1, port choisi par le système (port 0).
int ecouter(sockaddr_in& adr) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    adr = {};
    adr.sin_family = AF_INET;
    adr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    adr.sin_port = 0;
    bind(fd, (sockaddr*)&adr, sizeof adr);
    listen(fd, 8);
    socklen_t len = sizeof adr;
    getsockname(fd, (sockaddr*)&adr, &len);
    return fd;
}

int connecter(const sockaddr_in& adr) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    connect(fd, (const sockaddr*)&adr, sizeof adr);
    return fd;
}
'''

TCP1_CPP = TCP_CPP_HEAD + r'''
int main() {
    sockaddr_in adr;
    int ecoute = ecouter(adr);
    int traites = 0;
    thread serveur([&] {
        int fd = accept(ecoute, nullptr, nullptr);
        string l;
        while (lireLigne(fd, l)) {
            transform(l.begin(), l.end(), l.begin(), ::toupper);
            envoyer(fd, l);
            traites++;
        }
        close(fd);
    });
    int client = connecter(adr);
    string l, reponse;
    while (getline(cin, l)) {
        envoyer(client, l);
        lireLigne(client, reponse);
        cout << "envoyé : " << l << " | reçu : " << reponse << "\n";
    }
    close(client);  // le serveur lit alors une fin de flux
    serveur.join();
    close(ecoute);
    cout << "connexion fermée (" << traites << " message(s) traité(s))\n";
}
'''

TCP2_CPP = TCP_CPP_HEAD + r'''
// Exécute une commande du protocole ; fin = true pour fermer la connexion.
string executer(map<string, string>& store, const string& cmd, bool& fin) {
    istringstream in(cmd);
    string op, k, v;
    in >> op >> k;
    getline(in >> ws, v);
    fin = false;
    if (op == "SET" && !k.empty() && !v.empty()) { store[k] = v; return "OK"; }
    if (op == "GET" && !k.empty() && v.empty()) return store.count(k) ? "VALEUR " + store[k] : "INTROUVABLE";
    if (op == "DEL" && !k.empty() && v.empty()) return store.erase(k) ? "SUPPRIMÉ" : "INTROUVABLE";
    if (op == "COUNT" && k.empty()) return to_string(store.size()) + " clé(s)";
    if (op == "QUIT" && k.empty()) { fin = true; return "AU REVOIR"; }
    return "ERREUR commande invalide";
}

int main() {
    vector<vector<string>> sessions(1);
    for (string l; getline(cin, l);) {
        if (l == "--- nouveau client") sessions.emplace_back();
        else if (l.find_first_not_of(' ') != string::npos) sessions.back().push_back(l);
    }
    sockaddr_in adr;
    int ecoute = ecouter(adr);
    int commandes = 0;
    thread serveur([&] {
        map<string, string> store;
        for (size_t c = 0; c < sessions.size(); c++) {
            int fd = accept(ecoute, nullptr, nullptr);
            string l;
            bool fin = false;
            while (!fin && lireLigne(fd, l)) {
                commandes++;
                envoyer(fd, executer(store, l, fin));
            }
            close(fd);
        }
    });
    for (size_t i = 0; i < sessions.size(); i++) {
        int client = connecter(adr);
        string reponse;
        for (const string& cmd : sessions[i]) {
            envoyer(client, cmd);
            lireLigne(client, reponse);
            cout << "[client " << i + 1 << "] " << cmd << " -> " << reponse << "\n";
            if (cmd == "QUIT") break;
        }
        close(client);
    }
    serveur.join();
    close(ecoute);
    cout << "serveur arrêté : " << sessions.size() << " connexion(s), " << commandes << " commande(s)\n";
}
'''

TCP1_JAVA = r'''
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Main {
    public static void main(String[] args) throws Exception {
        // Port 0 : le système choisit un port libre.
        ServerSocket ecoute = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        int[] traites = {0};
        Thread serveur = new Thread(() -> {
            try (Socket s = ecoute.accept();
                 BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8));
                 PrintWriter out = new PrintWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true)) {
                String l;
                while ((l = in.readLine()) != null) {
                    out.println(l.toUpperCase(Locale.ROOT));
                    traites[0]++;
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        serveur.start();
        try (Socket client = new Socket(InetAddress.getLoopbackAddress(), ecoute.getLocalPort());
             BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
             PrintWriter out = new PrintWriter(new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8), true)) {
            Scanner sc = new Scanner(System.in);
            while (sc.hasNextLine()) {
                String l = sc.nextLine();
                out.println(l);
                System.out.println("envoyé : " + l + " | reçu : " + in.readLine());
            }
        } // la fermeture du client provoque une fin de flux côté serveur
        serveur.join();
        ecoute.close();
        System.out.println("connexion fermée (" + traites[0] + " message(s) traité(s))");
    }
}
'''

TCP2_JAVA = r'''
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Main {
    /** Exécute une commande du protocole ; renvoie null pour « QUIT ». */
    static String executer(Map<String, String> store, String cmd) {
        String[] p = cmd.split(" ", 3);
        return switch (p[0]) {
            case "SET" -> { if (p.length != 3) yield "ERREUR commande invalide"; store.put(p[1], p[2]); yield "OK"; }
            case "GET" -> p.length != 2 ? "ERREUR commande invalide" : store.containsKey(p[1]) ? "VALEUR " + store.get(p[1]) : "INTROUVABLE";
            case "DEL" -> p.length != 2 ? "ERREUR commande invalide" : store.remove(p[1]) != null ? "SUPPRIMÉ" : "INTROUVABLE";
            case "COUNT" -> p.length != 1 ? "ERREUR commande invalide" : store.size() + " clé(s)";
            case "QUIT" -> p.length == 1 ? null : "ERREUR commande invalide";
            default -> "ERREUR commande invalide";
        };
    }

    static BufferedReader lecteur(Socket s) throws IOException { return new BufferedReader(new InputStreamReader(s.getInputStream(), StandardCharsets.UTF_8)); }
    static PrintWriter ecrivain(Socket s) throws IOException { return new PrintWriter(new OutputStreamWriter(s.getOutputStream(), StandardCharsets.UTF_8), true); }

    public static void main(String[] args) throws Exception {
        List<List<String>> sessions = new ArrayList<>();
        sessions.add(new ArrayList<>());
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            String l = sc.nextLine();
            if (l.equals("--- nouveau client")) sessions.add(new ArrayList<>());
            else if (!l.isBlank()) sessions.get(sessions.size() - 1).add(l);
        }
        ServerSocket ecoute = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        int[] commandes = {0};
        Thread serveur = new Thread(() -> {
            Map<String, String> store = new HashMap<>();
            try {
                for (int c = 0; c < sessions.size(); c++) {
                    try (Socket s = ecoute.accept(); BufferedReader in = lecteur(s); PrintWriter out = ecrivain(s)) {
                        String l;
                        while ((l = in.readLine()) != null) {
                            commandes[0]++;
                            String r = executer(store, l);
                            out.println(r == null ? "AU REVOIR" : r);
                            if (r == null) break;
                        }
                    }
                }
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        });
        serveur.start();
        for (int i = 0; i < sessions.size(); i++) {
            try (Socket client = new Socket(InetAddress.getLoopbackAddress(), ecoute.getLocalPort()); BufferedReader in = lecteur(client); PrintWriter out = ecrivain(client)) {
                for (String cmd : sessions.get(i)) {
                    out.println(cmd);
                    System.out.println("[client " + (i + 1) + "] " + cmd + " -> " + in.readLine());
                    if (cmd.equals("QUIT")) break;
                }
            }
        }
        serveur.join();
        ecoute.close();
        System.out.println("serveur arrêté : " + sessions.size() + " connexion(s), " + commandes[0] + " commande(s)");
    }
}
'''

P.append(project(
    'client-serveur-tcp', 4, 'Client / serveur TCP',
    'De vraies sockets réseau : un serveur et un client qui communiquent sur la boucle locale, puis un protocole clé-valeur multi-clients.',
    '''
    Tu vas écrire un **vrai programme réseau** : un serveur TCP qui écoute sur `127.0.0.1` et un client qui s’y connecte — dans le même programme, le serveur tournant dans un **thread**.

    Même si le bac à sable n’a pas accès à Internet, l’interface de **boucle locale** (*loopback*) fonctionne : c’est exactement le même code que pour communiquer entre deux machines.

    Points clés :

    - le serveur demande le **port 0** : le système lui attribue un port libre (on évite ainsi les conflits) ;
    - TCP transporte un **flux d’octets**, pas des messages : on délimite chaque message par un saut de ligne `\\n` ;
    - quand le client ferme la connexion, le serveur lit une **fin de flux** (0 octet).

    Les entrées du programme sont les messages que le client doit envoyer.
    ''',
    ['Créer une socket serveur et accepter des connexions', 'Se connecter en tant que client', 'Définir un protocole texte délimité par lignes', 'Coordonner un thread serveur et le programme principal'],
    ['Écouter uniquement sur 127.0.0.1, port attribué par le système', 'Fermer proprement toutes les connexions', 'Le serveur s’arrête après avoir servi tous les clients'],
    [
        step('tcp-echo', 'Serveur d’écho',
             '''
             Le serveur renvoie chaque ligne reçue **en majuscules**. Le client envoie chaque ligne de l’entrée, attend la réponse et affiche `envoyé : LIGNE | reçu : RÉPONSE`.

             Quand l’entrée est épuisée, le client ferme la connexion ; le serveur s’arrête alors et le programme affiche `connexion fermée (N message(s) traité(s))`.
             ''',
             [T('bonjour serveur\ncodemori 2026\nfin', 'envoyé : bonjour serveur | reçu : BONJOUR SERVEUR\nenvoyé : codemori 2026 | reçu : CODEMORI 2026\nenvoyé : fin | reçu : FIN\nconnexion fermée (3 message(s) traité(s))'),
              T('a', 'envoyé : a | reçu : A\nconnexion fermée (1 message(s) traité(s))', hidden=True)],
             rust=TCP1_RUST, cpp=TCP1_CPP, java=TCP1_JAVA,
             hints=['Crée l’écoute AVANT de lancer le thread serveur et le client, pour connaître le port.', 'Utilise un lecteur bufferisé pour lire ligne par ligne sur la socket.'],
             xp=70),
        step('tcp-kv', 'Protocole clé-valeur multi-clients',
             '''
             Le serveur devient une petite base clé-valeur **partagée entre les clients**, servis l’un après l’autre. L’entrée contient les commandes de chaque client ; la ligne `--- nouveau client` sépare les clients.

             Protocole :

             | Commande | Réponse |
             |---|---|
             | `SET clé valeur` (la valeur peut contenir des espaces) | `OK` |
             | `GET clé` | `VALEUR valeur` ou `INTROUVABLE` |
             | `DEL clé` | `SUPPRIMÉ` ou `INTROUVABLE` |
             | `COUNT` | `N clé(s)` |
             | `QUIT` | `AU REVOIR`, puis le serveur ferme la connexion |
             | autre | `ERREUR commande invalide` |

             Le client affiche `[client i] COMMANDE -> RÉPONSE` et cesse d’envoyer après `QUIT`. À la fin : `serveur arrêté : C connexion(s), N commande(s)` (commandes reçues par le serveur).
             ''',
             [T('SET langage Rust\nSET mascotte Kiri la renarde\nGET mascotte\nCOUNT\n--- nouveau client\nGET langage\nDEL langage\nDEL langage\nPING\nQUIT\nGET mascotte\n--- nouveau client\nCOUNT',
                '[client 1] SET langage Rust -> OK\n[client 1] SET mascotte Kiri la renarde -> OK\n[client 1] GET mascotte -> VALEUR Kiri la renarde\n[client 1] COUNT -> 2 clé(s)\n[client 2] GET langage -> VALEUR Rust\n[client 2] DEL langage -> SUPPRIMÉ\n[client 2] DEL langage -> INTROUVABLE\n[client 2] PING -> ERREUR commande invalide\n[client 2] QUIT -> AU REVOIR\n[client 3] COUNT -> 1 clé(s)\nserveur arrêté : 3 connexion(s), 10 commande(s)'),
              T('GET x\nSET x\nCOUNT', '[client 1] GET x -> INTROUVABLE\n[client 1] SET x -> ERREUR commande invalide\n[client 1] COUNT -> 0 clé(s)\nserveur arrêté : 1 connexion(s), 3 commande(s)', hidden=True)],
             rust=TCP2_RUST, cpp=TCP2_CPP, java=TCP2_JAVA,
             hints=['Le serveur accepte autant de connexions qu’il y a de clients, une à la fois, avec un dictionnaire commun.', 'Découpe la commande en 3 morceaux au maximum : la valeur de SET garde ses espaces.'],
             xp=80),
    ]))

dump(P, sys.argv[1], 'Projets — niveau avancé (1/2)')
