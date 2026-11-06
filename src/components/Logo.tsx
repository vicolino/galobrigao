import { RoosterSvg } from './RoosterSvg'
import { appName } from '../brand'

/** Galo-herói da marca (Galo de Ouro com fogo e coroa), igual ao do jogo. */
export function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }}>
      <RoosterSvg breedId="dourado" skin="fogo" equipped={{ cabeca: 'coroa' }} anim="idle" size={size} />
    </span>
  )
}

/** Logotipo completo: o galo-herói + a palavra da marca (troca para "Chicken Fighter" em inglês). */
export function Logo({ size = 48 }: { size?: number }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className="logo-word">{appName()}</span>
    </span>
  )
}
