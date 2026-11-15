/**
 * Método de ganchos para vídeos de imóveis (Instagram/TikTok).
 * Usado como instrução para a IA e como base dos modelos sem IA.
 */
export const HOOK_METHOD = `
O objetivo do gancho é fazer a pessoa parar de rolar o feed nos primeiros 3 segundos.

Tipos de gancho (com exemplos):
1. Preço e oportunidade
   - "Você imaginava encontrar uma casa assim por apenas R$ valor?"
   - "Olha o que você consegue comprar com R$ valor nesta região."
   - "Se você está procurando imóvel até R$ valor, precisa conhecer este."
   - "Este imóvel tem um diferencial que está cada vez mais difícil de encontrar nessa faixa de preço."
2. Localização
   - "Já pensou morar a apenas X minutos do centro?"
   - "Uma das regiões mais procuradas de [cidade] e olha o que encontramos por aqui."
   - "Se você quer morar no [bairro], preste atenção nesta oportunidade."
   - "O melhor deste imóvel talvez nem seja a casa, mas onde ela está."
3. Metragem e estrutura
   - "São X metros quadrados muito bem aproveitados. Vem conhecer."
   - "Uma casa com X quartos, X vagas e ainda esse espaço externo."
   - "Sabe aquela casa onde cada pessoa da família tem seu espaço?"
   - "O que você faria com um terreno de X metros quadrados?"
4. Desejo e estilo de vida
   - "Imagine acordar todos os dias com essa vista."
   - "Se você procura espaço, conforto e privacidade, olha isso."
   - "Essa é para quem sonha em receber a família e os amigos em casa."
   - "Já imaginou passar os finais de semana com a família neste espaço?"
5. Curiosidade
   - "Tem um detalhe nesta casa que você provavelmente não vai encontrar em outras."
   - "Espere até ver o que tem nos fundos deste imóvel."
   - "Por fora, você não imagina o que vai encontrar aqui dentro."
   - "Vou mostrar por que esse imóvel merece entrar na sua lista."

Transforme características em benefícios — não leia o anúncio:
- 3 dormitórios → Espaço para toda a família
- 2 vagas → Chega de disputar espaço para estacionar
- 200 m² de terreno → Espaço para construir sua área de lazer
- Suíte → Mais privacidade e conforto
- Piscina → Seu lazer sem precisar sair de casa
- R$ 450 mil → O que R$ 450 mil podem comprar nesta região?
- Próximo ao centro → Mais praticidade no seu dia a dia

Fórmula do vídeo (até 30 s):
- 0–3 s GANCHO
- 3–15 s APRESENTAÇÃO: fachada, sala, cozinha, dormitórios e principais diferenciais
- 15–25 s DESEJO: o melhor ambiente ou diferencial
- 25–30 s CHAMADA PARA AÇÃO: "Quer conhecer pessoalmente? Me chama no direct e agende sua visita."
`;
