import { APP_NAME, COMPANY, SUPPORT_EMAIL } from '../brand'

// MODELO: revisar com advogado antes do lançamento e preencher razão social, CNPJ e endereço em src/brand.ts.
const UPDATED = '04/11/2026'

export function Legal({ doc }: { doc: 'termos' | 'privacidade' }) {
  return (
    <div className="legal">
      <a className="btn btn-ghost btn-sm" href="#/">
        ← Voltar
      </a>
      {doc === 'termos' ? <Termos /> : <Privacidade />}
      <p className="tiny muted">
        Última atualização: {UPDATED}. Dúvidas: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
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
        <li>As "apostas" do jogo usam apenas milho e nunca pagam prêmios em dinheiro ou bens.</li>
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
