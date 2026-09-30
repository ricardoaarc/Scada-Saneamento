/**
 * Controlador Lógico e de Segurança do Reator FTE-CDI
 * Implementação das travas físicas (PEAD 3.0 bar), controle hidráulico em malha fechada (PID)
 * e telemetria de sensores físico-químicos (Fluoreto F-, Condutividade, pH e Temperatura)
 */

import { 
  SensorData, 
  SkidHardwareState, 
  CellTelemetry, 
  NivelSeveridade, 
  BackwashState, 
  BackwashCicloRegistro, 
  ValvulasEstado,
  LaudoLaboratorial 
} from '../types';
import { dbInstance, ScadaDatabase } from './database';
import { notificationService } from './NotificationService';
import { pidService } from './PidController';
import { authService } from './AuthService';
import { plcService } from './PlcService';

export class FteCdiController {
  private readonly PRESSAO_MAX_BAR = 3.0; // Limite estrutural do PEAD e vedações
  private readonly VAZAO_MIN_L_H = 500;
  private readonly VAZAO_MAX_L_H = 1500;

  // Estado do Hardware Físico e CLP
  private db: ScadaDatabase;
  private bombaAlimentacaoAtiva: boolean = true;
  private interlockDisparado: boolean = false;
  private motivoInterlock: string | null = null;
  private tensaoAlvo: number = 1.40;
  private tensaoReal: number = 1.40;
  private correnteAmp: number = 18.5;
  private modoOperacao: 'AUTOMATICO' | 'MANUAL' = 'AUTOMATICO';
  private foulingDetectado: boolean = false;
  private massaFRemovidaMg: number = 1420.0; // Acumulada

  // Estado do Sistema de Retrolavagem e Válvulas de Bypass (P&ID)
  private retrolavagem: BackwashState = {
    emAndamento: false,
    tempoRestanteSegundos: 0,
    duracaoTotalSegundos: 45,
    faseAtual: 'IDLE',
    modoAuto: true,
    intervaloHorasAuto: 4,
    pressaoGatilhoAutoBar: 2.40,
    ultimoCicloTimestamp: '2026-09-24T12:00:00.000Z',
    recuperacaoPermeabilidadePct: 96.4,
    totalCiclosExecutados: 14,
    bypassAtivo: false,
    valvulas: {
      xv101Retrolavagem: false,
      xv102Alimentacao: true,
      xv103Descarte: false,
      xv104Bypass: false,
      xv105AirScour: false,
    },
    historicoCiclos: [
      {
        id: 'RW-20260924-001',
        timestamp: '2026-09-24 12:00:15',
        duracaoS: 45,
        motivo: 'DELTA_P_AUTOMATICO',
        pressaoAntesBar: 2.48,
        pressaoDepoisBar: 1.62,
        operador: 'Sistema Auto (CLP Modbus)',
        sucesso: true,
      },
      {
        id: 'RW-20260924-002',
        timestamp: '2026-09-24 08:00:00',
        duracaoS: 45,
        motivo: 'TEMPO_PROGRAMADO',
        pressaoAntesBar: 2.18,
        pressaoDepoisBar: 1.58,
        operador: 'Sistema Auto (CLP Modbus)',
        sucesso: true,
      },
      {
        id: 'RW-20260923-018',
        timestamp: '2026-09-23 20:30:10',
        duracaoS: 60,
        motivo: 'MANUAL_OPERADOR',
        pressaoAntesBar: 2.55,
        pressaoDepoisBar: 1.60,
        operador: 'Eng. Ricardo Arcanjo',
        sucesso: true,
      }
    ],
  };

  // Dados atuais dos sensores físico-químicos e hidráulicos
  private dadosAtuais: SensorData = {
    pressaoBar: 1.85,
    vazaoLitrosHora: 980,
    tensaoV: 1.40,
    correnteAmp: 18.5,
    fluoretoInPPM: 8.5,
    fluoretoOutPPM: 1.1,
    ph: 7.22,
    temperaturaC: 23.4,
    condutividadeInUsCm: 1250,
    condutividadeOutUsCm: 340,
    eficienciaRemocaoPct: 87.1,
  };

  // Simulação física dos 10 módulos FTE-CDI individuais
  private celulas: CellTelemetry[] = [];

  // Callbacks de notificação para UI em tempo real
  private listeners: Array<(dados: SensorData, estado: SkidHardwareState) => void> = [];

  constructor(db: ScadaDatabase = dbInstance) {
    this.db = db;
    this.inicializarCelulas();
  }

  private inicializarCelulas() {
    this.celulas = Array.from({ length: 10 }, (_, i) => ({
      cellId: i + 1,
      pressaoIndividualBar: 1.8 + (Math.random() * 0.1 - 0.05),
      vazaoIndividualLh: 98 + (Math.random() * 4 - 2),
      temperaturaC: 22.4 + (Math.random() * 0.8),
      status: 'OPERACIONAL',
      potencialV: 1.40,
    }));
  }

  // Loop de validação de segurança mecânica e hidráulica
  public validarSegurancaOperacional(dados: SensorData): void {
    // Trava 1: Risco de ruptura mecânica da base PEAD
    if (dados.pressaoBar >= this.PRESSAO_MAX_BAR) {
      this.dispararInterlockFisico("CRITICO", "Sobrepressão > 3.0 bar na base Plenum PEAD. Risco de extrusão das vedações.");
    }
    
    // Trava 2: Entupimento da matriz porosa (Fouling)
    if (dados.vazaoLitrosHora < this.VAZAO_MIN_L_H && dados.pressaoBar > 2.0) {
      this.foulingDetectado = true;
      this.registrarAlarme("ALERTA", "Baixa permeabilidade hidráulica (<500 L/h). Verificar fouling no Feltro de Grafite e Malha Ru-Ir.");
    } else {
      this.foulingDetectado = false;
    }
  }

  public async iniciarCicloAdsorcao(): Promise<void> {
    await this.aplicarTensao(1.4); // Target ótimo para adsorção de Fluoreto
    await this.atualizarBancoStatus("ADSORCAO");
    this.registrarAlarme("INFO", "Ciclo de ADSORÇÃO ativado. Tensão de polarização ajustada para 1.40 V.");
    authService.registrarAuditoria('Início de ciclo de ADSORÇÃO (Tensão 1.40 V)', 'PROCESSO');
  }

  public async iniciarCicloRegeneracao(): Promise<void> {
    await this.aplicarTensao(0.0); // Descarga capacitiva em curto
    await this.atualizarBancoStatus("REGENERACAO");
    this.registrarAlarme("INFO", "Ciclo de REGENERAÇÃO ativado. Tensão em 0.00 V (Descarga eletrossortiva).");
    authService.registrarAuditoria('Início de ciclo de REGENERAÇÃO (Tensão 0.00 V)', 'PROCESSO');
  }

  private dispararInterlockFisico(severidade: string, msg: string) { 
    // Corta contator/relé da bomba de alimentação imediatamente
    this.bombaAlimentacaoAtiva = false;
    this.interlockDisparado = true;
    this.motivoInterlock = msg;
    
    // Desliga fonte DC como precaução operacional adicional
    this.tensaoReal = 0.0;
    this.correnteAmp = 0.0;

    this.registrarAlarme(severidade as NivelSeveridade, `[INTERLOCK FÍSICO ATIVADO] Relé da Bomba Desarmado! ${msg}`);

    // Atualiza status do ciclo atual
    const cicloAtivo = this.db.getCicloAtivo();
    if (cicloAtivo) {
      this.db.atualizarStatusCiclo(cicloAtivo.id, 'INTERROMPIDO');
    }

    // Registra evento na auditoria do operador
    authService.registrarAuditoria(
      `Interlock crítico acionado: ${msg}`,
      'SEGURANCA'
    );

    // Despacho de notificação remota em tempo real (Web Push + E-mail + Sirene)
    const celulasComprometidas = this.celulas
      .filter(c => c.status !== 'OPERACIONAL')
      .map(c => c.cellId);

    notificationService.dispararAlertaInterlock({
      motivo: msg,
      pressaoBar: this.dadosAtuais.pressaoBar,
      vazaoLh: this.dadosAtuais.vazaoLitrosHora,
      tensaoV: this.dadosAtuais.tensaoV,
      correnteA: this.dadosAtuais.correnteAmp,
      celulasComprometidas: celulasComprometidas.length > 0 ? celulasComprometidas : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    });
  }

  private async aplicarTensao(volts: number): Promise<void> {
    this.tensaoAlvo = volts;
    this.tensaoReal = volts;
    this.correnteAmp = volts > 0 ? 18.5 : 0.0;
    this.notificarListeners();
  }

  private registrarAlarme(severidade: string, msg: string): void {
    this.db.inserirAlarme(severidade as NivelSeveridade, msg);
  }

  private async atualizarBancoStatus(fase: string): Promise<void> {
    this.db.criarCiclo(1, fase as 'ADSORCAO' | 'REGENERACAO', this.tensaoAlvo);
  }

  // --- Métodos de Controle Operacional SCADA ---

  // Re-arme do Relé da Bomba (Reset de Interlock Físico)
  public rearmarInterlockManual(): { sucesso: boolean; mensagem: string } {
    if (this.dadosAtuais.pressaoBar >= this.PRESSAO_MAX_BAR) {
      const msg = `Não é possível rearmar o relé! Pressão da Base Plenum (${this.dadosAtuais.pressaoBar.toFixed(2)} bar) ainda atinge ou excede o limite mecânico crítico de 3.0 bar.`;
      this.registrarAlarme("CRITICO", msg);
      return { sucesso: false, mensagem: msg };
    }

    this.bombaAlimentacaoAtiva = true;
    this.interlockDisparado = false;
    this.motivoInterlock = null;
    this.tensaoReal = this.tensaoAlvo;
    
    // Reinicia ciclo se estava interrompido
    const cicloAtivo = this.db.getCicloAtivo();
    if (!cicloAtivo || cicloAtivo.status === 'INTERROMPIDO') {
      this.db.criarCiclo(1, "ADSORCAO", this.tensaoAlvo);
    }

    this.registrarAlarme("INFO", "Interlock físico rearmado manualmente pelo operador. Relé da bomba alimentadora fechado.");
    authService.registrarAuditoria(
      'Interlock físico rearmado pelo operador com relé da bomba reativado.',
      'SEGURANCA'
    );

    this.notificarListeners();
    return { sucesso: true, mensagem: "Interlock rearmado com sucesso. Bomba em operação." };
  }

  // Botão de Parada de Emergência (E-STOP)
  public paradaEmergencia(): void {
    this.dispararInterlockFisico("CRITICO", "Parada de Emergência acionada pelo operador na IHM SCADA.");
    this.notificarListeners();
  }

  // Loop de telemetria (Modo Simulação ou Integração com CLP)
  public simularTelemetriaCLP(parciais?: Partial<SensorData>): void {
    const cicloAtivo = this.db.getCicloAtivo();
    const fase = cicloAtivo ? cicloAtivo.fase : 'ADSORCAO';

    if (parciais) {
      this.dadosAtuais = {
        ...this.dadosAtuais,
        ...parciais,
      };
    } else {
      // Dinâmica com malha fechada e controle PID de vazão/pressão
      if (!this.bombaAlimentacaoAtiva) {
        // Se a bomba foi cortada pelo interlock ou E-stop, pressão e vazão decaem rapidamente
        this.dadosAtuais.pressaoBar = Math.max(0.1, Number((this.dadosAtuais.pressaoBar * 0.7).toFixed(2)));
        this.dadosAtuais.vazaoLitrosHora = Math.max(0, Number((this.dadosAtuais.vazaoLitrosHora * 0.5).toFixed(1)));
        this.dadosAtuais.correnteAmp = 0;
        this.dadosAtuais.fluoretoOutPPM = this.dadosAtuais.fluoretoInPPM;
      } else {
        // Bomba ligada: cálculo de modulação do inversor pelo PID
        const sinalVfd = pidService.calcular(this.dadosAtuais.vazaoLitrosHora, this.dadosAtuais.pressaoBar, 1.0);
        const pidConfig = pidService.getConfig();

        // Vazão converge para a modulação do sinal de saída do PID
        const vazaoAlvoPid = (sinalVfd / 100) * 1500;
        const ruidoV = (Math.random() - 0.5) * 8;
        const novaVazao = Number((this.dadosAtuais.vazaoLitrosHora + (vazaoAlvoPid - this.dadosAtuais.vazaoLitrosHora) * 0.35 + ruidoV).toFixed(1));
        this.dadosAtuais.vazaoLitrosHora = Math.max(0, Math.min(1600, novaVazao));

        // Pressão reage hidraulicamente à vazão e ao estado de fouling
        const ruidoP = (Math.random() - 0.5) * 0.02;
        if (!this.interlockDisparado && this.dadosAtuais.pressaoBar < 2.9) {
          // Se o override de pressão do PID atuar, a pressão recua
          let alvoP = 1.2 + (this.dadosAtuais.vazaoLitrosHora / 1500) * 0.9;
          if (this.foulingDetectado) alvoP += 0.6;
          if (pidConfig.overridePressaoAtivo) alvoP = Math.min(alvoP, 2.55);

          this.dadosAtuais.pressaoBar = Number((this.dadosAtuais.pressaoBar + (alvoP - this.dadosAtuais.pressaoBar) * 0.2 + ruidoP).toFixed(2));
        }

        // Variáveis químicas e físico-químicas
        if (fase === 'ADSORCAO') {
          this.tensaoReal = 1.40;
          this.correnteAmp = Number((18.2 + (Math.random() - 0.5) * 0.6).toFixed(1));
          
          // Eletrodo ISE de Fluoreto (meta de potabilidade: <= 1.5 ppm)
          const fIn = this.dadosAtuais.fluoretoInPPM;
          const eficiencia = 0.86 + (Math.random() - 0.5) * 0.03;
          this.dadosAtuais.fluoretoOutPPM = Number((fIn * (1 - eficiencia)).toFixed(2));
          this.massaFRemovidaMg += (this.dadosAtuais.vazaoLitrosHora / 3600) * (fIn - this.dadosAtuais.fluoretoOutPPM);

          // Condutividade: redução significativa dos sais totais dissolvidos
          this.dadosAtuais.condutividadeOutUsCm = Number((340 + (Math.random() - 0.5) * 15).toFixed(0));
          // pH: estabilizado em faixa neutra
          this.dadosAtuais.ph = Number((7.22 + (Math.random() - 0.5) * 0.06).toFixed(2));
          // Temperatura: leve elevação por efeito Joule
          this.dadosAtuais.temperaturaC = Number((23.4 + (Math.random() - 0.5) * 0.2).toFixed(1));
        } else {
          // Fase de REGENERAÇÃO (Descarga eletrossortiva)
          this.tensaoReal = 0.00;
          this.correnteAmp = Number((Math.max(0, this.correnteAmp * 0.8)).toFixed(2));
          
          // Dessalinização: descarga de íons F- em alta concentração
          this.dadosAtuais.fluoretoOutPPM = Number((this.dadosAtuais.fluoretoInPPM * 2.8 + (Math.random() - 0.5) * 0.4).toFixed(2));
          this.dadosAtuais.condutividadeOutUsCm = Number((3200 + (Math.random() - 0.5) * 80).toFixed(0));
          this.dadosAtuais.ph = Number((6.95 + (Math.random() - 0.5) * 0.08).toFixed(2));
        }

        // Se o Bypass de emergência/manutenção estiver ativo
        if (this.retrolavagem.bypassAtivo) {
          this.dadosAtuais.pressaoBar = Number((0.15 + (Math.random() - 0.5) * 0.04).toFixed(2));
          this.dadosAtuais.fluoretoOutPPM = this.dadosAtuais.fluoretoInPPM;
          this.dadosAtuais.condutividadeOutUsCm = this.dadosAtuais.condutividadeInUsCm;
        }

        // Processamento dinâmico do ciclo de RETROLAVAGEM
        if (this.retrolavagem.emAndamento) {
          this.retrolavagem.tempoRestanteSegundos = Math.max(0, this.retrolavagem.tempoRestanteSegundos - 1);
          const restante = this.retrolavagem.tempoRestanteSegundos;
          const total = this.retrolavagem.duracaoTotalSegundos;

          if (restante <= 0) {
            // Conclusão com sucesso do ciclo
            this.retrolavagem.emAndamento = false;
            this.retrolavagem.faseAtual = 'IDLE';
            this.retrolavagem.valvulas.xv101Retrolavagem = false;
            this.retrolavagem.valvulas.xv102Alimentacao = !this.retrolavagem.bypassAtivo;
            this.retrolavagem.valvulas.xv103Descarte = false;
            this.retrolavagem.valvulas.xv105AirScour = false;
            this.foulingDetectado = false;
            this.retrolavagem.totalCiclosExecutados += 1;
            this.retrolavagem.ultimoCicloTimestamp = new Date().toISOString();
            this.retrolavagem.recuperacaoPermeabilidadePct = Number((95.5 + Math.random() * 3.8).toFixed(1));

            const pAntes = this.dadosAtuais.pressaoBar;
            this.dadosAtuais.pressaoBar = 1.60;

            this.retrolavagem.historicoCiclos.unshift({
              id: `RW-${Date.now().toString().slice(-6)}`,
              timestamp: new Date().toLocaleString('pt-BR'),
              duracaoS: total,
              motivo: 'MANUAL_OPERADOR',
              pressaoAntesBar: pAntes,
              pressaoDepoisBar: 1.60,
              operador: authService.getOperadorAtual().nome,
              sucesso: true,
            });

            this.registrarAlarme("INFO", `Ciclo de Retrolavagem finalizado. Matriz porosa desobstruída (Recuperação: ${this.retrolavagem.recuperacaoPermeabilidadePct}%).`);
            authService.registrarAuditoria(`Ciclo de retrolavagem de ${total}s concluído com sucesso. Pressão normalizada para 1.60 bar.`, 'PROCESSO');
          } else if (restante <= 6) {
            // Fase 3: Enxágue final
            this.retrolavagem.faseAtual = 'ENXAGUE';
            this.retrolavagem.valvulas.xv101Retrolavagem = false;
            this.retrolavagem.valvulas.xv102Alimentacao = true;
            this.retrolavagem.valvulas.xv103Descarte = true;
            this.retrolavagem.valvulas.xv105AirScour = false;
          } else if (restante <= total - 5) {
            // Fase 2: Lavagem em Contracorrente de Alta Velocidade + Air Scour
            this.retrolavagem.faseAtual = 'LAVAGEM_REVERSA';
            this.retrolavagem.valvulas.xv101Retrolavagem = true;
            this.retrolavagem.valvulas.xv102Alimentacao = false;
            this.retrolavagem.valvulas.xv103Descarte = true;
            this.retrolavagem.valvulas.xv105AirScour = (restante % 3 === 0);
            this.dadosAtuais.pressaoBar = Number((1.95 + (Math.random() - 0.5) * 0.1).toFixed(2));
          } else {
            // Fase 1: Despolarização
            this.retrolavagem.faseAtual = 'DESPOLARIZACAO';
            this.retrolavagem.valvulas.xv101Retrolavagem = false;
            this.retrolavagem.valvulas.xv102Alimentacao = false;
            this.retrolavagem.valvulas.xv103Descarte = true;
            this.tensaoReal = 0.0;
            this.correnteAmp = 0.0;
          }
        } else if (this.retrolavagem.modoAuto && this.foulingDetectado && !this.retrolavagem.bypassAtivo && this.bombaAlimentacaoAtiva) {
          // Disparo automático quando detectado entupimento por fouling
          this.iniciarRetrolavagem(45, 'DELTA_P_AUTOMATICO');
        }
      }
    }

    // Calcula taxa de remoção percentual (%)
    const fIn = this.dadosAtuais.fluoretoInPPM;
    const fOut = this.dadosAtuais.fluoretoOutPPM;
    this.dadosAtuais.eficienciaRemocaoPct = fIn > 0 ? Number(Math.max(0, Math.min(100, ((fIn - fOut) / fIn) * 100)).toFixed(1)) : 0;

    // Executa as validações de segurança críticas
    this.validarSegurancaOperacional(this.dadosAtuais);

    // Atualiza telemetria das 10 células em paralelo
    this.atualizarTelemetriaCelulas();

    // Grava registro de telemetria no banco de dados relacional
    if (cicloAtivo) {
      this.db.inserirTelemetria({
        ciclo_id: cicloAtivo.id,
        pressao_bar: this.dadosAtuais.pressaoBar,
        vazao_l_h: this.dadosAtuais.vazaoLitrosHora,
        corrente_amp: this.dadosAtuais.correnteAmp,
        tensao_v: this.dadosAtuais.tensaoV,
        fluoreto_in_ppm: this.dadosAtuais.fluoretoInPPM,
        fluoreto_out_ppm: this.dadosAtuais.fluoretoOutPPM,
        ph: this.dadosAtuais.ph,
        temperatura_c: this.dadosAtuais.temperaturaC,
        condutividade_us_cm: this.dadosAtuais.condutividadeOutUsCm,
      });
    }

    this.notificarListeners();
  }

  private atualizarTelemetriaCelulas() {
    const pressaoMedia = this.dadosAtuais.pressaoBar;
    const vazaoTotal = this.dadosAtuais.vazaoLitrosHora;
    const tensao = this.tensaoReal;

    this.celulas = this.celulas.map((c, i) => {
      // Variação hidráulica individual das 10 células em paralelo no rack
      const distRatio = 0.095 + (i % 3) * 0.003;
      const vCell = vazaoTotal * distRatio;
      const pCell = pressaoMedia * (0.97 + (i * 0.006));
      
      let status: CellTelemetry['status'] = 'OPERACIONAL';
      if (pCell >= this.PRESSAO_MAX_BAR) {
        status = 'SOBREPRESSAO';
      } else if (vCell < 45 && pCell > 2.0) {
        status = 'ALERTA_FOULING';
      } else if (!this.bombaAlimentacaoAtiva) {
        status = 'STANDBY';
      }

      return {
        ...c,
        pressaoIndividualBar: Number(pCell.toFixed(2)),
        vazaoIndividualLh: Number(vCell.toFixed(1)),
        potencialV: tensao,
        status,
      };
    });
  }

  // Retorna o snapshot completo de hardware e telemetria
  public getEstadoHardware(): SkidHardwareState {
    return {
      bombaAlimentacaoAtiva: this.bombaAlimentacaoAtiva,
      interlockDisparado: this.interlockDisparado,
      motivoInterlock: this.motivoInterlock,
      fonteDcAtiva: this.bombaAlimentacaoAtiva && this.tensaoReal > 0,
      tensaoAlvoV: this.tensaoAlvo,
      tensaoRealV: this.tensaoReal,
      correnteTotalA: this.correnteAmp,
      modoOperacao: this.modoOperacao,
      foulingDetectado: this.foulingDetectado,
      eficienciaRemocaoPct: this.dadosAtuais.eficienciaRemocaoPct,
      massaFRemovidaMg: Number(this.massaFRemovidaMg.toFixed(1)),
      celulas: this.celulas,
      retrolavagem: {
        ...this.retrolavagem,
        valvulas: { ...this.retrolavagem.valvulas },
        historicoCiclos: [...this.retrolavagem.historicoCiclos],
      },
    };
  }

  // --- MÉTODOS DE CONTROLE DA RETROLAVAGEM & BYPASS ---

  public iniciarRetrolavagem(duracaoSegundos: number = 45, motivo: BackwashCicloRegistro['motivo'] = 'MANUAL_OPERADOR'): { sucesso: boolean; mensagem: string } {
    if (this.interlockDisparado) {
      return { sucesso: false, mensagem: "Impossível iniciar retrolavagem com interlock crítico ativo!" };
    }
    if (this.retrolavagem.emAndamento) {
      return { sucesso: false, mensagem: "Ciclo de retrolavagem já em andamento!" };
    }

    this.retrolavagem.emAndamento = true;
    this.retrolavagem.duracaoTotalSegundos = duracaoSegundos;
    this.retrolavagem.tempoRestanteSegundos = duracaoSegundos;
    this.retrolavagem.faseAtual = 'DESPOLARIZACAO';
    
    // Configuração inicial de válvulas para lavagem
    this.retrolavagem.valvulas.xv101Retrolavagem = false;
    this.retrolavagem.valvulas.xv102Alimentacao = false;
    this.retrolavagem.valvulas.xv103Descarte = true;
    this.retrolavagem.valvulas.xv105AirScour = false;

    // Despolariza eletrodos para soltar ânions e matéria coloidal
    this.tensaoReal = 0.0;
    this.correnteAmp = 0.0;

    this.registrarAlarme("INFO", `Iniciando Retrolavagem (${duracaoSegundos}s) - Motivo: ${motivo}. Válvulas XV-101 e XV-103 acionadas.`);
    authService.registrarAuditoria(`Disparo de ciclo de Retrolavagem (${duracaoSegundos}s) [${motivo}]`, 'PROCESSO');

    this.notificarListeners();
    return { sucesso: true, mensagem: `Ciclo de retrolavagem iniciado com sucesso (${duracaoSegundos}s).` };
  }

  public cancelarRetrolavagem(motivo: string = "Cancelado pelo operador"): void {
    if (!this.retrolavagem.emAndamento) return;

    this.retrolavagem.emAndamento = false;
    this.retrolavagem.tempoRestanteSegundos = 0;
    this.retrolavagem.faseAtual = 'IDLE';

    // Restaura válvulas
    this.retrolavagem.valvulas.xv101Retrolavagem = false;
    this.retrolavagem.valvulas.xv102Alimentacao = !this.retrolavagem.bypassAtivo;
    this.retrolavagem.valvulas.xv103Descarte = false;
    this.retrolavagem.valvulas.xv105AirScour = false;

    this.registrarAlarme("ALERTA", `Retrolavagem cancelada: ${motivo}`);
    authService.registrarAuditoria(`Retrolavagem cancelada: ${motivo}`, 'PROCESSO');

    this.notificarListeners();
  }

  public setBypass(ativo: boolean, motivo?: string): void {
    this.retrolavagem.bypassAtivo = ativo;
    this.retrolavagem.valvulas.xv104Bypass = ativo;
    this.retrolavagem.valvulas.xv102Alimentacao = !ativo && !this.retrolavagem.emAndamento;

    if (ativo) {
      this.registrarAlarme("ALERTA", `BYPASS ATIVADO! Água bruta desviada do reator FTE-CDI. Válvula XV-104 aberta.`);
      authService.registrarAuditoria(`Válvula de Bypass XV-104 aberta manualmente. Motivo: ${motivo || 'Operação Manual'}`, 'SEGURANCA');
    } else {
      this.registrarAlarme("INFO", `Bypass Desativado. Válvula XV-104 fechada, fluxo restituído ao reator.`);
      authService.registrarAuditoria(`Bypass fechado e reator recolocado em linha.`, 'PROCESSO');
    }

    this.notificarListeners();
  }

  public toggleValvula(valvulaId: keyof ValvulasEstado): void {
    this.retrolavagem.valvulas[valvulaId] = !this.retrolavagem.valvulas[valvulaId];
    
    // Se ligar ou desligar bypass diretamente
    if (valvulaId === 'xv104Bypass') {
      this.retrolavagem.bypassAtivo = this.retrolavagem.valvulas.xv104Bypass;
    }

    this.registrarAlarme("INFO", `Válvula ${valvulaId.toUpperCase()} comutada para ${this.retrolavagem.valvulas[valvulaId] ? 'ABERTA' : 'FECHADA'}.`);
    authService.registrarAuditoria(`Comutação manual de válvula ${valvulaId}: ${this.retrolavagem.valvulas[valvulaId] ? 'ABERTA' : 'FECHADA'}`, 'PROCESSO');

    this.notificarListeners();
  }

  public configurarAutoRetrolavagem(parcial: Partial<BackwashState>): void {
    this.retrolavagem = {
      ...this.retrolavagem,
      ...parcial,
    };
    this.notificarListeners();
  }

  public aplicarLaudoNoReator(laudo: LaudoLaboratorial): { sucesso: boolean; mensagem: string } {
    const fIn = laudo.parametrosChaveFteCdi.fluoretoMgL;
    const ph = laudo.parametrosChaveFteCdi.ph;
    const std = laudo.parametrosChaveFteCdi.stdMgL;
    const cond = laudo.parametrosChaveFteCdi.condutividadeUsCm || (std ? std * 1.56 : null);

    if (fIn !== null && fIn !== undefined) {
      this.dadosAtuais.fluoretoInPPM = Number(fIn.toFixed(2));
      const taxaRemocao = this.tensaoReal > 0.5 && this.bombaAlimentacaoAtiva ? 0.82 : 0.05;
      this.dadosAtuais.fluoretoOutPPM = Number((fIn * (1 - taxaRemocao)).toFixed(2));
      this.dadosAtuais.eficienciaRemocaoPct = Number((taxaRemocao * 100).toFixed(1));
    }

    if (ph !== null && ph !== undefined) {
      this.dadosAtuais.ph = Number(ph.toFixed(2));
    }

    if (cond !== null && cond !== undefined) {
      this.dadosAtuais.condutividadeInUsCm = Number(cond.toFixed(0));
      this.dadosAtuais.condutividadeOutUsCm = Number((cond * 0.42).toFixed(0));
    }

    this.registrarAlarme("INFO", `Parâmetros do Laudo ${laudo.numeroLaudo} (${laudo.laboratorio}) carregados no reator FTE-CDI.`);
    authService.registrarAuditoria(`Carga de parâmetros do Laudo laboratorial ${laudo.numeroLaudo} (F-: ${fIn ?? 'N/A'} mg/L, pH: ${ph ?? 'N/A'}, STD: ${std ?? 'N/A'} mg/L)`, 'PROCESSO');

    this.notificarListeners();
    return {
      sucesso: true,
      mensagem: `Laudo ${laudo.numeroLaudo} aplicado com sucesso! F- afluente ajustado para ${fIn ?? 'N/A'} mg/L.`
    };
  }

  public getDadosSensores(): SensorData {
    return { ...this.dadosAtuais };
  }

  public setModoOperacao(modo: 'AUTOMATICO' | 'MANUAL') {
    this.modoOperacao = modo;
    this.notificarListeners();
  }

  public subscribe(fn: (dados: SensorData, estado: SkidHardwareState) => void): () => void {
    this.listeners.push(fn);
    fn(this.dadosAtuais, this.getEstadoHardware());
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notificarListeners(): void {
    const estado = this.getEstadoHardware();
    const dados = this.getDadosSensores();
    this.listeners.forEach(fn => fn(dados, estado));
  }
}

export const controllerInstance = new FteCdiController();
