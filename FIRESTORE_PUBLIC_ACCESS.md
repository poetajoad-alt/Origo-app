# Acesso público ao conteúdo do Origo

firestore.rules é uma proposta versionada para revisão e para os testes locais do Emulator Suite. Ela **não foi publicada no projeto Firebase**.

## Mudanças propostas

- banners: leitura pública; a coleção atual não tem campo de publicação/atividade e é usada apenas pelo carrossel público. Antes de produção, confirmar que não há rascunhos nessa coleção.
- eventos: leitura pública apenas de documentos com ativo == true; visitantes consultam com esse filtro. Administradores mantêm leitura completa e escrita.
- lojas: leitura pública apenas de documentos com ativo == true; visitantes consultam com esse filtro. Administradores mantêm leitura completa e escrita.
- perfisPublicos: continua exigindo autenticação. Visitantes não consultam essa coleção nem recebem coordenadas de jogadores.
- usuarios, admins, convites, conexoes e partidas: sem leitura pública; as demais permissões permanecem conforme as regras fornecidas.

As regras do Firestore avaliam cada consulta; o filtro ativo == true precisa estar na consulta do visitante. O código da página principal e do mapa mantém esse filtro.

## Testes locais

Requisitos: Node.js e Java. Os testes usam somente o Firestore Emulator, com projeto fictício origo-public-rules-test.

```bash
npm install
npm run test:all
```

npm test executa testes de lógica e contratos de interface. npm run test:rules inicia o emulador em 127.0.0.1:8085, executa testes com visitante, jogador e administrador, e encerra o emulador. Nenhum comando deste arquivo aponta para o Firestore de produção.

## Leituras públicas e cota Spark

Cada leitura pública consome a cota diária do Firestore e pode ser repetida por visitante, dispositivo e recarregamento. A implementação mantém uma consulta por coleção na tela principal e no mapa, sem listener contínuo. Em produção, observar a aba Usage do Firestore após a ativação. O plano Spark tem cota diária de leitura; atingir o limite pode interromper leituras até a renovação da cota.

## Ativação

1. Revisar o PR e confirmar que todos os banners existentes são material de divulgação pública.
2. Executar npm run test:all antes de qualquer ativação.
3. Com autorização explícita, publicar firestore.rules pelo fluxo aprovado do Firebase Console/CLI.
4. Só depois de confirmar as regras, autorizar merge e publicação da aplicação na Vercel. Sem a etapa 3, a interface pública abre, mas banners, eventos e lojas podem receber permission-denied.

Nenhuma regra, documento ou configuração do Firebase de produção foi alterada nesta etapa.
