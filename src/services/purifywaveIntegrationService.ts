/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  PurifyWaveState, 
  EstagioSinfoniaQuimica, 
  LaudoIntegradoDuplo, 
  LaudoDuploParametro,
  ConthecSkidState,
  BombaBiossonicaPosicao,
  BombaBiossonicaState,
  TopologiaTratamentoId,
  TopologiaInfo,
  PocoT100State,
  ValvulaMotorizadaInfo,
  ModoVisualizacaoSinoptico,
  FteCdiLayoutPosition,
  ConthecLayoutPosition,
  TanqueReusoT102State,
  PipelineSectionInfo
} from '../types';
import { dbInstance } from './database';

export class PurifyWaveIntegrationService {
  public state: PurifyWaveState;
  private scanTimer: any = null;
  private listeners: ((state: PurifyWaveState) => void)[] = [];
  private tubulacoesCache: PipelineSectionInfo[] = [];

  constructor() {
    this.state = {
      ativo: true,
      modoOperacao: 'AUTOMATICO_ADAPTATIVO',
      topologiaAtiva: 'TOPOLOGIA_A_PRE_OXIDACAO', // Padrão Oficial: Desfluoretação FTE-CDI -> Polimento CONTHEC
      posicaoFteCdi: 'POS_1_INICIO',              // Padrão Oficial: Reator FTE-CDI no Início (Montante 180 m³/h)
      posicaoConthec: 'POS_3_FINAL',              // Padrão Oficial: Skid CONTHEC no Final (Jusante / Polimento)
      modoVisualizacao: 'LAYOUT_FISICO_PLANTA',   // Padrão Oficial: Layout Físico Real e Manifold
      tubulacaoSelecionadaTag: null,
      estagioAtual: 'ESTAGIO_2_OXIDACAO_RADICALAR',
      progressoEstagioPct: 45,
      vazaoAfluenteM3h: 180,
      dosagens: {
        polioxidoCloroMgL: 38.5,
        silicioReativoMgL: 14.2,
        coagulanteAuxiliarMgL: 6.0,
        polimeroFloculantePpm: 1.8,
      },
      
      // Skid Quádruplo CONTHEC (A, B, C + 4º Injetor de Diluição)
      skidConthec: {
        componenteA: {
          codigo: 'CONTHEC_A',
          nome: 'CONTHEC A (Reagente Oxidante)',
          funcaoQuimica: 'Polióxido de Cloro e radicais oxidantes',
          volumeAtualML: 465,
          capacidadeMaximaML: 500,
          vazaoDosagemMLh: 65.0,
          proporcaoNominalPct: 53.2,
          statusNivel: 'NORMAL',
        },
        componenteB: {
          codigo: 'CONTHEC_B',
          nome: 'CONTHEC B (Estabilizador Silício)',
          funcaoQuimica: 'Silício reativo para passivação e lodo',
          volumeAtualML: 205,
          capacidadeMaximaML: 220,
          vazaoDosagemMLh: 28.6,
          proporcaoNominalPct: 23.4,
          statusNivel: 'NORMAL',
        },
        componenteC: {
          codigo: 'CONTHEC_C',
          nome: 'CONTHEC C (Catalisador Ativador)',
          funcaoQuimica: 'Catalisador ativador de clivagem molecular',
          volumeAtualML: 205,
          capacidadeMaximaML: 220,
          vazaoDosagemMLh: 28.6,
          proporcaoNominalPct: 23.4,
          statusNivel: 'NORMAL',
        },
        camaraMistura: {
          ativa: true,
          tempoHomogeneizacaoS: 240,
          tempoRestanteS: 85,
          volumeAcumuladoML: 122.2,
          statusReacao: 'PRONTO_PARA_INJECAO',
          temperaturaC: 24.8,
        },
        injetorDiluicao4: {
          ativo: true,
          vazaoAguaDiluicaoLh: 120,
          concentracaoFinalPpm: 38.5,
          pressaoInjecaoBar: 3.20,
          statusBomba: 'OPERANDO_NORMAL',
        },
        proporcaoEstequiometricaValida: true,
        autonomiaEstimadaHoras: 7.2,
      },

      // Tanque de Água de Reuso T-102 (5 m³ - Solução 1B Circuito Fechado ZLD)
      tanqueReusoT102: {
        tag: 'T-102',
        nome: 'Tanque de Água de Reuso ZLD (Circuito Fechado)',
        capacidadeNominalM3: 5.0,
        volumeAtualM3: 3.72,
        nivelPct: 74.4,
        vazaoEntradaFiltradoLh: 780,
        vazaoSaidaLavagemTelaLh: 400,
        vazaoSaidaDiluicaoReagentesLh: 380,
        qualidadeCondutividadeUsCm: 320,
        turbidezNtu: 1.15,
        ph: 7.20,
        statusCircuito: 'CIRCUITO_FECHADO_ZLD_ISOLADO',
      },

      // Bomba Biossônica de Cavitação BBS-100 (Fase 2)
      biossonica: {
        tag: 'BBS-100',
        ativa: true,
        modoOperacao: 'AUTOMATICO_ADAPTATIVO',
        posicaoAtual: 'POS_2_INTERMEDIARIO_POA',
        rotacaoRpm: 2850,
        frequenciaUltrassonicaKhz: 28.5,
        intensidadeCavitacaoPct: 82.5,
        vazaoProcessadaM3h: 180,
        pressaoEntradaBar: 1.20,
        pressaoSaidaBar: 2.65,
        deltaPBar: 1.45,
        potenciaAcusticaKw: 7.5,
        eficienciaLiseCelularPct: 99.8,
        temperaturaCamaraC: 28.4,
        statusAlarme: 'NORMAL',
        horimetroHoras: 142.5,
      },

      // Poço Tubular Profundo T-100 & Bomba Submersa B-100 (Fase 4)
      pocoT100: {
        id: 'T-100',
        nome: 'Poço Tubular Profundo PTP-04',
        localizacao: 'Campo Norte (22°53\'36"S 47°03\'30"W, Cota 612m)',
        aquifero: 'Aquífero Guarani / Tubarão (Formação Piramboia)',
        profundidadeTotalM: 180.0,
        diametroPerfuraoPol: 12,
        revestimentoMaterial: 'Aço Inox AISI 304 / PEAD Ranhurado DN250',
        nivelEstaticoM: 28.5,
        nivelDinamicoM: 62.0,
        rebaixamentoM: 33.5,
        vazaoEspecificaM3hM: 5.37,
        vazaoAtualM3h: 180.0,
        vazaoSetadaM3h: 180.0,
        temperaturaAguaC: 24.2,
        condutividadeUsCm: 1420,
        phNatural: 6.85,
        fluoretoNaturalMgL: 8.50,
        turbidezNaturalNtu: 12.4,
        bombaSubmersa: {
          tag: 'B-100',
          modelo: 'Grundfos SP 215-4 (75 CV / 55 kW)',
          potenciaCv: 75,
          status: 'LIGADA',
          modoOperacao: 'AUTOMATICO_VFD',
          frequenciaHz: 52.4,
          rotacaoRpm: 3140,
          correnteAmp: 86.4,
          tensaoV: 380,
          pressaoDescargaBar: 6.8,
          temperaturaMotorC: 48.5,
          vibracaoMmS: 1.8,
          horimetroHoras: 3840.5,
        },
        valvulaSaidaTag: 'XV-100',
        transmissorVazaoTag: 'FIT-100',
      },

      // Válvulas Motorizadas SCADA
      valvulas: {
        'XV-100': {
          tag: 'XV-100',
          nome: 'Válvula de Bloqueio da Boca do Poço T-100',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN16',
          atuadorModelo: 'Rotork IQ10 (120 Nm)',
          estado: 'ABERTA',
          posicaoAberturaPct: 100,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: true,
          fimCursoFechadoZSC: false,
          tempoCursoS: 3.5,
          torqueNm: 95,
          correnteMotorA: 1.65,
          temperaturaAtuadorC: 32.5,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-101': {
          tag: 'XV-101',
          nome: 'Válvula Geral de Alimentação do Sistema',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'AUMA SA 07.6 (120 Nm)',
          estado: 'ABERTA',
          posicaoAberturaPct: 100,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: true,
          fimCursoFechadoZSC: false,
          tempoCursoS: 3.5,
          torqueNm: 110,
          correnteMotorA: 1.80,
          temperaturaAtuadorC: 33.8,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-103': {
          tag: 'XV-103',
          nome: 'Válvula de Descarga e Retrolavagem FTE-CDI ➔ UGL',
          tipo: 'ESFERA_MOTORIZADA',
          diametroDn: 'DN100 (4")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'Rotork IQ10 Rápida',
          estado: 'FECHADA',
          posicaoAberturaPct: 0,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: false,
          fimCursoFechadoZSC: true,
          tempoCursoS: 2.0,
          torqueNm: 75,
          correnteMotorA: 1.40,
          temperaturaAtuadorC: 30.2,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-201': {
          tag: 'XV-201',
          nome: 'Válvula de Transferência POA ➔ FTE-CDI / P-101',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'AUMA SA 07.6',
          estado: 'ABERTA',
          posicaoAberturaPct: 100,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: true,
          fimCursoFechadoZSC: false,
          tempoCursoS: 3.5,
          torqueNm: 115,
          correnteMotorA: 1.85,
          temperaturaAtuadorC: 34.5,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-202': {
          tag: 'XV-202',
          nome: 'Válvula de Bypass Direto do Reator POA',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'AUMA SA 07.6',
          estado: 'FECHADA',
          posicaoAberturaPct: 0,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: false,
          fimCursoFechadoZSC: true,
          tempoCursoS: 3.5,
          torqueNm: 105,
          correnteMotorA: 1.70,
          temperaturaAtuadorC: 31.0,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-301': {
          tag: 'XV-301',
          nome: 'Válvula de Entrada do Manifold FTE-CDI',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'Rotork IQ10',
          estado: 'ABERTA',
          posicaoAberturaPct: 100,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: true,
          fimCursoFechadoZSC: false,
          tempoCursoS: 3.5,
          torqueNm: 118,
          correnteMotorA: 1.88,
          temperaturaAtuadorC: 35.0,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-302': {
          tag: 'XV-302',
          nome: 'Válvula de Retorno FTE-CDI ➔ POA Polimento (Top-B)',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'Rotork IQ10',
          estado: 'FECHADA',
          posicaoAberturaPct: 0,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: false,
          fimCursoFechadoZSC: true,
          tempoCursoS: 3.5,
          torqueNm: 100,
          correnteMotorA: 1.60,
          temperaturaAtuadorC: 29.8,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
        'XV-401': {
          tag: 'XV-401',
          nome: 'Válvula de Saída Potável para Tanque T-201',
          tipo: 'BORBOLETA_MOTORIZADA',
          diametroDn: 'DN200 (8")',
          pressaoNominal: 'PN10',
          atuadorModelo: 'AUMA SA 07.6',
          estado: 'ABERTA',
          posicaoAberturaPct: 100,
          modoControle: 'AUTOMATICO_TOPOLOGIA',
          fimCursoAbertoZSO: true,
          fimCursoFechadoZSC: false,
          tempoCursoS: 3.5,
          torqueNm: 112,
          correnteMotorA: 1.82,
          temperaturaAtuadorC: 33.5,
          intertravamentoSeguranca: false,
          motivoIntertravamento: null,
          ultimaManobraTimestamp: new Date().toLocaleTimeString(),
          operadorUltimaManobra: 'SISTEMA_AUTO',
        },
      },

      // Entrada Bruta (Efluente / Água Complexa com Carga Mista)
      orpInMv: -95,
      turbidezInNtu: 78.4,
      phIn: 6.75,
      dqoInMgL: 420.0,
      dboInMgL: 195.0,
      fenoisInPpm: 8.90,
      oleosGraxasInPpm: 34.5,
      coliformesInUfc: 1450000,
      
      // Saída Pré-Oxidação (Polimento pronto para FTE-CDI)
      orpOutMv: 645,
      turbidezOutNtu: 1.4,
      phOut: 7.18,
      dqoOutMgL: 28.5,
      dboOutMgL: 8.2,
      fenoisOutPpm: 0.04,
      oleosGraxasOutPpm: 1.1,
      coliformesOutUfc: 0,
      
      // Eficiências
      eficienciaOxidacaoPct: 94.8,
      remocaoDqoPct: 93.2,
      remocaoFenoisPct: 99.5,
      desinfeccaoPct: 100.0,
      
      // UGL (Lodo & Interligação ZLD com Retrolavagem FTE-CDI)
      ugl: {
        prensaAtiva: true,
        taxaDesaguamentoPct: 89.4,
        umidadeTortaPct: 17.8,
        lodoProcessadoKgH: 420,
        estabilizacaoSilicioConforme: true,
        ausenciaOdores: true,
        destinacaoAgricolaStatus: 'APTO_BIOSSOLIDO',
        temperaturaReacaoC: 26.4,
        
        // ZLD (Zero Liquid Discharge)
        linhaZldRetrolavagemAtiva: true,
        vazaoResiduoRecebidaLh: 850,
        concentracaoFluorRecebidaPpm: 64.5,
        massaFluorossilicatoPrecipitadaKgH: 0.12,
        vazaoFiltradoRecuperadoLh: 780,
        recuperacaoAguaZldPct: 91.8,
      },
      
      fluxoLiberadoParaFteCdi: true,
      motivoBloqueio: null,
    };

    this.carregarConfiguracaoPersistida();
    this.iniciarLoopIntegracao();
  }

  private salvarConfiguracaoPersistida() {
    try {
      const config = {
        topologiaAtiva: this.state.topologiaAtiva,
        posicaoFteCdi: this.state.posicaoFteCdi,
        posicaoConthec: this.state.posicaoConthec,
        modoVisualizacao: this.state.modoVisualizacao,
        posicaoBiossonica: this.state.biossonica?.posicaoAtual,
      };
      localStorage.setItem('purifywave_layout_config_v2', JSON.stringify(config));
    } catch (e) {
      console.error('Erro ao salvar layout config:', e);
    }
  }

  private carregarConfiguracaoPersistida() {
    try {
      const raw = localStorage.getItem('purifywave_layout_config_v2');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.topologiaAtiva) this.state.topologiaAtiva = parsed.topologiaAtiva;
        if (parsed.posicaoFteCdi) this.state.posicaoFteCdi = parsed.posicaoFteCdi;
        if (parsed.posicaoConthec) this.state.posicaoConthec = parsed.posicaoConthec;
        if (parsed.modoVisualizacao) this.state.modoVisualizacao = parsed.modoVisualizacao;
        if (parsed.posicaoBiossonica && this.state.biossonica) {
          this.state.biossonica.posicaoAtual = parsed.posicaoBiossonica;
        }
      }
    } catch (e) {
      console.error('Erro ao carregar layout config:', e);
    }
  }

  public setModoVisualizacao(modo: 'LAYOUT_FISICO_PLANTA' | 'DIAGRAMA_FLUXO_SEQUENCIAL') {
    this.state.modoVisualizacao = modo;
    this.salvarConfiguracaoPersistida();
    this.notificarListeners();
  }

  public atualizarPoco(novoPoco: Partial<PocoT100State>) {
    this.state.pocoT100 = {
      ...this.state.pocoT100,
      ...novoPoco,
      bombaSubmersa: {
        ...this.state.pocoT100.bombaSubmersa,
        ...(novoPoco.bombaSubmersa || {})
      }
    };
    this.notificarListeners();
  }

  public comandarValvula(
    tag: string, 
    comando: 'ABRIR' | 'FECHAR', 
    modo: 'AUTOMATICO_TOPOLOGIA' | 'MANUAL_SUPERVISIONADO' = 'MANUAL_SUPERVISIONADO'
  ) {
    if (!this.state.valvulas[tag]) return;

    const v = { ...this.state.valvulas[tag] };
    const novoEstado = comando === 'ABRIR' ? 'ABERTA' : 'FECHADA';
    
    v.estado = novoEstado;
    v.posicaoAberturaPct = comando === 'ABRIR' ? 100 : 0;
    v.fimCursoAbertoZSO = comando === 'ABRIR';
    v.fimCursoFechadoZSC = comando === 'FECHAR';
    v.modoControle = modo;
    v.ultimaManobraTimestamp = new Date().toLocaleTimeString();
    v.operadorUltimaManobra = 'OPERADOR_SCADA';

    this.state.valvulas[tag] = v;

    dbInstance.inserirAlarme(
      'INFO',
      `[MANOBRA VÁLVULA] ${tag} (${v.nome}) comandada para ${novoEstado} [Modo: ${modo}].`
    );

    this.notificarListeners();
  }

  public iniciarLoopIntegracao() {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = setInterval(() => {
      this.executarCicloScan();
    }, 1500);
  }

  private executarCicloScan() {
    if (!this.state.ativo) return;

    // 1. Ciclo dos 4 Estágios da Sinfonia Química
    let novoProgresso = this.state.progressoEstagioPct + 4;
    let novoEstagio = this.state.estagioAtual;

    if (novoProgresso >= 100) {
      novoProgresso = 0;
      switch (this.state.estagioAtual) {
        case 'ESTAGIO_1_CONDICIONAMENTO':
          novoEstagio = 'ESTAGIO_2_OXIDACAO_RADICALAR';
          break;
        case 'ESTAGIO_2_OXIDACAO_RADICALAR':
          novoEstagio = 'ESTAGIO_3_ESTABILIZACAO_SILICIO';
          break;
        case 'ESTAGIO_3_ESTABILIZACAO_SILICIO':
          novoEstagio = 'ESTAGIO_4_CLARIFICACAO_POLIMENTO';
          break;
        case 'ESTAGIO_4_CLARIFICACAO_POLIMENTO':
          novoEstagio = 'ESTAGIO_1_CONDICIONAMENTO';
          break;
      }
    }

    // 2. Simulação do Consumo do Skid Quádruplo CONTHEC
    const skid = { ...this.state.skidConthec };
    
    // Consumo proporcional leve (simulação temporal acelerada)
    const consumoA = (skid.componenteA.vazaoDosagemMLh / 3600) * 1.5;
    const consumoB = (skid.componenteB.vazaoDosagemMLh / 3600) * 1.5;
    const consumoC = (skid.componenteC.vazaoDosagemMLh / 3600) * 1.5;

    skid.componenteA.volumeAtualML = Math.max(0, Number((skid.componenteA.volumeAtualML - consumoA).toFixed(1)));
    skid.componenteB.volumeAtualML = Math.max(0, Number((skid.componenteB.volumeAtualML - consumoB).toFixed(1)));
    skid.componenteC.volumeAtualML = Math.max(0, Number((skid.componenteC.volumeAtualML - consumoC).toFixed(1)));

    // Atualiza status de nível
    skid.componenteA.statusNivel = skid.componenteA.volumeAtualML < 50 ? 'CRITICO_VAZIO' : skid.componenteA.volumeAtualML < 150 ? 'NIVEL_BAIXO' : 'NORMAL';
    skid.componenteB.statusNivel = skid.componenteB.volumeAtualML < 25 ? 'CRITICO_VAZIO' : skid.componenteB.volumeAtualML < 70 ? 'NIVEL_BAIXO' : 'NORMAL';
    skid.componenteC.statusNivel = skid.componenteC.volumeAtualML < 25 ? 'CRITICO_VAZIO' : skid.componenteC.volumeAtualML < 70 ? 'NIVEL_BAIXO' : 'NORMAL';

    // Temporizador da Câmara de Mistura
    if (skid.camaraMistura.tempoRestanteS > 0) {
      skid.camaraMistura.tempoRestanteS -= 2;
    } else {
      skid.camaraMistura.tempoRestanteS = skid.camaraMistura.tempoHomogeneizacaoS;
      skid.camaraMistura.statusReacao = 'PRONTO_PARA_INJECAO';
    }

    // 3. Micro-oscilação determinística e ruído físico-químico
    const noise = (Math.random() - 0.5) * 0.05;
    const orpNoise = Math.floor((Math.random() - 0.5) * 8);

    // 4. Simulação da Bomba Biossônica de Cavitação BBS-100 (Fase 2)
    const bio = { ...this.state.biossonica };
    if (bio.ativa) {
      const cavitPct = Number(((bio.rotacaoRpm / 3600) * 50 + (bio.frequenciaUltrassonicaKhz / 40) * 50).toFixed(1));
      bio.intensidadeCavitacaoPct = cavitPct;
      bio.potenciaAcusticaKw = Number(((bio.rotacaoRpm / 3600) * 4.5 + (bio.frequenciaUltrassonicaKhz / 40) * 3.5).toFixed(1));
      bio.deltaPBar = Number((bio.pressaoSaidaBar - bio.pressaoEntradaBar + noise * 0.05).toFixed(2));
      bio.temperaturaCamaraC = Number((28.0 + (cavitPct / 100) * 2.5 + noise * 0.2).toFixed(1));
      bio.horimetroHoras = Number((bio.horimetroHoras + 0.001).toFixed(3));
      
      // Cálculo dinâmico da Eficiência de Lise Celular (Ultrassom + Cavitação Hidrodinâmica)
      const liseBase = 100 * (1 - Math.exp(-Math.pow((0.4 * (bio.rotacaoRpm / 3600) + 0.6 * (bio.frequenciaUltrassonicaKhz / 40)), 2) * 3.8));
      bio.eficienciaLiseCelularPct = Number(Math.min(99.9, Math.max(85.0, liseBase + noise * 0.2)).toFixed(1));

      if (bio.intensidadeCavitacaoPct > 95) {
        bio.statusAlarme = 'ALERTA_CAVITACAO_EXCESSIVA';
      } else if (bio.temperaturaCamaraC > 45) {
        bio.statusAlarme = 'SOBREAQUECIMENTO';
      } else {
        bio.statusAlarme = 'NORMAL';
      }
    }

    // 5. Simulação físico-química dos efluentes
    const orpOut = Math.min(720, Math.max(580, this.state.orpOutMv + orpNoise));
    const turbOut = Number(Math.max(0.8, Math.min(2.5, this.state.turbidezOutNtu + (noise * 0.2))).toFixed(2));
    const dqoOut = Number(Math.max(18, Math.min(45, this.state.dqoOutMgL + (noise * 2))).toFixed(1));
    const phOut = Number(Math.max(6.85, Math.min(7.45, this.state.phOut + (noise * 0.05))).toFixed(2));

    // 6. Verificação de Intertravamento com o FTE-CDI
    let fluxoLiberado = true;
    let motivoBloqueio: string | null = null;

    if (turbOut > 5.0) {
      fluxoLiberado = false;
      motivoBloqueio = 'Turbidez elevada (> 5.0 NTU) após clarificação. Retendo para retrolavagem.';
      dbInstance.inserirAlarme('ALERTA', `[PuriFyWave] ${motivoBloqueio}`);
    } else if (orpOut < 400) {
      fluxoLiberado = false;
      motivoBloqueio = 'Potencial Redox ORP insuficiente (< 400 mV) para proteção das membranas de grafite.';
      dbInstance.inserirAlarme('ALERTA', `[PuriFyWave] ${motivoBloqueio}`);
    }

    this.state = {
      ...this.state,
      estagioAtual: novoEstagio,
      progressoEstagioPct: novoProgresso,
      orpOutMv: orpOut,
      turbidezOutNtu: turbOut,
      dqoOutMgL: dqoOut,
      phOut: phOut,
      skidConthec: skid,
      biossonica: bio,
      fluxoLiberadoParaFteCdi: fluxoLiberado,
      motivoBloqueio: motivoBloqueio,
    };

    this.notificarListeners();
  }

  public alternarBiossonica() {
    this.state.biossonica.ativa = !this.state.biossonica.ativa;
    dbInstance.inserirAlarme(
      'INFO', 
      `[BBS-100] Bomba Biossônica ${this.state.biossonica.ativa ? 'ATIVADA' : 'DESATIVADA'} na posição: ${this.state.biossonica.posicaoAtual}.`
    );
    this.notificarListeners();
  }

  public trocarPosicaoBiossonica(posicao: BombaBiossonicaPosicao) {
    this.state.biossonica.posicaoAtual = posicao;
    dbInstance.inserirAlarme(
      'INFO', 
      `[BBS-100] Topologia alterada: Bomba Biossônica movida para ${posicao}.`
    );
    this.notificarListeners();
  }

  public ajustarBiossonica(rpm: number, khz: number) {
    this.state.biossonica.rotacaoRpm = rpm;
    this.state.biossonica.frequenciaUltrassonicaKhz = khz;
    const cavitPct = Number(((rpm / 3600) * 50 + (khz / 40) * 50).toFixed(1));
    this.state.biossonica.intensidadeCavitacaoPct = cavitPct;
    this.notificarListeners();
  }

  public ajustarHidraulicaBiossonica(vazaoM3h: number, pressaoEntradaBar: number, pressaoSaidaBar: number) {
    this.state.biossonica.vazaoProcessadaM3h = vazaoM3h;
    this.state.biossonica.pressaoEntradaBar = pressaoEntradaBar;
    this.state.biossonica.pressaoSaidaBar = pressaoSaidaBar;
    this.state.biossonica.deltaPBar = Number((pressaoSaidaBar - pressaoEntradaBar).toFixed(2));
    this.notificarListeners();
  }

  public alternarModoBiossonica() {
    this.state.biossonica.modoOperacao = 
      this.state.biossonica.modoOperacao === 'AUTOMATICO_ADAPTATIVO' 
        ? 'MANUAL_SUPERVISIONADO' 
        : 'AUTOMATICO_ADAPTATIVO';
    this.notificarListeners();
  }

  public setModoOperacao(modo: 'AUTOMATICO_ADAPTATIVO' | 'MANUAL_SUPERVISIONADO') {
    this.state.modoOperacao = modo;
    this.notificarListeners();
  }

  public setDosagens(dosagens: Partial<PurifyWaveState['dosagens']>) {
    this.state.dosagens = {
      ...this.state.dosagens,
      ...dosagens,
    };
    this.notificarListeners();
  }

  public reabastecerFrascosConthec() {
    this.state.skidConthec.componenteA.volumeAtualML = 500;
    this.state.skidConthec.componenteB.volumeAtualML = 220;
    this.state.skidConthec.componenteC.volumeAtualML = 220;
    this.state.skidConthec.componenteA.statusNivel = 'NORMAL';
    this.state.skidConthec.componenteB.statusNivel = 'NORMAL';
    this.state.skidConthec.componenteC.statusNivel = 'NORMAL';
    this.state.skidConthec.autonomiaEstimadaHoras = 7.7;
    
    dbInstance.inserirAlarme('INFO', '[CONTHEC] Frascos A (500ml), B (220ml) e C (220ml) reabastecidos e calibrados com sucesso.');
    this.notificarListeners();
  }

  public ajustarDosadoraConthec(comp: 'A' | 'B' | 'C', vazaoMLh: number) {
    if (comp === 'A') this.state.skidConthec.componenteA.vazaoDosagemMLh = vazaoMLh;
    if (comp === 'B') this.state.skidConthec.componenteB.vazaoDosagemMLh = vazaoMLh;
    if (comp === 'C') this.state.skidConthec.componenteC.vazaoDosagemMLh = vazaoMLh;
    this.notificarListeners();
  }

  public ajustarInjetorDiluicao(vazaoLh: number, concentracaoPpm: number) {
    this.state.skidConthec.injetorDiluicao4.vazaoAguaDiluicaoLh = vazaoLh;
    this.state.skidConthec.injetorDiluicao4.concentracaoFinalPpm = concentracaoPpm;
    this.state.dosagens.polioxidoCloroMgL = concentracaoPpm;
    this.notificarListeners();
  }

  public obterTopologiasDisponiveis(): TopologiaInfo[] {
    return [
      {
        id: 'TOPOLOGIA_A_PRE_OXIDACAO',
        codigo: 'TOP-A',
        nome: '1. Pré-Oxidação (POA ➔ FTE-CDI)',
        descricaoCurta: 'Padrão: Oxidação prévia e clarificação seguida de polimento eletroquímico',
        descricaoDetalhada: 'A água bruta do poço T-100 passa primeiro pelo Reator PuriFyWave com Skid CONTHEC (A+B+C) para remoção de 93% da DQO e oxidação radicalar, sendo em seguida transferida pela Bomba P-101 para as 16 células FTE-CDI para desfluoretação.',
        fluxoDiagrama: 'T-100 ➔ PuriFyWave OS (CONTHEC) ➔ [BBS-100] ➔ P-101 ➔ FTE-CDI (16 Células) ➔ T-201 Potável',
        perdaCargaEstimadaBar: 0.85,
        tempoResidenciaHidraulicoMin: 18.5,
        indicacaoAplicacao: 'Recomendada para águas com alta carga orgânica (DQO > 200 mg/L), biofilmes ou metais solúveis.',
        statusValvulasMotorizadas: {
          xv101_EntradaPoco: 'ABERTA',
          xv201_TransferenciaPoaParaFte: 'ABERTA',
          xv202_BypassPoaDireto: 'FECHADA',
          xv301_EntradaFteCdi: 'ABERTA',
          xv302_TransferenciaFteParaPoa: 'FECHADA',
          xv401_SaidaPotavelFinal: 'ABERTA',
        },
      },
      {
        id: 'TOPOLOGIA_B_POS_OXIDACAO',
        codigo: 'TOP-B',
        nome: '2. Pós-Oxidação (FTE-CDI ➔ POA Polimento)',
        descricaoCurta: 'Invertida: Desfluoretação inicial e desinfecção terminal oxidativa com residual',
        descricaoDetalhada: 'A água bruta é alimentada diretamente no Reator FTE-CDI para remoção seletiva do fluoreto até 1.08 ppm. O efluente segue para o Reator PuriFyWave para esterilização terminal, destruição de micropollutants residuais e garantia de residual para a rede.',
        fluxoDiagrama: 'T-100 ➔ FTE-CDI (16 Células) ➔ P-101 ➔ PuriFyWave OS (CONTHEC) ➔ [BBS-100] ➔ T-201 Potável',
        perdaCargaEstimadaBar: 0.72,
        tempoResidenciaHidraulicoMin: 16.2,
        indicacaoAplicacao: 'Ideal para águas de poço profundas já clarificadas (baixa turbidez e baixa DQO) com foco em residual sanitário.',
        statusValvulasMotorizadas: {
          xv101_EntradaPoco: 'ABERTA',
          xv201_TransferenciaPoaParaFte: 'FECHADA',
          xv202_BypassPoaDireto: 'ABERTA',
          xv301_EntradaFteCdi: 'ABERTA',
          xv302_TransferenciaFteParaPoa: 'ABERTA',
          xv401_SaidaPotavelFinal: 'ABERTA',
        },
      },
      {
        id: 'TOPOLOGIA_C_LINHAS_PARALELAS',
        codigo: 'TOP-C',
        nome: '3. Linhas Paralelas (Split 50/50 + Blend)',
        descricaoCurta: 'Paralelo: Divisão simétrica de carga e mistura homogênea no manifold terminal',
        descricaoDetalhada: 'O afluente de 180 m³/h é bipartido: Linha 1 (90 m³/h) é processada pelo PuriFyWave OS para destruição orgânica e Linha 2 (90 m³/h) é desfluoretada no FTE-CDI. As duas correntes se combinam no Manifold Misturador para entrega potável balanceada.',
        fluxoDiagrama: 'T-100 ➔ Split 50/50 [Linha 1 POA (90m³/h) // Linha 2 FTE-CDI (90m³/h)] ➔ Manifold Blend ➔ T-201',
        perdaCargaEstimadaBar: 0.48,
        tempoResidenciaHidraulicoMin: 12.0,
        indicacaoAplicacao: 'Máxima capacidade hidráulica instantânea e economia de reagentes em matrizes com contaminação moderada.',
        statusValvulasMotorizadas: {
          xv101_EntradaPoco: 'ABERTA',
          xv201_TransferenciaPoaParaFte: 'ABERTA',
          xv202_BypassPoaDireto: 'ABERTA',
          xv301_EntradaFteCdi: 'ABERTA',
          xv302_TransferenciaFteParaPoa: 'FECHADA',
          xv401_SaidaPotavelFinal: 'ABERTA',
        },
      },
      {
        id: 'TOPOLOGIA_D_FTE_DIRETO_BYPASS',
        codigo: 'TOP-D',
        nome: '4. Bypass POA (FTE-CDI Direto)',
        descricaoCurta: 'Contingência: FTE-CDI direto com PuriFyWave em recirculação fechada / manutenção',
        descricaoDetalhada: 'Permite intervenções, limpezas químicas (CIP) ou recarga de reagentes no módulo PuriFyWave sem interromper a produção contínua de água potável no rack de 16 células FTE-CDI.',
        fluxoDiagrama: 'T-100 ➔ Bypass Direto ➔ P-101 ➔ FTE-CDI (16 Células) ➔ T-201 Potável [POA em Standby/Manutenção]',
        perdaCargaEstimadaBar: 0.35,
        tempoResidenciaHidraulicoMin: 9.5,
        indicacaoAplicacao: 'Modo de contingência operacional e manutenção preventiva do módulo de pré-oxidação.',
        statusValvulasMotorizadas: {
          xv101_EntradaPoco: 'ABERTA',
          xv201_TransferenciaPoaParaFte: 'FECHADA',
          xv202_BypassPoaDireto: 'ABERTA',
          xv301_EntradaFteCdi: 'ABERTA',
          xv302_TransferenciaFteParaPoa: 'FECHADA',
          xv401_SaidaPotavelFinal: 'ABERTA',
        },
      },
    ];
  }

  public selecionarTopologia(topologiaId: TopologiaTratamentoId) {
    const anterior = this.state.topologiaAtiva;
    this.state.topologiaAtiva = topologiaId;
    
    const info = this.obterTopologiasDisponiveis().find(t => t.id === topologiaId);
    if (info) {
      // Sincroniza o estado físico das válvulas motorizadas
      const st = info.statusValvulasMotorizadas;
      const setV = (tag: string, aberta: boolean) => {
        if (this.state.valvulas[tag]) {
          this.state.valvulas[tag].estado = aberta ? 'ABERTA' : 'FECHADA';
          this.state.valvulas[tag].posicaoAberturaPct = aberta ? 100 : 0;
          this.state.valvulas[tag].fimCursoAbertoZSO = aberta;
          this.state.valvulas[tag].fimCursoFechadoZSC = !aberta;
          this.state.valvulas[tag].ultimaManobraTimestamp = new Date().toLocaleTimeString();
          this.state.valvulas[tag].operadorUltimaManobra = '1-CLICK_SWITCHER';
        }
      };

      setV('XV-101', st.xv101_EntradaPoco === 'ABERTA');
      setV('XV-201', st.xv201_TransferenciaPoaParaFte === 'ABERTA');
      setV('XV-202', st.xv202_BypassPoaDireto === 'ABERTA');
      setV('XV-301', st.xv301_EntradaFteCdi === 'ABERTA');
      setV('XV-302', st.xv302_TransferenciaFteParaPoa === 'ABERTA');
      setV('XV-401', st.xv401_SaidaPotavelFinal === 'ABERTA');
    }

    dbInstance.inserirAlarme(
      'INFO', 
      `[1-Click Switcher] Topologia alterada de ${anterior} para ${info ? info.nome : topologiaId}. Válvulas e rotas de fluxo reconfiguradas.`
    );
    this.notificarListeners();
  }

  /**
   * Comuta o Reator FTE-CDI entre as 3 Posições Reais de Processo:
   * - POS_1_INICIO: Montante (Desfluoretação e Desmineralização Primária)
   * - POS_2_MEIO: Central (Série Simbiótica com Pré-Oxidação CONTHEC)
   * - POS_3_FINAL: Jusante (Polimento Terminal de Ultra-Pureza)
   */
  public setPosicaoFteCdi(posicao: FteCdiLayoutPosition) {
    const anterior = this.state.posicaoFteCdi;
    this.state.posicaoFteCdi = posicao;

    let desc = 'MEIO (Série Central)';
    if (posicao === 'POS_1_INICIO') desc = 'INÍCIO (Montante / Desfluoretação Primária)';
    if (posicao === 'POS_3_FINAL') desc = 'FINAL (Jusante / Polimento Terminal)';

    dbInstance.inserirAlarme(
      'INFO',
      `[Reator FTE-CDI] Estágio dinâmico alterado de ${anterior} para ${desc}. Nós, bicos e válvulas XV-301/XV-103 reposicionados solidariamente.`
    );
    this.salvarConfiguracaoPersistida();
    this.notificarListeners();
  }

  /**
   * Comuta o Skid Quádruplo CONTHEC entre as 3 Posições Reais de Processo:
   * - POS_1_INICIO: Montante (Pré-Oxidação Avançada logo após Poço T-100)
   * - POS_2_MEIO: Central / Intermediário (Pós-Oxidação pós-FTE ou Pré-Cavitação)
   * - POS_3_FINAL: Jusante (Polimento Terminal, Desinfecção e Ajuste Fino)
   */
  public setPosicaoConthec(posicao: ConthecLayoutPosition) {
    const anterior = this.state.posicaoConthec;
    this.state.posicaoConthec = posicao;

    let desc = 'INÍCIO (Montante / Pré-Oxidação)';
    if (posicao === 'POS_2_MEIO') desc = 'MEIO (Intermediário / Pós-Oxidação)';
    if (posicao === 'POS_3_FINAL') desc = 'FINAL (Jusante / Polimento & Desinfecção)';

    dbInstance.inserirAlarme(
      'INFO',
      `[Skid CONTHEC] Estágio dinâmico alterado de ${anterior} para ${desc}. Válvulas XV-101/XV-201/XV-202 e ramais reposicionados solidariamente.`
    );
    this.salvarConfiguracaoPersistida();
    this.notificarListeners();
  }

  public selecionarTubulacao(tag: string | null) {
    this.state.tubulacaoSelecionadaTag = tag;
    this.notificarListeners();
  }

  /**
   * Obtém a lista de prontuários técnicos e telemetria de todas as tubulações industriais
   */
  public getTubulacoesInfo(): PipelineSectionInfo[] {
    const vazao = this.state.vazaoAfluenteM3h || 180;
    
    return [
      {
        tag: 'L-101-DN200-PEAD',
        nome: 'Alimentação Geral de Água Bruta Subterrânea',
        origemTag: 'T-100',
        destinoTag: this.state.posicaoFteCdi === 'POS_1_INICIO' ? 'REATOR_FTE_CDI' : 'SKID_CONTHEC',
        tipoFluido: 'AGUA_BRUTA',
        diametroDn: 'DN200 (8")',
        diametroInternoMm: 190.2,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 35.0,
        vazaoM3h: vazao,
        velocidadeEscoamentoMs: 1.76,
        reynoldsRe: 334000,
        fatorAtritoDarcy: 0.0145,
        perdaCargaBar: 0.22,
        pressaoEntradaBar: 6.80,
        pressaoSaidaBar: 6.58,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#fbbf24',
        descricaoProcesso: 'Recalque profundo da Bomba B-100 (75 CV / 52.4 Hz) transportando 180 m³/h até a entrada da planta.',
      },
      {
        tag: 'L-201-DN200-PEAD',
        nome: 'Transferência Intermediária e Homogeneização',
        origemTag: 'SKID_CONTHEC',
        destinoTag: 'P-101_MANIFOLD',
        tipoFluido: 'AGUA_OXIDADA',
        diametroDn: 'DN200 (8")',
        diametroInternoMm: 190.2,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 22.0,
        vazaoM3h: vazao,
        velocidadeEscoamentoMs: 1.76,
        reynoldsRe: 334000,
        fatorAtritoDarcy: 0.0145,
        perdaCargaBar: 0.14,
        pressaoEntradaBar: 3.20,
        pressaoSaidaBar: 3.06,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#818cf8',
        descricaoProcesso: 'Água em processo de oxidação com blend CONTHEC (A+B+C) com 38.5 ppm de polióxido de cloro.',
      },
      {
        tag: 'L-301-DN200-PEAD',
        nome: 'Alimentação do Reator FTE-CDI (16 Células)',
        origemTag: 'P-101',
        destinoTag: 'REATOR_FTE_CDI',
        tipoFluido: 'AGUA_OXIDADA',
        diametroDn: 'DN200 (8")',
        diametroInternoMm: 190.2,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 18.0,
        vazaoM3h: vazao,
        velocidadeEscoamentoMs: 1.76,
        reynoldsRe: 334000,
        fatorAtritoDarcy: 0.0145,
        perdaCargaBar: 0.11,
        pressaoEntradaBar: 2.65,
        pressaoSaidaBar: 2.54,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#38bdf8',
        descricaoProcesso: 'Conduto distribuidor principal para o manifold de entrada das 16 células com interlock de 2.80 bar.',
      },
      {
        tag: 'L-401-DN200-PEAD',
        nome: 'Saída e Entrega de Água Potável Portaria 888',
        origemTag: 'REATOR_FTE_CDI',
        destinoTag: 'T-201',
        tipoFluido: 'POTAVEL_PORTARIA_888',
        diametroDn: 'DN200 (8")',
        diametroInternoMm: 190.2,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 28.0,
        vazaoM3h: vazao,
        velocidadeEscoamentoMs: 1.76,
        reynoldsRe: 334000,
        fatorAtritoDarcy: 0.0145,
        perdaCargaBar: 0.18,
        pressaoEntradaBar: 2.10,
        pressaoSaidaBar: 1.92,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#10b981',
        descricaoProcesso: 'Água tratada conforme Portaria GM/MS nº 888/2021 (Fluoreto 1.08 mg/L, turbidez 0.45 NTU).',
      },
      {
        tag: 'L-103-DN100-INOX-ZLD',
        nome: 'Dessorção de Concentrado Salino / Rejeito FTE-CDI para UGL',
        origemTag: 'XV-103',
        destinoTag: 'MODULO_UGL',
        tipoFluido: 'REJEITO_ZLD_SALMOURA',
        diametroDn: 'DN100 (4")',
        diametroInternoMm: 95.0,
        pressaoNominal: 'PN10',
        material: 'ACO_INOX_304',
        rugosidadeMm: 0.015,
        comprimentoEquivalenteM: 16.0,
        vazaoM3h: 0.85, // 850 L/h
        velocidadeEscoamentoMs: 0.33,
        reynoldsRe: 31000,
        fatorAtritoDarcy: 0.024,
        perdaCargaBar: 0.04,
        pressaoEntradaBar: 1.80,
        pressaoSaidaBar: 1.76,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#ef4444',
        descricaoProcesso: 'Salmoura concentrada de despolarização (64.5 mg/L F⁻) das 16 células encaminhada para precipitação de CaSiF₆ na UGL.',
      },
      {
        tag: 'L-LODO-CONTHEC-DN50',
        nome: 'Purga e Dreno de Lodo Químico do Skid CONTHEC para UGL',
        origemTag: 'SKID_CONTHEC',
        destinoTag: 'MODULO_UGL',
        tipoFluido: 'LODO_QUIMICO',
        diametroDn: 'DN50 (2")',
        diametroInternoMm: 50.0,
        pressaoNominal: 'PN10',
        material: 'PVC_U',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 14.0,
        vazaoM3h: 0.15, // 150 L/h
        velocidadeEscoamentoMs: 0.21,
        reynoldsRe: 10500,
        fatorAtritoDarcy: 0.031,
        perdaCargaBar: 0.02,
        pressaoEntradaBar: 1.50,
        pressaoSaidaBar: 1.48,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#78350f',
        descricaoProcesso: 'Dreno de purga e lodo coagulado/floculado do CONTHEC para co-tratamento na câmara de mistura da UGL.',
      },
      {
        tag: 'L-ZLD-CLARIF-T102-DN80',
        nome: 'Clarificado ZLD da Prensa UGL para Tanque T-102',
        origemTag: 'MODULO_UGL',
        destinoTag: 'T-102',
        tipoFluido: 'AGUA_REUSO_ZLD',
        diametroDn: 'DN80 (3")',
        diametroInternoMm: 76.0,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 18.0,
        vazaoM3h: 0.78, // 780 L/h
        velocidadeEscoamentoMs: 0.48,
        reynoldsRe: 36000,
        fatorAtritoDarcy: 0.022,
        perdaCargaBar: 0.04,
        pressaoEntradaBar: 2.20,
        pressaoSaidaBar: 2.16,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#06b6d4',
        descricaoProcesso: 'Água clarificada da Prensa UGL (780 L/h) direcionada ao Tanque de Reuso T-102 (5 m³), sem contato com água de entrada.',
      },
      {
        tag: 'L-REUSO-LAVAGEM-DN40',
        nome: 'Água de Reuso T-102 para Lavagem Contínua da Prensa',
        origemTag: 'T-102',
        destinoTag: 'MODULO_UGL',
        tipoFluido: 'AGUA_REUSO_ZLD',
        diametroDn: 'DN40 (1.1/2")',
        diametroInternoMm: 40.0,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 12.0,
        vazaoM3h: 0.40, // 400 L/h
        velocidadeEscoamentoMs: 0.88,
        reynoldsRe: 35000,
        fatorAtritoDarcy: 0.022,
        perdaCargaBar: 0.06,
        pressaoEntradaBar: 2.50,
        pressaoSaidaBar: 2.44,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#06b6d4',
        descricaoProcesso: 'Circuito fechado de lavagem contínua da tela e anéis da Prensa Parafuso UGL (400 L/h).',
      },
      {
        tag: 'L-REUSO-DILUICAO-DN40',
        nome: 'Água de Reuso T-102 para Diluição Skid CONTHEC',
        origemTag: 'T-102',
        destinoTag: 'SKID_CONTHEC',
        tipoFluido: 'AGUA_REUSO_ZLD',
        diametroDn: 'DN40 (1.1/2")',
        diametroInternoMm: 40.0,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 26.0,
        vazaoM3h: 0.38, // 380 L/h
        velocidadeEscoamentoMs: 0.84,
        reynoldsRe: 33000,
        fatorAtritoDarcy: 0.023,
        perdaCargaBar: 0.05,
        pressaoEntradaBar: 2.50,
        pressaoSaidaBar: 2.45,
        sentidoFluxo: 'NORMAL',
        animacaoAtiva: true,
        corHex: '#0ea5e9',
        descricaoProcesso: 'Água de reuso do T-102 utilizada na diluição dos frascos B e C e 4º Injetor CONTHEC (380 L/h).',
      },
      {
        tag: 'L-BYPASS-DN200',
        nome: 'Barramento de Bypass Superior de Contingência',
        origemTag: 'T-100',
        destinoTag: 'REATOR_FTE_CDI',
        tipoFluido: 'AGUA_BRUTA',
        diametroDn: 'DN200 (8")',
        diametroInternoMm: 190.2,
        pressaoNominal: 'PN10',
        material: 'PEAD_PE100',
        rugosidadeMm: 0.007,
        comprimentoEquivalenteM: 52.0,
        vazaoM3h: this.state.valvulas['XV-202']?.estado === 'ABERTA' ? vazao : 0,
        velocidadeEscoamentoMs: this.state.valvulas['XV-202']?.estado === 'ABERTA' ? 1.76 : 0,
        reynoldsRe: this.state.valvulas['XV-202']?.estado === 'ABERTA' ? 334000 : 0,
        fatorAtritoDarcy: 0.0145,
        perdaCargaBar: 0.32,
        pressaoEntradaBar: 6.80,
        pressaoSaidaBar: 6.48,
        sentidoFluxo: this.state.valvulas['XV-202']?.estado === 'ABERTA' ? 'NORMAL' : 'BLOQUEADO',
        animacaoAtiva: this.state.valvulas['XV-202']?.estado === 'ABERTA',
        corHex: '#fbbf24',
        descricaoProcesso: 'Linha superior de bypass manobrada pela válvula XV-202 para manutenção isolada do módulo POA.',
      }
    ];
  }

  public atualizarSentidoFluxoTubulacao(tag: string, sentido: 'NORMAL' | 'REVERSO' | 'BLOQUEADO') {
    dbInstance.inserirAlarme(
      'ALERTA',
      `[Hidráulica] Sentido de fluxo da tubulação ${tag} comutado para ${sentido}.`
    );
    this.notificarListeners();
  }

  public alternarAtivo() {
    this.state.ativo = !this.state.ativo;
    this.notificarListeners();
  }

  public forcarTransicaoEstagio(estagio: EstagioSinfoniaQuimica) {
    this.state.estagioAtual = estagio;
    this.state.progressoEstagioPct = 0;
    this.notificarListeners();
  }

  public subscribe(fn: (state: PurifyWaveState) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notificarListeners() {
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  /**
   * Gera o Laudo Técnico Integrado Duplo (Portaria GM/MS nº 888/2021 + Resoluções CONAMA 430/357)
   */
  public gerarLaudoIntegradoDuplo(): LaudoIntegradoDuplo {
    const dataHora = new Date().toISOString();
    const numeroLaudo = `LTI-PW-FTE-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const parametros: LaudoDuploParametro[] = [
      // 1. Bloco de Potabilidade (Portaria GM/MS nº 888/2021 - FTE-CDI)
      {
        nome: 'Fluoreto (F⁻) de Saída',
        categoria: 'PORTARIA_888_POTABILIDADE',
        amostraEntrada: '8.50 mg/L',
        amostraSaida: '1.08 mg/L',
        unidade: 'mg/L',
        limiteNorma: '≤ 1.50 mg/L (Portaria 888)',
        statusConformidade: 'CONFORME',
        metodologia: 'Eletrodo Íon Seletivo (ISE) / SMWW 4500-F⁻ C',
        observacoes: 'Desfluoretação por eletrodiálise capacitiva (1.40 V DC)',
      },
      {
        nome: 'pH Final da Água Tratada',
        categoria: 'PORTARIA_888_POTABILIDADE',
        amostraEntrada: '6.75',
        amostraSaida: `${this.state.phOut}`,
        unidade: 'U pH',
        limiteNorma: '6.00 a 9.00 (Portaria 888)',
        statusConformidade: 'CONFORME',
        metodologia: 'Potenciometria / SMWW 4500-H⁺ B',
        observacoes: 'Estabilizado na faixa neutra potável',
      },
      {
        nome: 'Turbidez Efluente Final',
        categoria: 'PORTARIA_888_POTABILIDADE',
        amostraEntrada: `${this.state.turbidezInNtu} NTU`,
        amostraSaida: `${this.state.turbidezOutNtu} NTU`,
        unidade: 'NTU',
        limiteNorma: '≤ 5.0 NTU (Portaria 888)',
        statusConformidade: 'CONFORME',
        metodologia: 'Nefelometria / SMWW 2130 B',
        observacoes: 'Clarificação profunda com Kit CONTHEC (A + B + C)',
      },
      {
        nome: 'Coliformes Totais e E. coli',
        categoria: 'PORTARIA_888_POTABILIDADE',
        amostraEntrada: '1.450.000 UFC/100mL',
        amostraSaida: 'Ausente (< 1 UFC/100mL)',
        unidade: 'UFC/100mL',
        limiteNorma: 'Ausência em 100 mL (Portaria 888)',
        statusConformidade: 'CONFORME',
        metodologia: 'Substrato Enzimático Cromogênico',
        observacoes: '100% de inativação microbiológica por POA CONTHEC',
      },

      // 2. Bloco Ambiental de Efluentes (Resolução CONAMA 430/357)
      {
        nome: 'Demanda Química de Oxigênio (DQO)',
        categoria: 'CONAMA_430_EFLUENTES',
        amostraEntrada: `${this.state.dqoInMgL} mg/L`,
        amostraSaida: `${this.state.dqoOutMgL} mg/L`,
        unidade: 'mg/L O₂',
        limiteNorma: '≤ 90.0 mg/L (CONAMA 430)',
        statusConformidade: 'CONFORME',
        metodologia: 'Refluxo Fechado Colorimétrico / SMWW 5220 D',
        observacoes: `Redução de ${this.state.remocaoDqoPct}% por POA`,
      },
      {
        nome: 'Demanda Bioquímica de Oxigênio (DBO₅)',
        categoria: 'CONAMA_430_EFLUENTES',
        amostraEntrada: `${this.state.dboInMgL} mg/L`,
        amostraSaida: `${this.state.dboOutMgL} mg/L`,
        unidade: 'mg/L O₂',
        limiteNorma: '≤ 60.0 mg/L ou Remoção ≥ 60%',
        statusConformidade: 'CONFORME',
        metodologia: 'Incubação 5 dias a 20°C / SMWW 5210 B',
        observacoes: 'Mineralização acelerada da carga biodegradável',
      },
      {
        nome: 'Fenóis Totais',
        categoria: 'CONAMA_430_EFLUENTES',
        amostraEntrada: `${this.state.fenoisInPpm} mg/L`,
        amostraSaida: `${this.state.fenoisOutPpm} mg/L`,
        unidade: 'mg/L',
        limiteNorma: '≤ 0.50 mg/L (CONAMA 430)',
        statusConformidade: 'CONFORME',
        metodologia: '4-Aminoantipirina / SMWW 5530 D',
        observacoes: 'Clivagem oxidativa do anel aromático por radicais',
      },
      {
        nome: 'Óleos e Graxas Minerais',
        categoria: 'CONAMA_430_EFLUENTES',
        amostraEntrada: `${this.state.oleosGraxasInPpm} mg/L`,
        amostraSaida: `${this.state.oleosGraxasOutPpm} mg/L`,
        unidade: 'mg/L',
        limiteNorma: '≤ 20.0 mg/L (CONAMA 430)',
        statusConformidade: 'CONFORME',
        metodologia: 'Partição Gravimétrica / SMWW 5520 B',
        observacoes: 'Separação e degradação completa',
      },
      {
        nome: 'Lise Celular & Cavitação Acústica (BBS-100)',
        categoria: 'CONAMA_430_EFLUENTES',
        amostraEntrada: `${this.state.biossonica.rotacaoRpm} RPM | ${this.state.biossonica.frequenciaUltrassonicaKhz} kHz`,
        amostraSaida: `${this.state.biossonica.eficienciaLiseCelularPct}% Eficiência`,
        unidade: '% Lise',
        limiteNorma: '≥ 95.0% Lise / Cisalhamento de Biofilme',
        statusConformidade: 'CONFORME',
        metodologia: 'Cavitação Acústica Ultrassônica + Hidrodinâmica',
        observacoes: `Operação ativa no slot: ${this.state.biossonica.posicaoAtual}`,
      },

      // 3. Bloco UGL (Estabilização de Lodo, ZLD e Biossólido)
      {
        nome: 'Umidade da Torta de Lodo Desaguada',
        categoria: 'BIOSSOLIDO_UGL',
        amostraEntrada: '98.5% (Lodo Fluido)',
        amostraSaida: `${this.state.ugl.umidadeTortaPct}%`,
        unidade: '%',
        limiteNorma: '≤ 25.0% para Biossólido Agrícola',
        statusConformidade: 'CONFORME',
        metodologia: 'Secagem Gravimétrica a 105°C',
        observacoes: 'Passivação mineral por Silício Reativo (CONTHEC B)',
      },
      {
        nome: 'Recuperação Hídrica ZLD (Retrolavagem FTE-CDI)',
        categoria: 'BIOSSOLIDO_UGL',
        amostraEntrada: '850 L/h Rejeito XV-103',
        amostraSaida: '780 L/h Recuperados (91.8%)',
        unidade: '%',
        limiteNorma: '≥ 85.0% Recuperação ZLD',
        statusConformidade: 'CONFORME',
        metodologia: 'Balanço Hídrico de Massa e Fluorossilicatos',
        observacoes: 'Clarificado isolado no Tanque de Reuso T-102 (5 m³): 400 L/h lavagem tela prensa e 380 L/h diluição CONTHEC, 100% ZLD sem contato com manancial ou água de entrada',
      },
      {
        nome: 'Estabilização e Inibição de Odores (H₂S / Mercaptanas)',
        categoria: 'BIOSSOLIDO_UGL',
        amostraEntrada: 'Odor Pútrido Intenso',
        amostraSaida: 'Ausência Total de Odor',
        unidade: 'Qualitativo',
        limiteNorma: 'Ausência de Putrefação (CONAMA 498)',
        statusConformidade: 'CONFORME',
        metodologia: 'Inspeção Organoléptica e Sulfeto de Hidrogênio',
        observacoes: 'Apto para destinação e enriquecimento de solo agrícola',
      }
    ];

    return {
      id: `laudo-duplo-${Date.now()}`,
      numeroLaudo,
      dataEmissao: dataHora,
      responsavelTecnicoCRQ: 'Dr. Gentil M. Pinheiro Jr. - CRQ 09100961 (Química e Tratamento)',
      responsavelTecnicoCREA: 'Eng. Ricardo Silveira - CREA 506982441-SP (Automação & Processos)',
      solicitante: 'CONCESSIONÁRIA INTEGRADA DE SANEAMENTO & ÁGUAS INDUSTRIAIS',
      unidadePlanta: 'Estação Central Híbrida: PuriFyWave OS V2 (CONTHEC) + FTE-CDI 180 m³/h',
      conformidadePortaria888: true,
      conformidadeConama430: true,
      conformidadeBiossolidoUgl: true,
      resumoQuimico: {
        vazaoTotalTratadaM3h: this.state.vazaoAfluenteM3h,
        fluoretoFinalPpm: 1.08,
        dqoFinalMgL: this.state.dqoOutMgL,
        turbidezFinalNtu: this.state.turbidezOutNtu,
        phFinal: this.state.phOut,
        desinfeccaoPct: this.state.desinfeccaoPct,
        desaguamentoLodoPct: this.state.ugl.taxaDesaguamentoPct,
      },
      parametros,
      conclusaoParecer: 'Aprovado para CONSUMO HUMANO POTÁVEL (Portaria GM/MS nº 888/2021) com REÚSO / LANÇAMENTO AMBIENTAL (CONAMA 430/357), BIOSSÓLIDO AGRÍCOLA ESTABILIZADO (UGL) e DESCARTE ZERO (ZLD).',
      statusSql: 'PENDENTE',
    };
  }
}

export const purifyWaveService = new PurifyWaveIntegrationService();
