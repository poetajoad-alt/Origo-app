# Presença de jogadores no Origo

## Estado desta implementação

- A presença usa uma sessão por aba/dispositivo em `presence/{uid}/{sessionId}`. Cada sessão guarda somente o booleano `true`; não há localização, e-mail, nome ou disponibilidade no Realtime Database.
- O SDK observa `/.info/connected`, registra `onDisconnect().remove()` no servidor antes de gravar a sessão e repete o registro depois de cada reconexão.
- Logout remove somente a sessão desta aba antes de chamar `signOut`. Cada outra aba/dispositivo tem sua própria chave.
- `disponivel` permanece como preferência separada e continua controlando os convites existentes. A bolinha verde representa exclusivamente uma conexão confirmada.
- Sem configuração, desconectado ou sem leitura autorizada, o estado é `desconhecido` e não aparece verde. Perfis desativados em “Aparecer no mapa” não são carregados pelo mapa e não recebem indicadores.
- Visitantes não assinam nem leem presença. A leitura é habilitada somente para usuários autenticados.

## Ativar o banco (ação manual necessária)

Não há instância RTDB nem `databaseURL` no projeto Firebase atual. Para habilitar a presença no projeto `origo-fe2da` sem mudar do plano Spark:

1. Acesse [Firebase Console](https://console.firebase.google.com/project/origo-fe2da/database) e abra **Build → Realtime Database**.
2. Selecione **Create Database**. Escolha uma região próxima aos jogadores; a região não pode ser trocada depois de criada.
3. Selecione **Start in locked mode** e crie o banco. Não selecione modo de teste nem regras abertas.
4. Copie o endereço mostrado na página do banco. O Firebase usa `https://<DATABASE_NAME>.firebaseio.com` em `us-central1` e `https://<DATABASE_NAME>.<REGION>.firebasedatabase.app` nas outras regiões.
5. Envie somente esse `databaseURL` para concluir a configuração local de `firebase-config.js`. O URL identifica o banco e não é uma senha.

Não publique regras. `database.rules.json` é somente uma proposta versionada e foi usada pelo emulador local. A regra proposta autoriza leitura somente a usuários autenticados e escrita apenas em `presence/{uid}/{sessionId}` quando `auth.uid == uid`, permitindo apenas o valor `true` e a remoção daquela sessão.

## Regras de privacidade e consumo

A presença não guarda dados pessoais, mas a chave `uid` é necessária para associar sessões às contas autenticadas. Usuários autenticados podem ler os estados da coleção `presence`; a interface só aplica o estado a perfis públicos que o Firestore já entregou ao mapa. A opção de aparecer no mapa continua sendo controlada pelo perfil no Firestore.

No Spark, a Realtime Database tem limite de 100 conexões simultâneas, 1 GB de armazenamento e 10 GB/mês de downloads incluídos. Cada aba ou dispositivo conectado conta como uma conexão. O mapa usa um listener compartilhado da árvore de presença por página e não usa polling. Acompanhe conexões e downloads na aba **Usage** do Realtime Database. Fontes oficiais: [limites](https://firebase.google.com/docs/database/usage/limits) e [faturamento](https://firebase.google.com/docs/database/usage/billing).

O Firebase executa `onDisconnect()` no servidor depois que a conexão cai ou o cliente fecha, inclusive em encerramentos abruptos. A detecção de uma perda de rede pode levar algum tempo até que o servidor perceba o socket interrompido. Em paralelo, o próprio mapa muda seus estados para desconhecido quando a conexão RTDB local cai.

## Testes locais

```bash
npm install
npm run test:all
```

Os testes usam o Realtime Database Emulator nas portas locais definidas em `firebase.json`; não acessam nem alteram o banco real. Os testes unitários simulam reconexão e várias abas. Os testes de regras usam o emulador para negar visitantes e escrita em sessões de terceiros e verificar que desconectar uma aba deixa a outra sessão ativa.
