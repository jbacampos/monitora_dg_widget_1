// ============================================================
// HARNESS DE TESTE (Node) — não faz parte do widget.
// Carrega script.js em sandbox com globais simulados e valida
// o cálculo de "Atualizado há" (menor tempo entre last_alive e
// última publicação) e as leituras ambientais de temperatura e
// umidade.
// ============================================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const scriptSrc = fs.readFileSync(
    path.join(__dirname, "script.js"),
    "utf8"
);

const ID = "7e62cc00-c0df-11f1-8ef7-dd61fc2d324e";
const ID_AMBIENTE = "b78d9b20-a309-11f1-b723-7b68e13f2590";

function item(name, type, ts, value, deviceId = ID) {
    return {
        dataKey: { name, type },
        datasource: {
            entityFilter: { singleEntity: { id: deviceId } }
        },
        data: [[ts, value]]
    };
}

// Item de telemetria do dispositivo ambiental (temperatura/umidade).
function envItem(name, ts, value) {
    return item(name, "timeseries", ts, value, ID_AMBIENTE);
}

// Constrói o ambiente simulando container/ctx/Date/setInterval.
function createEnv(startNow) {
    const clock = { now: startNow };

    // Estado inicial dos elementos, conforme index.html.
    const elements = {
        lastAlive: { id: "lastAlive", textContent: "desconhecido", className: "info-value" },
        uptime: { id: "uptime", textContent: "—", className: "info-value" },
        ledRede: { id: "ledRede", textContent: null, className: "led off" },
        ledRedeAlim: { id: "ledRedeAlim", textContent: null, className: "led off" },
        ledOffgrid: { id: "ledOffgrid", textContent: null, className: "led off" },
        ledGerador: { id: "ledGerador", textContent: null, className: "led off" },
        // Seção ambiental, com os valores iniciais de index.html.
        envTempInt: { id: "envTempInt", textContent: "—", className: "env-temp" },
        envTempExt: { id: "envTempExt", textContent: "—", className: "env-temp" },
        envHumidInt: { id: "envHumidInt", textContent: "—", className: "env-humid" },
        envHumidExt: { id: "envHumidExt", textContent: "—", className: "env-humid" },
        envUpdated: { id: "envUpdated", textContent: "Temp/umid atualizadas há —", className: "env-updated" }
    };

    const container = {
        querySelector(sel) {
            const id = sel.replace("#", "");
            if (!elements[id]) {
                elements[id] = { id, textContent: null, className: "" };
            }
            return elements[id];
        }
    };

    let onDataUpdated = null;
    let createCount = 0;
    let intervalCallback = null;

    const ctx = {
        subscriptionApi: {
            createSubscription(options) {
                createCount++;
                onDataUpdated = options.callbacks.onDataUpdated;
                return {
                    subscribe(fn) {
                        fn({ id: "test-subscription" });
                        return { unsubscribe() {} };
                    }
                };
            }
        },
        registerDestroyCallback(fn) {
            ctx._destroyCallback = fn;
        }
    };

    const sandbox = {
        container,
        ctx,
        Date: { now: () => clock.now },
        setInterval: fn => {
            intervalCallback = fn;
            return 1;
        },
        clearInterval: () => {},
        console
    };

    vm.createContext(sandbox);
    vm.runInContext(scriptSrc, sandbox, { filename: "script.js" });

    return {
        lastAliveText: () =>
            elements.lastAlive ? elements.lastAlive.textContent : undefined,
        uptimeText: () =>
            elements.uptime ? elements.uptime.textContent : undefined,
        envText: id => (elements[id] ? elements[id].textContent : undefined),
        ledClass: id => (elements[id] || {}).className,
        fire: data => onDataUpdated({ data }),
        tick: newNow => {
            clock.now = newNow;
            if (intervalCallback) {
                intervalCallback();
            }
        },
        createCount: () => createCount
    };
}

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
    const ok = actual === expected;
    if (ok) {
        passed++;
        console.log(`PASS  ${label}  =>  "${actual}"`);
    } else {
        failed++;
        console.log(
            `FAIL  ${label}  =>  obtido "${actual}" | esperado "${expected}"`
        );
    }
}

// ---- Base ----
const BASE = 1700000000000; // ms

// Teste 1 — last_alive e última publicação com timestamps iguais.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0"),
        item("last_alive", "attribute", BASE, BASE / 1000),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("1) timestamps iguais", env.lastAliveText(), "17s");
}

// Teste 2 — last_alive mais antigo que a última publicação.
{
    const now = BASE + 5000;
    const env = createEnv(now);
    const aliveSec = BASE / 1000 - 100;
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0"),
        item("last_alive", "attribute", BASE - 100000, aliveSec),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("2) last_alive mais antigo", env.lastAliveText(), "5s");
}

// Teste 3 — última publicação mais antiga que last_alive.
{
    const now = BASE + 3000;
    const env = createEnv(now);
    const oldTs = BASE - 200000;
    env.fire([
        item("rede_disponivel", "timeseries", oldTs, "1"),
        item("alimentacao_rede", "timeseries", oldTs, "1"),
        item("alimentacao_offgrid", "timeseries", oldTs, "0"),
        item("alimentacao_gerador", "timeseries", oldTs, "0"),
        item("last_alive", "attribute", BASE, BASE / 1000),
        item("uptime_s", "attribute", oldTs, "8345")
    ]);
    check("3) publicação mais antiga", env.lastAliveText(), "3s");
}

// Teste 4 — contador avançando segundo a segundo + sem novas consultas.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("last_alive", "attribute", BASE, BASE / 1000)
    ]);
    const before = env.lastAliveText();
    env.tick(now + 1000);
    const after1 = env.lastAliveText();
    env.tick(now + 2000);
    const after2 = env.lastAliveText();
    env.tick(now + 3000);
    const after3 = env.lastAliveText();

    check("4) contador t+0", before, "17s");
    check("4) contador t+1", after1, "18s");
    check("4) contador t+2", after2, "19s");
    check("4) contador t+3", after3, "20s");
    check("4) createSubscription chamado 1x", env.createCount(), 1);
}

// Teste 5 — ausência de last_alive => desconhecido.
{
    const now = BASE + 1000;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("5) sem last_alive", env.lastAliveText(), "desconhecido");

    const env2 = createEnv(now);
    env2.fire([
        item("last_alive", "attribute", BASE, ""),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("5) last_alive vazio", env2.lastAliveText(), "desconhecido");
}

// Teste 6 — sem novas consultas ao ThingsBoard por segundo.
{
    const now = BASE + 17000;
    const env = createEnv(now);
    env.fire([item("last_alive", "attribute", BASE, BASE / 1000)]);
    for (let i = 1; i <= 5; i++) {
        env.tick(now + i * 1000);
    }
    check("6) sem novas consultas em 5s", env.createCount(), 1);
}

// Teste 7 — formato com dias: 1d 6h 14m 7s.
{
    const elapsedMs = 108847000; // 1d 6h 14m 7s
    const now = BASE;
    const env = createEnv(now);
    env.fire([
        item("last_alive", "attribute", now - elapsedMs,
            (now - elapsedMs) / 1000),
        item("rede_disponivel", "timeseries", now - 200000000, "1")
    ]);
    check("7) formato 1d 6h 14m 7s", env.lastAliveText(), "1d 6h 14m 7s");
}

// Teste 8 — lastPublicationMs indisponível => usar somente last_alive.
{
    const now = BASE + 42000;
    const env = createEnv(now);
    // timestamp inválido em point[0] (somente last_alive presente).
    env.fire([item("last_alive", "attribute", "x", BASE / 1000)]);
    check("8) sem publication, só last_alive", env.lastAliveText(), "42s");
}

// Teste 9 — LEDs inalterados (sanidade).
{
    const now = BASE;
    const env = createEnv(now);
    env.fire([
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("alimentacao_rede", "timeseries", BASE, "1"),
        item("alimentacao_offgrid", "timeseries", BASE, "0"),
        item("alimentacao_gerador", "timeseries", BASE, "0")
    ]);
    check("9) led rede verde", env.ledClass("ledRede"), "led green");
    check("9) led offgrid off", env.ledClass("ledOffgrid"), "led off");
    check("9) uptime inalterado", env.uptimeText(), "—");
}

// ============================================================
// LEITURAS AMBIENTAIS (TEMPERATURA / UMIDADE)
// ============================================================

// Teste 10 — quatro leituras válidas: formato e idade do mais recente.
{
    const now = BASE + 49000;
    const env = createEnv(now);
    env.fire([
        envItem("intTemp", BASE - 8000, "23.47"),
        envItem("intHumid", BASE - 8000, "51.6"),
        envItem("extTemp", BASE, "14.2"),
        envItem("extHumid", BASE, "78.3")
    ]);
    check("10) temp interna (1 casa)", env.envText("envTempInt"), "23.5 °C");
    check("10) umid interna (sem casas)", env.envText("envHumidInt"), "52 %");
    check("10) temp externa", env.envText("envTempExt"), "14.2 °C");
    check("10) umid externa", env.envText("envHumidExt"), "78 %");
    check("10) idade pelo mais recente", env.envText("envUpdated"),
        "Temp/umid atualizadas há 49s");
}

// Teste 11 — valores ausentes/inválidos viram "—".
{
    const now = BASE + 10000;
    const env = createEnv(now);
    env.fire([
        envItem("intTemp", BASE, "23.4"),
        envItem("intHumid", BASE, ""),
        envItem("extTemp", BASE, "x"),
        envItem("extHumid", BASE, null)
    ]);
    check("11) temp interna válida", env.envText("envTempInt"), "23.4 °C");
    check("11) umid interna vazia", env.envText("envHumidInt"), "—");
    check("11) temp externa inválida", env.envText("envTempExt"), "—");
    check("11) umid externa nula", env.envText("envHumidExt"), "—");
    check("11) idade com uma leitura", env.envText("envUpdated"),
        "Temp/umid atualizadas há 10s");
}

// Teste 12 — nenhuma leitura ambiental recebida.
{
    const now = BASE + 1000;
    const env = createEnv(now);
    env.fire([item("rede_disponivel", "timeseries", BASE, "1")]);
    check("12) temp interna ausente", env.envText("envTempInt"), "—");
    check("12) umid externa ausente", env.envText("envHumidExt"), "—");
    check("12) idade sem timestamps", env.envText("envUpdated"),
        "Temp/umid atualizadas há —");
}

// Teste 13 — timestamps inválidos não geram horário de atualização.
{
    const now = BASE + 1000;
    const env = createEnv(now);
    env.fire([
        envItem("intTemp", "x", "23.4"),
        envItem("intHumid", 0, "50"),
        envItem("extTemp", null, "14.2"),
        envItem("extHumid", undefined, "78")
    ]);
    check("13) valores exibidos", env.envText("envTempInt"), "23.4 °C");
    check("13) idade sem ts válido", env.envText("envUpdated"),
        "Temp/umid atualizadas há —");
}

// Teste 14 — contador avança 1s a 1s sem nova consulta.
{
    const now = BASE + 20000;
    const env = createEnv(now);
    env.fire([envItem("intTemp", BASE, "23.4")]);
    check("14) idade t+0", env.envText("envUpdated"),
        "Temp/umid atualizadas há 20s");
    env.tick(now + 1000);
    check("14) idade t+1", env.envText("envUpdated"),
        "Temp/umid atualizadas há 21s");
    env.tick(now + 2000);
    check("14) idade t+2", env.envText("envUpdated"),
        "Temp/umid atualizadas há 22s");
    check("14) createSubscription 1x", env.createCount(), 1);
}

// Teste 15 — uma leitura deixa de ser publicada: idade segue a mais recente.
{
    const now = BASE;
    const env = createEnv(now);
    env.fire([
        envItem("intTemp", BASE - 5000, "23.4"),
        envItem("intHumid", BASE - 30000, "50"),
        envItem("extTemp", BASE - 1000, "14.2"),
        envItem("extHumid", BASE - 1000, "78")
    ]);
    check("15) idade segue a mais recente", env.envText("envUpdated"),
        "Temp/umid atualizadas há 1s");
    env.tick(now + 4000);
    check("15) contador avança", env.envText("envUpdated"),
        "Temp/umid atualizadas há 5s");
}

// Teste 16 — dados ambientais não alteram a parte elétrica.
{
    const now = BASE + 30000;
    const env = createEnv(now);
    env.fire([
        envItem("intTemp", BASE, "23.4"),
        envItem("intHumid", BASE, "50"),
        item("rede_disponivel", "timeseries", BASE, "1"),
        item("last_alive", "attribute", BASE, BASE / 1000),
        item("uptime_s", "attribute", BASE, "8345")
    ]);
    check("16) led rede verde", env.ledClass("ledRede"), "led green");
    check("16) Atualizado há inalterado", env.lastAliveText(), "30s");
    check("16) uptime inalterado", env.uptimeText(), "2h 19min");
    check("16) ambiental exibido", env.envText("envTempInt"), "23.4 °C");
}

console.log("");
console.log(`Resumo: ${passed} passaram, ${failed} falharam.`);
process.exit(failed === 0 ? 0 : 1);
