/**
 * E-mails transactionnels : vérification de l'adresse et mot de passe oublié.
 * Sans SMTP configuré, les liens sont écrits dans les journaux du serveur
 * (et la vérification n'est pas imposée, faute de pouvoir envoyer le message).
 */
import { createHash, randomBytes } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type { User } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../db.js';

export const smtpConfigured = () => !!config.smtp.host;
/** La vérification est imposée seulement si un serveur d'envoi est configuré. */
export const verificationRequired = () => config.requireEmailVerification && smtpConfigured();

let transport: Transporter | null = null;
function transporter() {
  if (!transport)
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  return transport;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function layout(title: string, intro: string, button: string, url: string, outro: string) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#eef4ff;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2538">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:24px;padding:32px;box-shadow:0 6px 24px rgba(30,50,120,.12)">
    <tr><td style="font-size:26px;font-weight:900;color:#3b6cf6">&lt;/&gt; ${esc(config.appName)}</td></tr>
    <tr><td style="padding-top:18px;font-size:22px;font-weight:800">${esc(title)}</td></tr>
    <tr><td style="padding-top:10px;font-size:16px;line-height:1.6">${intro}</td></tr>
    <tr><td style="padding:24px 0"><a href="${esc(url)}" style="display:inline-block;background:#3b6cf6;color:#fff;text-decoration:none;font-weight:800;padding:14px 26px;border-radius:16px">${esc(button)}</a></td></tr>
    <tr><td style="font-size:13px;color:#64708f;line-height:1.6">${outro}<br><br>Si le bouton ne fonctionne pas, copie ce lien :<br><span style="word-break:break-all;color:#3b6cf6">${esc(url)}</span></td></tr>
  </table>
  <p style="font-size:12px;color:#8f9bb8">Kiri te souhaite un bon apprentissage 💙</p>
  </td></tr></table></body></html>`;
}

async function send(to: string, subject: string, html: string, text: string) {
  if (!smtpConfigured()) {
    console.warn(`[e-mail non envoyé : SMTP non configuré] À ${to} — ${subject}\n${text}`);
    return false;
  }
  await transporter().sendMail({ from: config.smtp.from, to, subject, html, text });
  return true;
}

async function newToken(userId: string, kind: 'verify' | 'reset', hours: number) {
  const token = randomBytes(32).toString('base64url');
  await prisma.emailToken.deleteMany({ where: { userId, kind } });
  await prisma.emailToken.create({ data: { userId, kind, tokenHash: sha(token), expiresAt: new Date(Date.now() + hours * 3600_000) } });
  return token;
}

/** Consomme un jeton valide et renvoie l'utilisateur, ou null. */
export async function consumeToken(token: string, kind: 'verify' | 'reset') {
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha(token) }, include: { user: true } });
  if (!row || row.kind !== kind || row.expiresAt < new Date()) return null;
  await prisma.emailToken.delete({ where: { id: row.id } });
  return row.user;
}

const base = () => config.publicUrl.replace(/\/$/, '');

export async function sendVerification(user: User) {
  const token = await newToken(user.id, 'verify', 48);
  const url = `${base()}/verifier-email?token=${token}`;
  return send(
    user.email,
    `Confirme ton adresse e-mail — ${config.appName}`,
    layout(`Bienvenue, ${user.displayName} !`, 'Il ne reste qu’une étape : confirme ton adresse e-mail pour commencer à apprendre avec Kiri.', 'Confirmer mon adresse', url, 'Ce lien est valable 48 heures. Si tu n’as pas créé de compte, ignore simplement ce message.'),
    `Bienvenue ! Confirme ton adresse e-mail en ouvrant ce lien (valable 48 h) : ${url}`,
  );
}

export async function sendPasswordReset(user: User) {
  const token = await newToken(user.id, 'reset', 1);
  const url = `${base()}/nouveau-mot-de-passe?token=${token}`;
  return send(
    user.email,
    `Réinitialise ton mot de passe — ${config.appName}`,
    layout('Mot de passe oublié ?', 'Pas de panique ! Clique sur le bouton pour choisir un nouveau mot de passe.', 'Choisir un nouveau mot de passe', url, 'Ce lien est valable 1 heure. Si tu n’as rien demandé, ignore ce message : ton mot de passe actuel reste valable.'),
    `Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 h) : ${url}`,
  );
}
