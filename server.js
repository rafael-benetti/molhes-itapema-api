require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const STORMGLASS_API_KEY = process.env.STORMGLASS_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || '';

// Caminho do arquivo de cache
const CACHE_FILE = path.join(__dirname, 'cache.json');

// Coordenadas da Praia de Itapema-SC
const LATITUDE = -27.091;
const LONGITUDE = -48.612;

// Tempo de cache (3 horas)
const TEMPO_CACHE_MS = 3 * 60 * 60 * 1000;

// Cache de previsões
let cachePrevisoes = null;
let ultimaAtualizacao = 0;

// 🔹 Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// 🔹 Rota para carregar a página inicial automaticamente
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🔹 Rota para retornar as previsões do mar
app.get("/previsao", async (req, res) => {
    if (!cachePrevisoes || Date.now() - ultimaAtualizacao > TEMPO_CACHE_MS) {
        await atualizarPrevisoes();
    }
    res.json(cachePrevisoes);
});

// 🔹 Função para carregar cache salvo no JSON
function carregarCache() {
    if (fs.existsSync(CACHE_FILE)) {
        const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
        if (Date.now() - cache.ultimaAtualizacao < TEMPO_CACHE_MS) {
            cachePrevisoes = cache.dados;
            ultimaAtualizacao = cache.ultimaAtualizacao;
            console.log("✅ Cache carregado do arquivo!");
        } else {
            console.log("⚠️ Cache expirado, nova atualização necessária.");
        }
    }
}

// 🔹 Função para salvar cache no arquivo JSON
function salvarCache() {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ultimaAtualizacao, dados: cachePrevisoes }), 'utf-8');
}

// 🔹 Função para converter graus para pontos cardeais
function converterDirecao(degrees) {
    const direcoes = ["N", "NE", "E", "SE", "S", "SW", "O", "NO", "N"];
    return direcoes[Math.round(degrees / 45) % 8];
}

// 🔹 Função para converter m/s para km/h
function converterVelocidade(velocidadeMS) {
    return (velocidadeMS * 3.6).toFixed(2);
}

// 🔹 Função para arredondar alturas das ondas
function arredondarAltura(altura) {
    let base = Math.floor(altura * 10) / 10;
    if (altura - base >= 0.25) {
        base += 0.1;
    }
    return base.toFixed(1);
}
// 🔹 Função para arredondar período das ondas
function arredondarPeriodoOnda(periodo) {
    return parseFloat(periodo).toFixed(1); // Arredonda para uma casa decimal
}

// 🔹 Função para arredondar temperatura da água
function arredondarTemperaturaAgua(temperatura) {
    return parseFloat(temperatura).toFixed(1); // Arredonda para uma casa decimal
}




// 🔹 Função para calcular altura da onda na praia
function calcularAlturaNaPraia(alturaOceano, periodoOnda, direcaoOnda, velocidadeVento, direcaoVento) {
    let S = periodoOnda > 12 ? 1.3 : (periodoOnda > 7 ? 1.15 : 1.05);
    let R = Math.pow(Math.cos(direcaoOnda * Math.PI / 180), 2);
    R = R < 0.3 ? 0.3 : R;
    let C_vento = (direcaoVento < 45 || direcaoVento > 315) ? 0.1 : (direcaoVento > 135 && direcaoVento < 225) ? -0.1 : 0.05;
    let W = 1 + (velocidadeVento / 100) * C_vento;
// 🔹 o resultado real é let alturaPraia = alturaOceano * S * R * W; utilizo +0.1 pra chegar mais próximo do resultado exibido no surfguru

    let alturaPraia = alturaOceano * S * R * W + 0.1;
    return arredondarAltura(alturaPraia);
}

// 🔹 Função para buscar dados da API e atualizar o cache
async function atualizarPrevisoes() {
    try {
        console.log("🔄 Atualizando previsões...");
        const params = 'waveHeight,waveDirection,wavePeriod,windSpeed,windDirection,waterTemperature';
        const response = await axios.get(`https://api.stormglass.io/v2/weather/point?lat=${LATITUDE}&lng=${LONGITUDE}&params=${params}`, {
            headers: { 'Authorization': STORMGLASS_API_KEY }
        });

        // Filtrar previsões a partir da data de hoje
        const agora = new Date();
        const dataAtual = agora.toLocaleDateString("pt-BR");

        const previsoesFiltradas = response.data.hours.filter(data => {
            const dataHora = new Date(data.time);
            const dataFormatada = dataHora.toLocaleDateString("pt-BR");
            return dataFormatada >= dataAtual;
        });

        const previsoes = previsoesFiltradas.map(data => {
            const dataHora = new Date(data.time);
            const dataFormatada = dataHora.toLocaleDateString("pt-BR");
            const horarioFormatado = dataHora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
            // o resultado real é o que está abaixo; utilizo +0.1 pra chegar mais próximo do resultado exibido no surfguru
            //const alturaOceanica = arredondarAltura(data.waveHeight.noaa || data.waveHeight.sg || 0);

            const alturaOceanica = arredondarAltura((data.waveHeight.noaa || data.waveHeight.sg || 0) + 0.1);
            const periodoOnda = arredondarPeriodoOnda(data.wavePeriod.noaa || data.wavePeriod.sg || 0);
            const direcaoOnda = data.waveDirection.noaa || data.waveDirection.sg || 0;
            const velocidadeVentoMS = data.windSpeed.noaa || data.windSpeed.sg || 0;
            const direcaoVento = data.windDirection.noaa || data.windDirection.sg || 0;
            const temperaturaAgua = arredondarTemperaturaAgua(data.waterTemperature.noaa || data.waterTemperature.sg || 0);
            const velocidadeVentoKMH = converterVelocidade(velocidadeVentoMS);
            const direcaoVentoCardeal = converterDirecao(direcaoVento);
            const direcaoOndaCardeal = converterDirecao(direcaoOnda);
            const alturaPraia = calcularAlturaNaPraia(parseFloat(alturaOceanica), periodoOnda, direcaoOnda, velocidadeVentoKMH, direcaoVento);

            return {
                data: dataFormatada,
                horario: horarioFormatado,
                alturaOceanica: `${alturaOceanica} m`,
                alturaPraia: `${alturaPraia} m`,
                periodoOnda: `${periodoOnda} s`,
                direcaoOnda: `${direcaoOndaCardeal}`,
                velocidadeVento: `${velocidadeVentoKMH} km/h`,
                direcaoVento: `${direcaoVentoCardeal}`,
                temperaturaAgua: `${temperaturaAgua}°C`
            };
        });

        // Atualiza cache e salva no arquivo
        const resumoChatGPT = await obterResumoChatGPT(previsoes);

        cachePrevisoes = {
            local: "Itapema-SC",
            previsoes,
            resumoChatGPT // ✅ Agora o resumo é salvo no cache
        };

        ultimaAtualizacao = Date.now();
        salvarCache();
        console.log("✅ Previsões atualizadas e salvas no cache.");
    } catch (error) {
        console.error("❌ Erro ao buscar dados da StormGlass API:", error);
    }
}

// 🔹 Função para obter resumo do ChatGPT
async function obterResumoChatGPT(previsoes) {
    try {
        console.log("🤖 Consultando ChatGPT...");

        const agora = new Date();
        const dataAtual = agora.toLocaleDateString("pt-BR"); // Formato: "DD/MM/AAAA"

        // 🔹 Filtrar a previsão específica para 07:00 do dia atual
        const previsao07h = previsoes.find(p => p.data === dataAtual && p.horario === "07:00");

        if (!previsao07h) {
            console.error("❌ Nenhuma previsão encontrada para 07:00 de hoje!");
            return "Não há previsão disponível para as 07:00 de hoje.";
        }

        // 🔹 Criar o texto para o ChatGPT apenas se houver previsão válida
        const textoParaChatGPT = `
            Condições do mar em Itapema-SC hoje às 07:00:
            Altura das ondas: ${previsao07h.alturaPraia} metros
            Período das ondas: ${previsao07h.periodoOnda}
            Direção das ondas: ${previsao07h.direcaoOnda}
            Velocidade do vento: ${previsao07h.velocidadeVento}
            Direção do vento: ${previsao07h.direcaoVento}
            Temperatura da água: ${previsao07h.temperaturaAgua}

            Gere um resumo curto e direto para surfistas sobre as condições do mar em Itapema.
        `;

        console.log("🔹 Texto enviado ao ChatGPT:\n", textoParaChatGPT);

        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        "role": "system",
                        "content": "Você é especializado em previsões de ondas. Responda de forma descontraída e usando gírias do surf. Se as ondas forem menores que 0.5m, diga: 'Ondas menores de meio metro.'. Se forem maiores que 0.3m, diga: 'Tem um birubiru na central!'. Se forem maiores que 0.5m, diga: 'Tem meio metro bem servido!'. Se forem maiores que 0.6m, diga: 'Tem altas ondas! Bora Pro surf!'. Dê também um parecer geral sobre as condições do mar para o surf."
                    },
                    { role: "user", content: textoParaChatGPT }
                ],
                max_tokens: 200,
                temperature: 0.7
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content;

    } catch (error) {
        console.error("❌ Erro ao consultar ChatGPT:", error.response?.data || error.message);
        return "Erro ao gerar resumo.";
    }
}




// 🔹 Rota para obter previsões (com cache)
app.get('/condicoes-mar', async (req, res) => {
    const agora = Date.now();

    if (cachePrevisoes && (agora - ultimaAtualizacao < TEMPO_CACHE_MS)) {
        console.log("⚡ Usando previsões do cache.");
        return res.json(cachePrevisoes); // ✅ Retorna do cache sem fazer nova requisição
    }

    await atualizarPrevisoes();

    if (cachePrevisoes) {
        res.json(cachePrevisoes); // ✅ Retorna corretamente com o resumo do ChatGPT incluído
    } else {
        res.status(500).json({ error: "Erro ao obter dados da StormGlass API" });
    }
});


// 🔹 Inicia o servidor e carrega o cache
app.listen(PORT, async () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    carregarCache(); // 🔹 Carrega cache salvo no disco
    if (!cachePrevisoes) {
        await atualizarPrevisoes(); // 🔄 Faz uma requisição inicial se não houver cache válido
    }
});





// 🔹 Rota para previsão do tempo
app.get("/tempo", async (req, res) => {
    try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;
        const response = await axios.get(url);

        // 🔹 Formata o JSON com indentação de 2 espaços
        res.setHeader("Content-Type", "application/json");
        res.send(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error("❌ Erro ao buscar previsão do tempo:", error);
        res.status(500).json({ erro: "Erro ao obter dados do OpenWeatherMap" });
    }
});

