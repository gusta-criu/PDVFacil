# PRD — Casa do Bife PDV Mobile

**Versão:** 1.0 (MVP)  
**Data:** 15/11/2026  
**Status:** Especificação para implementação e validação técnica  
**Público-alvo deste documento:** desenvolvedor ou agente de programação (Claude)

## 1. Visão do produto

Aplicativo Android para um frigorífico/açougue de balcão, inicialmente utilizado por **um funcionário em um único celular**, para ler etiquetas EAN-13 impressas pela balança Filizola, montar um carrinho, totalizar compras, registrar pagamentos, armazenar vendas localmente e imprimir **resumo de compra não fiscal** em impressora térmica portátil Bluetooth.

A balança existente continua responsável pela pesagem, precificação e emissão das etiquetas. O aplicativo **não** precisa se comunicar diretamente com a balança no MVP. A câmera do celular substitui um leitor de código de barras dedicado.

### Problema atual

O atendimento e a soma das compras são feitos com papel e calculadora. Isso gera retrabalho, risco de erro, dificuldade para localizar vendas e ausência de um resumo padronizado para o cliente.

### Objetivos

1. Reduzir o tempo necessário para registrar e somar etiquetas.
2. Eliminar a soma manual dos preços de cada embalagem.
3. Gerar comprovante legível com identificação da venda e seus itens.
4. Registrar histórico e fechamento diário mesmo sem internet.
5. Manter o custo de implantação baixo, reutilizando a Filizola e um celular Android.

### Não objetivos do MVP

- Emissão de NFC-e, NF-e ou substituição de obrigações fiscais.
- Controle completo de estoque, rastreabilidade sanitária ou gestão de abate.
- Sincronização entre dispositivos, múltiplos caixas, multiusuários ou nuvem.
- Integração direta por serial/rede com a balança.
- Fidelidade, cadastro de clientes, delivery ou e-commerce.
- Reconstrução automática do peso a partir de um EAN que codifique somente preço.

## 2. Contexto operacional e evidências

Equipamento fotografado: balança etiquetadora **Filizola**, com teclado de produtos e impressora de etiquetas. O modelo exato e as opções de configuração não foram confirmados.

Etiquetas fornecidas pelo proprietário:

| Produto na etiqueta | Peso | Preço/kg | Total | Sequência visível/informada |
|---|---:|---:|---:|---|
| Patinho | 0,118 kg | R$ 55,00 | R$ 6,49 | `2000003006496` (informada explicitamente) |
| Maminha | 1,508 kg | R$ 60,00 | R$ 90,48 | aparentemente `2000018090480` (transcrição visual, **não validada por scanner**) |
| Diversos | 4,028 kg | R$ 50,00 | R$ 201,40 | aparentemente `2000000201405` (transcrição visual, **não validada por scanner**) |

**Atenção:** a interpretação dos códigos ainda é hipótese. Para `2000003006496`, a separação candidata é `2 | 000003 | 00649 | 6`, correspondendo a prefixo, identificador de produto, preço em centavos e dígito verificador. **Não assumir esse formato como confirmado** até testar etiquetas reais escaneadas, inclusive a validade do dígito verificador. O campo monetário deve ser extraído somente quando a regra estiver validada. A descrição do produto deve vir de um cadastro local vinculado ao identificador.

O código EAN-13 pode codificar preço, peso ou outro dado conforme configuração da balança. A etiqueta impressa mostra peso e preço/kg, mas isso **não garante** que ambos estejam presentes no código.

## 3. Usuário e ambiente

- **Perfil:** operador de balcão/caixa, não técnico.
- **Dispositivos:** 1 smartphone Android, 1 balança Filizola existente, 1 impressora térmica portátil Bluetooth a definir.
- **Conectividade:** operação principal offline.
- **Uso:** ambiente de atendimento rápido, possivelmente com iluminação variável, etiquetas curvas ou amassadas e conexão Bluetooth intermitente.
- **Princípio UX:** foco automático na próxima leitura, poucas etapas e botões grandes.

## 4. Fluxo principal

1. Operador abre o aplicativo e inicia uma venda vazia.
2. Cliente apresenta embalagens já pesadas e etiquetadas na Filizola.
3. Operador toca em **Ler etiqueta** e aponta a câmera para o EAN-13.
4. Aplicativo valida o formato, o dígito verificador, a regra de codificação e o produto cadastrado.
5. Aplicativo adiciona **uma linha por etiqueta**, exibindo descrição e valor; dá feedback visual e opcionalmente vibração.
6. Operador repete até concluir a compra; pode remover um item incorreto com confirmação.
7. Operador confere subtotal, eventual desconto autorizado e total.
8. Operador informa a forma de pagamento (Pix, dinheiro ou cartão; combinação de formas fica para evolução se não for implementada no MVP).
9. Aplicativo salva a venda de modo transacional, com número único local e status concluído.
10. Operador solicita impressão do resumo não fiscal via Bluetooth.
11. Se a impressão falhar, a venda continua salva; é possível **reimprimir** sem duplicar a venda.
12. Operador inicia a próxima venda.

## 5. Requisitos funcionais

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| RF-01 | Leitura de EAN-13 com câmera traseira | P0 | Lê etiqueta real em condições normais e retorna exatamente 13 dígitos |
| RF-02 | Validação EAN-13 e formato Filizola configurado | P0 | Código inválido não entra no carrinho; erro explicativo |
| RF-03 | Cadastro local de produtos por código da balança | P0 | Permite criar/editar/desativar e consultar código e nome |
| RF-04 | Decodificação do preço somente após validar o layout | P0 | `2000003006496` resulta em R$ 6,49 **se** a hipótese for confirmada; testes automatizados cobrem a regra |
| RF-05 | Carrinho com múltiplas etiquetas | P0 | Soma corretamente valores em centavos, inclusive etiquetas do mesmo produto |
| RF-06 | Proteção contra leituras duplicadas acidentais | P0 | Leituras repetidas em curto intervalo pedem confirmação; não proibir duas embalagens legitimamente iguais |
| RF-07 | Remoção de item e cancelamento de venda em aberto | P0 | Exige confirmação e recalcula o total |
| RF-08 | Registro de forma de pagamento | P0 | Pix/dinheiro/cartão salvos na venda |
| RF-09 | Histórico local e detalhe da venda | P0 | Venda concluída persiste após reiniciar aplicativo/celular |
| RF-10 | Resumo não fiscal imprimível | P0 | Mostra loja, número, data/hora, itens, totais, pagamento e aviso não fiscal |
| RF-11 | Reimpressão | P0 | Não cria nova venda e identifica segunda via |
| RF-12 | Fechamento diário | P0 | Exibe quantidade de vendas, total e agrupamento por forma de pagamento |
| RF-13 | Lançamento manual supervisionado | P1 | Permite recuperar atendimento se etiqueta estiver ilegível; identifica item como manual |
| RF-14 | Desconto com confirmação | P1 | Registra valor e motivo/operação; não permite total negativo |
| RF-15 | Exportação/backup local | P1 | Exporta dados para arquivo recuperável e oferece restauração testada |
| RF-16 | Configurações da impressora | P0 | Pareia/seleciona impressora compatível e imprime teste |
| RF-17 | Configuração dos dados da loja | P0 | Nome e demais dados do cabeçalho editáveis |

**Regra importante:** se o EAN codificar preço e não peso, o recibo do MVP exibirá descrição e valor, **sem inventar peso ou preço/kg**. Uma opção de digitar peso manualmente pode ser oferecida com indicação explícita de entrada manual.

## 6. Requisitos não funcionais

- **Offline-first:** cadastrar produtos, escanear, fechar venda, consultar histórico e gerar comandos de impressão sem internet.
- **Integridade:** salvar venda e itens em transação atômica; nunca marcar uma venda como concluída antes de persistir os dados.
- **Precisão:** dinheiro em centavos inteiros; se peso for registrado, usar gramas inteiras. Evitar `float` para operações financeiras.
- **Desempenho:** leitura e inclusão percebidas como imediatas; meta inicial de menos de 1 segundo após decodificação válida em aparelho de referência.
- **Resiliência:** impressão com falha não perde a venda; tela de recuperação após fechamento inesperado.
- **Usabilidade:** alto contraste, tipografia legível, alvos de toque grandes, fluxo utilizável com uma mão quando possível.
- **Privacidade:** não coletar dados pessoais do cliente por padrão; dados persistidos no dispositivo e protegidos por mecanismos disponíveis no Android.
- **Segurança:** impedir alteração silenciosa de vendas concluídas; registrar cancelamentos e ajustes.
- **Backup:** cópia exportável para evitar perda de todo o histórico em caso de dano ou troca de celular.

## 7. Arquitetura técnica recomendada

### Decisão principal

**Aplicativo Android com interface em React + TypeScript + Capacitor**, armazenamento SQLite local e plugin/ponte nativa para impressora Bluetooth. Tailwind CSS para interface.

Motivo: o requisito de impressão em mini impressora Bluetooth econômica pode exigir **Bluetooth Classic SPP**, que não deve ser presumido disponível diretamente em uma PWA/Chrome. O aplicativo nativo permite controlar permissões, pareamento e envio ESC/POS quando o hardware for compatível.

### Componentes

1. **UI React/TypeScript:** caixa, câmera, carrinho, histórico, produtos e configurações.
2. **Barcode service:** biblioteca de leitura de câmera compatível com Android/Capacitor; retornar EAN bruto, com validação independente.
3. **Barcode parser:** função pura e testável, com layout de etiqueta configurável; rejeitar padrões desconhecidos.
4. **SQLite repository:** operações transacionais, migrações e consultas do fechamento.
5. **Printer adapter:** interface abstrata `printReceipt(sale)`; implementação ESC/POS Bluetooth somente após confirmar modelo/protocolo; mock para desenvolvimento.
6. **Backup service:** exportação/restauração de banco ou dados em formato versionado.

Não introduzir backend Node.js ou servidor de rede no MVP de um único aparelho, salvo necessidade concreta demonstrada. Se houver futura sincronização, acrescentar backend posteriormente.

### Modelo de dados mínimo

```text
products
  id, scale_code (unique), name, unit, active, created_at, updated_at

sales
  id (UUID), sequential_number, created_at, status,
  subtotal_cents, discount_cents, total_cents,
  payment_method, payment_amount_cents,
  printed_at (nullable)

sale_items
  id, sale_id, product_id (nullable), product_name_snapshot,
  barcode_raw (nullable), source (barcode|manual),
  price_cents, weight_grams (nullable),
  unit_price_cents_per_kg (nullable)

app_settings
  key, value

print_attempts
  id, sale_id, attempted_at, status, error_message (nullable)
```

Observações: usar snapshots de nome e valores no momento da venda; permitir histórico mesmo após renomear produto. `printed_at` é informativo, pois o envio Bluetooth bem-sucedido não garante necessariamente que o papel saiu. Não usar somente o código de barras como chave única de item: duas embalagens podem ter códigos idênticos.

## 8. Decodificador EAN-13

Implementar a validação padrão do dígito verificador EAN-13 antes de qualquer parsing. Definir layout como configuração explícita, por exemplo:

```ts
type BarcodeLayout = {
  prefix: string;
  productStart: number;
  productLength: number;
  valueStart: number;
  valueLength: number;
  valueKind: 'price_cents' | 'weight_grams';
};
```

**Layout candidato, não confirmado:** prefixo `2`; código do produto nas posições 2–7 (índices 1–6); preço em centavos nas posições 8–12 (índices 7–11); último dígito verificador.

Regras:

- Exigir 13 caracteres numéricos.
- Verificar check digit EAN-13.
- Rejeitar prefixos não configurados.
- Resolver código de produto cadastrado; se não encontrado, apresentar fluxo de cadastro ou erro, sem atribuir nome arbitrário.
- Confirmar se os cinco dígitos representam preço em centavos antes de usar em produção.
- Não deduzir peso a partir de preço/kg sem conhecer preço/kg efetivamente usado na balança e a regra de arredondamento.
- Criar testes unitários com códigos reais obtidos por scanner e seus totais impressos.

### Protocolo de validação da balança (bloqueante para produção)

Coletar pelo menos 3 a 5 leituras **digitais** do código (não somente fotos), incluindo: mesmo produto com pesos diferentes, outro produto, um produto de valor alto e, se possível, repetição de impressão. Para cada etiqueta registrar código lido, nome, peso, preço/kg e total. Validar checksum, posições de produto e campo variável. Caso algum exemplo não corresponda, investigar configuração da Filizola antes de liberar a função.

## 9. Telas do aplicativo

### Tela A — Nova venda (principal)

- Cabeçalho Casa do Bife e identificação da venda em andamento.
- Botão primário **Ler etiqueta** abre câmera com guia visual.
- Lista de itens: descrição, código opcional, valor, ação remover.
- Total sempre visível.
- Ações: lançamento manual (secundária), cancelar, finalizar.
- Após leitura bem-sucedida, retornar automaticamente ao carrinho ou manter modo de leitura contínua configurável.

### Tela B — Finalizar venda

- Revisão de itens e total.
- Escolha Pix / dinheiro / cartão.
- Botão **Confirmar venda** com prevenção de toque duplo.
- Estado pós-venda: **Imprimir resumo**, **Reimprimir**, **Nova venda**.

### Tela C — Histórico

- Lista por data, número e total.
- Detalhes e reimpressão.
- Vendas concluídas não podem ser editadas silenciosamente.

### Tela D — Fechamento diário

- Data, número de vendas, total vendido, total por forma de pagamento e cancelamentos.
- Possibilidade de consultar dias anteriores.

### Tela E — Produtos

- Lista e busca por nome/código.
- Criar, editar e desativar produto.
- O preço cadastrado, se houver, é apenas referência e não substitui o preço codificado na etiqueta.

### Tela F — Configurações

- Dados da loja.
- Impressora Bluetooth: selecionar, testar e diagnosticar.
- Layout de código de barras validado.
- Backup/exportação e restauração.

## 10. Formato do resumo impresso

Bobina de **58 mm**, largura útil e número de caracteres configuráveis conforme impressora e fonte. Não fixar layout em 80 mm.

```text
          CASA DO BIFE
        RESUMO DE COMPRA
       DOCUMENTO NAO FISCAL
--------------------------------
Venda: 000001
Data: 15/11/2026 10:35
--------------------------------
PATINHO                R$  6,49
MAMINHA                R$ 90,48
DIVERSOS               R$201,40
--------------------------------
TOTAL                  R$298,37
Pagamento: PIX
--------------------------------
Obrigado pela preferencia!
Este resumo nao substitui
um documento fiscal.
```

Usar acentuação quando a impressora suportar página de códigos compatível; caso contrário, fallback sem acentos. Na reimpressão acrescentar `2a VIA`. Impressão deve ter tratamento de indisponibilidade, falta de papel, conexão interrompida e tentativas repetidas.

**Conformidade:** recibo não fiscal é apenas um resumo comercial e **não substitui NFC-e ou outra documentação fiscal legalmente exigida**. Validar as obrigações fiscais aplicáveis ao estabelecimento com contador antes da operação real.

## 11. Casos de erro e exceções

| Cenário | Comportamento esperado |
|---|---|
| Código ilegível | Permitir nova tentativa; lançamento manual identificado se habilitado |
| Check digit inválido | Rejeitar com mensagem clara |
| Produto desconhecido | Não registrar automaticamente; solicitar cadastro/conferência |
| Leitura repetida instantânea | Pedir confirmação antes de adicionar novamente |
| Duas etiquetas legítimas iguais | Permitir adicionar ambas após confirmação |
| Valor zerado/incoerente | Bloquear ou pedir revisão explícita |
| Câmera sem permissão | Explicar e oferecer acesso às configurações |
| Impressora desconectada | Venda permanece concluída; permitir reconectar/reimprimir |
| Aplicativo encerrado durante venda | Recuperar carrinho em andamento ou oferecer retomada segura |
| Celular sem internet | Todas as funções centrais continuam disponíveis |
| Armazenamento insuficiente | Alertar e evitar concluir operação sem persistência |
| Restauração de backup | Validar versão/esquema e evitar sobrescrever sem confirmação |

## 12. Métricas de sucesso

- Percentual de etiquetas lidas corretamente na primeira tentativa.
- Tempo médio de registro por etiqueta e tempo total por venda.
- Divergência entre valor impresso na etiqueta e valor no carrinho: **zero em testes de aceite**.
- Vendas perdidas após falha/reinício: **zero em testes de recuperação**.
- Taxa de sucesso de impressão e de reimpressão.
- Tempo necessário para consultar histórico e fechar o dia.

## 13. Plano de implementação

### Fase 0 — Validação de hardware e etiquetas

- Confirmar modelo/configuração da Filizola e obter códigos escaneados.
- Validar layout EAN-13 com testes automatizados.
- Escolher impressora Bluetooth e confirmar ESC/POS, Bluetooth Classic SPP ou outro protocolo, SDK disponível e permissões Android.
- Confirmar versão mínima de Android do celular.

**Gate:** não considerar parser e impressão prontos antes dos testes com equipamento real.

### Fase 1 — Protótipo funcional

- Criar projeto React + TypeScript + Capacitor.
- Construir telas Nova venda, Produtos e Finalização.
- Criar parser desacoplado com exemplos de teste e modo simulado.
- Carrinho com cálculos em centavos e prevenção de duplicidade.

### Fase 2 — Persistência

- SQLite local, migrações e cadastro.
- Salvar vendas e itens em transação.
- Histórico, fechamento diário e retomada de venda em andamento.

### Fase 3 — Hardware

- Leitura real pela câmera Android.
- Pareamento e impressão de teste Bluetooth.
- Layout ESC/POS 58 mm, reimpressão e registro de falhas.

### Fase 4 — Piloto e entrega

- Testar em paralelo ao método papel/calculadora.
- Conferir etiquetas de produtos variados e valores altos.
- Testar desconexão da impressora, falta de internet, reinício e recuperação.
- Produzir APK instalável, instruções de uso e procedimento de backup.

## 14. Critérios de aceite para lançamento

1. O operador registra uma compra com várias etiquetas reais usando somente a câmera do Android.
2. Cada etiqueta válida aparece como item separado e os valores batem exatamente com os impressos.
3. Códigos inválidos e produtos desconhecidos não geram cobrança automática.
4. A venda concluída permanece no histórico após fechar/reabrir o app.
5. O resumo imprime na impressora Bluetooth escolhida, em bobina de 58 mm.
6. Falha de impressão não apaga nem duplica a venda.
7. O fechamento diário confere com a soma das vendas persistidas.
8. O fluxo funciona sem internet.
9. Existe procedimento testado de backup e restauração.
10. O comprovante contém aviso claro de documento não fiscal.

## 15. Pendências e decisões abertas

1. **Modelo da impressora:** ainda não comprado/informado; escolher e validar compatibilidade antes da integração final.
2. **Modelo exato da Filizola:** não confirmado.
3. **Layout real dos códigos:** hipótese a confirmar por leituras digitais; as sequências de duas etiquetas foram inferidas visualmente.
4. **Celular e versão Android:** ainda não informados.
5. **Peso no resumo:** não incluir automaticamente sem campo confiável no EAN ou captura manual explícita.
6. **Descontos e pagamento misto:** podem ser P1 para preservar escopo.
7. **Dados cadastrais da loja no recibo:** confirmar nome comercial e informações desejadas.
8. **Fluxo fiscal:** alinhar com contador; este MVP não emite documentos fiscais.

## 16. Instruções para implementação no Claude

- Tratar este PRD como fonte de requisitos, distinguindo fatos confirmados de hipóteses.
- **Não inventar protocolo da impressora nem formato de etiqueta.** Usar interfaces e mocks até validação de hardware.
- Começar por estrutura de projeto, modelo de dados, parser testável e tela de carrinho.
- Preferir componentes simples e código legível, sem backend desnecessário.
- Implementar testes unitários para checksum EAN-13, extração condicional de preço, cálculos, duplicidade e persistência.
- Fornecer instruções reproduzíveis de build Android/APK e permissões necessárias.
- Registrar decisões técnicas e mudanças de escopo em documentação.
- Solicitar somente dados realmente bloqueantes para cada fase; permitir desenvolvimento com mocks enquanto o hardware não estiver disponível.

---

**Resultado esperado:** um PDV Android offline, rápido e confiável, integrado operacionalmente às etiquetas da Filizola e capaz de imprimir resumos não fiscais em impressora térmica Bluetooth portátil.
