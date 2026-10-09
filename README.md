# Monitora_DG — Widget ENERGIA

Projeto local para desenvolvimento e teste no VS Code/Cline de um widget HTML Container do ThingsBoard.

## Arquivos

- `index.html` — estrutura HTML do widget.
- `style.css` — apresentação visual e responsividade.
- `script.js` — subscription do ThingsBoard, estados dos quatro sinais, `last_alive`, `uptime_s`, leituras ambientais `intTemp`/`intHumid`/`extTemp`/`extHumid` e contadores vivos (último contato e idade das leituras ambientais).
- `preview.html` — ambiente local de teste com dados simulados; não faz parte do widget publicado.
- `.clinerules` — regras de trabalho do projeto.

## Widget

Título: `ENERGIA`

Estados:

1. `rede_disponivel` — verde quando 1, cinza quando 0.
2. `alimentacao_rede` — azul quando 1, cinza quando 0.
3. `alimentacao_offgrid` — amarelo quando 1, cinza quando 0.
4. `alimentacao_gerador` — vermelho quando 1, cinza quando 0.

A legenda usa as quebras:

- Rede / disponível
- Alimentação / pela rede
- Alimentação / pelo offgrid
- Alimentação / pelo gerador

Informações adicionais:

- `last_alive` — atributo em Epoch; exibido como tempo decorrido vivo (`Xd Xh Xm Xs atrás`). Quando inexistente ou inválido: `desconhecido`.
- `uptime_s` — atributo em segundos; exibido em dias/horas/minutos.

O contador de `Último contato` é atualizado localmente a cada segundo e não gera novas consultas ao ThingsBoard.

### Leituras ambientais (temperatura / umidade)

Seção adicional, abaixo de `Atualizado há` / `Uptime`, com duas colunas: `INTERNA` e `EXTERNA`.

- Ordem em cada coluna: rótulo, temperatura e umidade.
- Temperatura: uma casa decimal + `°C` (maior destaque tipográfico).
- Umidade: sem casas decimais + `%`.
- Valor ausente ou inválido: `—` (sem unidade).
- Linha discreta abaixo: `Temp/umid atualizadas há <tempo>`, calculada a partir do **timestamp mais recente** das quatro leituras, com o relógio do navegador, atualizada a cada segundo pelo **mesmo** `setInterval` de 1 s (nenhuma consulta nova ao ThingsBoard). Sem nenhum timestamp válido: `Temp/umid atualizadas há —`.
- Separador e cores discretas (`#555960`, `#969ba3`, `#b9bdc3`, `#7f858d`), sem introduzir cores fortes.

## Device

Elétrico: `7e62cc00-c0df-11f1-8ef7-dd61fc2d324e`

Ambiental (temperatura/umidade): `b78d9b20-a309-11f1-b723-7b68e13f2590`

Chaves do device ambiental (todas `timeseries`): `intTemp`, `intHumid`, `extTemp`, `extHumid`.

## Teste local

Abra `preview.html` em um navegador. O preview simula `container`, `ctx`, a subscription do ThingsBoard e os dados dos dois devices (elétrico e ambiental).

Testes automatizados (Node ≥ 18):

```
node --check script.js
$env:TZ='UTC'; node _test_lastalive.node.js
```

## Regra de trabalho

Fazer alterações pequenas e controladas. Preservar o comportamento existente. Não usar alterações específicas do `preview.html` para modificar o widget real.
