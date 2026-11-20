import sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from projgen import project, step, T, dump

P = []

# ====================================================================== Mini SQL
SQL_RUST_COMMON = r'''
use std::cmp::Ordering;
use std::collections::HashMap;
use std::io::{self, BufRead};

#[derive(Clone)]
enum Val {
    Int(i64),
    Txt(String),
}

impl Val {
    fn texte(&self) -> String {
        match self {
            Val::Int(n) => n.to_string(),
            Val::Txt(s) => s.clone(),
        }
    }
}

/// Deux entiers se comparent numériquement, sinon on compare les textes.
fn comparer(a: &Val, b: &Val) -> Ordering {
    match (a, b) {
        (Val::Int(x), Val::Int(y)) => x.cmp(y),
        _ => a.texte().cmp(&b.texte()),
    }
}

struct Table {
    cols: Vec<String>,
    lignes: Vec<Vec<Val>>,
}

/// Analyse lexicale : mots, nombres, chaînes 'entre apostrophes' et symboles.
fn lexer(s: &str) -> Vec<String> {
    let c: Vec<char> = s.chars().collect();
    let (mut i, mut t) = (0, Vec::new());
    while i < c.len() {
        let ch = c[i];
        if ch.is_whitespace() {
            i += 1;
        } else if ch == '\'' {
            let mut j = i + 1;
            while j < c.len() && c[j] != '\'' {
                j += 1;
            }
            t.push(c[i..(j + 1).min(c.len())].iter().collect());
            i = j + 1;
        } else if ch.is_alphanumeric() || ch == '_' || (ch == '-' && i + 1 < c.len() && c[i + 1].is_ascii_digit()) {
            let mut j = i + 1;
            while j < c.len() && (c[j].is_alphanumeric() || c[j] == '_') {
                j += 1;
            }
            t.push(c[i..j].iter().collect());
            i = j;
        } else if "<>!".contains(ch) && i + 1 < c.len() && c[i + 1] == '=' {
            t.push(c[i..i + 2].iter().collect());
            i += 2;
        } else {
            t.push(ch.to_string());
            i += 1;
        }
    }
    t
}

struct Lexemes {
    t: Vec<String>,
    i: usize,
}

impl Lexemes {
    fn suivant(&mut self) -> Result<String, String> {
        let r = self.t.get(self.i).cloned().ok_or("syntaxe")?;
        self.i += 1;
        Ok(r)
    }
    /// Consomme le mot-clé (insensible à la casse) s'il est présent.
    fn mot_cle(&mut self, k: &str) -> bool {
        if self.t.get(self.i).map_or(false, |x| x.eq_ignore_ascii_case(k)) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn attendre(&mut self, k: &str) -> Result<(), String> {
        if self.mot_cle(k) { Ok(()) } else { Err("syntaxe".into()) }
    }
    fn ident(&mut self) -> Result<String, String> {
        let s = self.suivant()?;
        if s.chars().next().map_or(false, |c| c.is_alphabetic() || c == '_') { Ok(s) } else { Err("syntaxe".into()) }
    }
    fn valeur(&mut self) -> Result<Val, String> {
        let s = self.suivant()?;
        if s.len() >= 2 && s.starts_with('\'') && s.ends_with('\'') {
            return Ok(Val::Txt(s[1..s.len() - 1].to_string()));
        }
        s.parse().map(Val::Int).map_err(|_| "syntaxe".to_string())
    }
    fn liste<T>(&mut self, mut f: impl FnMut(&mut Self) -> Result<T, String>) -> Result<Vec<T>, String> {
        self.attendre("(")?;
        let mut v = vec![f(self)?];
        while self.mot_cle(",") {
            v.push(f(self)?);
        }
        self.attendre(")")?;
        Ok(v)
    }
    fn fin(&mut self) -> Result<(), String> {
        self.mot_cle(";");
        if self.i == self.t.len() { Ok(()) } else { Err("syntaxe".into()) }
    }
}

fn creer_ou_inserer(tables: &mut HashMap<String, Table>, lx: &mut Lexemes) -> Option<Result<String, String>> {
    if lx.mot_cle("CREATE") {
        return Some((|| {
            lx.attendre("TABLE")?;
            let nom = lx.ident()?;
            let cols = lx.liste(|l| l.ident())?;
            lx.fin()?;
            if tables.contains_key(&nom) {
                return Err(format!("la table {} existe déjà", nom));
            }
            tables.insert(nom.clone(), Table { cols, lignes: vec![] });
            Ok(format!("Table {} créée", nom))
        })());
    }
    if lx.mot_cle("INSERT") {
        return Some((|| {
            lx.attendre("INTO")?;
            let nom = lx.ident()?;
            lx.attendre("VALUES")?;
            let vals = lx.liste(|l| l.valeur())?;
            lx.fin()?;
            let t = tables.get_mut(&nom).ok_or(format!("table {} inconnue", nom))?;
            if vals.len() != t.cols.len() {
                return Err(format!("{} valeurs attendues", t.cols.len()));
            }
            t.lignes.push(vals);
            Ok("1 ligne insérée".to_string())
        })());
    }
    None
}

fn afficher(t: &Table, idx: &[usize], lignes: &[&Vec<Val>]) -> String {
    let mut out = vec![idx.iter().map(|&i| t.cols[i].clone()).collect::<Vec<_>>().join(" | ")];
    for l in lignes {
        out.push(idx.iter().map(|&i| l[i].texte()).collect::<Vec<_>>().join(" | "));
    }
    out.push(format!("({} ligne(s))", lignes.len()));
    out.join("\n")
}
'''

SQL1_RUST = SQL_RUST_COMMON + r'''
fn executer(tables: &mut HashMap<String, Table>, ligne: &str) -> Result<String, String> {
    let mut lx = Lexemes { t: lexer(ligne), i: 0 };
    if let Some(r) = creer_ou_inserer(tables, &mut lx) {
        return r;
    }
    if lx.mot_cle("SELECT") {
        lx.attendre("*")?;
        lx.attendre("FROM")?;
        let nom = lx.ident()?;
        let t = tables.get(&nom).ok_or(format!("table {} inconnue", nom))?;
        lx.fin()?;
        let idx: Vec<usize> = (0..t.cols.len()).collect();
        return Ok(afficher(t, &idx, &t.lignes.iter().collect::<Vec<_>>()));
    }
    Err("syntaxe".into())
}

fn main() {
    let mut tables = HashMap::new();
    for ligne in io::stdin().lock().lines() {
        let ligne = ligne.unwrap();
        if ligne.trim().is_empty() {
            continue;
        }
        match executer(&mut tables, &ligne) {
            Ok(s) => println!("{}", s),
            Err(e) => println!("Erreur : {}", e),
        }
    }
    let _ = comparer;
}
'''

SQL2_RUST = SQL_RUST_COMMON + r'''
struct Condition {
    col: usize,
    op: String,
    val: Val,
}

impl Condition {
    fn teste(&self, ligne: &[Val]) -> bool {
        let o = comparer(&ligne[self.col], &self.val);
        match self.op.as_str() {
            "=" => o == Ordering::Equal,
            "!=" => o != Ordering::Equal,
            "<" => o == Ordering::Less,
            ">" => o == Ordering::Greater,
            "<=" => o != Ordering::Greater,
            _ => o != Ordering::Less,
        }
    }
}

fn position(t: &Table, col: &str) -> Result<usize, String> {
    t.cols.iter().position(|c| c == col).ok_or(format!("colonne {} inconnue", col))
}

fn condition(lx: &mut Lexemes, t: &Table) -> Result<Option<Condition>, String> {
    if !lx.mot_cle("WHERE") {
        return Ok(None);
    }
    let col = position(t, &lx.ident()?)?;
    let op = lx.suivant()?;
    if !["=", "!=", "<", ">", "<=", ">="].contains(&op.as_str()) {
        return Err("syntaxe".into());
    }
    Ok(Some(Condition { col, op, val: lx.valeur()? }))
}

fn garde(c: &Option<Condition>, l: &[Val]) -> bool {
    c.as_ref().map_or(true, |c| c.teste(l))
}

fn executer(tables: &mut HashMap<String, Table>, ligne: &str) -> Result<String, String> {
    let mut lx = Lexemes { t: lexer(ligne), i: 0 };
    if let Some(r) = creer_ou_inserer(tables, &mut lx) {
        return r;
    }
    if lx.mot_cle("SELECT") {
        let mut noms = vec![];
        if !lx.mot_cle("*") {
            noms.push(lx.ident()?);
            while lx.mot_cle(",") {
                noms.push(lx.ident()?);
            }
        }
        lx.attendre("FROM")?;
        let nom = lx.ident()?;
        let t = tables.get(&nom).ok_or(format!("table {} inconnue", nom))?;
        let idx: Vec<usize> = if noms.is_empty() {
            (0..t.cols.len()).collect()
        } else {
            noms.iter().map(|n| position(t, n)).collect::<Result<_, _>>()?
        };
        let cond = condition(&mut lx, t)?;
        let mut tri = None;
        if lx.mot_cle("ORDER") {
            lx.attendre("BY")?;
            let i = position(t, &lx.ident()?)?;
            let desc = lx.mot_cle("DESC");
            if !desc {
                lx.mot_cle("ASC");
            }
            tri = Some((i, desc));
        }
        lx.fin()?;
        let mut lignes: Vec<&Vec<Val>> = t.lignes.iter().filter(|l| garde(&cond, l)).collect();
        if let Some((i, desc)) = tri {
            // sort_by est stable : les égalités gardent l'ordre d'insertion.
            lignes.sort_by(|a, b| if desc { comparer(&b[i], &a[i]) } else { comparer(&a[i], &b[i]) });
        }
        return Ok(afficher(t, &idx, &lignes));
    }
    if lx.mot_cle("DELETE") {
        lx.attendre("FROM")?;
        let nom = lx.ident()?;
        let t = tables.get_mut(&nom).ok_or(format!("table {} inconnue", nom))?;
        let cond = condition(&mut lx, t)?;
        lx.fin()?;
        let avant = t.lignes.len();
        t.lignes.retain(|l| !garde(&cond, l));
        return Ok(format!("{} ligne(s) supprimée(s)", avant - t.lignes.len()));
    }
    if lx.mot_cle("UPDATE") {
        let nom = lx.ident()?;
        let t = tables.get_mut(&nom).ok_or(format!("table {} inconnue", nom))?;
        lx.attendre("SET")?;
        let col = position(t, &lx.ident()?)?;
        lx.attendre("=")?;
        let val = lx.valeur()?;
        let cond = condition(&mut lx, t)?;
        lx.fin()?;
        let mut n = 0;
        for l in t.lignes.iter_mut().filter(|l| garde(&cond, l)) {
            l[col] = val.clone();
            n += 1;
        }
        return Ok(format!("{} ligne(s) modifiée(s)", n));
    }
    Err("syntaxe".into())
}

fn main() {
    let mut tables = HashMap::new();
    for ligne in io::stdin().lock().lines() {
        let ligne = ligne.unwrap();
        if ligne.trim().is_empty() {
            continue;
        }
        match executer(&mut tables, &ligne) {
            Ok(s) => println!("{}", s),
            Err(e) => println!("Erreur : {}", e),
        }
    }
}
'''

SQL_CPP_COMMON = r'''
#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
using namespace std;

struct Val {
    bool num = false;
    long long n = 0;
    string s;
    string texte() const { return num ? to_string(n) : s; }
};

// Deux entiers se comparent numériquement, sinon on compare les textes.
int comparer(const Val& a, const Val& b) {
    if (a.num && b.num) return (a.n > b.n) - (a.n < b.n);
    return a.texte().compare(b.texte());
}

struct Table {
    vector<string> cols;
    vector<vector<Val>> lignes;
};

struct ErreurSql : runtime_error {
    using runtime_error::runtime_error;
};

// Analyse lexicale : mots, nombres, chaînes 'entre apostrophes' et symboles.
vector<string> lexer(const string& s) {
    vector<string> t;
    size_t i = 0;
    auto mot = [](char c) { return isalnum((unsigned char)c) || c == '_' || (unsigned char)c >= 0x80; };
    while (i < s.size()) {
        char c = s[i];
        if (isspace((unsigned char)c)) i++;
        else if (c == '\'') {
            size_t j = s.find('\'', i + 1);
            if (j == string::npos) j = s.size() - 1;
            t.push_back(s.substr(i, j - i + 1));
            i = j + 1;
        } else if (mot(c) || (c == '-' && i + 1 < s.size() && isdigit((unsigned char)s[i + 1]))) {
            size_t j = i + 1;
            while (j < s.size() && mot(s[j])) j++;
            t.push_back(s.substr(i, j - i));
            i = j;
        } else if ((c == '<' || c == '>' || c == '!') && i + 1 < s.size() && s[i + 1] == '=') {
            t.push_back(s.substr(i, 2));
            i += 2;
        } else {
            t.push_back(string(1, c));
            i++;
        }
    }
    return t;
}

struct Lexemes {
    vector<string> t;
    size_t i = 0;
    string suivant() {
        if (i >= t.size()) throw ErreurSql("syntaxe");
        return t[i++];
    }
    // Consomme le mot-clé (insensible à la casse) s'il est présent.
    bool motCle(const string& k) {
        if (i >= t.size() || t[i].size() != k.size()) return false;
        for (size_t j = 0; j < k.size(); j++)
            if (toupper((unsigned char)t[i][j]) != toupper((unsigned char)k[j])) return false;
        i++;
        return true;
    }
    void attendre(const string& k) {
        if (!motCle(k)) throw ErreurSql("syntaxe");
    }
    string ident() {
        string s = suivant();
        if (!(isalpha((unsigned char)s[0]) || s[0] == '_' || (unsigned char)s[0] >= 0x80)) throw ErreurSql("syntaxe");
        return s;
    }
    Val valeur() {
        string s = suivant();
        Val v;
        if (s.size() >= 2 && s.front() == '\'' && s.back() == '\'') {
            v.s = s.substr(1, s.size() - 2);
            return v;
        }
        try {
            size_t pos;
            v.n = stoll(s, &pos);
            if (pos != s.size()) throw ErreurSql("syntaxe");
        } catch (const ErreurSql&) {
            throw;
        } catch (...) {
            throw ErreurSql("syntaxe");
        }
        v.num = true;
        return v;
    }
    void fin() {
        motCle(";");
        if (i != t.size()) throw ErreurSql("syntaxe");
    }
};

map<string, Table> tables;

Table& table(const string& nom) {
    auto it = tables.find(nom);
    if (it == tables.end()) throw ErreurSql("table " + nom + " inconnue");
    return it->second;
}

// Renvoie true si la commande était un CREATE ou un INSERT.
bool creerOuInserer(Lexemes& lx, string& res) {
    if (lx.motCle("CREATE")) {
        lx.attendre("TABLE");
        string nom = lx.ident();
        lx.attendre("(");
        vector<string> cols{lx.ident()};
        while (lx.motCle(",")) cols.push_back(lx.ident());
        lx.attendre(")");
        lx.fin();
        if (tables.count(nom)) throw ErreurSql("la table " + nom + " existe déjà");
        tables[nom] = {cols, {}};
        res = "Table " + nom + " créée";
        return true;
    }
    if (lx.motCle("INSERT")) {
        lx.attendre("INTO");
        string nom = lx.ident();
        lx.attendre("VALUES");
        lx.attendre("(");
        vector<Val> vals{lx.valeur()};
        while (lx.motCle(",")) vals.push_back(lx.valeur());
        lx.attendre(")");
        lx.fin();
        Table& t = table(nom);
        if (vals.size() != t.cols.size()) throw ErreurSql(to_string(t.cols.size()) + " valeurs attendues");
        t.lignes.push_back(vals);
        res = "1 ligne insérée";
        return true;
    }
    return false;
}

string afficher(const Table& t, const vector<size_t>& idx, const vector<const vector<Val>*>& lignes) {
    string out;
    for (size_t k = 0; k < idx.size(); k++) out += (k ? " | " : "") + t.cols[idx[k]];
    for (auto* l : lignes) {
        out += "\n";
        for (size_t k = 0; k < idx.size(); k++) out += (k ? " | " : "") + (*l)[idx[k]].texte();
    }
    return out + "\n(" + to_string(lignes.size()) + " ligne(s))";
}
'''

SQL1_CPP = SQL_CPP_COMMON + r'''
string executer(const string& ligne) {
    Lexemes lx{lexer(ligne)};
    string res;
    if (creerOuInserer(lx, res)) return res;
    if (lx.motCle("SELECT")) {
        lx.attendre("*");
        lx.attendre("FROM");
        Table& t = table(lx.ident());
        lx.fin();
        vector<size_t> idx;
        for (size_t i = 0; i < t.cols.size(); i++) idx.push_back(i);
        vector<const vector<Val>*> lignes;
        for (auto& l : t.lignes) lignes.push_back(&l);
        return afficher(t, idx, lignes);
    }
    throw ErreurSql("syntaxe");
}

int main() {
    string ligne;
    while (getline(cin, ligne)) {
        if (ligne.find_first_not_of(" \t\r") == string::npos) continue;
        try {
            cout << executer(ligne) << "\n";
        } catch (const ErreurSql& e) {
            cout << "Erreur : " << e.what() << "\n";
        }
    }
    (void)comparer;
}
'''

SQL2_CPP = SQL_CPP_COMMON + r'''
struct Condition {
    bool active = false;
    size_t col = 0;
    string op;
    Val val;
    bool teste(const vector<Val>& l) const {
        if (!active) return true;
        int o = comparer(l[col], val);
        if (op == "=") return o == 0;
        if (op == "!=") return o != 0;
        if (op == "<") return o < 0;
        if (op == ">") return o > 0;
        if (op == "<=") return o <= 0;
        return o >= 0;
    }
};

size_t position(const Table& t, const string& col) {
    auto it = find(t.cols.begin(), t.cols.end(), col);
    if (it == t.cols.end()) throw ErreurSql("colonne " + col + " inconnue");
    return it - t.cols.begin();
}

Condition condition(Lexemes& lx, const Table& t) {
    Condition c;
    if (!lx.motCle("WHERE")) return c;
    c.active = true;
    c.col = position(t, lx.ident());
    c.op = lx.suivant();
    if (c.op != "=" && c.op != "!=" && c.op != "<" && c.op != ">" && c.op != "<=" && c.op != ">=") throw ErreurSql("syntaxe");
    c.val = lx.valeur();
    return c;
}

string executer(const string& ligne) {
    Lexemes lx{lexer(ligne)};
    string res;
    if (creerOuInserer(lx, res)) return res;
    if (lx.motCle("SELECT")) {
        vector<string> noms;
        if (!lx.motCle("*")) {
            noms.push_back(lx.ident());
            while (lx.motCle(",")) noms.push_back(lx.ident());
        }
        lx.attendre("FROM");
        Table& t = table(lx.ident());
        vector<size_t> idx;
        if (noms.empty())
            for (size_t i = 0; i < t.cols.size(); i++) idx.push_back(i);
        for (auto& n : noms) idx.push_back(position(t, n));
        Condition cond = condition(lx, t);
        bool trier = false, desc = false;
        size_t col = 0;
        if (lx.motCle("ORDER")) {
            lx.attendre("BY");
            col = position(t, lx.ident());
            trier = true;
            desc = lx.motCle("DESC");
            if (!desc) lx.motCle("ASC");
        }
        lx.fin();
        vector<const vector<Val>*> lignes;
        for (auto& l : t.lignes)
            if (cond.teste(l)) lignes.push_back(&l);
        // stable_sort : les égalités gardent l'ordre d'insertion.
        if (trier)
            stable_sort(lignes.begin(), lignes.end(), [&](auto* a, auto* b) {
                int o = comparer((*a)[col], (*b)[col]);
                return desc ? o > 0 : o < 0;
            });
        return afficher(t, idx, lignes);
    }
    if (lx.motCle("DELETE")) {
        lx.attendre("FROM");
        Table& t = table(lx.ident());
        Condition cond = condition(lx, t);
        lx.fin();
        size_t avant = t.lignes.size();
        t.lignes.erase(remove_if(t.lignes.begin(), t.lignes.end(), [&](const vector<Val>& l) { return cond.teste(l); }), t.lignes.end());
        return to_string(avant - t.lignes.size()) + " ligne(s) supprimée(s)";
    }
    if (lx.motCle("UPDATE")) {
        Table& t = table(lx.ident());
        lx.attendre("SET");
        size_t col = position(t, lx.ident());
        lx.attendre("=");
        Val v = lx.valeur();
        Condition cond = condition(lx, t);
        lx.fin();
        int n = 0;
        for (auto& l : t.lignes)
            if (cond.teste(l)) { l[col] = v; n++; }
        return to_string(n) + " ligne(s) modifiée(s)";
    }
    throw ErreurSql("syntaxe");
}

int main() {
    string ligne;
    while (getline(cin, ligne)) {
        if (ligne.find_first_not_of(" \t\r") == string::npos) continue;
        try {
            cout << executer(ligne) << "\n";
        } catch (const ErreurSql& e) {
            cout << "Erreur : " << e.what() << "\n";
        }
    }
}
'''

SQL_JAVA_COMMON = r'''
import java.util.*;

public class Main {
    static class ErreurSql extends Exception {
        ErreurSql(String m) { super(m); }
    }

    static class Table {
        final List<String> cols;
        final List<Object[]> lignes = new ArrayList<>();
        Table(List<String> cols) { this.cols = cols; }
    }

    static final Map<String, Table> tables = new HashMap<>();

    /** Deux entiers (Long) se comparent numériquement, sinon on compare les textes. */
    static int comparer(Object a, Object b) {
        if (a instanceof Long x && b instanceof Long y) return Long.compare(x, y);
        return String.valueOf(a).compareTo(String.valueOf(b));
    }

    /** Analyse lexicale : mots, nombres, chaînes 'entre apostrophes' et symboles. */
    static List<String> lexer(String s) {
        List<String> t = new ArrayList<>();
        int i = 0;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c)) i++;
            else if (c == '\'') {
                int j = s.indexOf('\'', i + 1);
                if (j < 0) j = s.length() - 1;
                t.add(s.substring(i, j + 1));
                i = j + 1;
            } else if (Character.isLetterOrDigit(c) || c == '_' || (c == '-' && i + 1 < s.length() && Character.isDigit(s.charAt(i + 1)))) {
                int j = i + 1;
                while (j < s.length() && (Character.isLetterOrDigit(s.charAt(j)) || s.charAt(j) == '_')) j++;
                t.add(s.substring(i, j));
                i = j;
            } else if ("<>!".indexOf(c) >= 0 && i + 1 < s.length() && s.charAt(i + 1) == '=') {
                t.add(s.substring(i, i + 2));
                i += 2;
            } else {
                t.add(String.valueOf(c));
                i++;
            }
        }
        return t;
    }

    static class Lexemes {
        final List<String> t;
        int i = 0;
        Lexemes(List<String> t) { this.t = t; }
        String suivant() throws ErreurSql {
            if (i >= t.size()) throw new ErreurSql("syntaxe");
            return t.get(i++);
        }
        /** Consomme le mot-clé (insensible à la casse) s'il est présent. */
        boolean motCle(String k) {
            if (i < t.size() && t.get(i).equalsIgnoreCase(k)) { i++; return true; }
            return false;
        }
        void attendre(String k) throws ErreurSql { if (!motCle(k)) throw new ErreurSql("syntaxe"); }
        String ident() throws ErreurSql {
            String s = suivant();
            if (!(Character.isLetter(s.charAt(0)) || s.charAt(0) == '_')) throw new ErreurSql("syntaxe");
            return s;
        }
        Object valeur() throws ErreurSql {
            String s = suivant();
            if (s.length() >= 2 && s.startsWith("'") && s.endsWith("'")) return s.substring(1, s.length() - 1);
            try { return Long.parseLong(s); } catch (NumberFormatException e) { throw new ErreurSql("syntaxe"); }
        }
        void fin() throws ErreurSql {
            motCle(";");
            if (i != t.size()) throw new ErreurSql("syntaxe");
        }
    }

    static Table table(String nom) throws ErreurSql {
        Table t = tables.get(nom);
        if (t == null) throw new ErreurSql("table " + nom + " inconnue");
        return t;
    }

    /** Renvoie le résultat d'un CREATE ou d'un INSERT, ou null pour une autre commande. */
    static String creerOuInserer(Lexemes lx) throws ErreurSql {
        if (lx.motCle("CREATE")) {
            lx.attendre("TABLE");
            String nom = lx.ident();
            lx.attendre("(");
            List<String> cols = new ArrayList<>(List.of(lx.ident()));
            while (lx.motCle(",")) cols.add(lx.ident());
            lx.attendre(")");
            lx.fin();
            if (tables.containsKey(nom)) throw new ErreurSql("la table " + nom + " existe déjà");
            tables.put(nom, new Table(cols));
            return "Table " + nom + " créée";
        }
        if (lx.motCle("INSERT")) {
            lx.attendre("INTO");
            String nom = lx.ident();
            lx.attendre("VALUES");
            lx.attendre("(");
            List<Object> vals = new ArrayList<>(List.of(lx.valeur()));
            while (lx.motCle(",")) vals.add(lx.valeur());
            lx.attendre(")");
            lx.fin();
            Table t = table(nom);
            if (vals.size() != t.cols.size()) throw new ErreurSql(t.cols.size() + " valeurs attendues");
            t.lignes.add(vals.toArray());
            return "1 ligne insérée";
        }
        return null;
    }

    static String afficher(Table t, List<Integer> idx, List<Object[]> lignes) {
        StringJoiner out = new StringJoiner("\n");
        StringJoiner entete = new StringJoiner(" | ");
        for (int i : idx) entete.add(t.cols.get(i));
        out.add(entete.toString());
        for (Object[] l : lignes) {
            StringJoiner j = new StringJoiner(" | ");
            for (int i : idx) j.add(String.valueOf(l[i]));
            out.add(j.toString());
        }
        return out.add("(" + lignes.size() + " ligne(s))").toString();
    }
'''

SQL1_JAVA = SQL_JAVA_COMMON + r'''
    static String executer(String ligne) throws ErreurSql {
        Lexemes lx = new Lexemes(lexer(ligne));
        String r = creerOuInserer(lx);
        if (r != null) return r;
        if (lx.motCle("SELECT")) {
            lx.attendre("*");
            lx.attendre("FROM");
            Table t = table(lx.ident());
            lx.fin();
            List<Integer> idx = new ArrayList<>();
            for (int i = 0; i < t.cols.size(); i++) idx.add(i);
            return afficher(t, idx, t.lignes);
        }
        throw new ErreurSql("syntaxe");
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            String l = sc.nextLine();
            if (l.isBlank()) continue;
            try { System.out.println(executer(l)); }
            catch (ErreurSql e) { System.out.println("Erreur : " + e.getMessage()); }
        }
    }
}
'''

SQL2_JAVA = SQL_JAVA_COMMON + r'''
    record Condition(int col, String op, Object val) {
        boolean teste(Object[] l) {
            int o = comparer(l[col], val);
            return switch (op) {
                case "=" -> o == 0;
                case "!=" -> o != 0;
                case "<" -> o < 0;
                case ">" -> o > 0;
                case "<=" -> o <= 0;
                default -> o >= 0;
            };
        }
    }

    static int position(Table t, String col) throws ErreurSql {
        int i = t.cols.indexOf(col);
        if (i < 0) throw new ErreurSql("colonne " + col + " inconnue");
        return i;
    }

    static Condition condition(Lexemes lx, Table t) throws ErreurSql {
        if (!lx.motCle("WHERE")) return null;
        int col = position(t, lx.ident());
        String op = lx.suivant();
        if (!List.of("=", "!=", "<", ">", "<=", ">=").contains(op)) throw new ErreurSql("syntaxe");
        return new Condition(col, op, lx.valeur());
    }

    static boolean garde(Condition c, Object[] l) { return c == null || c.teste(l); }

    static String executer(String ligne) throws ErreurSql {
        Lexemes lx = new Lexemes(lexer(ligne));
        String r = creerOuInserer(lx);
        if (r != null) return r;
        if (lx.motCle("SELECT")) {
            List<String> noms = new ArrayList<>();
            if (!lx.motCle("*")) {
                noms.add(lx.ident());
                while (lx.motCle(",")) noms.add(lx.ident());
            }
            lx.attendre("FROM");
            Table t = table(lx.ident());
            List<Integer> idx = new ArrayList<>();
            if (noms.isEmpty()) for (int i = 0; i < t.cols.size(); i++) idx.add(i);
            for (String n : noms) idx.add(position(t, n));
            Condition cond = condition(lx, t);
            Comparator<Object[]> tri = null;
            if (lx.motCle("ORDER")) {
                lx.attendre("BY");
                int col = position(t, lx.ident());
                tri = (a, b) -> comparer(a[col], b[col]);
                if (lx.motCle("DESC")) tri = tri.reversed();
                else lx.motCle("ASC");
            }
            lx.fin();
            List<Object[]> lignes = new ArrayList<>();
            for (Object[] l : t.lignes) if (garde(cond, l)) lignes.add(l);
            if (tri != null) lignes.sort(tri); // tri stable
            return afficher(t, idx, lignes);
        }
        if (lx.motCle("DELETE")) {
            lx.attendre("FROM");
            Table t = table(lx.ident());
            Condition cond = condition(lx, t);
            lx.fin();
            int avant = t.lignes.size();
            t.lignes.removeIf(l -> garde(cond, l));
            return (avant - t.lignes.size()) + " ligne(s) supprimée(s)";
        }
        if (lx.motCle("UPDATE")) {
            Table t = table(lx.ident());
            lx.attendre("SET");
            int col = position(t, lx.ident());
            lx.attendre("=");
            Object v = lx.valeur();
            Condition cond = condition(lx, t);
            lx.fin();
            int n = 0;
            for (Object[] l : t.lignes) if (garde(cond, l)) { l[col] = v; n++; }
            return n + " ligne(s) modifiée(s)";
        }
        throw new ErreurSql("syntaxe");
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        while (sc.hasNextLine()) {
            String l = sc.nextLine();
            if (l.isBlank()) continue;
            try { System.out.println(executer(l)); }
            catch (ErreurSql e) { System.out.println("Erreur : " + e.getMessage()); }
        }
    }
}
'''

P.append(project(
    'mini-base-de-donnees', 4, 'Mini base de données SQL',
    'Écrire un moteur SQL en mémoire : analyse lexicale, analyse syntaxique, tables, filtres, tri, mises à jour.',
    '''
    Tu vas écrire un petit **moteur de base de données** qui comprend un sous-ensemble de SQL — exactement ce que font SQLite ou PostgreSQL, en (beaucoup) plus simple.

    Un moteur SQL se découpe en étapes :

    1. **analyse lexicale** (*lexer*) : `SELECT nom FROM eleves WHERE age > 18` → `SELECT`, `nom`, `FROM`, `eleves`, `WHERE`, `age`, `>`, `18` ;
    2. **analyse syntaxique** (*parser*) : vérifier la grammaire et extraire la structure de la requête ;
    3. **exécution** sur les données.

    Les valeurs sont des **entiers** (`36`, `-5`) ou des **chaînes** entre apostrophes (`'Ada'`). Les mots-clés ne sont pas sensibles à la casse ; le `;` final est facultatif. Toute requête mal formée → `Erreur : syntaxe`.

    Un `SELECT` affiche l’en-tête (`col1 | col2`), une ligne par résultat, puis `(N ligne(s))`.
    ''',
    ['Écrire un analyseur lexical', 'Écrire un analyseur syntaxique par descente récursive', 'Représenter des valeurs de types différents', 'Filtrer et trier des enregistrements'],
    ['Aucune bibliothèque externe', 'Les erreurs ne doivent jamais arrêter le programme', 'Entiers comparés numériquement, textes comparés lexicographiquement'],
    [
        step('sql-base', 'Tables et insertions',
             '''
             Commandes :

             - `CREATE TABLE nom (col1, col2, …)` → `Table nom créée` ou `Erreur : la table nom existe déjà`
             - `INSERT INTO nom VALUES (v1, v2, …)` → `1 ligne insérée`, `Erreur : N valeurs attendues` ou `Erreur : table nom inconnue`
             - `SELECT * FROM nom` → le tableau des lignes, dans l’ordre d’insertion
             ''',
             [T("CREATE TABLE eleves (nom, age, langage);\nINSERT INTO eleves VALUES ('Ada', 36, 'rust');\ninsert into eleves values ('Linus', 54, 'cpp')\nINSERT INTO eleves VALUES ('Kiri', 16);\nINSERT INTO profs VALUES (1);\nCREATE TABLE eleves (x);\nSELECT * FROM eleves;\nSELECT * FROM profs\nINSERT eleves\nSELECT * FROM eleves WHERE",
                'Table eleves créée\n1 ligne insérée\n1 ligne insérée\nErreur : 3 valeurs attendues\nErreur : table profs inconnue\nErreur : la table eleves existe déjà\nnom | age | langage\nAda | 36 | rust\nLinus | 54 | cpp\n(2 ligne(s))\nErreur : table profs inconnue\nErreur : syntaxe\nErreur : syntaxe'),
              T("CREATE TABLE t (a)\nINSERT INTO t VALUES (-7)\nINSERT INTO t VALUES ('deux mots')\nINSERT INTO t VALUES (abc)\nSELECT * FROM t", 'Table t créée\n1 ligne insérée\n1 ligne insérée\nErreur : syntaxe\na\n-7\ndeux mots\n(2 ligne(s))', hidden=True)],
             rust=SQL1_RUST, cpp=SQL1_CPP, java=SQL1_JAVA,
             hints=['Commence par le lexer : transforme la ligne en liste de lexèmes, les chaînes entre apostrophes formant un seul lexème.', 'Écris des petites fonctions « attendre(mot) », « identifiant() », « valeur() » : le parser devient une suite d’appels.'],
             xp=70),
        step('sql-requetes', 'WHERE, ORDER BY, UPDATE, DELETE',
             '''
             Ajoute :

             - `SELECT col1, col2 FROM nom` (colonnes choisies) ;
             - `WHERE col op valeur` avec `=`, `!=`, `<`, `>`, `<=`, `>=` (sur SELECT, UPDATE et DELETE) ;
             - `ORDER BY col [ASC|DESC]` (tri **stable**) ;
             - `DELETE FROM nom [WHERE …]` → `N ligne(s) supprimée(s)` ;
             - `UPDATE nom SET col = valeur [WHERE …]` → `N ligne(s) modifiée(s)` ;
             - colonne inexistante → `Erreur : colonne col inconnue`.
             ''',
             [T("CREATE TABLE eleves (nom, age, langage)\nINSERT INTO eleves VALUES ('Ada', 36, 'rust')\nINSERT INTO eleves VALUES ('Linus', 54, 'cpp')\nINSERT INTO eleves VALUES ('Grace', 85, 'java')\nINSERT INTO eleves VALUES ('Kiri', 16, 'rust')\nINSERT INTO eleves VALUES ('Bob', 16, 'java')\nSELECT nom, age FROM eleves WHERE langage = 'rust'\nSELECT nom FROM eleves WHERE age >= 36 ORDER BY age DESC\nSELECT nom, age FROM eleves ORDER BY age\nUPDATE eleves SET langage = 'cpp' WHERE nom = 'Bob'\nDELETE FROM eleves WHERE age < 20\nSELECT nom, langage FROM eleves WHERE langage != 'cpp' ORDER BY nom\nSELECT email FROM eleves\nDELETE FROM eleves\nSELECT * FROM eleves",
                'Table eleves créée\n' + '1 ligne insérée\n' * 5 + 'nom | age\nAda | 36\nKiri | 16\n(2 ligne(s))\nnom\nGrace\nLinus\nAda\n(3 ligne(s))\nnom | age\nKiri | 16\nBob | 16\nAda | 36\nLinus | 54\nGrace | 85\n(5 ligne(s))\n1 ligne(s) modifiée(s)\n2 ligne(s) supprimée(s)\nnom | langage\nAda | rust\nGrace | java\n(2 ligne(s))\nErreur : colonne email inconnue\n3 ligne(s) supprimée(s)\nnom | age | langage\n(0 ligne(s))'),
              T("CREATE TABLE n (v)\nINSERT INTO n VALUES (10)\nINSERT INTO n VALUES (9)\nINSERT INTO n VALUES (100)\nSELECT v FROM n ORDER BY v\nSELECT v FROM n WHERE v > 9\nUPDATE n SET w = 1\nSELECT v FROM n WHERE v ~ 3", 'Table n créée\n1 ligne insérée\n1 ligne insérée\n1 ligne insérée\nv\n9\n10\n100\n(3 ligne(s))\nv\n10\n100\n(2 ligne(s))\nErreur : colonne w inconnue\nErreur : syntaxe', hidden=True)],
             rust=SQL2_RUST, cpp=SQL2_CPP, java=SQL2_JAVA,
             hints=['Une condition WHERE = (indice de colonne, opérateur, valeur) : une fonction « teste(ligne) » suffit ensuite partout.', 'Compare les entiers numériquement : sinon « 100 » serait avant « 9 » !'],
             xp=80),
    ]))

# ====================================================================== Multithread
MT1_RUST = r'''
use std::collections::HashMap;
use std::io::{self, BufRead};
use std::thread;

fn compter(lignes: &[String]) -> HashMap<String, usize> {
    let mut m = HashMap::new();
    for l in lignes {
        for mot in l.to_lowercase().split(|c: char| !c.is_alphanumeric()).filter(|m| !m.is_empty()) {
            *m.entry(mot.to_string()).or_insert(0) += 1;
        }
    }
    m
}

fn main() {
    let stdin = io::stdin();
    let mut it = stdin.lock().lines().map(|l| l.unwrap());
    let k: usize = it.next().unwrap().trim().parse().unwrap();
    let lignes: Vec<String> = it.collect();
    // Répartition circulaire : la ligne i va au thread i % k.
    let paquets: Vec<Vec<String>> = (0..k).map(|i| lignes.iter().skip(i).step_by(k).cloned().collect()).collect();
    let resultats: Vec<HashMap<String, usize>> = thread::scope(|s| {
        let poignees: Vec<_> = paquets.iter().map(|p| s.spawn(move || compter(p))).collect();
        poignees.into_iter().map(|h| h.join().unwrap()).collect()
    });
    let mut total: HashMap<String, usize> = HashMap::new();
    for (i, r) in resultats.iter().enumerate() {
        println!("thread {} : {} ligne(s), {} mot(s)", i, paquets[i].len(), r.values().sum::<usize>());
        for (m, n) in r {
            *total.entry(m.clone()).or_insert(0) += n;
        }
    }
    let mut v: Vec<(&String, &usize)> = total.iter().collect();
    v.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
    println!("total : {} mot(s), {} distinct(s)", total.values().sum::<usize>(), total.len());
    for (m, n) in v.iter().take(5) {
        println!("{} : {}", m, n);
    }
}
'''

MT1_CPP = r'''
#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <string>
#include <thread>
#include <vector>
using namespace std;

map<string, int> compter(const vector<string>& lignes) {
    map<string, int> m;
    for (const auto& l : lignes) {
        string mot;
        for (char c : l + " ") {
            if (isalnum((unsigned char)c)) mot += (char)tolower((unsigned char)c);
            else if (!mot.empty()) { m[mot]++; mot.clear(); }
        }
    }
    return m;
}

int main() {
    int k;
    string l;
    getline(cin, l);
    k = stoi(l);
    vector<vector<string>> paquets(k);
    // Répartition circulaire : la ligne i va au thread i % k.
    for (int i = 0; getline(cin, l); i++) paquets[i % k].push_back(l);
    vector<map<string, int>> resultats(k);
    vector<thread> threads;
    for (int i = 0; i < k; i++) threads.emplace_back([&, i] { resultats[i] = compter(paquets[i]); });
    for (auto& t : threads) t.join();
    map<string, int> total;
    for (int i = 0; i < k; i++) {
        int n = 0;
        for (auto& [m, c] : resultats[i]) { n += c; total[m] += c; }
        cout << "thread " << i << " : " << paquets[i].size() << " ligne(s), " << n << " mot(s)\n";
    }
    vector<pair<string, int>> v(total.begin(), total.end());
    stable_sort(v.begin(), v.end(), [](auto& a, auto& b) { return a.second > b.second; });
    int somme = 0;
    for (auto& [m, c] : total) somme += c;
    cout << "total : " << somme << " mot(s), " << total.size() << " distinct(s)\n";
    for (size_t i = 0; i < v.size() && i < 5; i++) cout << v[i].first << " : " << v[i].second << "\n";
}
'''

MT1_JAVA = r'''
import java.util.*;

public class Main {
    static Map<String, Integer> compter(List<String> lignes) {
        Map<String, Integer> m = new HashMap<>();
        for (String l : lignes)
            for (String mot : l.toLowerCase().split("[^\\p{L}\\p{N}]+"))
                if (!mot.isEmpty()) m.merge(mot, 1, Integer::sum);
        return m;
    }

    public static void main(String[] args) throws InterruptedException {
        Scanner sc = new Scanner(System.in);
        int k = Integer.parseInt(sc.nextLine().trim());
        List<List<String>> paquets = new ArrayList<>();
        for (int i = 0; i < k; i++) paquets.add(new ArrayList<>());
        // Répartition circulaire : la ligne i va au thread i % k.
        for (int i = 0; sc.hasNextLine(); i++) paquets.get(i % k).add(sc.nextLine());
        List<Map<String, Integer>> resultats = new ArrayList<>(Collections.nCopies(k, null));
        List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < k; i++) {
            final int id = i;
            Thread t = new Thread(() -> resultats.set(id, compter(paquets.get(id))));
            threads.add(t);
            t.start();
        }
        for (Thread t : threads) t.join();
        Map<String, Integer> total = new HashMap<>();
        for (int i = 0; i < k; i++) {
            int n = resultats.get(i).values().stream().mapToInt(Integer::intValue).sum();
            System.out.println("thread " + i + " : " + paquets.get(i).size() + " ligne(s), " + n + " mot(s)");
            resultats.get(i).forEach((m, c) -> total.merge(m, c, Integer::sum));
        }
        System.out.println("total : " + total.values().stream().mapToInt(Integer::intValue).sum() + " mot(s), " + total.size() + " distinct(s)");
        total.entrySet().stream()
            .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
            .limit(5).forEach(e -> System.out.println(e.getKey() + " : " + e.getValue()));
    }
}
'''

MT2_RUST = r'''
use std::collections::VecDeque;
use std::io::{self, BufRead};
use std::sync::{Arc, Mutex};
use std::thread;

fn fib(n: u64) -> u64 {
    let (mut a, mut b) = (0u64, 1u64);
    for _ in 0..n {
        let c = a + b;
        a = b;
        b = c;
    }
    a
}

fn premiers(n: usize) -> usize {
    if n < 2 {
        return 0;
    }
    let mut crible = vec![true; n + 1];
    crible[0] = false;
    crible[1] = false;
    let mut i = 2;
    while i * i <= n {
        if crible[i] {
            let mut j = i * i;
            while j <= n {
                crible[j] = false;
                j += i;
            }
        }
        i += 1;
    }
    crible.iter().filter(|&&p| p).count()
}

fn collatz(mut n: u64) -> u64 {
    let mut etapes = 0;
    while n > 1 {
        n = if n % 2 == 0 { n / 2 } else { 3 * n + 1 };
        etapes += 1;
    }
    etapes
}

fn traiter(tache: &str) -> String {
    let p: Vec<&str> = tache.split_whitespace().collect();
    let n = p.get(1).and_then(|s| s.parse::<u64>().ok());
    match (p.first().copied(), n, p.len()) {
        (Some("fib"), Some(n), 2) if n <= 90 => format!("fib({}) = {}", n, fib(n)),
        (Some("premiers"), Some(n), 2) if n <= 10_000_000 => format!("premiers(≤{}) = {}", n, premiers(n as usize)),
        (Some("collatz"), Some(n), 2) if n >= 1 => format!("collatz({}) = {} étapes", n, collatz(n)),
        _ => format!("tâche invalide : {}", tache),
    }
}

fn main() {
    let stdin = io::stdin();
    let mut it = stdin.lock().lines().map(|l| l.unwrap());
    let k: usize = it.next().unwrap().trim().parse().unwrap();
    let taches: Vec<String> = it.filter(|l| !l.trim().is_empty()).collect();
    let n = taches.len();
    // File de tâches partagée et tableau de résultats indexé par numéro de tâche.
    let file: Arc<Mutex<VecDeque<(usize, String)>>> = Arc::new(Mutex::new(taches.into_iter().enumerate().collect()));
    let resultats: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(vec![String::new(); n]));
    let workers: Vec<_> = (0..k)
        .map(|_| {
            let file = Arc::clone(&file);
            let resultats = Arc::clone(&resultats);
            thread::spawn(move || loop {
                // Le verrou n'est tenu que le temps de retirer une tâche.
                let Some((i, tache)) = file.lock().unwrap().pop_front() else { break };
                let r = traiter(&tache);
                resultats.lock().unwrap()[i] = r;
            })
        })
        .collect();
    for w in workers {
        w.join().unwrap();
    }
    for (i, r) in resultats.lock().unwrap().iter().enumerate() {
        println!("#{} {}", i + 1, r);
    }
    println!("{} tâche(s) traitée(s) par {} worker(s)", n, k);
}
'''

MT2_CPP = r'''
#include <deque>
#include <iostream>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>
using namespace std;

unsigned long long fib(int n) {
    unsigned long long a = 0, b = 1;
    for (int i = 0; i < n; i++) { unsigned long long c = a + b; a = b; b = c; }
    return a;
}

long long premiers(long long n) {
    if (n < 2) return 0;
    vector<bool> crible(n + 1, true);
    crible[0] = crible[1] = false;
    for (long long i = 2; i * i <= n; i++)
        if (crible[i])
            for (long long j = i * i; j <= n; j += i) crible[j] = false;
    long long c = 0;
    for (bool p : crible) c += p;
    return c;
}

long long collatz(unsigned long long n) {
    long long e = 0;
    while (n > 1) { n = n % 2 == 0 ? n / 2 : 3 * n + 1; e++; }
    return e;
}

string traiter(const string& tache) {
    istringstream in(tache);
    string op, reste;
    long long n;
    bool ok = (in >> op >> n) && !(in >> reste);
    if (ok && op == "fib" && n >= 0 && n <= 90) return "fib(" + to_string(n) + ") = " + to_string(fib(n));
    if (ok && op == "premiers" && n >= 0 && n <= 10000000) return "premiers(≤" + to_string(n) + ") = " + to_string(premiers(n));
    if (ok && op == "collatz" && n >= 1) return "collatz(" + to_string(n) + ") = " + to_string(collatz(n)) + " étapes";
    return "tâche invalide : " + tache;
}

int main() {
    string l;
    getline(cin, l);
    int k = stoi(l);
    deque<pair<size_t, string>> file;
    while (getline(cin, l))
        if (l.find_first_not_of(" \r") != string::npos) file.push_back({file.size(), l});
    size_t n = file.size();
    vector<string> resultats(n);
    mutex verrou;
    vector<thread> workers;
    for (int w = 0; w < k; w++)
        workers.emplace_back([&] {
            while (true) {
                pair<size_t, string> t;
                {
                    // Le verrou n'est tenu que le temps de retirer une tâche.
                    lock_guard<mutex> g(verrou);
                    if (file.empty()) return;
                    t = file.front();
                    file.pop_front();
                }
                string r = traiter(t.second);
                lock_guard<mutex> g(verrou);
                resultats[t.first] = r;
            }
        });
    for (auto& w : workers) w.join();
    for (size_t i = 0; i < n; i++) cout << "#" << i + 1 << " " << resultats[i] << "\n";
    cout << n << " tâche(s) traitée(s) par " << k << " worker(s)\n";
}
'''

MT2_JAVA = r'''
import java.util.*;

public class Main {
    static long fib(int n) {
        long a = 0, b = 1;
        for (int i = 0; i < n; i++) { long c = a + b; a = b; b = c; }
        return a;
    }

    static int premiers(int n) {
        if (n < 2) return 0;
        boolean[] compose = new boolean[n + 1];
        int c = 0;
        for (int i = 2; i <= n; i++) {
            if (compose[i]) continue;
            c++;
            for (long j = (long) i * i; j <= n; j += i) compose[(int) j] = true;
        }
        return c;
    }

    static long collatz(long n) {
        long e = 0;
        while (n > 1) { n = n % 2 == 0 ? n / 2 : 3 * n + 1; e++; }
        return e;
    }

    static String traiter(String tache) {
        String[] p = tache.trim().split("\\s+");
        long n;
        try { n = p.length == 2 ? Long.parseLong(p[1]) : -1; } catch (NumberFormatException e) { n = -1; }
        if (p[0].equals("fib") && n >= 0 && n <= 90) return "fib(" + n + ") = " + fib((int) n);
        if (p[0].equals("premiers") && n >= 0 && n <= 10_000_000) return "premiers(≤" + n + ") = " + premiers((int) n);
        if (p[0].equals("collatz") && n >= 1) return "collatz(" + n + ") = " + collatz(n) + " étapes";
        return "tâche invalide : " + tache;
    }

    public static void main(String[] args) throws InterruptedException {
        Scanner sc = new Scanner(System.in);
        int k = Integer.parseInt(sc.nextLine().trim());
        Deque<Integer> file = new ArrayDeque<>();
        List<String> taches = new ArrayList<>();
        while (sc.hasNextLine()) {
            String l = sc.nextLine();
            if (!l.isBlank()) { file.add(taches.size()); taches.add(l); }
        }
        String[] resultats = new String[taches.size()];
        List<Thread> workers = new ArrayList<>();
        for (int w = 0; w < k; w++) {
            Thread t = new Thread(() -> {
                while (true) {
                    Integer i;
                    // Le verrou n'est tenu que le temps de retirer une tâche.
                    synchronized (file) { i = file.poll(); }
                    if (i == null) return;
                    String r = traiter(taches.get(i));
                    synchronized (resultats) { resultats[i] = r; }
                }
            });
            workers.add(t);
            t.start();
        }
        for (Thread t : workers) t.join();
        for (int i = 0; i < resultats.length; i++) System.out.println("#" + (i + 1) + " " + resultats[i]);
        System.out.println(taches.size() + " tâche(s) traitée(s) par " + k + " worker(s)");
    }
}
'''

P.append(project(
    'traitement-multithread', 4, 'Traitement multithread',
    'Paralléliser un traitement : découpage des données entre threads, fusion des résultats, puis un pool de workers avec file de tâches.',
    '''
    Les processeurs modernes ont plusieurs cœurs : pour en profiter, on **découpe le travail** entre plusieurs threads.

    Deux grands schémas :

    1. **Partitionner les données** : chaque thread traite sa part, sans rien partager ; on **fusionne** ensuite les résultats (*map/reduce*). Aucun verrou nécessaire !
    2. **Pool de workers** : une **file de tâches partagée**, protégée par un verrou ; chaque worker prend la tâche suivante dès qu’il est libre. C’est le principe des `ExecutorService` de Java, de `rayon` en Rust ou des serveurs web.

    Dans les deux cas, la sortie doit être **déterministe** : elle ne doit pas dépendre de l’ordre (imprévisible) dans lequel les threads s’exécutent.
    ''',
    ['Lancer et attendre plusieurs threads', 'Partitionner des données et fusionner des résultats', 'Protéger une structure partagée avec un verrou', 'Produire un résultat déterministe malgré le parallélisme'],
    ['Le nombre de threads est donné en entrée', 'Le verrou n’est jamais tenu pendant un calcul long', 'Résultats affichés dans un ordre indépendant de l’ordonnancement'],
    [
        step('mt-mots', 'Comptage de mots parallèle',
             '''
             Première ligne : `k`, le nombre de threads. Les lignes suivantes forment le texte : la ligne `i` (à partir de 0) est traitée par le thread `i % k`. Un mot est une suite de lettres ou chiffres, compté en minuscules.

             Affiche :

             - pour chaque thread : `thread i : L ligne(s), M mot(s)` ;
             - `total : M mot(s), D distinct(s)` ;
             - les 5 mots les plus fréquents `mot : n` (fréquence décroissante, puis ordre alphabétique).
             ''',
             [T('3\nLe chat dort. Le chien aussi !\nUn chat, deux chats.\nLe soleil brille ; le chat dort.\nDeux chiens\nfin', 'thread 0 : 2 ligne(s), 8 mot(s)\nthread 1 : 2 ligne(s), 5 mot(s)\nthread 2 : 1 ligne(s), 6 mot(s)\ntotal : 19 mot(s), 12 distinct(s)\nle : 4\nchat : 3\ndeux : 2\ndort : 2\naussi : 1'),
              T('2\na b\nb', 'thread 0 : 1 ligne(s), 2 mot(s)\nthread 1 : 1 ligne(s), 1 mot(s)\ntotal : 3 mot(s), 2 distinct(s)\nb : 2\na : 1', hidden=True)],
             rust=MT1_RUST, cpp=MT1_CPP, java=MT1_JAVA,
             hints=['Chaque thread produit son propre dictionnaire : aucun partage, donc aucun verrou.', 'Fusionne les dictionnaires dans le thread principal APRÈS avoir attendu tous les threads.'],
             xp=60),
        step('mt-pool', 'Pool de workers',
             '''
             Première ligne : `k`, le nombre de workers. Chaque ligne suivante est une tâche :

             - `fib n` (0 ≤ n ≤ 90) → `fib(n) = …`
             - `premiers n` (n ≤ 10 000 000) → `premiers(≤n) = …` (nombre de premiers ≤ n, avec un crible)
             - `collatz n` (n ≥ 1) → `collatz(n) = E étapes` (nombre d’étapes pour atteindre 1)
             - sinon → `tâche invalide : LIGNE`

             Les `k` workers se partagent **une file de tâches** protégée par un verrou. Affiche ensuite les résultats **dans l’ordre des tâches** (`#i résultat`) puis `N tâche(s) traitée(s) par k worker(s)`.
             ''',
             [T('3\nfib 10\npremiers 100\ncollatz 27\nfib 90\npremiers 1000000\ncollatz 1\ndanser 3\nfib -1', '#1 fib(10) = 55\n#2 premiers(≤100) = 25\n#3 collatz(27) = 111 étapes\n#4 fib(90) = 2880067194370816120\n#5 premiers(≤1000000) = 78498\n#6 collatz(1) = 0 étapes\n#7 tâche invalide : danser 3\n#8 tâche invalide : fib -1\n8 tâche(s) traitée(s) par 3 worker(s)'),
              T('1\npremiers 2\nfib 0\ncollatz 0', '#1 premiers(≤2) = 1\n#2 fib(0) = 0\n#3 tâche invalide : collatz 0\n3 tâche(s) traitée(s) par 1 worker(s)', hidden=True)],
             rust=MT2_RUST, cpp=MT2_CPP, java=MT2_JAVA,
             hints=['Chaque tâche garde son numéro : le worker range son résultat à cet indice.', 'Retire la tâche sous verrou, puis LIBÈRE le verrou avant de calculer.'],
             xp=70),
    ]))

dump(P, sys.argv[1], 'Projets — niveau avancé (2/3)')
