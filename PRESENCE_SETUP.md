# Presença de jogadores no Origo

## Estado desta implementação

- A presença privada usa uma sessão por aba/dispositivo em `presence/{uid}/{sessionId}`. Cada sessão guarda somente o booleano `true`; outras contas não podem ler esse ramo.
- O índice mínimo `mapPresence/{uid}/{sessionId}` contém somente sessões online de jogadores que o cliente confirmou como participantes ativos do mapa no Firestore. Os mapas escutam caminhos individuais dos perfis públicos que já carregaram, nunca a raiz de presença.
- O SDK observa `/.info/connected`, registra `onDisconnect().remove()` no servidor antes de gravar a sessão e repete o registro depois de cada reconexão.
- Logout remove somente a sessão desta aba antes de chamar `signOut`. Cada outra aba/dispositivo tem sua própria chave.
- `disponivel` permanece como preferência separada e continua controlando os convites existentes. A bolinha verde representa exclusivamente uma conexão confirmada.
- Sem configuração, desconectado ou sem leitura autorizada, o estado é `desconhecido` e não aparece verde. Perfis desativados em “Aparecer no mapa” não são carregados pelo mapa e o cliente oficial remove a sessão correspondente do índice `mapPresence`.
- Visitantes não assinam nem leem presença. Usuários autenticados podem ler o índice somente em um caminho exato `mapPresence/{uid}`. A leitura da raiz e a leitura de sessões privadas de outras contas são negadas.

## Regras e limite de confiança

`database.rules.json` contém a proposta de regras versionada e testada no Realtime Database Emulator. As regras negam por padrão, permitem ao próprio usuário ler sua sessão privada e gravar/remover somente sessões sob seu UID, e permitem que clientes autenticados leiam caminhos exatos do índice de mapa. Elas não permitem listar `/presence` nem `/mapPresence`.

O RTDB não consegue consultar `perfisPublicos` no Firestore. Por isso não existe regra que prove que o UID em `mapPresence/{uid}` tem `ativo: true` no Firestore. O cliente oficial observa o documento do próprio perfil e só publica no índice enquanto ele está ativo; ao ocultar ou remover o perfil, remove a sessão pública. As regras impedem que um usuário escreva no caminho de outra pessoa, mas um cliente autenticado modificado ainda pode publicar a própria presença no índice mesmo com o perfil oculto. Assim, a ausência de publicação para perfis ocultos é garantida pelo aplicativo oficial, não por uma validação confiável do servidor. Sem backend confiável (por exemplo, Cloud Functions, que este projeto não quer habilitar), essa garantia entre produtos Firebase não pode ser imposta.

Não publique regras como parte desta alteração. O `databaseURL` já foi configurado no commit `9a8d601`; esta tarefa altera somente regras versionadas e código do cliente.

## Regras de privacidade e consumo

O banco de presença não guarda dados pessoais, disponibilidade para jogar ou coordenadas. A chave `uid` e os identificadores aleatórios de sessão são necessários para relacionar o estado à conta e suportar abas/dispositivos separados. O índice revela apenas que existe uma sessão ativa para o UID consultado. Os mapas obtêm esses UIDs da consulta pública já filtrada de perfis do Firestore e criam listeners apenas nesses caminhos. Regras não impedem que um cliente autenticado consulte o caminho de um UID que já conheça; não há listagem pela raiz.

No Spark, a Realtime Database tem limite de 100 conexões simultâneas, 1 GB de armazenamento e 10 GB/mês de downloads incluídos. Cada aba ou dispositivo conectado conta como uma conexão. Cada perfil visível no mapa usa um listener no índice individual, sem polling e sem listener de raiz; páginas com muitos jogadores podem baixar mais dados e criar mais listeners. Acompanhe conexões e downloads na aba **Usage** do Realtime Database. Fontes oficiais: [limites](https://firebase.google.com/docs/database/usage/limits) e [faturamento](https://firebase.google.com/docs/database/usage/billing).

O Firebase executa `onDisconnect()` no servidor depois que a conexão cai ou o cliente fecha, inclusive em encerramentos abruptos. A detecção de uma perda de rede pode levar algum tempo até que o servidor perceba o socket interrompido. Em paralelo, o próprio mapa muda seus estados para desconhecido quando a conexão RTDB local cai.

## Testes locais

```bash
npm install
npm run test:all
```

Os testes usam o Realtime Database Emulator nas portas locais definidas em `firebase.json`; não acessam nem alteram o banco real. Os testes unitários simulam reconexão e várias abas. Os testes de regras usam o emulador para negar visitantes e escrita em sessões de terceiros e verificar que desconectar uma aba deixa a outra sessão ativa.
