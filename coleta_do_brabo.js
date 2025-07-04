// Versão 1.1.6 — última atualização em 2025-07-04T00:23:55Z

// ==UserScript==
// @name         Coletor do Brabo (Refatorado v6)
// @namespace    http://tampermonkey.net/
// @version      9.4-Refactored-TimeInput
// @description  Automação com seletor de tempo nativo para melhor usabilidade.
// @author       Seu Nome Aqui
// @match        *://*/game.php*screen=place&mode=scavenge*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(async function() {
    'use strict';

    // =======================================================================
    //  1. CONFIGURAÇÕES E CONSTANTES GLOBAIS
    // =======================================================================
    const CONFIG = {
        STORAGE_KEY: 'scavenging_automation_state_final_v9.4',
        DELAY_APOS_COLETA_SEGUNDOS: 10,
        TICK_INTERVAL_MS: 5000,
        CAPACIDADE_TROPAS: {
            spear: 25, sword: 15, axe: 10, archer: 10, light: 80, marcher: 50, heavy: 50, knight: 100
        },
        NOMES_TROPAS_PT: {
            spear: "Lanceiro", sword: "Espadachim", axe: "Bárbaro", archer: "Arqueiro",
            light: "C. Leve", marcher: "C. Arqueira", heavy: "C. Pesada", knight: "Paladino"
        },
        FATORES_COLETA: {
            "Pequena Coleta": 0.10, "Média Coleta": 0.25, "Grande Coleta": 0.50, "Extrema Coleta": 0.75
        },
        CONSTANTES_FORMULA: {
            DURATION_EXPONENT: 0.45000,
            DURATION_INITIAL_SECONDS: 1800,
            DURATION_FACTOR: 0.683013
        }
    };

    // =======================================================================
    //  2. MÓDULO DE UTILIDADES (Utils)
    // =======================================================================
    const Utils = {
        parseTempoParaSegundos(tempoString) {
            const partes = tempoString.split(":").map(Number);
            return partes.length === 3 ? (partes[0] * 3600) + (partes[1] * 60) + partes[2] : 0;
        },
        formatarSegundos(totalSegundos) {
            if (totalSegundos < 0) totalSegundos = 0;
            const h = Math.floor(totalSegundos / 3600);
            const m = Math.floor((totalSegundos % 3600) / 60);
            const s = Math.round(totalSegundos % 60);
            return [h, m, s].map(val => val < 10 ? "0" + val : val).join(":");
        },
        calcCapacity(targetSeconds, coletaType) {
            const fator = CONFIG.FATORES_COLETA[coletaType];
            if (!fator || targetSeconds <= 0) return 0;
            const duracaoBase = targetSeconds / CONFIG.CONSTANTES_FORMULA.DURATION_FACTOR;
            const incrementoDuracao = duracaoBase - CONFIG.CONSTANTES_FORMULA.DURATION_INITIAL_SECONDS;
            if (incrementoDuracao < 0) return 0;
            const potenciaBase = Math.pow(incrementoDuracao, 1 / CONFIG.CONSTANTES_FORMULA.DURATION_EXPONENT);
            const resultadoFinal = potenciaBase / (100 * Math.pow(fator, 2));
            return Math.sqrt(resultadoFinal);
        },
        async getState() { return await GM_getValue(CONFIG.STORAGE_KEY, {}); },
        async setState(state) { await GM_setValue(CONFIG.STORAGE_KEY, state); }
    };

    // =======================================================================
    //  3. MÓDULO DE INTERFACE (UI)
    // =======================================================================
    const UI = {
        elements: {},
        panelCSS: `
            #cdb-painel-container { position: fixed; top: 100px; right: 20px; width: 350px; background: #f4e4bc; border: 3px solid #7d510f; z-index: 10000; padding: 10px; font-family: Arial, sans-serif; }
            #cdb-painel-container h3, #cdb-painel-container h4 { text-align: center; margin: 5px 0 10px 0; color: #542F0C; }
            .cdb-grupo-secao { margin-bottom: 10px; }
            .cdb-grupo-secao > label { font-weight: bold; display: block; margin-bottom: 5px; }
            .cdb-checkbox-grid { display: grid; grid-template-columns: 1fr 1fr; background: #e9d7b4; padding: 5px; border-radius: 3px; }
            .cdb-checkbox-container { display: flex; align-items: center; margin: 2px 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .cdb-grupo-secao-botoes { display: flex; justify-content: space-around; margin-top: 15px; }
            #cdb-status-panel { margin-top: 10px; border-top: 2px solid #c1a264; padding-top: 5px; }
            #cdb-status-log { font-size:11px; height: 100px; overflow-y: auto; background: #faf5e9; padding: 5px; border: 1px solid #e0d1b0; border-radius: 3px; }
            #cdb-tempo-alvo { border: 1px solid #c1a264; padding: 2px 4px; border-radius: 3px; }`,

        _createCheckboxGroup(items, nameAttr, checkedDefault = false) {
            const fragment = document.createDocumentFragment();
            Object.entries(items).forEach(([key, val]) => {
                const id = `cdb-${nameAttr}-${key.replace(/\s+/g, '')}`;
                const container = document.createElement('span');
                container.className = 'cdb-checkbox-container';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = id;
                checkbox.value = key;
                if (checkedDefault) checkbox.checked = true;
                const label = document.createElement('label');
                label.htmlFor = id;
                const labelText = nameAttr === 'tropa' ? val : key;
                label.textContent = ` ${labelText}`;
                label.title = labelText;
                container.appendChild(checkbox);
                container.appendChild(label);
                fragment.appendChild(container);
            });
            return fragment;
        },

        initialize() {
            document.head.insertAdjacentHTML('beforeend', `<style>${this.panelCSS}</style>`);
            const container = document.createElement('div');
            container.id = 'cdb-painel-container';
            const title = document.createElement('h3');
            title.textContent = 'Automação de Coleta (v9.4)';
            const configPanel = document.createElement('div');
            configPanel.id = 'cdb-config-panel';
            const coletasSection = document.createElement('div');
            coletasSection.className = 'cdb-grupo-secao';
            const coletasLabel = document.createElement('label');
            coletasLabel.textContent = '1. Selecione as Coletas:';
            this.elements.selecaoColetas = document.createElement('div');
            this.elements.selecaoColetas.className = 'cdb-checkbox-grid';
            this.elements.selecaoColetas.appendChild(this._createCheckboxGroup(CONFIG.FATORES_COLETA, 'coleta', true));
            coletasSection.append(coletasLabel, this.elements.selecaoColetas);
            const tropasSection = document.createElement('div');
            tropasSection.className = 'cdb-grupo-secao';
            const tropasLabel = document.createElement('label');
            tropasLabel.textContent = '2. Selecione as Tropas:';
            this.elements.selecaoTropas = document.createElement('div');
            this.elements.selecaoTropas.className = 'cdb-checkbox-grid';
            this.elements.selecaoTropas.appendChild(this._createCheckboxGroup(CONFIG.NOMES_TROPAS_PT, 'tropa'));
            tropasSection.append(tropasLabel, this.elements.selecaoTropas);
            const tempoSection = document.createElement('div');
            tempoSection.className = 'cdb-grupo-secao';
            const tempoLabel = document.createElement('label');
            tempoLabel.htmlFor = 'cdb-tempo-alvo';
            tempoLabel.textContent = '3. Tempo Desejado (H:M:S):';
            this.elements.tempoAlvoInput = document.createElement('input');
            this.elements.tempoAlvoInput.type = 'time';
            this.elements.tempoAlvoInput.id = 'cdb-tempo-alvo';
            this.elements.tempoAlvoInput.step = '1';
            this.elements.tempoAlvoInput.value = '00:40:00';
            tempoSection.append(tempoLabel, this.elements.tempoAlvoInput);
            const botoesSection = document.createElement('div');
            botoesSection.className = 'cdb-grupo-secao-botoes';
            this.elements.btnLigar = document.createElement('button');
            this.elements.btnLigar.id = 'btn-ligar-automacao';
            this.elements.btnLigar.className = 'btn';
            this.elements.btnLigar.textContent = 'Ligar Automação';
            this.elements.btnParar = document.createElement('button');
            this.elements.btnParar.id = 'btn-parar-automacao';
            this.elements.btnParar.className = 'btn btn-disabled';
            this.elements.btnParar.textContent = 'Parar Automação';
            botoesSection.append(this.elements.btnLigar, this.elements.btnParar);
            configPanel.append(coletasSection, tropasSection, tempoSection, botoesSection);
            const statusPanel = document.createElement('div');
            statusPanel.id = 'cdb-status-panel';
            const statusTitle = document.createElement('h4');
            statusTitle.textContent = 'Status dos Agendamentos:';
            this.elements.statusLog = document.createElement('div');
            this.elements.statusLog.id = 'cdb-status-log';
            statusPanel.append(statusTitle, this.elements.statusLog);
            container.append(title, configPanel, statusPanel);
            document.body.appendChild(container);
        },

        setupEventListeners() {
            this.elements.btnLigar.addEventListener('click', () => {
                const tropas = Array.from(this.elements.selecaoTropas.querySelectorAll('input:checked')).map(x => x.value);
                const tempo = Utils.parseTempoParaSegundos(this.elements.tempoAlvoInput.value);
                const coletas = Array.from(this.elements.selecaoColetas.querySelectorAll('input:checked')).map(x => x.value);
                if (!tropas.length || tempo <= 0 || !coletas.length) {
                    alert("Por favor, selecione coletas, tropas e um tempo válido."); return;
                }
                Scheduler.start({ tropas, tempoDesejado: tempo, nomesColetas: coletas });
            });
            this.elements.btnParar.addEventListener('click', () => Scheduler.stop());
        },

        updateStatus(html) { if (this.elements.statusLog) this.elements.statusLog.innerHTML = html; },

        setAutomationState(isAutomationRunning) {
             if (isAutomationRunning) {
                this.elements.btnLigar.classList.add('btn-disabled');
                this.elements.btnParar.classList.remove('btn-disabled');
             } else {
                this.elements.btnLigar.classList.remove('btn-disabled');
                this.elements.btnParar.classList.add('btn-disabled');
             }
        }
    };

    // =======================================================================
    //  4. MÓDULO DE COLETA (Scavenge)
    // =======================================================================
    const Scavenge = {
        async execute(nomeDaColeta, tropasSelecionadas, tempoDesejadoSeg, scavengeOptions) {
            UI.updateStatus(`<div>Verificando: <b>${nomeDaColeta}</b>...</div>`);
            const cardPai = scavengeOptions.find(option => {
                const titleEl = option.querySelector('.title');
                return titleEl && titleEl.innerText.trim() === nomeDaColeta;
            });
            if (!cardPai) return 300;
            const botaoComecar = cardPai.querySelector('a.free_send_button');
            if (!botaoComecar) {
                UI.updateStatus(UI.elements.statusLog.innerHTML + `<div><b>${nomeDaColeta}:</b> Em andamento. Sincronizando...</div>`);
                const tempoRestanteEl = cardPai.querySelector('.return-countdown') || cardPai.querySelector('.duration');
                return Utils.parseTempoParaSegundos(tempoRestanteEl?.textContent.trim() || "0:00:00");
            }
            UI.updateStatus(UI.elements.statusLog.innerHTML + `<div><b>${nomeDaColeta}:</b> Pronto para envio. Calculando...</div>`);
            let tropasDisponiveis = {}, capacidadeTotalDisponivel = 0;
            tropasSelecionadas.forEach(tropa => {
                const el = document.querySelector(`a.units-entry-all[data-unit="${tropa}"]`);
                const qtd = el ? parseInt(el.textContent.replace(/[()]/g, ""), 10) : 0;
                tropasDisponiveis[tropa] = qtd;
                capacidadeTotalDisponivel += qtd * CONFIG.CAPACIDADE_TROPAS[tropa];
            });
            if (capacidadeTotalDisponivel === 0) return 300;
            const capacidadeNecessaria = Utils.calcCapacity(tempoDesejadoSeg, nomeDaColeta);
            document.querySelectorAll("input.units-input-nicer").forEach(e => e.value = "");
            tropasSelecionadas.forEach(tropa => {
                const proporcao = (tropasDisponiveis[tropa] * CONFIG.CAPACIDADE_TROPAS[tropa]) / capacidadeTotalDisponivel;
                let tropasAEnviar = Math.floor((capacidadeNecessaria * proporcao) / CONFIG.CAPACIDADE_TROPAS[tropa]);
                tropasAEnviar = Math.min(tropasDisponiveis[tropa], tropasAEnviar);
                const inputTropa = document.querySelector(`input[name="${tropa}"]`);
                if (inputTropa) {
                    inputTropa.value = tropasAEnviar;
                    inputTropa.dispatchEvent(new Event("input", { bubbles: true }));
                    inputTropa.dispatchEvent(new Event("change", { bubbles: true }));
                }
            });
            await new Promise(r => setTimeout(r, 250));
            botaoComecar.click();
            UI.updateStatus(UI.elements.statusLog.innerHTML + `<div><b>${nomeDaColeta}:</b> Coleta iniciada!</div>`);
            const tempoRealLido = cardPai.querySelector('.duration')?.textContent.trim() || "0:00:00";
            return Utils.parseTempoParaSegundos(tempoRealLido);
        }
    };

    // =======================================================================
    //  5. MÓDULO AGENDADOR (Scheduler)
    // =======================================================================
    const Scheduler = {
        intervalId: null,
        cachedState: {},
        async start(config) {
            const now = Date.now();
            const initialState = {};
            config.nomesColetas.forEach(nome => {
                initialState[nome] = { ativo: true, proximaExecucao: now, tropas: config.tropas, tempoDesejado: config.tempoDesejado };
            });
            this.cachedState = initialState;
            await Utils.setState(this.cachedState);
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = setInterval(this.tick.bind(this), CONFIG.TICK_INTERVAL_MS);
            UI.setAutomationState(true);
            this.tick();
        },
        async stop() {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = null;
            this.cachedState = {};
            await Utils.setState({});
            UI.setAutomationState(false);
            UI.updateStatus("Automação parada.");
        },
        async tick() {
            const scavengeOptions = Array.from(document.querySelectorAll('.scavenge-option'));
            const agora = Date.now();
            let htmlStatus = '';
            let umaColetaJaFoiExecutada = false;
            let estadoFoiModificado = false;
            for (const nomeColeta in this.cachedState) {
                const agendamento = this.cachedState[nomeColeta];
                if (!agendamento.ativo) continue;
                if (agora >= agendamento.proximaExecucao && !umaColetaJaFoiExecutada) {
                    umaColetaJaFoiExecutada = true;
                    estadoFoiModificado = true;
                    htmlStatus += `<div><b>${nomeColeta}:</b> Executando agora...</div>`;
                    try {
                        const duracaoRealSegundos = await Scavenge.execute(nomeColeta, agendamento.tropas, agendamento.tempoDesejado, scavengeOptions);
                        const proximaExecucao = Date.now() + (duracaoRealSegundos + CONFIG.DELAY_APOS_COLETA_SEGUNDOS) * 1000;
                        this.cachedState[nomeColeta].proximaExecucao = proximaExecucao;
                    } catch (error) {
                        console.error(`Erro ao executar a coleta "${nomeColeta}":`, error);
                        htmlStatus += `<div><b style="color:red;">ERRO em ${nomeColeta}.</b> Tentando em 5 min.</div>`;
                        this.cachedState[nomeColeta].proximaExecucao = Date.now() + (300 * 1000);
                    }
                } else {
                    if (agendamento.proximaExecucao > agora) {
                        const segundosFaltantes = (agendamento.proximaExecucao - agora) / 1000;
                        htmlStatus += `<div><b>${nomeColeta}:</b> Próximo em ${Utils.formatarSegundos(segundosFaltantes)}</div>`;
                    }
                }
            }
            if (estadoFoiModificado) {
                await Utils.setState(this.cachedState);
            }
            UI.updateStatus(htmlStatus || "Automação parada. Nenhum agendamento ativo.");
        },
        async resume() {
            this.cachedState = await Utils.getState();
            if (Object.keys(this.cachedState).length > 0) {
                if (this.intervalId) clearInterval(this.intervalId);
                this.intervalId = setInterval(this.tick.bind(this), CONFIG.TICK_INTERVAL_MS);
                UI.setAutomationState(true);
                this.tick();
            }
        }
    };

    // =======================================================================
    //  6. INICIALIZAÇÃO DA APLICAÇÃO
    // =======================================================================
    function main() {
        UI.initialize();
        UI.setupEventListeners();
        // A chamada para Scheduler.resume() foi REMOVIDA para atender à solicitação.
        window.addEventListener('beforeunload', () => {
            if (Scheduler.intervalId) {
                clearInterval(Scheduler.intervalId);
            }
        });
    }

    main();

})();
