// ============================================================
// WIDGET MONITORA_DG — ENERGIA
// ============================================================

const DEVICE_MONITORA_DG =
    "7e62cc00-c0df-11f1-8ef7-dd61fc2d324e";

// Dispositivo de monitoramento ambiental (temperatura/umidade).
const DEVICE_AMBIENTE =
    "b78d9b20-a309-11f1-b723-7b68e13f2590";

let lastAliveMs = null;
let lastPublicationMs = null;
let lastAliveTimer = null;

// Timestamp mais recente entre as quatro leituras ambientais.
let ambientNewestMs = null;

function setLed(id, active, color) {
    const el = container.querySelector("#" + id);

    if (!el) {
        return;
    }

    el.className = "led " + (Number(active) === 1 ? color : "off");
}

function setText(id, value) {
    const el = container.querySelector("#" + id);

    if (el) {
        el.textContent = value;
    }
}

function formatElapsed(ms) {
    if (!Number.isFinite(ms) || ms < 0) {
        ms = 0;
    }

    let totalSeconds = Math.floor(ms / 1000);

    const days = Math.floor(totalSeconds / 86400);
    totalSeconds %= 86400;

    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds %= 3600;

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function updateLastAliveDisplay() {
    if (lastAliveMs === null) {
        setText("lastAlive", "desconhecido");
        return;
    }

    const now = Date.now();

    let elapsed = now - lastAliveMs;

    // Menor tempo decorrido entre o último contato e a última publicação.
    if (lastPublicationMs !== null) {
        elapsed = Math.min(elapsed, now - lastPublicationMs);
    }

    setText("lastAlive", formatElapsed(elapsed));
}

function updateLastAlive(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        lastAliveMs = null;
        updateLastAliveDisplay();
        return;
    }

    let timestamp = Number(value);

    if (!Number.isFinite(timestamp)) {
        lastAliveMs = null;
        updateLastAliveDisplay();
        return;
    }

    // last_alive é Epoch em segundos.
    // Se vier em milissegundos, também trata.
    if (timestamp < 10000000000) {
        timestamp *= 1000;
    }

    lastAliveMs = timestamp;
    updateLastAliveDisplay();
}

function formatUptime(value) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return "—";
    }

    let seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds < 0) {
        return "—";
    }

    seconds = Math.floor(seconds);

    const days = Math.floor(seconds / 86400);
    seconds %= 86400;

    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;

    const minutes = Math.floor(seconds / 60);

    if (days > 0) {
        return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}min`;
    }

    if (hours > 0) {
        return `${hours}h ${String(minutes).padStart(2, "0")}min`;
    }

    return `${minutes}min`;
}

// ============================================================
// LEITURAS AMBIENTAIS — TEMPERATURA / UMIDADE
// ============================================================

// Formata uma leitura bruta. Valor ausente ou inválido vira "—".
function formatAmbientValue(point, decimals, unit) {
    if (
        !point ||
        point.value === null ||
        point.value === undefined ||
        point.value === ""
    ) {
        return "—";
    }

    const number = Number(point.value);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return number.toFixed(decimals) + " " + unit;
}

// Linha discreta com a idade do dado ambiental mais recente.
// Recalculada a cada segundo, reaproveitando o timer local.
function updateAmbientAge() {
    if (ambientNewestMs === null) {
        setText("envUpdated", "Temp/umid atualizadas há —");
        return;
    }

    setText(
        "envUpdated",
        "Temp/umid atualizadas há " +
            formatElapsed(Date.now() - ambientNewestMs)
    );
}

function updateAmbientDisplay(intTemp, intHumid, extTemp, extHumid) {
    const points = [intTemp, intHumid, extTemp, extHumid];

    // Timestamp mais recente entre as quatro leituras recebidas.
    let newestMs = null;

    points.forEach(point => {
        if (
            point &&
            Number.isFinite(point.timestamp) &&
            point.timestamp > 0
        ) {
            if (newestMs === null || point.timestamp > newestMs) {
                newestMs = point.timestamp;
            }
        }
    });

    ambientNewestMs = newestMs;

    setText("envTempInt", formatAmbientValue(intTemp, 1, "°C"));
    setText("envTempExt", formatAmbientValue(extTemp, 1, "°C"));
    setText("envHumidInt", formatAmbientValue(intHumid, 0, "%"));
    setText("envHumidExt", formatAmbientValue(extHumid, 0, "%"));

    updateAmbientAge();
}

function updateDisplay(data) {
    function getValue(key, type, deviceId = DEVICE_MONITORA_DG) {
        const item = data.find(d =>
            d.dataKey &&
            d.dataKey.name === key &&
            d.dataKey.type === type &&
            d.datasource &&
            d.datasource.entityFilter &&
            d.datasource.entityFilter.singleEntity &&
            d.datasource.entityFilter.singleEntity.id === deviceId
        );

        if (!item || !item.data || !item.data.length) {
            return null;
        }

        const point = item.data[item.data.length - 1];

        return {
            timestamp: Number(point[0]),
            value: point[1]
        };
    }

    const rede = getValue("rede_disponivel", "timeseries");
    const alimentacaoRede = getValue("alimentacao_rede", "timeseries");
    const offgrid = getValue("alimentacao_offgrid", "timeseries");
    const gerador = getValue("alimentacao_gerador", "timeseries");
    const lastAlive = getValue("last_alive", "attribute");
    const uptime = getValue("uptime_s", "attribute");

    // Leituras ambientais (outro dispositivo, na mesma subscription).
    const intTemp = getValue("intTemp", "timeseries", DEVICE_AMBIENTE);
    const intHumid = getValue("intHumid", "timeseries", DEVICE_AMBIENTE);
    const extTemp = getValue("extTemp", "timeseries", DEVICE_AMBIENTE);
    const extHumid = getValue("extHumid", "timeseries", DEVICE_AMBIENTE);

    // Timestamp de publicação mais recente entre os dados efetivamente
    // recebidos, usando o timestamp do ThingsBoard em point[0].
    const receivedPoints = [
        rede,
        alimentacaoRede,
        offgrid,
        gerador,
        lastAlive,
        uptime
    ];

    let newestPublicationMs = null;

    receivedPoints.forEach(point => {
        if (point && Number.isFinite(point.timestamp)) {
            if (
                newestPublicationMs === null ||
                point.timestamp > newestPublicationMs
            ) {
                newestPublicationMs = point.timestamp;
            }
        }
    });

    if (newestPublicationMs !== null) {
        lastPublicationMs = newestPublicationMs;
    }

    if (rede) {
        setLed("ledRede", rede.value, "green");
    }

    if (alimentacaoRede) {
        setLed("ledRedeAlim", alimentacaoRede.value, "blue");
    }

    if (offgrid) {
        setLed("ledOffgrid", offgrid.value, "yellow");
    }

    if (gerador) {
        setLed("ledGerador", gerador.value, "red");
    }

    if (lastAlive) {
        updateLastAlive(lastAlive.value);
    }

    if (uptime) {
        setText("uptime", formatUptime(uptime.value));
    }

    // A seção ambiental é redesenhada a cada callback, inclusive para
    // exibir "—" quando as leituras ainda não chegarem.
    updateAmbientDisplay(intTemp, intHumid, extTemp, extHumid);
}

// ============================================================
// SUBSCRIPTION
// ============================================================

const subscriptionOptions = {
    type: "latest",

    datasources: [{
        type: "entity",

        entityFilter: {
            type: "singleEntity",
            singleEntity: {
                entityType: "DEVICE",
                id: DEVICE_MONITORA_DG
            }
        },

        dataKeys: [
            "rede_disponivel",
            "alimentacao_rede",
            "alimentacao_offgrid",
            "alimentacao_gerador"
        ].map(name => ({
            type: "timeseries",
            name,
            settings: {}
        })).concat([
            "last_alive",
            "uptime_s"
        ].map(name => ({
            type: "attribute",
            name,
            settings: {}
        })))
    }, {
        // Dispositivo ambiental — datasource adicional. O bloco acima
        // permanece exatamente como estava.
        type: "entity",

        entityFilter: {
            type: "singleEntity",
            singleEntity: {
                entityType: "DEVICE",
                id: DEVICE_AMBIENTE
            }
        },

        dataKeys: [
            "intTemp",
            "intHumid",
            "extTemp",
            "extHumid"
        ].map(name => ({
            type: "timeseries",
            name,
            settings: {}
        }))
    }],

    callbacks: {
        onDataUpdated: subscription => {
            updateDisplay(subscription.data || []);
        }
    }
};

ctx.subscriptionApi
    .createSubscription(subscriptionOptions, true)
    .subscribe(subscription => {
        ctx.defaultSubscription = subscription;
    });

// ============================================================
// CONTADOR VIVO DE ÚLTIMO CONTATO
// ============================================================

// O mesmo timer local atualiza o contador de "Atualizado há" e a idade
// das leituras ambientais. Nenhuma consulta nova ao ThingsBoard.
lastAliveTimer = setInterval(
    () => {
        updateLastAliveDisplay();
        updateAmbientAge();
    },
    1000
);

// ============================================================
// LIMPEZA
// ============================================================

ctx.registerDestroyCallback(() => {
    if (lastAliveTimer !== null) {
        clearInterval(lastAliveTimer);
        lastAliveTimer = null;
    }
});
