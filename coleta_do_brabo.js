// Versão 1.2.1 — última atualização em 2025-07-04T22:13:56Z

// ==UserScript==
// @name         Coletor do Brabo (Refatorado v10)
// @namespace    http://tampermonkey.net/
// @version      9.6-Refactored-VisualLock
// @description  Automação com feedback visual para coletas bloqueadas.
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
        TROOP_DATA: {
            spear:   { nome: "Lanceiro",    capacidade: 25, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_spear.png" },
            sword:   { nome: "Espadachim",  capacidade: 15, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_sword.png" },
            axe:     { nome: "Bárbaro",     capacidade: 10, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_axe.png" },
            archer:  { nome: "Arqueiro",    capacidade: 10, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_archer.png" },
            light:   { nome: "C. Leve",     capacidade: 80, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_light.png" },
            marcher: { nome: "C. Arqueira", capacidade: 50, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_marcher.png" },
            heavy:   { nome: "C. Pesada",   capacidade: 50, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_heavy.png" },
            knight:  { nome: "Paladino",    capacidade: 100, icone: "https://dsbr.innogamescdn.com/asset/8d3d81dd/graphic/unit/unit_knight.png" }
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
    //  MÓDULO DE VALIDAÇÃO
    // =======================================================================
    const Validator = {
        getAvailableScavengeOptions(scavengeOptionElements) {
            const availableOptions = [];
            scavengeOptionElements.forEach(option => {
                const isLocked = option.querySelector('a.unlock-button');
                if (!isLocked) {
                    const titleEl = option.querySelector('.title');
                    if (titleEl) {
                        availableOptions.push(titleEl.innerText.trim());
                    }
                }
            });
            return availableOptions;
        }
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
            #cdb-tempo-alvo { border: 1px solid #c1a264; padding: 2px 4px; border-radius: 3px; }
            .cdb-tropa-icon { height: 20px; width: 20px; vertical-align: middle; }
            .cdb-checkbox-container label { display: flex; align-items: center; cursor: pointer; }
            .cdb-checkbox-container input { margin-right: 4px; }
            .cdb-troop-icon-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; background: #e9d7b4; padding: 5px; border-radius: 3px; }
            .cdb-coleta-bloqueada label { opacity: 0.5; text-decoration: line-through; cursor: not-allowed; pointer-events: none; }
            .cdb-coleta-bloqueada input { pointer-events: none; }`,

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

        _createTroopIconSelectors() {
            const fragment = document.createDocumentFragment();
            Object.entries(CONFIG.TROOP_DATA).forEach(([unitKey, unitData]) => {
                const id = `cdb-tropa-${unitKey}`;
                const container = document.createElement('span');
                container.className = 'cdb-checkbox-container';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = id;
                checkbox.value = unitKey;
                const label = document.createElement('label');
                label.htmlFor = id;
                label.title = unitData.nome;
                const iconImg = document.createElement('img');
                iconImg.src = unitData.icone;
                iconImg.className = 'cdb-tropa-icon';
                label.appendChild(checkbox);
                label.appendChild(iconImg);
                container.appendChild(label);
                fragment.appendChild(container);
            });
            return fragment;
        },

        updateColetasLockStatus(availableOptions) {
            const allColetaCheckboxes = this.elements.selecaoColetas.querySelectorAll('input[type="checkbox"]');
            allColetaCheckboxes.forEach(checkbox => {
                const container = checkbox.closest('.cdb-checkbox-container');
                if (availableOptions.includes(checkbox.value)) {
                    container.classList.remove('cdb-coleta-bloqueada');
                } else {
                    container.classList.add('cdb-coleta-bloqueada');
                }
            });
        },

        initialize() {
            document.head.insertAdjacentHTML('beforeend', `<style>${this.panelCSS}</style>`);
            const container = document.createElement('div');
            container.id = 'cdb-painel-container';
            const title = document.createElement('h3');
            title.textContent = 'Automação de Coleta (v9.6)';
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
            this.elements.selecaoTropas.className = 'cdb-troop-icon-grid';
            this.elements.selecaoTropas.appendChild(this._createTroopIconSelectors());
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
            this.elements.tempoAlvoInput.value = '01:00:00';
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
                const tropasSelecionadas = Array.from(this.elements.selecaoTropas.querySelectorAll('input:checked')).map(x => x.value);
                const tempoDesejado = Utils.parseTempoParaSegundos(this.elements.tempoAlvoInput.value);
                const coletasSelecionadas = Array.from(this.elements.selecaoColetas.querySelectorAll('input:checked')).map(x => x.value);

                const todasAsOpcoesDOM = document.querySelectorAll('.scavenge-option');
                const coletasDisponiveis = Validator.getAvailableScavengeOptions(todasAsOpcoesDOM);

                const coletasValidasParaEnviar = coletasSelecionadas.filter(coleta => coletasDisponiveis.includes(coleta));

                if (!tropasSelecionadas.length || tempoDesejado <= 0 || !coletasValidasParaEnviar.length) {
                    alert("Por favor, selecione tropas, um tempo válido e pelo menos uma opção de coleta DESBLOQUEADA.");
                    return;
                }
                Scheduler.start({
                    tropas: tropasSelecionadas,
                    tempoDesejado: tempoDesejado,
                    nomesColetas: coletasValidasParaEnviar
                });
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
                capacidadeTotalDisponivel += qtd * CONFIG.TROOP_DATA[tropa].capacidade;
            });
            if (capacidadeTotalDisponivel === 0) return 300;
            const capacidadeNecessaria = Utils.calcCapacity(tempoDesejadoSeg, nomeDaColeta);
            document.querySelectorAll("input.units-input-nicer").forEach(e => e.value = "");
            tropasSelecionadas.forEach(tropa => {
                const proporcao = (tropasDisponiveis[tropa] * CONFIG.TROOP_DATA[tropa].capacidade) / capacidadeTotalDisponivel;
                let tropasAEnviar = Math.floor((capacidadeNecessaria * proporcao) / CONFIG.TROOP_DATA[tropa].capacidade);
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
            config.nomesColetas.slice().reverse().forEach(nome => {
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
            const coletasDisponiveis = Validator.getAvailableScavengeOptions(scavengeOptions);
            UI.updateColetasLockStatus(coletasDisponiveis);

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

        const initialOptions = document.querySelectorAll('.scavenge-option');
        const availableOptions = Validator.getAvailableScavengeOptions(initialOptions);
        UI.updateColetasLockStatus(availableOptions);

        window.addEventListener('beforeunload', () => {
            if (Scheduler.intervalId) {
                clearInterval(Scheduler.intervalId);
            }
        });
    }

    main();

})();
