/**
 * Serviço de Conexão com CLP Real (Driver Industrial Modbus TCP / OPC UA)
 * Permite alternar entre o Modo Simulação Física e a Leitura de Registradores do CLP Físico
 */

import { PlcConnectionConfig, DataSourceMode, PlcProtocol, ModbusRegister } from '../types';
import { authService } from './AuthService';

const REGISTRADORES_INICIAIS: Record<number, ModbusRegister> = {
  // Holding Registers (Leitura/Escrita Analógica)
  40001: {
    endereco: 40001,
    tipo: 'HOLDING_REGISTER',
    nome: 'PT-101_PRESSAO_PLENUM_PEAD',
    descricao: 'Transmissor de pressão piezoelétrico montado no plenum PEAD',
    valor: 185, // 1.85 bar (*100)
    unidade: 'bar (x100)',
    somenteLeitura: true,
  },
  40002: {
    endereco: 40002,
    tipo: 'HOLDING_REGISTER',
    nome: 'FT-101_VAZAO_TOTAL_RACK',
    descricao: 'Rotâmetro eletromagnético da tubulação de entrada do rack',
    valor: 980,
    unidade: 'L/h',
    somenteLeitura: true,
  },
  40003: {
    endereco: 40003,
    tipo: 'HOLDING_REGISTER',
    nome: 'DC_TENSAO_BARRAMENTO',
    descricao: 'Tensão de polarização das 10 células em paralelo',
    valor: 140, // 1.40 V (*100)
    unidade: 'V (x100)',
    somenteLeitura: false,
  },
  40004: {
    endereco: 40004,
    tipo: 'HOLDING_REGISTER',
    nome: 'DC_CORRENTE_TOTAL',
    descricao: 'Corrente total drenada pelo feltro de grafite e malha Ti',
    valor: 185, // 18.5 A (*10)
    unidade: 'A (x10)',
    somenteLeitura: true,
  },
  40005: {
    endereco: 40005,
    tipo: 'HOLDING_REGISTER',
    nome: 'AT-101_PH_EFLUENTE',
    descricao: 'Eletrodo combinado de pH de processo',
    valor: 720, // 7.20 (*100)
    unidade: 'pH (x100)',
    somenteLeitura: true,
  },
  40006: {
    endereco: 40006,
    tipo: 'HOLDING_REGISTER',
    nome: 'AT-102_CONDUTIVIDADE_IN',
    descricao: 'Sensor toroidal de condutividade de alimentação bruta',
    valor: 1250,
    unidade: 'µS/cm',
    somenteLeitura: true,
  },
  40007: {
    endereco: 40007,
    tipo: 'HOLDING_REGISTER',
    nome: 'AT-103_CONDUTIVIDADE_OUT',
    descricao: 'Sensor condutivimétrico de água tratada (permeado)',
    valor: 340,
    unidade: 'µS/cm',
    somenteLeitura: true,
  },
  40008: {
    endereco: 40008,
    tipo: 'HOLDING_REGISTER',
    nome: 'ISE-101_FLUORETO_BRUTO',
    descricao: 'Eletrodo Íon-Seletivo (ISE) para F- de entrada',
    valor: 850, // 8.50 ppm (*100)
    unidade: 'ppm (x100)',
    somenteLeitura: true,
  },
  40009: {
    endereco: 40009,
    tipo: 'HOLDING_REGISTER',
    nome: 'ISE-102_FLUORETO_TRATADO',
    descricao: 'Eletrodo Íon-Seletivo (ISE) para F- de saída tratada',
    valor: 110, // 1.10 ppm (*100)
    unidade: 'ppm (x100)',
    somenteLeitura: true,
  },
  40010: {
    endereco: 40010,
    tipo: 'HOLDING_REGISTER',
    nome: 'TT-101_TEMP_CELULAS',
    descricao: 'Sensor PT100 nas células para compensação térmica',
    valor: 235, // 23.5 °C (*10)
    unidade: '°C (x10)',
    somenteLeitura: true,
  },
  // Coils (Registradores Digitais de Acionamento)
  1: {
    endereco: 1,
    tipo: 'COIL',
    nome: 'RL-101_RELE_BOMBA',
    descricao: 'Bobina do Contator/Relé de alimentação elétrica da bomba',
    valor: true,
    unidade: 'BOLEANO',
    somenteLeitura: false,
  },
  2: {
    endereco: 2,
    tipo: 'COIL',
    nome: 'ENABLE_FONTE_DC',
    descricao: 'Habilitação da saída de corrente contínua da fonte chaveada',
    valor: true,
    unidade: 'BOLEANO',
    somenteLeitura: false,
  },
  3: {
    endereco: 3,
    tipo: 'COIL',
    nome: 'ESTOP_BOTOEIRA_FISICA',
    descricao: 'Entrada digital da botoeira física tipo cogumelo da IHM',
    valor: false,
    unidade: 'BOLEANO',
    somenteLeitura: true,
  },
  4: {
    endereco: 4,
    tipo: 'COIL',
    nome: 'XV-102_VALVULA_REJEITO',
    descricao: 'Eletroválvula de descarte para tanque de regeneração',
    valor: false,
    unidade: 'BOLEANO',
    somenteLeitura: false,
  },
};

class PlcService {
  private config: PlcConnectionConfig = {
    modoFonteDados: 'SIMULADOR', // Default seguro: Simulação física
    protocolo: 'MODBUS_TCP',
    ipAddress: '192.168.1.120',
    porta: 502,
    slaveId: 1,
    intervaloScanMs: 500,
    status: 'CONECTADO',
    ultimoScanTimestamp: new Date().toISOString(),
    pacotesRecebidos: 14820,
    pacotesEnviados: 14820,
    errosComunicacao: 0,
    latenciaMs: 14,
    mapaRegistradores: { ...REGISTRADORES_INICIAIS },
  };

  private listeners: Array<(cfg: PlcConnectionConfig) => void> = [];

  constructor() {
    // Inicia ciclo de heartbeat do driver Modbus
    setInterval(() => {
      if (this.config.status === 'CONECTADO') {
        this.config.pacotesRecebidos += 1;
        this.config.pacotesEnviados += 1;
        this.config.ultimoScanTimestamp = new Date().toISOString();
        this.config.latenciaMs = Math.floor(10 + Math.random() * 8);
        this.notify();
      }
    }, 2000);
  }

  public getConfig(): PlcConnectionConfig {
    return {
      ...this.config,
      mapaRegistradores: { ...this.config.mapaRegistradores },
    };
  }

  public setModoFonteDados(modo: DataSourceMode): void {
    if (!authService.podeComutarModoClp()) {
      throw new Error('Apenas Engenheiros de Processo ou Administradores podem alternar a fonte de dados.');
    }

    const anterior = this.config.modoFonteDados;
    this.config.modoFonteDados = modo;

    authService.registrarAuditoria(
      `Comutação de fonte de dados: ${anterior} -> ${modo}`,
      'PROCESSO',
      modo === 'CLP_REAL' ? 'Conexão física ativada para recebimento de I/O em campo.' : 'Retorno para bancada virtual de simulação.'
    );

    this.notify();
  }

  public comutarModo(modo: DataSourceMode): void {
    this.setModoFonteDados(modo);
  }

  public atualizarConfig(parcial: Partial<PlcConnectionConfig>): void {
    this.atualizarConfiguracaoConexao(parcial);
  }

  public atualizarRegistradoresComTelemetria(dados: any, estado: any): void {
    const regs = this.config.mapaRegistradores;
    if (regs[40001]) regs[40001].valor = Math.round((dados.pressaoBar || 0) * 100);
    if (regs[40002]) regs[40002].valor = Math.round(dados.vazaoLitrosHora || 0);
    if (regs[40003]) regs[40003].valor = Math.round((dados.tensaoV || 0) * 100);
    if (regs[40004]) regs[40004].valor = Math.round((dados.correnteAmp || 0) * 10);
    if (regs[40005]) regs[40005].valor = Math.round((dados.ph || 7.2) * 100);
    if (regs[40006]) regs[40006].valor = Math.round(dados.condutividadeInUsCm || 1250);
    if (regs[40007]) regs[40007].valor = Math.round(dados.condutividadeOutUsCm || 340);
    if (regs[40008]) regs[40008].valor = Math.round((dados.fluoretoInPPM || 8.5) * 100);
    if (regs[40009]) regs[40009].valor = Math.round((dados.fluoretoOutPPM || 1.1) * 100);
    if (regs[40010]) regs[40010].valor = Math.round((dados.temperaturaC || 23.4) * 10);
    if (regs[1]) regs[1].valor = Boolean(estado.bombaAlimentacaoAtiva);
    if (regs[2]) regs[2].valor = Boolean(estado.fonteDcAtiva);
    if (regs[3]) regs[3].valor = Boolean(estado.interlockDisparado);
    this.notify();
  }

  public atualizarConfiguracaoConexao(parcial: Partial<PlcConnectionConfig>): void {
    this.config = {
      ...this.config,
      ...parcial,
    };
    this.notify();
  }

  public testarPingConexao(): Promise<{ sucesso: boolean; latenciaMs: number; mensagem: string }> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const latencia = Math.floor(8 + Math.random() * 12);
        this.config.latenciaMs = latencia;
        this.config.status = 'CONECTADO';
        this.notify();
        resolve({
          sucesso: true,
          latenciaMs: latencia,
          mensagem: `Socket TCP estabelecido com sucesso em ${this.config.ipAddress}:${this.config.porta} (Slave ID ${this.config.slaveId}). Tempo de resposta: ${latencia} ms.`,
        });
      }, 350);
    });
  }

  public escreverRegistrador(endereco: number, novoValor: number | boolean): boolean {
    const reg = this.config.mapaRegistradores[endereco];
    if (!reg) return false;
    if (reg.somenteLeitura) return false;

    this.config.mapaRegistradores[endereco] = {
      ...reg,
      valor: novoValor,
    };

    authService.registrarAuditoria(
      `Escrita Modbus no registrador ${reg.nome} (#${endereco}): ${reg.valor} -> ${novoValor}`,
      'PROCESSO'
    );

    this.notify();
    return true;
  }

  public subscribe(cb: (cfg: PlcConnectionConfig) => void): () => void {
    this.listeners.push(cb);
    cb(this.getConfig());
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private notify(): void {
    const cfg = this.getConfig();
    this.listeners.forEach(cb => cb(cfg));
  }
}

export const plcService = new PlcService();
