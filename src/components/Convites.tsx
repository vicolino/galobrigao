// 🎟️ Card "Convide amigos" do Perfil: o acesso ao jogo é só por convite (whitelist).
import { useEffect, useState } from 'react'
import { api, type MyInvites } from '../api'
import { useGame } from '../game/store'
import { locale, t, tx } from '../i18n'

const STATUS: Record<string, string> = {
  ativo: t('disponível'),
  usado: t('usado'),
  expirado: t('expirado'),
  cancelado: t('cancelado'),
}

export function MyInvitesCard() {
  const { toast } = useGame()
  const [d, setD] = useState<MyInvites | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.convites.list().then(setD).catch(() => null)
  }, [])
  if (!d || d.perPlayer <= 0) return null

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(t('Link copiado!'), 'ok')
    } catch {
      toast(text, 'info')
    }
  }
  const create = async () => {
    setBusy(true)
    try {
      setD(await api.convites.create())
      toast(t('Convite criado! Mande o link para um amigo.'), 'ok')
    } catch (e) {
      toast(tx((e as Error).message), 'erro')
    }
    setBusy(false)
  }

  return (
    <div className="card">
      <h3>{t('🎟️ Convide amigos')}</h3>
      <p className="muted small">
        {d.on ? t('O Galo Brigão está em acesso fechado: só entra quem recebe um convite.') : t('Convide amigos para criarem galos com você.')}{' '}
        {t('Você pode gerar {n} convites de 1 uso.', { n: d.perPlayer })}
      </p>
      {d.codes.length > 0 && (
        <div className="list" style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
          {d.codes.map((c) => (
            <div key={c.code} className="row-between">
              <div>
                <b style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{c.code}</b>{' '}
                <span className={`tiny ${c.status === 'ativo' ? 'pos' : 'muted'}`}>· {STATUS[c.status]}</span>
                {c.usedBy.length > 0 && <div className="tiny muted">{t('Entrou: {nomes}', { nomes: c.usedBy.join(', ') })}</div>}
                {c.status === 'ativo' && c.expiresAt && <div className="tiny muted">{t('Vale até {data}', { data: new Date(c.expiresAt).toLocaleDateString(locale()) })}</div>}
              </div>
              {c.status === 'ativo' && (
                <button className="btn btn-sm" onClick={() => copy(c.link)}>
                  {t('Copiar link')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!d.verified ? (
        <p className="tiny muted">{t('Confirme seu e-mail para poder convidar amigos.')}</p>
      ) : d.left > 0 ? (
        <button className="btn btn-primary" disabled={busy} onClick={create}>
          {busy ? t('Aguarde...') : t('Gerar convite ({n} restantes)', { n: d.left })}
        </button>
      ) : (
        <p className="tiny muted">{t('Você já usou todos os seus convites.')}</p>
      )}
    </div>
  )
}
