# Validação das etiquetas da Filizola (PRD §8, bloqueante para produção)

O objetivo é confirmar, com leituras **digitais** (não fotos), em que posições do código de barras estão o produto e o preço.

## Hipótese atual

```
2  000003  00649  6
│  │       │      └─ dígito verificador
│  │       └──────── preço em centavos (R$ 6,49)
│  └──────────────── código do produto (3)
└─────────────────── prefixo de peso variável
```

| Etiqueta | Código | Produto | Preço | Dígito verificador | Origem |
|---|---|---|---|---|---|
| Patinho | 2000003006496 | 3 | R$ 6,49 ✔ | ✔ | informado |
| Maminha | 2000018090480 | 18 | R$ 90,48 ✔ | ✔ | transcrição de foto |
| Diversos | 2000000201405 | 0 | R$ 201,40 ✔ | ✔ | transcrição de foto |

## Como validar (usando o próprio app)

1. Instale o APK no celular que será usado no balcão.
2. Abra **Ajustes → Etiquetas da balança → Validar com uma etiqueta real**.
3. Para cada etiqueta: toque em 📷, leia o código, digite o **nome** e o **TOTAL (R$)** impressos e toque em **Registrar leitura**.
4. Use pelo menos estas etiquetas:
   - o mesmo produto com **pesos diferentes** (2 etiquetas);
   - **outro produto**;
   - uma etiqueta de **valor alto** (acima de R$ 100);
   - se possível, uma **reimpressão** da mesma pesagem.
5. Confira também se o código do produto lido bate com o número da tecla/PLU na Filizola.
6. Se tudo conferir (✔), toque em **Marcar layout como validado**. A faixa amarela "Modo conferência" some.

Se alguma leitura der ✘, **não** valide. Anote o código e a etiqueta e envie para análise: a Filizola pode estar configurada com outro formato (por exemplo, peso no lugar de preço ou código com outra quantidade de dígitos).

## Pontos de atenção

- Etiquetas acima de **R$ 999,99** não cabem em 5 dígitos de preço. Vale testar com uma pesagem de valor alto para ver como a balança se comporta.
- O código `0` (Diversos) parece ser um produto genérico: cadastre-o com o nome "Diversos".
