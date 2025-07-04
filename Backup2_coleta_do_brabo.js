// Versão 1.1.5 — última atualização em 2025-07-03T21:05:16Z

// ==UserScript==
// @name         Coletor do Brabo testes
// @namespace    http://tampermonkey.net/
// @version      9.4
// @description  Automação com lógica de sincronização e delay corrigidos pelo usuário.
// @author       Seu Nome Aqui
// @match        *://*/game.php*screen=place&mode=scavenge*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    // =======================================================================
    //  1. BANCO DE DADOS E CONSTANTES
    // =======================================================================
    const STORAGE_KEY = 'scavenging_automation_state_final_v9.4';
    // MUDANÇA 1: Delay padrão ajustado para 10 segundos
    const DELAY_APOS_COLETA_SEGUNDOS = 10;
    const CAPACIDADE_TROPAS = {
        spear: 25, sword: 15, axe: 10, archer: 10, light: 80, marcher: 50, heavy: 50, knight: 100
    };
    const NOMES_TROPAS_PT = {
        spear: "Lanceiro", sword: "Espadachim", axe: "Bárbaro", archer: "Arqueiro", light: "C. Leve", marcher: "C. Arqueira", heavy: "C. Pesada", knight: "Paladino"
    };
    const FATORES_COLETA = {
        "Pequena Coleta": 0.10, "Média Coleta": 0.25, "Grande Coleta": 0.50, "Extrema Coleta": 0.75
    };
    const CONSTANTES_FORMULA = {
        DURATION_EXPONENT: 0.45000, DURATION_INITIAL_SECONDS: 1800, DURATION_FACTOR: 0.683013
    };

    // =======================================================================
    //  2. INTERFACE GRÁFICA
    // =======================================================================
    const HTML_PAINEL = `
        <div id="auto-painel-container">
            <h3>Automação de Coleta (v9.4)</h3>
            <div id="config-panel">
                <div class="grupo-secao">
                    <label>1. Selecione as Coletas:</label>
                    <div id="selecao-coletas" class="checkbox-grid"></div>
                </div>
                <div class="grupo-secao">
                    <label>2. Selecione as Tropas:</label>
                    <div id="selecao-tropas" class="checkbox-grid"></div>
                </div>
                <div class="grupo-secao">
                    <label for="tempo-alvo">3. Tempo Desejado (H:M:S):</label>
                    <input type="text" id="tempo-alvo" value="00:40:00">
                </div>
                <div class="grupo-secao-botoes">
                    <button id="btn-ligar-automacao" class="btn">Ligar Automação</button>
                    <button id="btn-parar-automacao" class="btn btn-disabled">Parar Automação</button>
                </div>
            </div>
            <div id="status-panel">
                <h4>Status dos Agendamentos:</h4>
                <div id="status-log"></div>
            </div>
        </div>
    `;
    const CSS_PAINEL = `
        #auto-painel-container { position: fixed; top: 100px; right: 20px; width: 350px; background: #f4e4bc; border: 3px solid #7d510f; z-index: 10000; padding: 10px; font-family: Arial, sans-serif; }
        #auto-painel-container h3, #auto-painel-container h4 { text-align: center; margin: 5px 0; color: #542F0C; }
        .grupo-secao { margin-bottom: 10px; }
        .grupo-secao label { font-weight: bold; display: block; margin-bottom: 5px; }
        .checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; background: #e9d7b4; padding: 5px; border-radius: 3px; }
        .checkbox-container { margin: 2px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .grupo-secao-botoes { display: flex; justify-content: space-around; margin-top: 15px; }
        #status-panel { margin-top: 10px; border-top: 2px solid #c1a264; padding-top: 5px; }
        #status-log { font-size:11px; height: 100px; overflow-y: auto; background: #faf5e9; padding: 5px; }
    `;
    document.head.insertAdjacentHTML('beforeend', `<style>${CSS_PAINEL}</style>`);
    document.body.insertAdjacentHTML('beforeend', HTML_PAINEL);
    const contColetas = document.getElementById('selecao-coletas');
    Object.keys(FATORES_COLETA).forEach(nomeColeta => {
        const id = `chk-coleta-auto-${nomeColeta.replace(/\s+/g, '')}`;
        contColetas.innerHTML += `<span class="checkbox-container"><input type="checkbox" id="${id}" value="${nomeColeta}" checked><label for="${id}">${nomeColeta}</label></span>`;
    });
    const contTropas = document.getElementById('selecao-tropas');
    Object.keys(NOMES_TROPAS_PT).forEach(nomeTropa => {
        const id = `chk-tropa-${nomeTropa}`;
        const nomeEmPortugues = NOMES_TROPAS_PT[nomeTropa];
        contTropas.innerHTML += `<span class="checkbox-container"><input type="checkbox" id="${id}" value="${nomeTropa}"><label for="${id}" title="${nomeEmPortugues}">${nomeEmPortugues}</label></span>`;
    });

    // =======================================================================
    //  3. LÓGICA DA AUTOMAÇÃO (Com a sua solução implementada)
    // =======================================================================
    let automationInterval = null;
    const btnLigar = document.getElementById('btn-ligar-automacao');
    const btnParar = document.getElementById('btn-parar-automacao');
    const statusLog = document.getElementById('status-log');

    function parseTempoParaSegundos(t){const e=t.split(":").map(Number);return 3===e.length?3600*e[0]+60*e[1]+e[2]:0}
    function formatarSegundos(s){if(s<0)s=0;const t=Math.floor(s/3600),e=Math.floor(s%3600/60),o=Math.round(s%60);return[t,e,o].map(t=>t<10?"0"+t:t).join(":")}
    function calcularCapacidadeNecessaria(t,e){const o=FATORES_COLETA[e];if(!o||t<=0)return 0;const a=t/CONSTANTES_FORMULA.DURATION_FACTOR,n=a-CONSTANTES_FORMULA.DURATION_INITIAL_SECONDS;if(n<0)return 0;const l=Math.pow(n,1/CONSTANTES_FORMULA.DURATION_EXPONENT),r=l/100/Math.pow(o,2);return Math.sqrt(r)}

    async function executarColetaUnica(nomeDaColeta, tropasSelecionadas, tempoDesejadoSeg) {
        statusLog.innerHTML = `<div>Verificando: <b>${nomeDaColeta}</b>...</div>`;
        const cardPai = Array.from(document.querySelectorAll('.scavenge-option .title')).find(el => el.innerText.trim() === nomeDaColeta)?.closest('.scavenge-option');
        if (!cardPai) { return 300; }

        const botaoComecar = cardPai.querySelector('a.free_send_button');

        // MUDANÇA 2: Sua lógica de sincronização implementada aqui
        if (!botaoComecar) {
            statusLog.innerHTML += `<div><b>${nomeDaColeta}:</b> Em andamento. Sincronizando...</div>`;
            const tempoRestanteEl = cardPai.querySelector('.return-countdown') || cardPai.querySelector('.duration');
            const tempoRestanteStr = tempoRestanteEl?.textContent.trim() || "0:00:00";
            return parseTempoParaSegundos(tempoRestanteStr);
        }

        statusLog.innerHTML += `<div><b>${nomeDaColeta}:</b> Pronto para envio. Calculando...</div>`;
        let tropasDisponiveis={},capacidadeTotalDisponivel=0;tropasSelecionadas.forEach(e=>{const o=document.querySelector(`a.units-entry-all[data-unit="${e}"]`),t=o?parseInt(o.textContent.replace(/[()]/g,""),10):0;tropasDisponiveis[e]=t,capacidadeTotalDisponivel+=t*CAPACIDADE_TROPAS[e]});
        if(0===capacidadeTotalDisponivel)return 300;
        const capacidadeNecessaria=calcularCapacidadeNecessaria(tempoDesejadoSeg,nomeDaColeta);
        document.querySelectorAll("input.units-input-nicer").forEach(e=>{e.value=""});
        tropasSelecionadas.forEach(e=>{const o=tropasDisponiveis[e]*CAPACIDADE_TROPAS[e]/capacidadeTotalDisponivel,t=Math.floor(capacidadeNecessaria*o/CAPACIDADE_TROPAS[e]),a=Math.min(tropasDisponiveis[e],t),n=document.querySelector(`input[name="${e}"]`);n&&(n.value=a,n.dispatchEvent(new Event("input",{bubbles:!0})),n.dispatchEvent(new Event("change",{bubbles:!0})))})
        await new Promise(e=>setTimeout(e,250));
        botaoComecar.click();
        statusLog.innerHTML += `<div><b>${nomeDaColeta}:</b> Coleta iniciada!</div>`;
        const tempoRealLido = cardPai.querySelector('.duration')?.textContent.trim()||"0:00:00";
        return parseTempoParaSegundos(tempoRealLido);
    }

    async function tick() {
        let estado = await GM_getValue(STORAGE_KEY, {});
        const agora = new Date().getTime();
        let htmlStatus = '';
        let estadoMudou = false;
        for (const nomeColeta in estado) {
            const agendamento = estado[nomeColeta];
            if (agendamento.ativo) {
                if (agora >= agendamento.proximaExecucao) {
                    htmlStatus += `<div><b>${nomeColeta}:</b> Executando agora...</div>`;
                    estado[nomeColeta].ativo = false;
                    await GM_setValue(STORAGE_KEY, estado);
                    const tempoRealSeg = await executarColetaUnica(nomeColeta, agendamento.tropas, agendamento.tempoDesejado);
                    const novoEstado = await GM_getValue(STORAGE_KEY, {});
                    if (novoEstado[nomeColeta]) {
                        // MUDANÇA 1: Usando a nova constante de DELAY
                        const proximoTimestamp = new Date().getTime() + (tempoRealSeg + DELAY_APOS_COLETA_SEGUNDOS) * 1000;
                        novoEstado[nomeColeta] = { ...agendamento, ativo: true, proximaExecucao: proximoTimestamp };
                        await GM_setValue(STORAGE_KEY, novoEstado);
                    }
                    estadoMudou = true;
                    break;
                } else {
                    const tempoRestante = (agendamento.proximaExecucao - agora) / 1000;
                    htmlStatus += `<div><b>${nomeColeta}:</b> Próximo envio em ${formatarSegundos(tempoRestante)}</div>`;
                }
            }
        }
        if(!estadoMudou) statusLog.innerHTML = htmlStatus || "Automação parada.";
    }

    btnLigar.addEventListener('click', async () => {
        const tropas = Array.from(document.querySelectorAll('#selecao-tropas input:checked')).map(el => el.value);
        const tempoDesejado = parseTempoParaSegundos(document.getElementById('tempo-alvo').value);
        const coletasSelecionadas = Array.from(document.querySelectorAll('#selecao-coletas input:checked')).map(el => el.value);
        if (tropas.length === 0 || tempoDesejado <= 0 || coletasSelecionadas.length === 0) {
            alert("Por favor, selecione as coletas, as tropas e um tempo válido.");
            return;
        }
        let estadoInicial = {};
        const agora = new Date().getTime();
        coletasSelecionadas.forEach(nomeColeta => {
            estadoInicial[nomeColeta] = {
                ativo: true, proximaExecucao: agora, tropas: tropas, tempoDesejado: tempoDesejado
            };
        });
        await GM_setValue(STORAGE_KEY, estadoInicial);
        if (automationInterval) clearInterval(automationInterval);
        automationInterval = setInterval(tick, 5000);
        btnLigar.classList.add('btn-disabled');
        btnParar.classList.remove('btn-disabled');
        tick();
    });

    btnParar.addEventListener('click', async () => {
        if (automationInterval) clearInterval(automationInterval);
        automationInterval = null;
        await GM_setValue(STORAGE_KEY, {});
        btnLigar.classList.remove('btn-disabled');
        btnParar.classList.add('btn-disabled');
        statusLog.innerHTML = "Automação parada.";
    });

    (async () => {
        const estadoSalvo = await GM_getValue(STORAGE_KEY, {});
        if (Object.keys(estadoSalvo).length > 0) {
            automationInterval = setInterval(tick, 5000);
            btnLigar.classList.add('btn-disabled');
            btnParar.classList.remove('btn-disabled');
            tick();
        }
    })();

})();
