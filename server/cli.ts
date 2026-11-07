// Comandos de administração para rodar NO SERVIDOR (nunca pela internet).
//   node dist-server/cli.mjs admin add email@dominio.com
//   node dist-server/cli.mjs admin remove email@dominio.com
//   node dist-server/cli.mjs admin list
//   node dist-server/cli.mjs backup /caminho/arquivo.sqlite
import { randomBytes, randomUUID } from 'node:crypto'
import { hashPassword } from './auth'
import { getDb } from './db'

try {
  process.loadEnvFile?.('.env')
} catch {
  /* sem .env */
}

const [cmd, sub, arg] = process.argv.slice(2)
const db = getDb()

if (cmd === 'admin') {
  if (sub === 'create' && arg) {
    // Cria a conta já como admin, com senha temporária (troque no Perfil ao entrar)
    const email = arg.trim().toLowerCase()
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      console.error(`Já existe conta com ${email}. Use "admin add" para promover.`)
      process.exit(1)
    }
    const temp = randomBytes(9).toString('base64url')
    const { hash, salt } = await hashPassword(temp)
    const now = Date.now()
    const name = (process.argv[5] ?? email.split('@')[0]).slice(0, 16)
    db.prepare(
      "INSERT INTO users (id, email, name, pass_hash, salt, created_at, adult_confirmed_at, terms_accepted_at, monthly_limit_cents, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')",
    ).run(randomUUID(), email, name, hash, salt, now, now, now, 50000)
    console.log(`✅ Admin criado: ${email}\n   Senha temporária: ${temp}\n   Entre no jogo e troque em Perfil → Trocar senha.`)
  } else if (sub === 'list') {
    console.table(db.prepare("SELECT email, name FROM users WHERE role = 'admin'").all())
  } else if ((sub === 'add' || sub === 'remove') && arg) {
    const r = db.prepare('UPDATE users SET role = ? WHERE email = ?').run(sub === 'add' ? 'admin' : 'player', arg.trim().toLowerCase())
    if (!r.changes) {
      console.error(`Nenhuma conta com o e-mail ${arg}. Crie a conta no jogo primeiro.`)
      process.exit(1)
    }
    if (sub === 'add') db.prepare('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').run(arg.trim().toLowerCase())
    console.log(sub === 'add' ? `✅ ${arg} agora é administrador (entre de novo no jogo).` : `✅ ${arg} não é mais administrador.`)
  } else {
    console.log('Uso: admin create <email> [nome] · admin add|remove <email> · admin list')
  }
} else if (cmd === 'backup' && sub) {
  db.exec(`VACUUM INTO '${sub.replace(/'/g, "''")}'`)
  console.log(`✅ Backup salvo em ${sub}`)
} else {
  console.log('Comandos: admin add|remove|list, backup <arquivo>')
}
