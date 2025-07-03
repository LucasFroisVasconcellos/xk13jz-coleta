// Versão 1.1.1 — última atualização em 2025-07-03T16:33:59Z

(function() {
    'use strict';

    // =======================================================================
    //  1. BANCO DE DADOS E CONSTANTES
    // =======================================================================
    const STORAGE_KEY = 'scavenging_automation_state_final_v9.5';
    const DELAY_APOS_COLETA_SEGUNDOS = 10;
    const CAPACIDADE_TROPAS = { spear: 25, sword: 15, axe: 10, archer: 10, light: 80, marcher: 50, heavy: 50, knight: 100 };
    const NOMES_TROPAS_PT = { spear: "Lanceiro", sword: "Espadachim", axe: "Bárbaro", archer: "Arqueiro", light: "C. Leve", marcher: "C. Arqueira", heavy: "C. Pesada", knight: "Paladino" };
    const FATORES_COLETA = { "Pequena Coleta": 0.10, "Média Coleta": 0.25, "Grande Coleta": 0.50, "Extrema Coleta": 0.75 };
    const CONSTANTES_FORMULA = { DURATION_EXPONENT: 0.45000, DURATION_INITIAL_SECONDS: 1800, DURATION_FACTOR: 0.683013 };

    // =======================================================================
    //  2. INTERFACE GRÁFICA (Com suas melhorias)
    // =======================================================================
    const HTML_PAINEL = `
        <div id="auto-painel-container">
            <h3 id="auto-painel-header">Automação de Coleta (v9.5)</h3>
            <div id="painel-conteudo-completo">
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
        </div>
    `;
    // CSS ATUALIZADO COM SUA SUGESTÃO
    const CSS_PAINEL = `
        #auto-painel-container {
            position: absolute;
            top: 100px; left: 100px;
            width: 350px; max-width: 90%;
            background: #f4e4bc;
            border: 3px solid #7d510f;
            z-index: 10000;
            box-shadow: 2px 2px 8px rgba(0,0,0,0.3);
            resize: both;
            overflow: auto;
        }
        #auto-painel-header { text-align: center; margin: 0; padding: 5px; color: #542F0C; font-size: 14px; font-weight: bold; }
        #painel-conteudo-completo { padding: 0 10px 10px 10px; }
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

    // Preenche os checkboxes
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
    //  3. LÓGICA DE INTERATIVIDADE DO PAINEL (Suas funções)
    // =======================================================================
    const painelPrincipal = document.getElementById('auto-painel-container');

    // SOLUÇÃO 1: TORNAR ARRASTÁVEL
    function tornarArrastavel(elemento) {
        let offsetX = 0, offsetY = 0, arrastando = false;
        const cabecalho = elemento.querySelector('#auto-painel-header');
        cabecalho.style.cursor = 'move';
        cabecalho.onmousedown = function(e) {
            arrastando = true;
            offsetX = e.clientX - elemento.offsetLeft;
            offsetY = e.clientY - elemento.offsetTop;
            document.onmousemove = function(e) {
                if (arrastando) {
                    elemento.style.top = (e.clientY - offsetY) + 'px';
                    elemento.style.left = (e.clientX - offsetX) + 'px';
                }
            };
            document.onmouseup = function() {
                arrastando = false;
                document.onmousemove = null;
                document.onmouseup = null;
            };
        };
    }
    tornarArrastavel(painelPrincipal);

    // SOLUÇÃO 2: BOTÃO DE MINIMIZAR
    const botaoMinimizar = document.createElement('button');
    botaoMinimizar.textContent = "−"; // Símbolo de menos
    botaoMinimizar.style.cssText = "position:absolute; top:5px; right:5px; font-weight:bold; width: 20px; height: 20px; line-height: 1; border-radius: 3px;";
    botaoMinimizar.onclick = () => {
        const conteudo = document.getElementById('painel-conteudo-completo');
        const estaVisivel = conteudo.style.display !== 'none';
        conteudo.style.display = estaVisivel ? 'none' : 'block';
        botaoMinimizar.textContent = estaVisivel ? '+' : '−';
    };
    painelPrincipal.appendChild(botaoMinimizar);


    // =======================================================================
    //  4. LÓGICA DA AUTOMAÇÃO (Inalterada)
    // =======================================================================
    let automationInterval = null;
    const btnLigar = document.getElementById('btn-ligar-automacao');
    const btnParar = document.getElementById('btn-parar-automacao');
    const statusLog = document.getElementById('status-log');
    // ... (O restante do código de automação, que já está funcionando, continua aqui sem alterações)
    // As funções parseTempoParaSegundos, formatarSegundos, calcularCapacidadeNecessaria, executarColetaUnica, tick, e os eventListeners dos botões permanecem os mesmos da v9.4.
    function parseTempoParaSegundos(t){const e=t.split(":").map(Number);return 3===e.length?3600*e[0]+60*e[1]+e[2]:0}
    function formatarSegundos(s){if(s<0)s=0;const t=Math.floor(s/3600),e=Math.floor(s%3600/60),o=Math.round(s%60);return[t,e,o].map(t=>t<10?"0"+t:t).join(":")}
    function calcularCapacidadeNecessaria(t,e){const o=FATORES_COLETA[e];if(!o||t<=0)return 0;const a=t/CONSTANTES_FORMULA.DURATION_FACTOR,n=a-CONSTANTES_FORMULA.DURATION_INITIAL_SECONDS;if(n<0)return 0;const l=Math.pow(n,1/CONSTANTES_FORMULA.DURATION_EXPONENT),r=l/100/Math.pow(o,2);return Math.sqrt(r)}
    async function executarColetaUnica(e,t,o){statusLog.innerHTML=`<div>Verificando: <b>${e}</b>...</div>`;const a=Array.from(document.querySelectorAll(".scavenge-option .title")).find(t=>t.innerText.trim()===e)?.closest(".scavenge-option");if(!a)return 300;if(a.querySelector("a.unlock-button"))return statusLog.innerHTML+=`<div><b>${e}:</b> Bloqueada. Ignorando.</div>`,-1;const n=a.querySelector("a.free_send_button");if(!n)return statusLog.innerHTML+=`<div><b>${e}:</b> Em andamento. Sincronizando...</div>`,parseTempoParaSegundos(a.querySelector(".duration")?.textContent.trim()||"0:00:00");statusLog.innerHTML+=`<div><b>${e}:</b> Pronto para envio. Calculando...</div>`;let l={},r=0;t.forEach(t=>{const e=document.querySelector(`a.units-entry-all[data-unit="${t}"]`),o=e?parseInt(e.textContent.replace(/[()]/g,""),10):0;l[t]=o,r+=o*CAPACIDADE_TROPAS[t]});if(0===r)return 300;const c=calcularCapacidadeNecessaria(o,e);document.querySelectorAll("input.units-input-nicer").forEach(e=>{e.value=""}),t.forEach(e=>{const o=l[e]*CAPACIDADE_TROPAS[e]/r,t=Math.floor(c*o/CAPACIDADE_TROPAS[e]),s=Math.min(l[e],t),i=document.querySelector(`input[name="${e}"]`);i&&(i.value=s,i.dispatchEvent(new Event("input",{bubbles:!0})),i.dispatchEvent(new Event("change",{bubbles:!0})))})
    ,await new Promise(e=>setTimeout(e,250)),n.click(),statusLog.innerHTML+=`<div><b>${e}:</b> Coleta iniciada!</div>`;const s=a.querySelector(".duration")?.textContent.trim()||"0:00:00";return parseTempoParaSegundos(s)}
    async function tick(){let e=await GM_getValue(STORAGE_KEY,{}),t=new Date().getTime(),o="",a=!1;for(const n in e){const l=e[n];if(l.ativo)if(t>=l.proximaExecucao){o+=`<div><b>${n}:</b> Executando agora...</div>`,e[n].ativo=!1,await GM_setValue(STORAGE_KEY,e);const c=await executarColetaUnica(n,l.tropas,l.tempoDesejado),r=await GM_getValue(STORAGE_KEY,{});r[n]&&(-1===c?delete r[n]:r[n]={...l,ativo:!0,proximaExecucao:new Date().getTime()+(c+DELAY_APOS_COLETA_SEGUNDOS)*1e3},await GM_setValue(STORAGE_KEY,r)),a=!0;break}else{const s=(l.proximaExecucao-t)/1e3;o+=`<div><b>${n}:</b> Próximo envio em ${formatarSegundos(s)}</div>`}}a||(statusLog.innerHTML=o||"Automação parada.")}
    btnLigar.addEventListener("click",async()=>{const t=Array.from(document.querySelectorAll("#selecao-tropas input:checked")).map(e=>e.value),o=parseTempoParaSegundos(document.getElementById("tempo-alvo").value),e=Array.from(document.querySelectorAll("#selecao-coletas input:checked")).map(e=>e.value);if(0===t.length||o<=0||0===e.length)return void alert("Por favor, selecione as coletas, as tropas e um tempo válido.");let a={};const n=new Date().getTime();e.forEach(e=>{a[e]={ativo:!0,proximaExecucao:n,tropas:t,tempoDesejado:o}}),await GM_setValue(STORAGE_KEY,a),automationInterval&&clearInterval(automationInterval),automationInterval=setInterval(tick,5e3),btnLigar.classList.add("btn-disabled"),btnParar.classList.remove("btn-disabled"),tick()}),btnParar.addEventListener("click",async()=>{automationInterval&&clearInterval(automationInterval),automationInterval=null,await GM_setValue(STORAGE_KEY,{}),btnLigar.classList.remove("btn-disabled"),btnParar.classList.add("btn-disabled"),statusLog.innerHTML="Automação parada."}),async function(){const e=await GM_getValue(STORAGE_KEY,{});0<Object.keys(e).length&&(automationInterval=setInterval(tick,5e3),btnLigar.classList.add("btn-disabled"),btnParar.classList.remove("btn-disabled"),tick())}()

})();
