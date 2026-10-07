# Monitora_DG — Widget ENERGIA

Projeto local para desenvolvimento e teste no VS Code/Cline de um widget HTML Container do ThingsBoard.

## Arquivos

- `index.html` — estrutura HTML do widget.
- `style.css` — apresentação visual e responsividade.
- `script.js` — subscription do ThingsBoard, estados dos quatro sinais, `last_alive`, `uptime_s` e contador vivo de último contato.
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

## Device

`7e62cc00-c0df-11f1-8ef7-dd61fc2d324e`

## Teste local

Abra `preview.html` em um navegador. O preview simula `container`, `ctx`, a subscription do ThingsBoard e os dados do device.

## Regra de trabalho

Fazer alterações pequenas e controladas. Preservar o comportamento existente. Não usar alterações específicas do `preview.html` para modificar o widget real.
