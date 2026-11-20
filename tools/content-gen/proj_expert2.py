import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from projgen import project, step, T, dump

P = []

# ====================================================================== Serveur réseau : protocole RESP
R_RUST = r'''
use std::collections::HashMap;
use std::io::{self, Read};

/// Les cinq types de réponse du protocole RESP.
enum Rep {
    Simple(String),
    Erreur(String),
    Entier(i64),
    Chaine(Option<String>),
    Tableau(Vec<Rep>),
}

fn afficher(r: &Rep, out: &mut Vec<String>) {
    match r {
        Rep::Simple(s) => out.push(format!("+{}", s)),
        Rep::Erreur(s) => out.push(format!("-ERR {}", s)),
        Rep::Entier(n) => out.push(format!(":{}", n)),
        Rep::Chaine(None) => out.push("$-1".into()),
        Rep::Chaine(Some(s)) => {
            out.push(format!("${}", s.len()));
            out.push(s.clone());
        }
        Rep::Tableau(v) => {
            out.push(format!("*{}", v.len()));
            for x in v {
                afficher(x, out);
            }
        }
    }
}

/// Analyseur RESP : travaille sur des octets, car une chaîne peut contenir des sauts de ligne.
struct Lecteur {
    b: Vec<u8>,
    p: usize,
}

impl Lecteur {
    fn ligne(&mut self) -> Option<String> {
        if self.p >= self.b.len() {
            return None;
        }
        let debut = self.p;
        while self.p < self.b.len() && self.b[self.p] != b'\n' {
            self.p += 1;
        }
        let mut s = &self.b[debut..self.p];
        if self.p < self.b.len() {
            self.p += 1;
        }
        if s.last() == Some(&b'\r') {
            s = &s[..s.len() - 1];
        }
        Some(String::from_utf8_lossy(s).into_owned())
    }

    fn nombre(&mut self) -> Result<usize, ()> {
        self.ligne().ok_or(())?.trim().parse().map_err(|_| ())
    }

    /// Ok(None) à la fin de l'entrée, Err(()) en cas d'erreur de protocole.
    fn commande(&mut self) -> Result<Option<Vec<String>>, ()> {
        while self.p < self.b.len() && self.b[self.p].is_ascii_whitespace() {
            self.p += 1;
        }
        if self.p >= self.b.len() {
            return Ok(None);
        }
        if self.b[self.p] != b'*' {
            // Commande « en ligne » : simplement des mots séparés par des espaces.
            return Ok(Some(self.ligne().unwrap().split_whitespace().map(String::from).collect()));
        }
        self.p += 1;
        let n = self.nombre()?;
        let mut args = Vec::with_capacity(n);
        for _ in 0..n {
            if self.b.get(self.p) != Some(&b'$') {
                return Err(());
            }
            self.p += 1;
            let len = self.nombre()?;
            if self.p + len > self.b.len() {
                return Err(());
            }
            args.push(String::from_utf8_lossy(&self.b[self.p..self.p + len]).into_owned());
            self.p += len;
            if self.b.get(self.p) == Some(&b'\r') {
                self.p += 1;
            }
            if self.b.get(self.p) != Some(&b'\n') {
                return Err(());
            }
            self.p += 1;
        }
        Ok(Some(args))
    }
}

#[derive(Default)]
struct Serveur {
    donnees: HashMap<String, (String, Option<u64>)>, // valeur, échéance (ms)
    temps: u64,
    transaction: Option<Vec<Vec<String>>>,
}

impl Serveur {
    /// Supprime la clé si elle a expiré (expiration « paresseuse »).
    fn purger(&mut self, k: &str) {
        let echeance = self.donnees.get(k).and_then(|v| v.1);
        if echeance.map_or(false, |e| e <= self.temps) {
            self.donnees.remove(k);
        }
    }

    fn executer(&mut self, args: &[String]) -> Rep {
        let nom = args[0].to_lowercase();
        let a = &args[1..];
        let mauvais = || Rep::Erreur(format!("nombre d'arguments incorrect pour '{}'", nom));
        match nom.as_str() {
            "ping" => match a.len() {
                0 => Rep::Simple("PONG".into()),
                1 => Rep::Chaine(Some(a[0].clone())),
                _ => mauvais(),
            },
            "echo" if a.len() == 1 => Rep::Chaine(Some(a[0].clone())),
            "set" if a.len() == 2 => {
                self.donnees.insert(a[0].clone(), (a[1].clone(), None));
                Rep::Simple("OK".into())
            }
            //@@SETPX
            "get" if a.len() == 1 => {
                self.purger(&a[0]);
                Rep::Chaine(self.donnees.get(&a[0]).map(|v| v.0.clone()))
            }
            "del" if !a.is_empty() => {
                let mut n = 0;
                for k in a {
                    self.purger(k);
                    if self.donnees.remove(k).is_some() {
                        n += 1;
                    }
                }
                Rep::Entier(n)
            }
            "exists" if a.len() == 1 => {
                self.purger(&a[0]);
                Rep::Entier(self.donnees.contains_key(&a[0]) as i64)
            }
            "incr" if a.len() == 1 => {
                self.purger(&a[0]);
                let e = self.donnees.entry(a[0].clone()).or_insert(("0".into(), None));
                match e.0.parse::<i64>() {
                    Ok(v) => {
                        e.0 = (v + 1).to_string();
                        Rep::Entier(v + 1)
                    }
                    Err(_) => Rep::Erreur("la valeur n'est pas un entier".into()),
                }
            }
            //@@ETAPE2
            "echo" | "set" | "get" | "del" | "exists" | "incr" | "pttl" | "avancer" => mauvais(),
            _ => Rep::Erreur(format!("commande inconnue '{}'", nom)),
        }
    }

    //@@TRAITER
}

fn main() {
    let mut b = Vec::new();
    io::stdin().read_to_end(&mut b).unwrap();
    let mut lecteur = Lecteur { b, p: 0 };
    let mut serveur = Serveur::default();
    let mut out = vec![];
    loop {
        match lecteur.commande() {
            Ok(None) => break,
            Ok(Some(c)) if c.is_empty() => {}
            Ok(Some(c)) => {
                let r = serveur.traiter(c);
                afficher(&r, &mut out);
            }
            Err(()) => {
                out.push("-ERR protocole".into());
                break;
            }
        }
    }
    println!("{}", out.join("\n"));
}
'''

R1_RUST_TRAITER = '''fn traiter(&mut self, args: Vec<String>) -> Rep {
        let _ = &self.transaction;
        self.executer(&args)
    }'''

R2_RUST_SETPX = '''            "set" if a.len() == 4 && a[2].eq_ignore_ascii_case("px") => match a[3].parse::<u64>() {
                Ok(ms) => {
                    self.donnees.insert(a[0].clone(), (a[1].clone(), Some(self.temps + ms)));
                    Rep::Simple("OK".into())
                }
                Err(_) => Rep::Erreur("syntaxe".into()),
            },
'''

R2_RUST_ETAPE2 = '''            "pttl" if a.len() == 1 => {
                self.purger(&a[0]);
                Rep::Entier(match self.donnees.get(&a[0]) {
                    None => -2,
                    Some((_, None)) => -1,
                    Some((_, Some(e))) => (*e - self.temps) as i64,
                })
            }
            "avancer" if a.len() == 1 => match a[0].parse::<u64>() {
                Ok(ms) => {
                    self.temps += ms;
                    Rep::Simple("OK".into())
                }
                Err(_) => Rep::Erreur("syntaxe".into()),
            },
'''

R2_RUST_TRAITER = '''/// Gère les transactions MULTI / EXEC / DISCARD autour de l'exécution.
    fn traiter(&mut self, args: Vec<String>) -> Rep {
        let nom = args[0].to_lowercase();
        match (nom.as_str(), self.transaction.is_some()) {
            ("multi", true) => Rep::Erreur("MULTI imbriqué".into()),
            ("multi", false) => {
                self.transaction = Some(vec![]);
                Rep::Simple("OK".into())
            }
            ("exec", false) => Rep::Erreur("EXEC sans MULTI".into()),
            ("discard", false) => Rep::Erreur("DISCARD sans MULTI".into()),
            ("discard", true) => {
                self.transaction = None;
                Rep::Simple("OK".into())
            }
            ("exec", true) => {
                let file = self.transaction.take().unwrap();
                Rep::Tableau(file.iter().map(|c| self.executer(c)).collect())
            }
            (_, true) => {
                self.transaction.as_mut().unwrap().push(args);
                Rep::Simple("QUEUED".into())
            }
            _ => self.executer(&args),
        }
    }'''

R1_RUST = R_RUST.replace(' | "pttl" | "avancer"', '').replace('            //@@SETPX\n', '').replace('            //@@ETAPE2\n', '').replace('    //@@TRAITER', '    ' + R1_RUST_TRAITER)
R2_RUST = R_RUST.replace('            //@@SETPX\n', R2_RUST_SETPX).replace('            //@@ETAPE2\n', R2_RUST_ETAPE2).replace('    //@@TRAITER', '    ' + R2_RUST_TRAITER)

R_CPP = r'''
#include <algorithm>
#include <cctype>
#include <iostream>
#include <iterator>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>
using namespace std;

// Une réponse RESP : '+' simple, '-' erreur, ':' entier, '$' chaîne (nul possible), '*' tableau.
struct Rep {
    char type;
    string s;
    long long n = 0;
    bool nul = false;
    vector<Rep> v;
};

Rep simple(const string& s) { return {'+', s}; }
Rep erreur(const string& s) { return {'-', s}; }
Rep entier(long long n) { return {':', "", n}; }
Rep chaine(optional<string> s) { return {'$', s.value_or(""), 0, !s}; }

void afficher(const Rep& r, vector<string>& out) {
    switch (r.type) {
        case '+': out.push_back("+" + r.s); break;
        case '-': out.push_back("-ERR " + r.s); break;
        case ':': out.push_back(":" + to_string(r.n)); break;
        case '$':
            if (r.nul) out.push_back("$-1");
            else { out.push_back("$" + to_string(r.s.size())); out.push_back(r.s); }
            break;
        default:
            out.push_back("*" + to_string(r.v.size()));
            for (auto& x : r.v) afficher(x, out);
    }
}

// Analyseur RESP : travaille sur des octets, car une chaîne peut contenir des sauts de ligne.
struct Lecteur {
    string b;
    size_t p = 0;
    bool ligne(string& out) {
        if (p >= b.size()) return false;
        size_t fin = b.find('\n', p);
        if (fin == string::npos) fin = b.size();
        out = b.substr(p, fin - p);
        p = min(fin + 1, b.size());
        if (!out.empty() && out.back() == '\r') out.pop_back();
        return true;
    }
    bool nombre(size_t& n) {
        string l;
        if (!ligne(l)) return false;
        try {
            size_t pos;
            long long v = stoll(l, &pos);
            if (v < 0 || pos != l.size()) return false;
            n = v;
            return true;
        } catch (...) {
            return false;
        }
    }
    // 1 = commande lue, 0 = fin de l'entrée, -1 = erreur de protocole.
    int commande(vector<string>& args) {
        args.clear();
        while (p < b.size() && isspace((unsigned char)b[p])) p++;
        if (p >= b.size()) return 0;
        if (b[p] != '*') {
            // Commande « en ligne » : simplement des mots séparés par des espaces.
            string l;
            ligne(l);
            istringstream in(l);
            for (string w; in >> w;) args.push_back(w);
            return 1;
        }
        p++;
        size_t n;
        if (!nombre(n)) return -1;
        for (size_t i = 0; i < n; i++) {
            size_t len;
            if (p >= b.size() || b[p] != '$') return -1;
            p++;
            if (!nombre(len) || p + len > b.size()) return -1;
            args.push_back(b.substr(p, len));
            p += len;
            if (p < b.size() && b[p] == '\r') p++;
            if (p >= b.size() || b[p] != '\n') return -1;
            p++;
        }
        return 1;
    }
};

struct Serveur {
    map<string, pair<string, optional<unsigned long long>>> donnees;  // valeur, échéance (ms)
    unsigned long long temps = 0;
    optional<vector<vector<string>>> transaction;

    // Supprime la clé si elle a expiré (expiration « paresseuse »).
    void purger(const string& k) {
        auto it = donnees.find(k);
        if (it != donnees.end() && it->second.second && *it->second.second <= temps) donnees.erase(it);
    }

    Rep executer(const vector<string>& args) {
        string nom = args[0];
        for (char& c : nom) c = tolower((unsigned char)c);
        vector<string> a(args.begin() + 1, args.end());
        Rep mauvais = erreur("nombre d'arguments incorrect pour '" + nom + "'");
        if (nom == "ping") return a.empty() ? simple("PONG") : a.size() == 1 ? chaine(a[0]) : mauvais;
        if (nom == "echo") return a.size() == 1 ? chaine(a[0]) : mauvais;
        if (nom == "set") {
            if (a.size() == 2) { donnees[a[0]] = {a[1], nullopt}; return simple("OK"); }
            //@@SETPX
            return mauvais;
        }
        if (nom == "get") {
            if (a.size() != 1) return mauvais;
            purger(a[0]);
            auto it = donnees.find(a[0]);
            return chaine(it == donnees.end() ? nullopt : optional<string>(it->second.first));
        }
        if (nom == "del") {
            if (a.empty()) return mauvais;
            long long n = 0;
            for (auto& k : a) { purger(k); n += donnees.erase(k); }
            return entier(n);
        }
        if (nom == "exists") {
            if (a.size() != 1) return mauvais;
            purger(a[0]);
            return entier(donnees.count(a[0]));
        }
        if (nom == "incr") {
            if (a.size() != 1) return mauvais;
            purger(a[0]);
            auto& e = donnees.try_emplace(a[0], "0", nullopt).first->second;
            try {
                size_t pos;
                long long v = stoll(e.first, &pos);
                if (pos != e.first.size()) throw 0;
                e.first = to_string(v + 1);
                return entier(v + 1);
            } catch (...) {
                return erreur("la valeur n'est pas un entier");
            }
        }
        //@@ETAPE2
        return erreur("commande inconnue '" + nom + "'");
    }

    //@@TRAITER
};

int main() {
    Lecteur lecteur{string(istreambuf_iterator<char>(cin), istreambuf_iterator<char>())};
    Serveur serveur;
    vector<string> out, args;
    while (true) {
        int r = lecteur.commande(args);
        if (r == 0) break;
        if (r < 0) { out.push_back("-ERR protocole"); break; }
        if (!args.empty()) afficher(serveur.traiter(args), out);
    }
    for (size_t i = 0; i < out.size(); i++) cout << out[i] << "\n";
}
'''

R1_CPP_TRAITER = 'Rep traiter(const vector<string>& args) { return executer(args); }'

R2_CPP_SETPX = '''            if (a.size() == 4 && (a[2] == "px" || a[2] == "PX" || a[2] == "Px" || a[2] == "pX")) {
                try {
                    size_t pos;
                    unsigned long long ms = stoull(a[3], &pos);
                    if (pos != a[3].size() || a[3][0] == '-') throw 0;
                    donnees[a[0]] = {a[1], temps + ms};
                    return simple("OK");
                } catch (...) {
                    return erreur("syntaxe");
                }
            }
'''

R2_CPP_ETAPE2 = '''        if (nom == "pttl") {
            if (a.size() != 1) return mauvais;
            purger(a[0]);
            auto it = donnees.find(a[0]);
            if (it == donnees.end()) return entier(-2);
            if (!it->second.second) return entier(-1);
            return entier((long long)(*it->second.second - temps));
        }
        if (nom == "avancer") {
            if (a.size() != 1) return mauvais;
            try {
                size_t pos;
                unsigned long long ms = stoull(a[0], &pos);
                if (pos != a[0].size() || a[0][0] == '-') throw 0;
                temps += ms;
                return simple("OK");
            } catch (...) {
                return erreur("syntaxe");
            }
        }
'''

R2_CPP_TRAITER = '''// Gère les transactions MULTI / EXEC / DISCARD autour de l'exécution.
    Rep traiter(const vector<string>& args) {
        string nom = args[0];
        for (char& c : nom) c = tolower((unsigned char)c);
        bool enCours = transaction.has_value();
        if (nom == "multi") {
            if (enCours) return erreur("MULTI imbriqué");
            transaction.emplace();
            return simple("OK");
        }
        if (nom == "exec" || nom == "discard") {
            if (!enCours) return erreur(string(nom == "exec" ? "EXEC" : "DISCARD") + " sans MULTI");
            auto file = *transaction;
            transaction.reset();
            if (nom == "discard") return simple("OK");
            Rep t{'*'};
            for (auto& c : file) t.v.push_back(executer(c));
            return t;
        }
        if (enCours) {
            transaction->push_back(args);
            return simple("QUEUED");
        }
        return executer(args);
    }'''

R1_CPP = R_CPP.replace('            //@@SETPX\n', '').replace('        //@@ETAPE2\n', '').replace('    //@@TRAITER', '    ' + R1_CPP_TRAITER)
R2_CPP = R_CPP.replace('            //@@SETPX\n', R2_CPP_SETPX).replace('        //@@ETAPE2\n', R2_CPP_ETAPE2).replace('    //@@TRAITER', '    ' + R2_CPP_TRAITER)

R_JAVA = r'''
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class Main {
    /** Une réponse RESP : '+' simple, '-' erreur, ':' entier, '$' chaîne (null possible), '*' tableau. */
    record Rep(char type, String s, long n, List<Rep> v) {
        static Rep simple(String s) { return new Rep('+', s, 0, null); }
        static Rep erreur(String s) { return new Rep('-', s, 0, null); }
        static Rep entier(long n) { return new Rep(':', null, n, null); }
        static Rep chaine(String s) { return new Rep('$', s, 0, null); }
        static Rep tableau(List<Rep> v) { return new Rep('*', null, 0, v); }

        void afficher(List<String> out) {
            switch (type) {
                case '+' -> out.add("+" + s);
                case '-' -> out.add("-ERR " + s);
                case ':' -> out.add(":" + n);
                case '$' -> {
                    if (s == null) out.add("$-1");
                    else { out.add("$" + s.getBytes(StandardCharsets.UTF_8).length); out.add(s); }
                }
                default -> { out.add("*" + v.size()); v.forEach(x -> x.afficher(out)); }
            }
        }
    }

    static class ErreurProtocole extends Exception {}

    /** Analyseur RESP : travaille sur des octets, car une chaîne peut contenir des sauts de ligne. */
    static class Lecteur {
        final byte[] b;
        int p = 0;
        Lecteur(byte[] b) { this.b = b; }

        String ligne() {
            int debut = p;
            while (p < b.length && b[p] != '\n') p++;
            int fin = p;
            if (p < b.length) p++;
            if (fin > debut && b[fin - 1] == '\r') fin--;
            return new String(b, debut, fin - debut, StandardCharsets.UTF_8);
        }

        int nombre() throws ErreurProtocole {
            if (p >= b.length) throw new ErreurProtocole();
            try {
                int n = Integer.parseInt(ligne().trim());
                if (n < 0) throw new ErreurProtocole();
                return n;
            } catch (NumberFormatException e) {
                throw new ErreurProtocole();
            }
        }

        /** null à la fin de l'entrée. */
        List<String> commande() throws ErreurProtocole {
            while (p < b.length && Character.isWhitespace(b[p])) p++;
            if (p >= b.length) return null;
            if (b[p] != '*') {
                // Commande « en ligne » : simplement des mots séparés par des espaces.
                String l = ligne().trim();
                return l.isEmpty() ? List.of() : List.of(l.split("\\s+"));
            }
            p++;
            int n = nombre();
            List<String> args = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                if (p >= b.length || b[p] != '$') throw new ErreurProtocole();
                p++;
                int len = nombre();
                if (p + len > b.length) throw new ErreurProtocole();
                args.add(new String(b, p, len, StandardCharsets.UTF_8));
                p += len;
                if (p < b.length && b[p] == '\r') p++;
                if (p >= b.length || b[p] != '\n') throw new ErreurProtocole();
                p++;
            }
            return args;
        }
    }

    record Entree(String valeur, Long echeance) {}

    static class Serveur {
        final Map<String, Entree> donnees = new HashMap<>();
        long temps = 0;
        List<List<String>> transaction = null;

        /** Supprime la clé si elle a expiré (expiration « paresseuse »). */
        void purger(String k) {
            Entree e = donnees.get(k);
            if (e != null && e.echeance() != null && e.echeance() <= temps) donnees.remove(k);
        }

        static Long positif(String s) {
            try {
                long v = Long.parseLong(s);
                return v >= 0 ? v : null;
            } catch (NumberFormatException e) {
                return null;
            }
        }

        Rep executer(List<String> args) {
            String nom = args.get(0).toLowerCase(Locale.ROOT);
            List<String> a = args.subList(1, args.size());
            Rep mauvais = Rep.erreur("nombre d'arguments incorrect pour '" + nom + "'");
            switch (nom) {
                case "ping": return a.isEmpty() ? Rep.simple("PONG") : a.size() == 1 ? Rep.chaine(a.get(0)) : mauvais;
                case "echo": return a.size() == 1 ? Rep.chaine(a.get(0)) : mauvais;
                case "set": {
                    if (a.size() == 2) { donnees.put(a.get(0), new Entree(a.get(1), null)); return Rep.simple("OK"); }
                    //@@SETPX
                    return mauvais;
                }
                case "get": {
                    if (a.size() != 1) return mauvais;
                    purger(a.get(0));
                    Entree e = donnees.get(a.get(0));
                    return Rep.chaine(e == null ? null : e.valeur());
                }
                case "del": {
                    if (a.isEmpty()) return mauvais;
                    long n = 0;
                    for (String k : a) { purger(k); if (donnees.remove(k) != null) n++; }
                    return Rep.entier(n);
                }
                case "exists": {
                    if (a.size() != 1) return mauvais;
                    purger(a.get(0));
                    return Rep.entier(donnees.containsKey(a.get(0)) ? 1 : 0);
                }
                case "incr": {
                    if (a.size() != 1) return mauvais;
                    purger(a.get(0));
                    Entree e = donnees.getOrDefault(a.get(0), new Entree("0", null));
                    try {
                        long v = Long.parseLong(e.valeur()) + 1;
                        donnees.put(a.get(0), new Entree(String.valueOf(v), e.echeance()));
                        return Rep.entier(v);
                    } catch (NumberFormatException ex) {
                        return Rep.erreur("la valeur n'est pas un entier");
                    }
                }
                //@@ETAPE2
                default: return Rep.erreur("commande inconnue '" + nom + "'");
            }
        }

        //@@TRAITER
    }

    public static void main(String[] args) throws IOException {
        Lecteur lecteur = new Lecteur(System.in.readAllBytes());
        Serveur serveur = new Serveur();
        List<String> out = new ArrayList<>();
        try {
            for (List<String> c; (c = lecteur.commande()) != null;) {
                if (!c.isEmpty()) serveur.traiter(c).afficher(out);
            }
        } catch (ErreurProtocole e) {
            out.add("-ERR protocole");
        }
        out.forEach(System.out::println);
    }
}
'''

R1_JAVA_TRAITER = 'Rep traiter(List<String> args) { return executer(args); }'

R2_JAVA_SETPX = '''                    if (a.size() == 4 && a.get(2).equalsIgnoreCase("px")) {
                        Long ms = positif(a.get(3));
                        if (ms == null) return Rep.erreur("syntaxe");
                        donnees.put(a.get(0), new Entree(a.get(1), temps + ms));
                        return Rep.simple("OK");
                    }
'''

R2_JAVA_ETAPE2 = '''                case "pttl": {
                    if (a.size() != 1) return mauvais;
                    purger(a.get(0));
                    Entree e = donnees.get(a.get(0));
                    return Rep.entier(e == null ? -2 : e.echeance() == null ? -1 : e.echeance() - temps);
                }
                case "avancer": {
                    if (a.size() != 1) return mauvais;
                    Long ms = positif(a.get(0));
                    if (ms == null) return Rep.erreur("syntaxe");
                    temps += ms;
                    return Rep.simple("OK");
                }
'''

R2_JAVA_TRAITER = '''/** Gère les transactions MULTI / EXEC / DISCARD autour de l'exécution. */
        Rep traiter(List<String> args) {
            String nom = args.get(0).toLowerCase(Locale.ROOT);
            boolean enCours = transaction != null;
            switch (nom) {
                case "multi":
                    if (enCours) return Rep.erreur("MULTI imbriqué");
                    transaction = new ArrayList<>();
                    return Rep.simple("OK");
                case "exec", "discard": {
                    if (!enCours) return Rep.erreur(nom.toUpperCase(Locale.ROOT) + " sans MULTI");
                    List<List<String>> file = transaction;
                    transaction = null;
                    if (nom.equals("discard")) return Rep.simple("OK");
                    List<Rep> r = new ArrayList<>();
                    for (List<String> c : file) r.add(executer(c));
                    return Rep.tableau(r);
                }
                default:
                    if (enCours) { transaction.add(args); return Rep.simple("QUEUED"); }
                    return executer(args);
            }
        }'''

R1_JAVA = R_JAVA.replace('                    //@@SETPX\n', '').replace('                //@@ETAPE2\n', '').replace('        //@@TRAITER', '        ' + R1_JAVA_TRAITER)
R2_JAVA = R_JAVA.replace('                    //@@SETPX\n', R2_JAVA_SETPX).replace('                //@@ETAPE2\n', R2_JAVA_ETAPE2).replace('        //@@TRAITER', '        ' + R2_JAVA_TRAITER)


def bulk(*args):
    return '*%d\n' % len(args) + ''.join('$%d\n%s\n' % (len(a.encode()), a) for a in args)


P.append(project(
    'serveur-cle-valeur', 5, 'Serveur réseau : protocole Redis (RESP)',
    'Implémenter le cœur d’un serveur clé-valeur compatible avec le protocole de Redis : analyse binaire, commandes, expiration et transactions.',
    '''
    **Redis** est une base clé-valeur en mémoire utilisée partout (caches, sessions, files de messages). Son protocole, **RESP**, est simple mais précis — tu vas en écrire le cœur.

    Une commande est un **tableau de chaînes préfixées par leur longueur** :

    ```
    *3        ← tableau de 3 éléments
    $3        ← chaîne de 3 octets
    SET
    $3
    nom
    $4
    Kiri
    ```

    La longueur rend le protocole **binaire** : une valeur peut contenir des espaces ou des sauts de ligne. Une commande peut aussi être envoyée « en ligne » : `GET nom`. Les noms de commandes ne sont pas sensibles à la casse.

    Réponses (une valeur par ligne) : `+OK` (simple), `-ERR message` (erreur), `:42` (entier), `$4` puis `Kiri` (chaîne, longueur en octets), `$-1` (absence de valeur), `*N` suivi de N réponses (tableau).

    Tu reçois tout le flux sur l’entrée standard (avec des sauts de ligne `\\n` ; `\\r\\n` est aussi accepté). Si le flux est mal formé, affiche `-ERR protocole` et arrête-toi.
    ''',
    ['Analyser un protocole binaire préfixé par longueurs', 'Concevoir un type somme pour les réponses', 'Gérer un temps logique et l’expiration', 'Implémenter des transactions'],
    ['Lire l’entrée en octets, pas en lignes', 'Aucune dépendance externe', "Erreur d’arité : « nombre d'arguments incorrect pour 'nom' »"],
    [
        step('resp-base', 'Protocole et commandes de base',
             '''
             Commandes :

             | Commande | Réponse |
             |---|---|
             | `PING [msg]` | `+PONG`, ou `msg` en chaîne |
             | `ECHO msg` | `msg` en chaîne |
             | `SET clé valeur` | `+OK` |
             | `GET clé` | la valeur ou `$-1` |
             | `DEL clé…` | `:N` (nombre de clés supprimées) |
             | `EXISTS clé` | `:1` ou `:0` |
             | `INCR clé` | `:N` (une clé absente vaut 0) ; valeur non entière → `-ERR la valeur n'est pas un entier` |

             Mauvais nombre d’arguments → `-ERR nombre d'arguments incorrect pour 'get'` ; commande inconnue → `-ERR commande inconnue 'xyz'` (nom en minuscules).
             ''',
             [T('PING\n' + bulk('PING') + bulk('ECHO', 'hello world') + bulk('SET', 'nom', 'Kiri') + 'GET nom\nGET absent\n' + bulk('set', 'multi', 'a\nb') + 'GET multi\nINCR compteur\nincr compteur\nINCR nom\nDEL nom compteur x\nEXISTS nom\nGET\nFLY me\n*2\n$3\nGET\n$10\nabc\n',
                '+PONG\n+PONG\n$11\nhello world\n+OK\n$4\nKiri\n$-1\n+OK\n$3\na\nb\n:1\n:2\n-ERR la valeur n\'est pas un entier\n:2\n:0\n-ERR nombre d\'arguments incorrect pour \'get\'\n-ERR commande inconnue \'fly\'\n-ERR protocole'),
              T(bulk('ECHO', 'été') + 'PING salut\n*1\n$4\nPINGX', '$5\nété\n$5\nsalut\n-ERR protocole', hidden=True)],
             rust=R1_RUST, cpp=R1_CPP, java=R1_JAVA,
             hints=['Lis TOUTE l’entrée en octets, puis avance un curseur : après « $N », prends exactement N octets.', 'Représente les réponses par un type somme (enum Rust, struct avec un type en C++, record en Java), affiché par une seule fonction.'],
             xp=90),
        step('resp-avance', 'Expiration et transactions',
             '''
             Ajoute :

             - `SET clé valeur PX ms` : la clé expire après `ms` millisecondes (temps **logique**) ; option invalide → `-ERR syntaxe` ;
             - `AVANCER ms` (commande pédagogique) : avance l’horloge logique → `+OK` ;
             - `PTTL clé` → `:ms` restantes, `:-1` sans expiration, `:-2` si absente. Une clé expire quand l’horloge atteint son échéance ; `SET` sans option supprime l’expiration ;
             - `MULTI` → `+OK` : les commandes suivantes sont mises en file (`+QUEUED`) ; `EXEC` exécute la file et répond un **tableau** des réponses ; `DISCARD` → `+OK` abandonne la file. `EXEC`/`DISCARD` sans `MULTI` → `-ERR EXEC sans MULTI` / `-ERR DISCARD sans MULTI` ; `MULTI` imbriqué → `-ERR MULTI imbriqué`.
             ''',
             [T('SET session abc PX 1000\nPTTL session\nAVANCER 400\nPTTL session\nGET session\nAVANCER 600\nGET session\nPTTL session\nSET permanent oui\nPTTL permanent\nMULTI\nSET a 1\nINCR a\nGET a\nEXEC\nEXEC\nMULTI\nSET b 2\nMULTI\nDISCARD\nGET b\nSET x 1 PX abc\nSET x 1 EX 5',
                '+OK\n:1000\n+OK\n:600\n$3\nabc\n+OK\n$-1\n:-2\n+OK\n:-1\n+OK\n+QUEUED\n+QUEUED\n+QUEUED\n*3\n+OK\n:2\n$1\n2\n-ERR EXEC sans MULTI\n+OK\n+QUEUED\n-ERR MULTI imbriqué\n+OK\n$-1\n-ERR syntaxe\n-ERR nombre d\'arguments incorrect pour \'set\''),
              T('SET k v PX 10\nMULTI\nAVANCER 10\nEXISTS k\nEXEC\nDISCARD\nSET k w PX 5\nSET k z\nAVANCER 100\nGET k', '+OK\n+OK\n+QUEUED\n+QUEUED\n*2\n+OK\n:0\n-ERR DISCARD sans MULTI\n+OK\n+OK\n+OK\n$1\nz', hidden=True)],
             rust=R2_RUST, cpp=R2_CPP, java=R2_JAVA,
             hints=['Stocke avec chaque valeur son échéance optionnelle, et supprime la clé « paresseusement » quand on y accède.', 'Une transaction est simplement une liste de commandes mise de côté puis exécutée d’un bloc.'],
             xp=100),
    ]))

# ====================================================================== Moteur de stockage
DB_RUST = r'''
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufRead, BufReader, Seek, SeekFrom, Write};
use std::path::PathBuf;

/// Somme de contrôle FNV-1a 32 bits.
fn fnv(s: &[u8]) -> u32 {
    let mut h: u32 = 2166136261;
    for &b in s {
        h ^= b as u32;
        h = h.wrapping_mul(16777619);
    }
    h
}

/// Moteur « log-structured » : le journal n'est jamais modifié, seulement complété.
/// L'index en mémoire associe chaque clé à la position de son dernier enregistrement.
struct Moteur {
    journal: PathBuf,
    index: BTreeMap<String, u64>,
}

impl Moteur {
    fn taille(&self) -> u64 {
        fs::metadata(&self.journal).map(|m| m.len()).unwrap_or(0)
    }

    fn ecrire(&self, payload: &str) -> u64 {
        let position = self.taille();
        let mut f = OpenOptions::new().create(true).append(true).open(&self.journal).unwrap();
        write!(f, "{}\t{:08x}\n", payload, fnv(payload.as_bytes())).unwrap();
        position
    }

    /// Lit la valeur de l'enregistrement « PUT clé valeur crc » situé à cette position.
    fn lire(&self, position: u64) -> String {
        let mut f = File::open(&self.journal).unwrap();
        f.seek(SeekFrom::Start(position)).unwrap();
        let mut l = String::new();
        BufReader::new(f).read_line(&mut l).unwrap();
        let l = l.trim_end_matches('\n');
        let sans_crc = &l[..l.rfind('\t').unwrap()];
        sans_crc.splitn(3, '\t').nth(2).unwrap().to_string()
    }

    fn enregistrements(&self) -> usize {
        fs::read(&self.journal).unwrap_or_default().iter().filter(|&&b| b == b'\n').count()
    }

    //@@RECONSTRUIRE

    fn executer(&mut self, ligne: &str) -> Option<String> {
        let p: Vec<&str> = ligne.trim().splitn(3, ' ').collect();
        let arg = p.get(1).copied().unwrap_or("");
        Some(match p[0] {
            "put" => {
                let position = self.ecrire(&format!("PUT\t{}\t{}", arg, p.get(2).copied().unwrap_or("")));
                self.index.insert(arg.to_string(), position);
                "OK".into()
            }
            "get" => self.index.get(arg).map_or("(absent)".into(), |&pos| self.lire(pos)),
            "del" => {
                if self.index.remove(arg).is_none() {
                    return Some("(absent)".into());
                }
                self.ecrire(&format!("DEL\t{}", arg));
                "OK".into()
            }
            "redemarrer" => self.reconstruire(),
            "stats" => format!("clés : {}, enregistrements : {}, journal : {} octet(s)", self.index.len(), self.enregistrements(), self.taille()),
            //@@ETAPE2
            _ => return None,
        })
    }
}

fn main() {
    let dossier = std::env::temp_dir().join(format!("codemori-moteur-{}", std::process::id()));
    fs::create_dir_all(&dossier).unwrap();
    let mut moteur = Moteur { journal: dossier.join("journal.log"), index: BTreeMap::new() };
    for ligne in io::stdin().lock().lines() {
        if let Some(r) = moteur.executer(&ligne.unwrap()) {
            println!("{}", r);
        }
    }
    fs::remove_dir_all(&dossier).ok();
}
'''

DB1_RUST_RECONS = r'''/// Simule un redémarrage : l'index est perdu, on le reconstruit en relisant le journal.
    fn reconstruire(&mut self) -> String {
        self.index.clear();
        let contenu = fs::read(&self.journal).unwrap_or_default();
        let mut position = 0u64;
        for ligne in contenu.split_inclusive(|&b| b == b'\n') {
            let s = String::from_utf8_lossy(ligne);
            let c: Vec<&str> = s.trim_end_matches('\n').split('\t').collect();
            match c[0] {
                "PUT" => {
                    self.index.insert(c[1].to_string(), position);
                }
                "DEL" => {
                    self.index.remove(c[1]);
                }
                _ => {}
            }
            position += ligne.len() as u64;
        }
        format!("index reconstruit : {} clé(s)", self.index.len())
    }'''

DB2_RUST_RECONS = r'''/// Vérifie un enregistrement complet (avec son « \n ») ; renvoie (type, clé).
    fn valider(ligne: &[u8]) -> Option<(String, String)> {
        let s = std::str::from_utf8(ligne.strip_suffix(b"\n")?).ok()?;
        let (payload, crc) = s.rsplit_once('\t')?;
        if u32::from_str_radix(crc, 16).ok()? != fnv(payload.as_bytes()) || crc.len() != 8 {
            return None;
        }
        let c: Vec<&str> = payload.splitn(3, '\t').collect();
        match (c[0], c.len()) {
            ("PUT", 3) | ("DEL", 2) => Some((c[0].to_string(), c[1].to_string())),
            _ => None,
        }
    }

    /// Simule un redémarrage : relit le journal, s'arrête au premier enregistrement invalide
    /// (écriture interrompue par un crash) et tronque le journal à cet endroit.
    fn reconstruire(&mut self) -> String {
        self.index.clear();
        let contenu = fs::read(&self.journal).unwrap_or_default();
        let mut position = 0u64;
        for ligne in contenu.split_inclusive(|&b| b == b'\n') {
            let Some((t, cle)) = Moteur::valider(ligne) else { break };
            if t == "PUT" {
                self.index.insert(cle, position);
            } else {
                self.index.remove(&cle);
            }
            position += ligne.len() as u64;
        }
        let perdus = contenu.len() as u64 - position;
        let mut r = format!("index reconstruit : {} clé(s)", self.index.len());
        if perdus > 0 {
            OpenOptions::new().write(true).open(&self.journal).unwrap().set_len(position).unwrap();
            r += &format!(", {} octet(s) corrompu(s) supprimé(s)", perdus);
        }
        r
    }'''

DB2_RUST_ETAPE2 = r'''            "compacter" => {
                // On réécrit seulement les valeurs vivantes dans un fichier temporaire,
                // puis on le renomme : le remplacement est atomique.
                let avant = self.enregistrements();
                let tmp = self.journal.with_extension("tmp");
                let mut f = File::create(&tmp).unwrap();
                let mut nouvel_index = BTreeMap::new();
                let mut position = 0u64;
                for (cle, &pos) in &self.index {
                    let payload = format!("PUT\t{}\t{}", cle, self.lire(pos));
                    let ligne = format!("{}\t{:08x}\n", payload, fnv(payload.as_bytes()));
                    f.write_all(ligne.as_bytes()).unwrap();
                    nouvel_index.insert(cle.clone(), position);
                    position += ligne.len() as u64;
                }
                drop(f);
                fs::rename(&tmp, &self.journal).unwrap();
                self.index = nouvel_index;
                format!("compactage : {} → {} enregistrement(s)", avant, self.index.len())
            }
            "corrompre" => {
                let n = arg.parse::<u64>().unwrap_or(0).min(self.taille());
                let nouvelle = self.taille() - n;
                OpenOptions::new().write(true).open(&self.journal).unwrap().set_len(nouvelle).unwrap();
                format!("journal tronqué de {} octet(s)", n)
            }
'''

DB1_RUST = DB_RUST.replace('    //@@RECONSTRUIRE', '    ' + DB1_RUST_RECONS).replace('            //@@ETAPE2\n', '')
DB2_RUST = DB_RUST.replace('    //@@RECONSTRUIRE', '    ' + DB2_RUST_RECONS).replace('            //@@ETAPE2\n', DB2_RUST_ETAPE2)

DB_CPP = r'''
#include <cstdint>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <unistd.h>
using namespace std;
namespace fs = std::filesystem;

// Somme de contrôle FNV-1a 32 bits.
uint32_t fnv(const string& s) {
    uint32_t h = 2166136261u;
    for (unsigned char b : s) {
        h ^= b;
        h *= 16777619u;
    }
    return h;
}

string enregistrement(const string& payload) {
    char crc[16];
    snprintf(crc, sizeof crc, "%08x", fnv(payload));
    return payload + "\t" + crc + "\n";
}

// Moteur « log-structured » : le journal n'est jamais modifié, seulement complété.
// L'index en mémoire associe chaque clé à la position de son dernier enregistrement.
struct Moteur {
    fs::path journal;
    map<string, uint64_t> index;

    uint64_t taille() const { return fs::exists(journal) ? fs::file_size(journal) : 0; }

    uint64_t ecrire(const string& payload) {
        uint64_t position = taille();
        ofstream(journal, ios::app | ios::binary) << enregistrement(payload);
        return position;
    }

    string contenu() const {
        ifstream f(journal, ios::binary);
        return string(istreambuf_iterator<char>(f), istreambuf_iterator<char>());
    }

    // Lit la valeur de l'enregistrement « PUT clé valeur crc » situé à cette position.
    string lire(uint64_t position) const {
        ifstream f(journal, ios::binary);
        f.seekg(position);
        string l;
        getline(f, l);
        l = l.substr(0, l.rfind('\t'));
        size_t a = l.find('\t'), b = l.find('\t', a + 1);
        return l.substr(b + 1);
    }

    size_t enregistrements() const {
        string c = contenu();
        size_t n = 0;
        for (char ch : c) n += ch == '\n';
        return n;
    }

    //@@RECONSTRUIRE

    optional<string> executer(const string& ligne) {
        istringstream in(ligne);
        string cmd, arg, reste;
        in >> cmd >> arg;
        getline(in >> ws, reste);
        if (cmd == "put") {
            index[arg] = ecrire("PUT\t" + arg + "\t" + reste);
            return "OK";
        }
        if (cmd == "get") {
            auto it = index.find(arg);
            return it == index.end() ? "(absent)" : lire(it->second);
        }
        if (cmd == "del") {
            if (!index.erase(arg)) return "(absent)";
            ecrire("DEL\t" + arg);
            return "OK";
        }
        if (cmd == "redemarrer") return reconstruire();
        if (cmd == "stats")
            return "clés : " + to_string(index.size()) + ", enregistrements : " + to_string(enregistrements()) + ", journal : " + to_string(taille()) + " octet(s)";
        //@@ETAPE2
        return nullopt;
    }
};

int main() {
    fs::path dossier = fs::temp_directory_path() / ("codemori-moteur-" + to_string(getpid()));
    fs::create_directories(dossier);
    Moteur moteur{dossier / "journal.log"};
    string ligne;
    while (getline(cin, ligne))
        if (auto r = moteur.executer(ligne)) cout << *r << "\n";
    fs::remove_all(dossier);
}
'''

DB1_CPP_RECONS = r'''// Simule un redémarrage : l'index est perdu, on le reconstruit en relisant le journal.
    string reconstruire() {
        index.clear();
        istringstream in(contenu());
        uint64_t position = 0;
        for (string l; getline(in, l);) {
            istringstream ls(l);
            string type, cle;
            getline(ls, type, '\t');
            getline(ls, cle, '\t');
            if (type == "PUT") index[cle] = position;
            else if (type == "DEL") index.erase(cle);
            position += l.size() + 1;
        }
        return "index reconstruit : " + to_string(index.size()) + " clé(s)";
    }'''

DB2_CPP_RECONS = r'''// Vérifie un enregistrement complet (avec son « \n ») ; renvoie (type, clé).
    static optional<pair<string, string>> valider(const string& l) {
        if (l.empty() || l.back() != '\n') return nullopt;
        string s = l.substr(0, l.size() - 1);
        size_t t = s.rfind('\t');
        if (t == string::npos) return nullopt;
        string payload = s.substr(0, t), crc = s.substr(t + 1);
        char attendu[16];
        snprintf(attendu, sizeof attendu, "%08x", fnv(payload));
        if (crc != attendu) return nullopt;
        size_t a = payload.find('\t');
        if (a == string::npos) return nullopt;
        string type = payload.substr(0, a);
        size_t b = payload.find('\t', a + 1);
        if (type == "PUT" && b != string::npos) return pair{type, payload.substr(a + 1, b - a - 1)};
        if (type == "DEL" && b == string::npos) return pair{type, payload.substr(a + 1)};
        return nullopt;
    }

    // Simule un redémarrage : relit le journal, s'arrête au premier enregistrement invalide
    // (écriture interrompue par un crash) et tronque le journal à cet endroit.
    string reconstruire() {
        index.clear();
        string c = contenu();
        uint64_t position = 0;
        while (position < c.size()) {
            size_t fin = c.find('\n', position);
            string l = c.substr(position, fin == string::npos ? string::npos : fin - position + 1);
            auto v = valider(l);
            if (!v) break;
            if (v->first == "PUT") index[v->second] = position;
            else index.erase(v->second);
            position += l.size();
        }
        uint64_t perdus = c.size() - position;
        string r = "index reconstruit : " + to_string(index.size()) + " clé(s)";
        if (perdus > 0) {
            fs::resize_file(journal, position);
            r += ", " + to_string(perdus) + " octet(s) corrompu(s) supprimé(s)";
        }
        return r;
    }'''

DB2_CPP_ETAPE2 = r'''        if (cmd == "compacter") {
            // On réécrit seulement les valeurs vivantes dans un fichier temporaire,
            // puis on le renomme : le remplacement est atomique.
            size_t avant = enregistrements();
            fs::path tmp = journal;
            tmp.replace_extension(".tmp");
            map<string, uint64_t> nouvelIndex;
            {
                ofstream f(tmp, ios::binary);
                uint64_t position = 0;
                for (auto& [cle, pos] : index) {
                    string e = enregistrement("PUT\t" + cle + "\t" + lire(pos));
                    f << e;
                    nouvelIndex[cle] = position;
                    position += e.size();
                }
            }
            fs::rename(tmp, journal);
            index = nouvelIndex;
            return "compactage : " + to_string(avant) + " → " + to_string(index.size()) + " enregistrement(s)";
        }
        if (cmd == "corrompre") {
            uint64_t n = min<uint64_t>(stoull(arg), taille());
            fs::resize_file(journal, taille() - n);
            return "journal tronqué de " + to_string(n) + " octet(s)";
        }
'''

DB1_CPP = DB_CPP.replace('    //@@RECONSTRUIRE', '    ' + DB1_CPP_RECONS).replace('        //@@ETAPE2\n', '')
DB2_CPP = DB_CPP.replace('    //@@RECONSTRUIRE', '    ' + DB2_CPP_RECONS).replace('        //@@ETAPE2\n', DB2_CPP_ETAPE2)

DB_JAVA = r'''
import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class Main {
    /** Somme de contrôle FNV-1a 32 bits. */
    static int fnv(byte[] s) {
        int h = 0x811c9dc5;
        for (byte b : s) {
            h ^= (b & 0xff);
            h *= 16777619;
        }
        return h;
    }

    static byte[] enregistrement(String payload) {
        byte[] p = payload.getBytes(StandardCharsets.UTF_8);
        return (payload + "\t" + String.format("%08x", fnv(p)) + "\n").getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Moteur « log-structured » : le journal n'est jamais modifié, seulement complété.
     * L'index en mémoire associe chaque clé à la position de son dernier enregistrement.
     */
    static class Moteur {
        final Path journal;
        TreeMap<String, Long> index = new TreeMap<>();
        Moteur(Path journal) { this.journal = journal; }

        long taille() throws IOException { return Files.exists(journal) ? Files.size(journal) : 0; }

        long ecrire(String payload) throws IOException {
            long position = taille();
            Files.write(journal, enregistrement(payload), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            return position;
        }

        byte[] contenu() throws IOException { return Files.exists(journal) ? Files.readAllBytes(journal) : new byte[0]; }

        /** Lit la valeur de l'enregistrement « PUT clé valeur crc » situé à cette position. */
        String lire(long position) throws IOException {
            try (RandomAccessFile f = new RandomAccessFile(journal.toFile(), "r")) {
                f.seek(position);
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                for (int b; (b = f.read()) != -1 && b != '\n';) buf.write(b);
                String l = buf.toString(StandardCharsets.UTF_8);
                return l.substring(0, l.lastIndexOf('\t')).split("\t", 3)[2];
            }
        }

        long enregistrements() throws IOException {
            long n = 0;
            for (byte b : contenu()) if (b == '\n') n++;
            return n;
        }

        void tronquer(long longueur) throws IOException {
            try (FileChannel ch = FileChannel.open(journal, StandardOpenOption.WRITE)) { ch.truncate(longueur); }
        }

        //@@RECONSTRUIRE

        String executer(String ligne) throws IOException {
            String[] p = ligne.trim().split(" ", 3);
            String arg = p.length > 1 ? p[1] : "";
            switch (p[0]) {
                case "put":
                    index.put(arg, ecrire("PUT\t" + arg + "\t" + (p.length > 2 ? p[2] : "")));
                    return "OK";
                case "get": {
                    Long pos = index.get(arg);
                    return pos == null ? "(absent)" : lire(pos);
                }
                case "del":
                    if (index.remove(arg) == null) return "(absent)";
                    ecrire("DEL\t" + arg);
                    return "OK";
                case "redemarrer": return reconstruire();
                case "stats": return "clés : " + index.size() + ", enregistrements : " + enregistrements() + ", journal : " + taille() + " octet(s)";
                //@@ETAPE2
                default: return null;
            }
        }
    }

    public static void main(String[] args) throws IOException {
        Path dossier = Files.createTempDirectory("codemori-moteur-");
        Moteur moteur = new Moteur(dossier.resolve("journal.log"));
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            String r = moteur.executer(sc.nextLine());
            if (r != null) System.out.println(r);
        }
        try (var s = Files.list(dossier)) { for (Path f : s.toList()) Files.delete(f); }
        Files.delete(dossier);
    }
}
'''

DB1_JAVA_RECONS = r'''/** Simule un redémarrage : l'index est perdu, on le reconstruit en relisant le journal. */
        String reconstruire() throws IOException {
            index.clear();
            long position = 0;
            for (String l : new String(contenu(), StandardCharsets.UTF_8).split("\n")) {
                if (l.isEmpty()) continue;
                String[] c = l.split("\t");
                if (c[0].equals("PUT")) index.put(c[1], position);
                else if (c[0].equals("DEL")) index.remove(c[1]);
                position += l.getBytes(StandardCharsets.UTF_8).length + 1;
            }
            return "index reconstruit : " + index.size() + " clé(s)";
        }'''

DB2_JAVA_RECONS = r'''/** Vérifie un enregistrement complet (sans son « \n ») ; renvoie {type, clé} ou null. */
        static String[] valider(byte[] c, int debut, int fin) {
            String s = new String(c, debut, fin - debut, StandardCharsets.UTF_8);
            int t = s.lastIndexOf('\t');
            if (t < 0) return null;
            String payload = s.substring(0, t), crc = s.substring(t + 1);
            if (!crc.equals(String.format("%08x", fnv(payload.getBytes(StandardCharsets.UTF_8))))) return null;
            String[] p = payload.split("\t", 3);
            if ((p[0].equals("PUT") && p.length == 3) || (p[0].equals("DEL") && p.length == 2)) return new String[]{p[0], p[1]};
            return null;
        }

        /**
         * Simule un redémarrage : relit le journal, s'arrête au premier enregistrement invalide
         * (écriture interrompue par un crash) et tronque le journal à cet endroit.
         */
        String reconstruire() throws IOException {
            index.clear();
            byte[] c = contenu();
            int position = 0;
            while (position < c.length) {
                int fin = position;
                while (fin < c.length && c[fin] != '\n') fin++;
                if (fin == c.length) break; // enregistrement incomplet
                String[] v = valider(c, position, fin);
                if (v == null) break;
                if (v[0].equals("PUT")) index.put(v[1], (long) position);
                else index.remove(v[1]);
                position = fin + 1;
            }
            long perdus = c.length - position;
            String r = "index reconstruit : " + index.size() + " clé(s)";
            if (perdus > 0) {
                tronquer(position);
                r += ", " + perdus + " octet(s) corrompu(s) supprimé(s)";
            }
            return r;
        }'''

DB2_JAVA_ETAPE2 = r'''                case "compacter": {
                    // On réécrit seulement les valeurs vivantes dans un fichier temporaire,
                    // puis on le renomme : le remplacement est atomique.
                    long avant = enregistrements();
                    Path tmp = journal.resolveSibling("journal.tmp");
                    TreeMap<String, Long> nouvelIndex = new TreeMap<>();
                    try (OutputStream out = Files.newOutputStream(tmp)) {
                        long position = 0;
                        for (var e : index.entrySet()) {
                            byte[] b = enregistrement("PUT\t" + e.getKey() + "\t" + lire(e.getValue()));
                            out.write(b);
                            nouvelIndex.put(e.getKey(), position);
                            position += b.length;
                        }
                    }
                    Files.move(tmp, journal, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
                    index = nouvelIndex;
                    return "compactage : " + avant + " → " + index.size() + " enregistrement(s)";
                }
                case "corrompre": {
                    long n = Math.min(Long.parseLong(arg), taille());
                    tronquer(taille() - n);
                    return "journal tronqué de " + n + " octet(s)";
                }
'''

DB1_JAVA = DB_JAVA.replace('        //@@RECONSTRUIRE', '        ' + DB1_JAVA_RECONS).replace('                //@@ETAPE2\n', '')
DB2_JAVA = DB_JAVA.replace('        //@@RECONSTRUIRE', '        ' + DB2_JAVA_RECONS).replace('                //@@ETAPE2\n', DB2_JAVA_ETAPE2)


def rec(payload):
    h = 2166136261
    for b in payload.encode():
        h ^= b
        h = (h * 16777619) % 2 ** 32
    return len(f'{payload}\t{h:08x}\n'.encode())


L1 = sum(rec(x) for x in ['PUT\tlangage\tRust', 'PUT\tmascotte\tKiri', 'PUT\tlangage\tRust 2024', 'DEL\tmascotte'])
L2 = L1 + rec('PUT\tnote\t20/20')
C1 = rec('PUT\ta\t3') + rec('PUT\tc\t4')
D = rec('PUT\td\t5')

P.append(project(
    'moteur-stockage', 5, 'Base de données : moteur de stockage',
    'Écrire le moteur de stockage d’une base clé-valeur persistante : journal append-only, index, redémarrage, compactage et reprise après crash.',
    '''
    Comment une base de données garde-t-elle ses données sur disque, rapidement et sans les perdre en cas de panne ? Tu vas écrire un moteur **log-structured** (à la manière de Bitcask, ou du WAL de PostgreSQL) :

    - chaque écriture **ajoute** un enregistrement à la fin d’un **journal** (le fichier n’est jamais modifié au milieu : c’est rapide et sûr) ;
    - un **index** en mémoire associe chaque clé à la **position** (en octets) de son dernier enregistrement ; lire une valeur = un accès direct (`seek`) dans le fichier.

    Format d’un enregistrement (une ligne) : `PUT⇥clé⇥valeur⇥crc` ou `DEL⇥clé⇥crc` (⇥ = tabulation). Le `crc` est la somme de contrôle **FNV-1a 32 bits** de ce qui précède la dernière tabulation, en 8 chiffres hexadécimaux minuscules :

    ```
    h = 2166136261
    pour chaque octet b : h = (h XOR b) × 16777619   (modulo 2³²)
    ```

    Le journal se trouve dans un dossier temporaire créé au démarrage. Les clés sont des mots ; les valeurs peuvent contenir des espaces (pas de tabulation).
    ''',
    ['Persister des données dans un fichier en ajout seul', 'Maintenir un index de positions et lire par accès direct', 'Détecter des corruptions avec une somme de contrôle', 'Compacter et remplacer un fichier de façon atomique'],
    ['Ne jamais réécrire le journal en place (sauf troncature après crash)', 'Compactage via fichier temporaire + renommage', 'Clés affichées et compactées dans l’ordre alphabétique'],
    [
        step('moteur-journal', 'Journal et index',
             '''
             Commandes :

             - `put clé valeur…` → `OK` ; `get clé` → la valeur ou `(absent)` ; `del clé` → `OK` (écrit un enregistrement `DEL`) ou `(absent)` ;
             - `stats` → `clés : N, enregistrements : R, journal : B octet(s)` ;
             - `redemarrer` → oublie l’index puis le **reconstruit** en relisant le journal : `index reconstruit : N clé(s)`.
             ''',
             [T('put langage Rust\nput mascotte Kiri\nget langage\nput langage Rust 2024\nget langage\ndel mascotte\ndel mascotte\nget mascotte\nstats\nredemarrer\nget langage\nput note 20/20\nredemarrer\nget note\nstats',
                f'OK\nOK\nRust\nOK\nRust 2024\nOK\n(absent)\n(absent)\nclés : 1, enregistrements : 4, journal : {L1} octet(s)\nindex reconstruit : 1 clé(s)\nRust 2024\nOK\nindex reconstruit : 2 clé(s)\n20/20\nclés : 2, enregistrements : 5, journal : {L2} octet(s)'),
              T('get x\nstats\nredemarrer', '(absent)\nclés : 0, enregistrements : 0, journal : 0 octet(s)\nindex reconstruit : 0 clé(s)', hidden=True)],
             rust=DB1_RUST, cpp=DB1_CPP, java=DB1_JAVA,
             hints=['Avant d’écrire, note la taille actuelle du fichier : c’est la position du nouvel enregistrement.', 'Pour reconstruire, parcours le journal en additionnant la longueur de chaque ligne (« \\n » compris).'],
             xp=90),
        step('moteur-robuste', 'Compactage et reprise après crash',
             '''
             Ajoute :

             - `compacter` → réécrit le journal avec **une seule** entrée `PUT` par clé vivante (ordre alphabétique), dans un fichier temporaire **renommé** ensuite par-dessus le journal : `compactage : R → N enregistrement(s)` ;
             - `corrompre n` (commande de test) → tronque les `n` derniers octets du journal, comme une écriture interrompue par une coupure de courant : `journal tronqué de n octet(s)` ;
             - `redemarrer` vérifie désormais chaque enregistrement (ligne complète, format, **crc**) : il s’arrête au premier invalide, **tronque** le journal à cet endroit et ajoute `, B octet(s) corrompu(s) supprimé(s)` au message.
             ''',
             [T('put a 1\nput b 2\nput a 3\ndel b\nput c 4\ncompacter\nstats\nget a\nput d 5\ncorrompre 4\nredemarrer\nget d\nget c\nstats\nput d 6\nredemarrer\nget d',
                f'OK\nOK\nOK\nOK\nOK\ncompactage : 5 → 2 enregistrement(s)\nclés : 2, enregistrements : 2, journal : {C1} octet(s)\n3\nOK\njournal tronqué de 4 octet(s)\nindex reconstruit : 2 clé(s), {D - 4} octet(s) corrompu(s) supprimé(s)\n(absent)\n4\nclés : 2, enregistrements : 2, journal : {C1} octet(s)\nOK\nindex reconstruit : 3 clé(s)\n6'),
              T('put k v\ncorrompre 1000\nredemarrer\nget k\ncompacter\nstats', 'OK\njournal tronqué de %d octet(s)\nindex reconstruit : 0 clé(s)\n(absent)\ncompactage : 0 → 0 enregistrement(s)\nclés : 0, enregistrements : 0, journal : 0 octet(s)' % rec('PUT\tk\tv'), hidden=True)],
             rust=DB2_RUST, cpp=DB2_CPP, java=DB2_JAVA,
             hints=['Pendant le compactage, calcule directement les nouvelles positions au fur et à mesure de l’écriture.', 'Un enregistrement sans « \\n » final ou dont le crc ne correspond pas marque la fin des données sûres.'],
             xp=100),
    ]))

# ====================================================================== Projet open source : outil diff
DIFF_RUST = r'''
use std::io::{self, BufRead};

#[derive(Clone, Copy, PartialEq)]
enum Op {
    Egal,
    Suppr,
    Ajout,
}

/// Script d'édition minimal par plus longue sous-séquence commune (LCS).
/// À égalité, on préfère supprimer avant d'ajouter (comme GNU diff).
fn script<'a>(a: &'a [String], b: &'a [String]) -> Vec<(Op, &'a str)> {
    let (n, m) = (a.len(), b.len());
    let mut l = vec![vec![0usize; m + 1]; n + 1];
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            l[i][j] = if a[i] == b[j] { l[i + 1][j + 1] + 1 } else { l[i + 1][j].max(l[i][j + 1]) };
        }
    }
    let (mut i, mut j, mut ops) = (0, 0, vec![]);
    while i < n || j < m {
        if i < n && j < m && a[i] == b[j] {
            ops.push((Op::Egal, a[i].as_str()));
            i += 1;
            j += 1;
        } else if i < n && (j == m || l[i + 1][j] >= l[i][j + 1]) {
            ops.push((Op::Suppr, a[i].as_str()));
            i += 1;
        } else {
            ops.push((Op::Ajout, b[j].as_str()));
            j += 1;
        }
    }
    ops
}

//@@SORTIE

fn main() {
    let (mut a, mut b, mut second) = (vec![], vec![], false);
    for l in io::stdin().lock().lines() {
        let l = l.unwrap();
        if l == "=====" {
            second = true;
        } else if second {
            b.push(l);
        } else {
            a.push(l);
        }
    }
    let ops = script(&a, &b);
    let ajouts = ops.iter().filter(|o| o.0 == Op::Ajout).count();
    let suppr = ops.iter().filter(|o| o.0 == Op::Suppr).count();
    if ajouts + suppr == 0 {
        println!("fichiers identiques");
        return;
    }
    afficher(&ops);
    println!("{} ajout(s), {} suppression(s)", ajouts, suppr);
}
'''

DIFF1_RUST_SORTIE = '''fn afficher(ops: &[(Op, &str)]) {
    for (op, ligne) in ops {
        let p = match op {
            Op::Egal => "  ",
            Op::Suppr => "- ",
            Op::Ajout => "+ ",
        };
        println!("{}{}", p, ligne);
    }
}'''

DIFF2_RUST_SORTIE = '''const CONTEXTE: usize = 1;

/// Format unifié : des « blocs » de changements entourés de CONTEXTE lignes inchangées.
fn afficher(ops: &[(Op, &str)]) {
    // Intervalles [début, fin] (indices dans ops) autour de chaque changement, fusionnés s'ils se touchent.
    let mut blocs: Vec<(usize, usize)> = vec![];
    for (k, o) in ops.iter().enumerate() {
        if o.0 == Op::Egal {
            continue;
        }
        let (d, f) = (k.saturating_sub(CONTEXTE), (k + CONTEXTE).min(ops.len() - 1));
        match blocs.last_mut() {
            Some(b) if d <= b.1 + 1 => b.1 = b.1.max(f),
            _ => blocs.push((d, f)),
        }
    }
    println!("--- a");
    println!("+++ b");
    for (d, f) in blocs {
        let avant_a = ops[..d].iter().filter(|o| o.0 != Op::Ajout).count();
        let avant_b = ops[..d].iter().filter(|o| o.0 != Op::Suppr).count();
        let na = ops[d..=f].iter().filter(|o| o.0 != Op::Ajout).count();
        let nb = ops[d..=f].iter().filter(|o| o.0 != Op::Suppr).count();
        // Convention : un bloc vide commence à la ligne qui précède.
        let sa = if na == 0 { avant_a } else { avant_a + 1 };
        let sb = if nb == 0 { avant_b } else { avant_b + 1 };
        println!("@@ -{},{} +{},{} @@", sa, na, sb, nb);
        for (op, ligne) in &ops[d..=f] {
            let p = match op {
                Op::Egal => ' ',
                Op::Suppr => '-',
                Op::Ajout => '+',
            };
            println!("{}{}", p, ligne);
        }
    }
}'''

DIFF1_RUST = DIFF_RUST.replace('//@@SORTIE', DIFF1_RUST_SORTIE)
DIFF2_RUST = DIFF_RUST.replace('//@@SORTIE', DIFF2_RUST_SORTIE)

DIFF_CPP = r'''
#include <algorithm>
#include <iostream>
#include <string>
#include <vector>
using namespace std;

enum class Op { Egal, Suppr, Ajout };

// Script d'édition minimal par plus longue sous-séquence commune (LCS).
// À égalité, on préfère supprimer avant d'ajouter (comme GNU diff).
vector<pair<Op, string>> script(const vector<string>& a, const vector<string>& b) {
    size_t n = a.size(), m = b.size();
    vector<vector<int>> l(n + 1, vector<int>(m + 1, 0));
    for (size_t i = n; i-- > 0;)
        for (size_t j = m; j-- > 0;) l[i][j] = a[i] == b[j] ? l[i + 1][j + 1] + 1 : max(l[i + 1][j], l[i][j + 1]);
    vector<pair<Op, string>> ops;
    size_t i = 0, j = 0;
    while (i < n || j < m) {
        if (i < n && j < m && a[i] == b[j]) { ops.push_back({Op::Egal, a[i]}); i++; j++; }
        else if (i < n && (j == m || l[i + 1][j] >= l[i][j + 1])) { ops.push_back({Op::Suppr, a[i]}); i++; }
        else { ops.push_back({Op::Ajout, b[j]}); j++; }
    }
    return ops;
}

//@@SORTIE

int main() {
    vector<string> a, b;
    bool second = false;
    for (string l; getline(cin, l);) {
        if (l == "=====") second = true;
        else (second ? b : a).push_back(l);
    }
    auto ops = script(a, b);
    auto compte = [&](Op o) { return count_if(ops.begin(), ops.end(), [&](auto& x) { return x.first == o; }); };
    long ajouts = compte(Op::Ajout), suppr = compte(Op::Suppr);
    if (ajouts + suppr == 0) { cout << "fichiers identiques\n"; return 0; }
    afficher(ops);
    cout << ajouts << " ajout(s), " << suppr << " suppression(s)\n";
}
'''

DIFF1_CPP_SORTIE = '''void afficher(const vector<pair<Op, string>>& ops) {
    for (auto& [op, ligne] : ops) cout << (op == Op::Egal ? "  " : op == Op::Suppr ? "- " : "+ ") << ligne << "\\n";
}'''

DIFF2_CPP_SORTIE = '''const size_t CONTEXTE = 1;

// Format unifié : des « blocs » de changements entourés de CONTEXTE lignes inchangées.
void afficher(const vector<pair<Op, string>>& ops) {
    // Intervalles [début, fin] (indices dans ops) autour de chaque changement, fusionnés s'ils se touchent.
    vector<pair<size_t, size_t>> blocs;
    for (size_t k = 0; k < ops.size(); k++) {
        if (ops[k].first == Op::Egal) continue;
        size_t d = k >= CONTEXTE ? k - CONTEXTE : 0, f = min(k + CONTEXTE, ops.size() - 1);
        if (!blocs.empty() && d <= blocs.back().second + 1) blocs.back().second = max(blocs.back().second, f);
        else blocs.push_back({d, f});
    }
    cout << "--- a\\n+++ b\\n";
    for (auto [d, f] : blocs) {
        size_t avantA = 0, avantB = 0, na = 0, nb = 0;
        for (size_t k = 0; k < d; k++) { avantA += ops[k].first != Op::Ajout; avantB += ops[k].first != Op::Suppr; }
        for (size_t k = d; k <= f; k++) { na += ops[k].first != Op::Ajout; nb += ops[k].first != Op::Suppr; }
        // Convention : un bloc vide commence à la ligne qui précède.
        cout << "@@ -" << (na ? avantA + 1 : avantA) << "," << na << " +" << (nb ? avantB + 1 : avantB) << "," << nb << " @@\\n";
        for (size_t k = d; k <= f; k++) cout << (ops[k].first == Op::Egal ? ' ' : ops[k].first == Op::Suppr ? '-' : '+') << ops[k].second << "\\n";
    }
}'''

DIFF1_CPP = DIFF_CPP.replace('//@@SORTIE', DIFF1_CPP_SORTIE)
DIFF2_CPP = DIFF_CPP.replace('//@@SORTIE', DIFF2_CPP_SORTIE)

DIFF_JAVA = r'''
import java.util.*;

public class Main {
    enum Op { EGAL, SUPPR, AJOUT }

    record Ligne(Op op, String texte) {}

    /**
     * Script d'édition minimal par plus longue sous-séquence commune (LCS).
     * À égalité, on préfère supprimer avant d'ajouter (comme GNU diff).
     */
    static List<Ligne> script(List<String> a, List<String> b) {
        int n = a.size(), m = b.size();
        int[][] l = new int[n + 1][m + 1];
        for (int i = n - 1; i >= 0; i--)
            for (int j = m - 1; j >= 0; j--)
                l[i][j] = a.get(i).equals(b.get(j)) ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
        List<Ligne> ops = new ArrayList<>();
        int i = 0, j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && a.get(i).equals(b.get(j))) { ops.add(new Ligne(Op.EGAL, a.get(i))); i++; j++; }
            else if (i < n && (j == m || l[i + 1][j] >= l[i][j + 1])) { ops.add(new Ligne(Op.SUPPR, a.get(i))); i++; }
            else { ops.add(new Ligne(Op.AJOUT, b.get(j))); j++; }
        }
        return ops;
    }

    //@@SORTIE

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        List<String> a = new ArrayList<>(), b = new ArrayList<>();
        boolean second = false;
        while (sc.hasNextLine()) {
            String l = sc.nextLine();
            if (l.equals("=====")) second = true;
            else (second ? b : a).add(l);
        }
        List<Ligne> ops = script(a, b);
        long ajouts = ops.stream().filter(o -> o.op() == Op.AJOUT).count();
        long suppr = ops.stream().filter(o -> o.op() == Op.SUPPR).count();
        if (ajouts + suppr == 0) { System.out.println("fichiers identiques"); return; }
        afficher(ops);
        System.out.println(ajouts + " ajout(s), " + suppr + " suppression(s)");
    }
}
'''

DIFF1_JAVA_SORTIE = '''static void afficher(List<Ligne> ops) {
        for (Ligne o : ops) System.out.println((o.op() == Op.EGAL ? "  " : o.op() == Op.SUPPR ? "- " : "+ ") + o.texte());
    }'''

DIFF2_JAVA_SORTIE = '''static final int CONTEXTE = 1;

    /** Format unifié : des « blocs » de changements entourés de CONTEXTE lignes inchangées. */
    static void afficher(List<Ligne> ops) {
        // Intervalles [début, fin] (indices dans ops) autour de chaque changement, fusionnés s'ils se touchent.
        List<int[]> blocs = new ArrayList<>();
        for (int k = 0; k < ops.size(); k++) {
            if (ops.get(k).op() == Op.EGAL) continue;
            int d = Math.max(0, k - CONTEXTE), f = Math.min(ops.size() - 1, k + CONTEXTE);
            if (!blocs.isEmpty() && d <= blocs.get(blocs.size() - 1)[1] + 1) {
                int[] der = blocs.get(blocs.size() - 1);
                der[1] = Math.max(der[1], f);
            } else blocs.add(new int[]{d, f});
        }
        System.out.println("--- a");
        System.out.println("+++ b");
        for (int[] bl : blocs) {
            int avantA = 0, avantB = 0, na = 0, nb = 0;
            for (int k = 0; k < bl[0]; k++) { if (ops.get(k).op() != Op.AJOUT) avantA++; if (ops.get(k).op() != Op.SUPPR) avantB++; }
            for (int k = bl[0]; k <= bl[1]; k++) { if (ops.get(k).op() != Op.AJOUT) na++; if (ops.get(k).op() != Op.SUPPR) nb++; }
            // Convention : un bloc vide commence à la ligne qui précède.
            System.out.println("@@ -" + (na > 0 ? avantA + 1 : avantA) + "," + na + " +" + (nb > 0 ? avantB + 1 : avantB) + "," + nb + " @@");
            for (int k = bl[0]; k <= bl[1]; k++) {
                Ligne o = ops.get(k);
                System.out.println((o.op() == Op.EGAL ? " " : o.op() == Op.SUPPR ? "-" : "+") + o.texte());
            }
        }
    }'''

DIFF1_JAVA = DIFF_JAVA.replace('    //@@SORTIE', '    ' + DIFF1_JAVA_SORTIE)
DIFF2_JAVA = DIFF_JAVA.replace('    //@@SORTIE', '    ' + DIFF2_JAVA_SORTIE)

CODE_A = 'fn main() {\n    let x = 1;\n    let y = 2;\n    println!("{}", x + y);\n}'
CODE_B = 'fn main() {\n    let x = 10;\n    let y = 2;\n    let z = 3;\n    println!("{}", x + y + z);\n}'
LIGNES_A = '\n'.join(f'l{i}' for i in range(1, 11))
LIGNES_B = '\n'.join(['l1', 'L2'] + [f'l{i}' for i in range(3, 9)] + ['l10'])

P.append(project(
    'outil-diff', 5, 'Projet open source : un outil diff',
    'Développer un outil comme on contribue à un projet open source : algorithme éprouvé (LCS), format standard (diff unifié), cas limites et tests.',
    '''
    `diff` (et `git diff`) comparent deux fichiers et affichent les changements. C’est un outil **open source** emblématique : tu vas en écrire une version, avec les exigences d’une contribution à un vrai projet — un algorithme correct et documenté, une sortie **conforme à un format standard**, une gestion rigoureuse des cas limites.

    L’entrée contient le premier fichier, une ligne `=====`, puis le second.

    ### L’algorithme

    On cherche la **plus longue sous-séquence commune** (LCS) des lignes, par programmation dynamique : `L[i][j]` = longueur de la LCS des suffixes `a[i..]` et `b[j..]`. On reconstruit ensuite le **script d’édition** en partant du début : lignes égales → inchangées ; sinon on **supprime** `a[i]` si `L[i+1][j] ≥ L[i][j+1]` (on préfère supprimer à égalité), sinon on **ajoute** `b[j]`.

    Si les fichiers sont identiques, affiche seulement `fichiers identiques`. Sinon, termine par `A ajout(s), S suppression(s)`.

    > 💡 Bonnes pratiques open source à appliquer à ton code : un README qui explique l’usage, des fonctions documentées, des tests pour chaque cas limite (fichier vide, fichiers identiques, tout changé) et une licence.
    ''',
    ['Implémenter un algorithme de programmation dynamique (LCS)', 'Respecter un format de sortie standard', 'Traiter les cas limites rigoureusement', 'Écrire du code documenté, prêt pour une contribution'],
    ['Complexité O(n × m) en temps et en mémoire', 'À égalité, la suppression passe avant l’ajout', 'Sortie stable et déterministe'],
    [
        step('diff-lcs', 'Le script d’édition',
             '''
             Affiche chaque ligne du script d’édition préfixée par deux caractères : `  ` (inchangée), `- ` (supprimée) ou `+ ` (ajoutée).
             ''',
             [T(CODE_A + '\n=====\n' + CODE_B, '  fn main() {\n-     let x = 1;\n+     let x = 10;\n      let y = 2;\n-     println!("{}", x + y);\n+     let z = 3;\n+     println!("{}", x + y + z);\n  }\n3 ajout(s), 2 suppression(s)'),
              T('a\nb\n=====\na\nb', 'fichiers identiques', hidden=True),
              T('=====\nnouveau', '+ nouveau\n1 ajout(s), 0 suppression(s)', hidden=True),
              T('x\ny\n=====\ny\nx', '- x\n  y\n+ x\n1 ajout(s), 1 suppression(s)', hidden=True)],
             rust=DIFF1_RUST, cpp=DIFF1_CPP, java=DIFF1_JAVA,
             hints=['Remplis le tableau L de la fin vers le début : L[i][j] dépend de L[i+1][j+1], L[i+1][j] et L[i][j+1].', 'Reconstruis le script en avançant i et j depuis 0 en suivant la règle de l’énoncé.'],
             xp=90),
        step('diff-unifie', 'Le format unifié',
             '''
             Produis le **format unifié** (celui de `git diff`), avec **1 ligne de contexte** :

             ```
             --- a
             +++ b
             @@ -début,longueur +début,longueur @@
              ligne inchangée
             -ligne supprimée
             +ligne ajoutée
             ```

             - chaque changement est entouré d’au plus 1 ligne inchangée avant et après ; les blocs qui se touchent ou se chevauchent sont **fusionnés** ;
             - dans l’en-tête, `début` est le numéro (à partir de 1) de la première ligne du bloc dans chaque fichier et `longueur` son nombre de lignes dans ce fichier ; si la longueur vaut 0, `début` est le numéro de la ligne qui précède ;
             - le préfixe ne fait plus qu’**un** caractère (espace, `-` ou `+`).
             ''',
             [T(CODE_A + '\n=====\n' + CODE_B, '--- a\n+++ b\n@@ -1,5 +1,6 @@\n fn main() {\n-    let x = 1;\n+    let x = 10;\n     let y = 2;\n-    println!("{}", x + y);\n+    let z = 3;\n+    println!("{}", x + y + z);\n }\n3 ajout(s), 2 suppression(s)'),
              T(LIGNES_A + '\n=====\n' + LIGNES_B, '--- a\n+++ b\n@@ -1,3 +1,3 @@\n l1\n-l2\n+L2\n l3\n@@ -8,3 +8,2 @@\n l8\n-l9\n l10\n1 ajout(s), 2 suppression(s)'),
              T('a\nb\nc\n=====\na\nb\nc\nd', '--- a\n+++ b\n@@ -3,1 +3,2 @@\n c\n+d\n1 ajout(s), 0 suppression(s)', hidden=True),
              T('=====\nx', '--- a\n+++ b\n@@ -0,0 +1,1 @@\n+x\n1 ajout(s), 0 suppression(s)', hidden=True)],
             rust=DIFF2_RUST, cpp=DIFF2_CPP, java=DIFF2_JAVA,
             hints=['Calcule pour chaque changement l’intervalle [k − 1, k + 1] dans le script, puis fusionne les intervalles qui se touchent.', 'Pour l’en-tête, compte les lignes de chaque fichier situées avant le bloc (les « + » n’existent pas dans le fichier a, les « - » pas dans b).'],
             xp=100),
    ]))

dump(P, sys.argv[1], 'Projets — niveau expertise (2/2)')
