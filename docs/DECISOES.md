# Registro de decisões

## 2026-11-15 — Decisões validadas com o proprietário

| Tema | Decisão |
|---|---|
| Código do produto na etiqueta | **Não confirmado.** Pelas etiquetas, Patinho = 3, Maminha = 18 e Diversos = 0. O proprietário vai conferir na Filizola. O app não traz produtos pré-cadastrados |
| Produto não cadastrado lido | **Cadastro rápido**: abre formulário com o código preenchido; o operador digita o nome e o item entra no carrinho |
| Pagamento | **Uma forma por venda** (Pix, dinheiro ou cartão). No dinheiro, informa o valor recebido e o app calcula o troco. Pagamento misto fica para depois |
| Impressora | **Ainda não comprada.** Desenvolvimento com impressora simulada |

## Decisões técnicas

### D1. React + TypeScript + Capacitor 8, SQLite local (conforme PRD §7)
Sem backend. Nativo para permitir Bluetooth Classic SPP no futuro.

### D2. Um único repositório SQL para Android, navegador e testes
`PdvRepository` fala com uma interface mínima `SqlDriver`. No Android usa `@capacitor-community/sqlite`; no navegador e nos testes, `sql.js` (o mesmo SQLite compilado para WASM). Assim os testes de persistência rodam contra SQLite real, inclusive os gatilhos.

### D3. Layout da etiqueta como configuração + "modo conferência"
O layout candidato `2 | PPPPPP | VVVVV | D` (preço em centavos) confere com as 3 etiquetas do PRD: o dígito verificador é válido e o preço bate com o total impresso. Mesmo assim, segue como `validated: false` até passar pelo protocolo do PRD §8.
- Enquanto não validado, o app **funciona**, mas mostra a faixa "Modo conferência" para o operador conferir cada valor com a etiqueta. Isso permite o piloto em paralelo ao papel (Fase 4).
- Em **Ajustes → Etiquetas da balança** há uma ferramenta de validação: ler a etiqueta e digitar o total impresso. Só é possível marcar o layout como validado com pelo menos 5 leituras conferidas, 2 ou mais produtos e nenhuma divergência.
- Alterar o layout volta automaticamente para o modo conferência.

### D4. Código do produto normalizado sem zeros à esquerda
`000003` → `3`, para casar com o número da tecla/PLU que o operador conhece.

### D5. Duplicidade (RF-06)
O código idêntico a um item do carrinho **sempre** pede confirmação, nunca bloqueia. A mensagem muda se a leitura foi há menos de 5 s (provável leitura acidental) ou não (provável embalagem igual).

### D6. Imutabilidade no banco
Gatilhos SQLite impedem `UPDATE` de campos financeiros, `DELETE` de vendas e qualquer alteração de itens. O cancelamento muda apenas o status, exige motivo e fica no `audit_log`. A restauração de backup remove e recria os gatilhos dentro da mesma transação.

### D7. Leitor de câmera: Google code scanner (ML Kit `scan()`)
É a forma mais simples e robusta (a interface de câmera é do Google, com foco e lanterna) e não exige permissão de câmera em tempo de execução. A desvantagem é que o módulo é baixado pelo Play Services, o que o `AndroidManifest` pede na instalação. Se o aparelho não tiver Play Services, a alternativa é `startScan()` com o modelo embarcado.

### D8. Impressão: interface + simulada, ESC/POS genérico pronto
`PrinterAdapter.print(lines)` com `MockPrinter`, que mostra o resumo na tela e pode simular falha. O codificador ESC/POS (`ESC @`, `ESC E`, `ESC d`) já está pronto e testado, mas o transporte Bluetooth só será escrito com a impressora em mãos (PRD §16).
`printed_at`/`print_count` são informativos, e toda tentativa vai para `print_attempts`.

### D9. PIN de supervisor opcional
Usado em item manual, desconto, cancelamento e mudança de layout. Sem PIN, essas ações pedem apenas confirmação.

### D10. Backup em JSON versionado
`{format, version, schemaVersion, tables}`. A restauração valida o formato, a versão, o esquema e as colunas, pede confirmação e substitui tudo em uma única transação. No Android, o arquivo é compartilhado pelo menu do sistema (WhatsApp/Drive/e-mail).

## Pendências (PRD §15)

1. Modelo da impressora: escolher um que tenha **Bluetooth Classic (SPP) + ESC/POS** e 58 mm.
2. Modelo da Filizola e layout real: aplicar o protocolo de [VALIDACAO_ETIQUETAS.md](VALIDACAO_ETIQUETAS.md).
3. Celular e versão do Android (mínimo suportado: Android 7 / API 24).
4. Dados do cabeçalho do resumo (já editáveis em Ajustes).
5. Fluxo fiscal com o contador.
