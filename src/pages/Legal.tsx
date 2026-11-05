import { APP_NAME, COMPANY, SUPPORT_EMAIL } from '../brand'
import { lang, locale, t } from '../i18n'

// MODELO: revisar com advogado antes do lançamento e preencher razão social, CNPJ e endereço em src/brand.ts.
const UPDATED = new Date(2026, 10, 4).toLocaleDateString(locale())

export function Legal({ doc }: { doc: 'termos' | 'privacidade' }) {
  return (
    <div className="legal">
      <a className="btn btn-ghost btn-sm" href="#/">
        {t('← Voltar')}
      </a>
      {lang() === 'en' ? doc === 'termos' ? <TermsEn /> : <PrivacyEn /> : doc === 'termos' ? <Termos /> : <Privacidade />}
      <p className="tiny muted">
        {t('Última atualização: {data}. Dúvidas:', { data: UPDATED })} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </p>
    </div>
  )
}

function Termos() {
  return (
    <>
      <h1>Termos de Uso — {APP_NAME}</h1>
      <p>
        Estes termos regem o uso do jogo {APP_NAME}, oferecido por {COMPANY}. Ao criar uma conta, você concorda com eles.
      </p>
      <h3>1. Quem pode jogar</h3>
      <p>O jogo é destinado a maiores de 18 anos. Ao se cadastrar, você declara ter 18 anos ou mais.</p>
      <h3>2. O jogo</h3>
      <p>
        {APP_NAME} é um jogo de entretenimento com personagens de desenho animado. Nenhum animal real participa ou é retratado. As lutas são simulações por computador.
      </p>
      <h3>3. Moedas e itens virtuais</h3>
      <ul>
        <li>Milho e ovos de ouro são moedas virtuais usadas só dentro do jogo.</li>
        <li>Moedas e itens virtuais <b>não têm valor em dinheiro, não podem ser sacados, trocados por dinheiro nem transferidos</b> para outras contas.</li>
        <li>Você recebe uma licença de uso dos itens virtuais, não a propriedade deles.</li>
        <li>As "apostas" do jogo usam apenas fichas (🎟️), que só servem para apostar: são ganhas jogando, não podem ser compradas, transferidas nem trocadas por milho, ovos, itens ou dinheiro. Apostas nunca pagam prêmios em dinheiro, moedas ou bens.</li>
      </ul>
      <h3>4. Compras</h3>
      <ul>
        <li>Pagamentos são processados por terceiros (ex.: Mercado Pago). Não armazenamos dados de cartão.</li>
        <li>Os itens são entregues assim que o pagamento é confirmado.</li>
        <li>
          Direito de arrependimento (art. 49 do CDC): você pode pedir reembolso em até 7 dias da compra se os itens comprados ainda não tiverem sido usados. Escreva para{' '}
          {SUPPORT_EMAIL}.
        </li>
        <li>Você pode definir um limite mensal de gastos no Perfil. Aumentos de limite valem após 24 horas.</li>
      </ul>
      <h3>5. Conduta</h3>
      <p>É proibido usar trapaças, automatizar o jogo, explorar falhas ou revender contas e itens. Contas que fizerem isso podem ser suspensas.</p>
      <h3>6. Disponibilidade</h3>
      <p>Podemos alterar, equilibrar ou encerrar recursos do jogo. Em caso de encerramento definitivo, avisaremos com pelo menos 30 dias de antecedência.</p>
      <h3>7. Foro</h3>
      <p>Aplica-se a lei brasileira. Fica eleito o foro do domicílio do consumidor.</p>
    </>
  )
}

function Privacidade() {
  return (
    <>
      <h1>Política de Privacidade — {APP_NAME}</h1>
      <p>Esta política explica como {COMPANY} trata seus dados, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</p>
      <h3>1. Dados que coletamos</h3>
      <ul>
        <li>Cadastro: e-mail, nome de criador e senha (guardada de forma criptografada, nunca em texto).</li>
        <li>Jogo: seu progresso, compras feitas e histórico de moedas.</li>
        <li>Pagamentos: valor, data e situação do pedido. Os dados do cartão ou da conta bancária ficam com o processador de pagamento.</li>
        <li>Técnicos: endereço IP e cookies de sessão, para manter você conectado e prevenir fraude.</li>
      </ul>
      <h3>2. Para que usamos</h3>
      <ul>
        <li>Executar o contrato: criar sua conta, salvar o progresso e entregar compras.</li>
        <li>Obrigação legal: guardar registros de pagamento pelo prazo exigido na lei fiscal.</li>
        <li>Legítimo interesse: prevenir trapaça e fraude, e melhorar o jogo.</li>
      </ul>
      <h3>3. Com quem compartilhamos</h3>
      <p>Somente com o processador de pagamento (Mercado Pago), o serviço de e-mail e o provedor de hospedagem, na medida do necessário. Não vendemos seus dados.</p>
      <h3>4. Seus direitos</h3>
      <p>
        Você pode acessar, corrigir e excluir seus dados. A exclusão da conta está disponível no Perfil, em "Excluir minha conta". Registros de pagamento são mantidos sem identificação pessoal pelo prazo legal.
      </p>
      <h3>5. Cookies</h3>
      <p>Usamos apenas um cookie essencial de sessão. Não usamos cookies de publicidade.</p>
      <h3>6. Contato do encarregado (DPO)</h3>
      <p>{SUPPORT_EMAIL}</p>
    </>
  )
}

// ---------- English version (keep in sync with the Portuguese text above) ----------

function TermsEn() {
  return (
    <>
      <h1>Terms of Use — {APP_NAME}</h1>
      <p>
        These terms govern your use of the game {APP_NAME}, provided by {COMPANY}. By creating an account, you agree to them.
      </p>
      <h3>1. Who can play</h3>
      <p>The game is intended for people aged 18 or over. By signing up, you confirm that you are at least 18 years old.</p>
      <h3>2. The game</h3>
      <p>
        {APP_NAME} is an entertainment game featuring cartoon characters. No real animals take part in it or are depicted. All fights are computer simulations.
      </p>
      <h3>3. Virtual currencies and items</h3>
      <ul>
        <li>Corn and golden eggs are virtual currencies that can only be used inside the game.</li>
        <li>Virtual currencies and items <b>have no monetary value and cannot be withdrawn, exchanged for money or transferred</b> to other accounts.</li>
        <li>You receive a license to use virtual items, not ownership of them.</li>
        <li>The in-game "bets" use chips (🎟️) only. Chips exist only for betting: they are earned by playing and cannot be bought, transferred or exchanged for corn, eggs, items or money. Bets never pay out prizes in money, coins or goods.</li>
      </ul>
      <h3>4. Purchases</h3>
      <ul>
        <li>Payments are processed by third parties (e.g. Mercado Pago). We do not store card details.</li>
        <li>Items are delivered as soon as the payment is confirmed.</li>
        <li>
          Right of withdrawal (art. 49 of the Brazilian Consumer Protection Code — CDC): you may request a refund within 7 days of purchase if the purchased items have not been used yet. Write to{' '}
          {SUPPORT_EMAIL}.
        </li>
        <li>You can set a monthly spending limit in your Profile. Limit increases take effect after 24 hours.</li>
      </ul>
      <h3>5. Conduct</h3>
      <p>Cheating, automating the game, exploiting bugs, or reselling accounts and items is prohibited. Accounts that do so may be suspended.</p>
      <h3>6. Availability</h3>
      <p>We may change, rebalance or discontinue game features. If the game is shut down permanently, we will give at least 30 days' notice.</p>
      <h3>7. Governing law and jurisdiction</h3>
      <p>These terms are governed by Brazilian law. The courts of the consumer's place of residence shall have jurisdiction.</p>
    </>
  )
}

function PrivacyEn() {
  return (
    <>
      <h1>Privacy Policy — {APP_NAME}</h1>
      <p>This policy explains how {COMPANY} handles your data, in accordance with the Brazilian General Data Protection Law (LGPD — Law 13,709/2018).</p>
      <h3>1. Data we collect</h3>
      <ul>
        <li>Sign-up: email, breeder name and password (stored encrypted, never as plain text).</li>
        <li>Game: your progress, purchases made and currency history.</li>
        <li>Payments: amount, date and order status. Card or bank account details stay with the payment processor.</li>
        <li>Technical: IP address and session cookies, to keep you logged in and prevent fraud.</li>
      </ul>
      <h3>2. What we use it for</h3>
      <ul>
        <li>Performance of the contract: creating your account, saving your progress and delivering purchases.</li>
        <li>Legal obligation: keeping payment records for the period required by tax law.</li>
        <li>Legitimate interest: preventing cheating and fraud, and improving the game.</li>
      </ul>
      <h3>3. Who we share it with</h3>
      <p>Only with the payment processor (Mercado Pago), the email service and the hosting provider, to the extent necessary. We do not sell your data.</p>
      <h3>4. Your rights</h3>
      <p>
        You can access, correct and delete your data. Account deletion is available in your Profile, under "Delete my account". Payment records are kept without personal identification for the legally required period.
      </p>
      <h3>5. Cookies</h3>
      <p>We only use one essential session cookie. We do not use advertising cookies.</p>
      <h3>6. Data Protection Officer (DPO) contact</h3>
      <p>{SUPPORT_EMAIL}</p>
    </>
  )
}
