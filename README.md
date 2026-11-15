# Casa do Bife PDV

PDV Android offline para o açougue: lê com a câmera do celular as etiquetas EAN-13 impressas pela balança Filizola, monta o carrinho, registra o pagamento, guarda as vendas no próprio aparelho e imprime um **resumo de compra não fiscal** (impressora térmica Bluetooth de 58 mm).

> **Documento não fiscal.** O app não emite NFC-e/NF-e. Confirme as obrigações fiscais do estabelecimento com o contador.

Requisitos: [`docs/PRD.md`](docs/PRD.md). Decisões técnicas: [`docs/DECISOES.md`](docs/DECISOES.md). Validação das etiquetas: [`docs/VALIDACAO_ETIQUETAS.md`](docs/VALIDACAO_ETIQUETAS.md).

## Situação atual (v0.1.0)

| Área | Status |
|---|---|
| Parser EAN-13 + layout configurável | ✅ pronto e testado. O layout é uma **hipótese** até ser validado com leituras reais |
| Carrinho, duplicidade, desconto, troco | ✅ |
| SQLite local, venda atômica, histórico, fechamento | ✅ |
| Retomada de venda após fechamento inesperado | ✅ |
| Cadastro de produtos + cadastro rápido na leitura | ✅ |
| Lançamento manual, desconto e cancelamento com PIN opcional | ✅ |
| Backup/restauração em arquivo JSON versionado | ✅ |
| Leitura pela câmera (Google ML Kit) | ✅ código pronto, **falta teste no celular** |
| Impressão | ⏳ impressora **simulada** (pré-visualização na tela). Bluetooth depende da escolha do modelo |
| Ferramenta de validação de etiquetas (Ajustes) | ✅ |

## Desenvolvimento

Requisitos: Node 22+.

```bash
npm install
npm run dev        # abre no navegador (modo simulado: digitar código em vez de câmera)
npm test           # testes unitários e de persistência (SQLite real via sql.js)
npm run typecheck
```

No navegador, o banco é um SQLite (sql.js) salvo no IndexedDB, e o botão **Ler etiqueta** abre a digitação com as etiquetas de exemplo do PRD.

## Gerar o APK

### Pelo GitHub (sem instalar nada)

Cada push roda o workflow **Testes e APK Android** (`.github/workflows/android.yml`), que testa, compila e publica `app-debug.apk` como artefato da execução, em *Actions → execução → Artifacts*.

### Localmente

Requisitos: JDK 21 e Android Studio (Android SDK 36).

```bash
npm run android:sync     # build web + copia para android/
cd android && ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Ou abra no Android Studio com `npm run android:open`.

### Instalar no celular

1. Copie o `app-debug.apk` para o celular (cabo, Drive, WhatsApp).
2. Abra o arquivo e permita "instalar apps desta fonte".
3. Android mínimo: 7.0 (API 24).
4. Na primeira leitura, o Android pode baixar o módulo de leitura do Google (Play Services). Isso precisa de internet **só uma vez**; o app já pede esse download na instalação.

### Permissões Android

| Permissão | Uso |
|---|---|
| `CAMERA` | Leitura de etiquetas (declarada pelo plugin ML Kit) |
| `VIBRATE` | Retorno tátil ao ler uma etiqueta |
| `INTERNET` | Padrão do Capacitor e download único do módulo de leitura. Nenhum dado é enviado |
| Bluetooth (futuro) | `BLUETOOTH_CONNECT`/`BLUETOOTH_SCAN`, a definir com a impressora |

## Arquitetura

```
src/
  domain/        funções puras e testadas
    ean13.ts       dígito verificador
    barcode.ts     layout configurável da etiqueta + parser
    money.ts       centavos inteiros, formatação e parse sem float
    cart.ts        carrinho, duplicidade, desconto, troco, validação do checkout
    receipt.ts     resumo 58 mm (colunas configuráveis, fallback sem acentos, 2a via)
    escpos.ts      codificador ESC/POS genérico (para a futura impressora)
    closing.ts     fechamento diário
  data/
    schema.ts      migrações SQLite + gatilhos de imutabilidade
    repository.ts  operações transacionais, backup/restauração
    *Driver.ts     SQLite nativo (Capacitor) ou sql.js (navegador/testes)
  services/      câmera, impressora (interface + simulada), arquivos de backup
  ui/            React + Tailwind: Venda, Finalizar, Histórico, Caixa, Produtos, Ajustes
```

Princípios: dinheiro sempre em centavos inteiros, a venda é gravada em uma única transação, vendas concluídas não podem ser alteradas (gatilhos no banco) e cancelamentos e ajustes ficam registrados no log de operações.
