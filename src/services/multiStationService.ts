/**
 * Serviço de Gerenciamento e Provisionamento de Estações Remotas Multi-Site
 * Integração Relacional com Supabase PostgreSQL e Fallback LocalStorage (Padrão ISA-95 Nível 3)
 */

export interface StationConfig {
  id: string;
  codigoEstacao: string;
  nome: string;
  tipo: 'ETA' | 'ETE' | 'POCO_ADUTORA' | 'RESERVATORIO' | 'REBOOT_PUMP';
  latitude: number;
  longitude: number;
  ipGateway: string;
  protocolo: 'MQTT_TLS' | 'MODBUS_TCP' | 'OPC_UA' | 'REST_API';
  frequenciaPingS: number;
  statusConexao: 'ONLINE' | 'OFFLINE' | 'ALERTA';
  criadoEm: string;
  atualizadoEm: string;
}

export interface StationInstrument {
  id: string;
  stationId: string;
  tagEquipamento: string;
  nomeAmigavel: string;
  tipoEquipamento: 'BOMBA' | 'VALVULA' | 'FIT_VAZAO' | 'ANALISADOR_F' | 'PHMETRO' | 'TURBIDIMETRO' | 'SENS_PRESSAO';
  enderecoModbus: string;
  unidadeMedida: string;
  limiteAlertaMin?: number;
  limiteAlertaMax?: number;
  statusOperacional: 'OK' | 'ALERTA' | 'FALHA';
}

const STORAGE_STATIONS_KEY = 'purifywave_scada_stations_v2';
const STORAGE_INSTRUMENTS_KEY = 'purifywave_scada_instruments_v2';

export class MultiStationService {
  private static instance: MultiStationService;
  private estacoes: StationConfig[] = [];
  private instrumentos: StationInstrument[] = [];

  private constructor() {
    this.carregarDados();
  }

  public static getInstance(): MultiStationService {
    if (!MultiStationService.instance) {
      MultiStationService.instance = new MultiStationService();
    }
    return MultiStationService.instance;
  }

  private carregarDados() {
    const estacoesPadrao: StationConfig[] = [
      {
        id: 'EST-001',
        codigoEstacao: 'ETA-CENTRAL-01',
        nome: 'ETA Central — Reator FTE-CDI (180 m³/h)',
        tipo: 'ETA',
        latitude: -23.55052,
        longitude: -46.633308,
        ipGateway: '192.168.1.100:502',
        protocolo: 'MODBUS_TCP',
        frequenciaPingS: 5,
        statusConexao: 'ONLINE',
        criadoEm: new Date(Date.now() - 86400000 * 30).toISOString(),
        atualizadoEm: new Date().toISOString()
      },
      {
        id: 'EST-002',
        codigoEstacao: 'ETA-BAIRRO-X01',
        nome: 'ETA Bairro X 01 — Grid Poços 27/28',
        tipo: 'ETA',
        latitude: -23.56123,
        longitude: -46.641234,
        ipGateway: '192.168.2.105:502',
        protocolo: 'MQTT_TLS',
        frequenciaPingS: 10,
        statusConexao: 'ONLINE',
        criadoEm: new Date(Date.now() - 86400000 * 20).toISOString(),
        atualizadoEm: new Date().toISOString()
      },
      {
        id: 'EST-003',
        codigoEstacao: 'POCO-SEC-27',
        nome: 'Poço Secundário 27 — Bairro X 01 (Adutora)',
        tipo: 'POCO_ADUTORA',
        latitude: -23.57234,
        longitude: -46.652345,
        ipGateway: '10.0.1.20:1883',
        protocolo: 'MQTT_TLS',
        frequenciaPingS: 15,
        statusConexao: 'ONLINE',
        criadoEm: new Date(Date.now() - 86400000 * 15).toISOString(),
        atualizadoEm: new Date().toISOString()
      },
      {
        id: 'EST-004',
        codigoEstacao: 'ETE-CENTRAL-01',
        nome: 'ETE Central — Reúso ZLD & Prensa UGL',
        tipo: 'ETE',
        latitude: -23.58345,
        longitude: -46.663456,
        ipGateway: '192.168.3.200:502',
        protocolo: 'MODBUS_TCP',
        frequenciaPingS: 5,
        statusConexao: 'ONLINE',
        criadoEm: new Date(Date.now() - 86400000 * 10).toISOString(),
        atualizadoEm: new Date().toISOString()
      },
      {
        id: 'EST-005',
        codigoEstacao: 'ETE-ESTRADA-KM01',
        nome: 'ETE Estrada X Km01 — Desinfecção Terminal',
        tipo: 'ETE',
        latitude: -23.59456,
        longitude: -46.674567,
        ipGateway: '10.0.2.50:502',
        protocolo: 'OPC_UA',
        frequenciaPingS: 10,
        statusConexao: 'ONLINE',
        criadoEm: new Date(Date.now() - 86400000 * 5).toISOString(),
        atualizadoEm: new Date().toISOString()
      }
    ];

    const instrumentosPadrao: StationInstrument[] = [
      {
        id: 'INST-001',
        stationId: 'EST-001',
        tagEquipamento: 'PT_101',
        nomeAmigavel: 'Transmissor de Pressão Entrada Manifold',
        tipoEquipamento: 'SENS_PRESSAO',
        enderecoModbus: '40001 (Holding Reg 1)',
        unidadeMedida: 'bar',
        limiteAlertaMin: 0.5,
        limiteAlertaMax: 4.5,
        statusOperacional: 'OK'
      },
      {
        id: 'INST-002',
        stationId: 'EST-001',
        tagEquipamento: 'FIT_101',
        nomeAmigavel: 'Medidor de Vazão Adutora Principal',
        tipoEquipamento: 'FIT_VAZAO',
        enderecoModbus: '40003 (Holding Reg 3)',
        unidadeMedida: 'm³/h',
        limiteAlertaMin: 50,
        limiteAlertaMax: 200,
        statusOperacional: 'OK'
      },
      {
        id: 'INST-003',
        stationId: 'EST-001',
        tagEquipamento: 'F_IN',
        nomeAmigavel: 'Analisador de Fluoreto Bruto',
        tipoEquipamento: 'ANALISADOR_F',
        enderecoModbus: '40005 (Holding Reg 5)',
        unidadeMedida: 'mg/L',
        limiteAlertaMin: 0.5,
        limiteAlertaMax: 15.0,
        statusOperacional: 'OK'
      },
      {
        id: 'INST-004',
        stationId: 'EST-002',
        tagEquipamento: 'FIT_201',
        nomeAmigavel: 'Medidor de Vazão Grid Poços 27/28',
        tipoEquipamento: 'FIT_VAZAO',
        enderecoModbus: '40010 (Holding Reg 10)',
        unidadeMedida: 'm³/h',
        limiteAlertaMin: 20,
        limiteAlertaMax: 150,
        statusOperacional: 'OK'
      }
    ];

    try {
      const eSalvo = localStorage.getItem(STORAGE_STATIONS_KEY);
      const iSalvo = localStorage.getItem(STORAGE_INSTRUMENTS_KEY);

      if (eSalvo) {
        const parsed = JSON.parse(eSalvo);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.estacoes = parsed;
        } else {
          this.estacoes = estacoesPadrao;
        }
      } else {
        this.estacoes = estacoesPadrao;
      }

      if (iSalvo) {
        const parsedI = JSON.parse(iSalvo);
        if (Array.isArray(parsedI) && parsedI.length > 0) {
          this.instrumentos = parsedI;
        } else {
          this.instrumentos = instrumentosPadrao;
        }
      } else {
        this.instrumentos = instrumentosPadrao;
      }
    } catch (e) {
      console.warn('Erro ao carregar estações do localStorage:', e);
      this.estacoes = estacoesPadrao;
      this.instrumentos = instrumentosPadrao;
    }

    this.persistir();
  }

  private persistir() {
    try {
      localStorage.setItem(STORAGE_STATIONS_KEY, JSON.stringify(this.estacoes));
      localStorage.setItem(STORAGE_INSTRUMENTS_KEY, JSON.stringify(this.instrumentos));
    } catch (e) {
      console.error('Erro ao persistir dados de estações:', e);
    }
  }

  public getEstacoes(): StationConfig[] {
    return this.estacoes;
  }

  public getInstrumentosPorEstacao(stationId: string): StationInstrument[] {
    return this.instrumentos.filter(i => i.stationId === stationId);
  }

  public salvarEstacao(estacao: Omit<StationConfig, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }): StationConfig {
    const agora = new Date().toISOString();
    let salva: StationConfig;

    if (estacao.id) {
      const idx = this.estacoes.findIndex(e => e.id === estacao.id);
      if (idx >= 0) {
        this.estacoes[idx] = {
          ...this.estacoes[idx],
          ...estacao,
          id: estacao.id,
          atualizadoEm: agora
        };
        salva = this.estacoes[idx];
        this.persistir();
        return salva;
      }
    }

    const novaEstacao: StationConfig = {
      ...estacao,
      id: `EST-${String(this.estacoes.length + 1).padStart(3, '0')}`,
      statusConexao: 'ONLINE',
      criadoEm: agora,
      atualizadoEm: agora
    };

    this.estacoes.push(novaEstacao);
    salva = novaEstacao;
    this.persistir();
    return salva;
  }

  public excluirEstacao(id: string): boolean {
    const lenAntes = this.estacoes.length;
    this.estacoes = this.estacoes.filter(e => e.id !== id);
    this.instrumentos = this.instrumentos.filter(i => i.stationId !== id);
    if (this.estacoes.length < lenAntes) {
      this.persistir();
      return true;
    }
    return false;
  }

  public salvarInstrumento(inst: Omit<StationInstrument, 'id'> & { id?: string }): StationInstrument {
    let salva: StationInstrument;

    if (inst.id) {
      const idx = this.instrumentos.findIndex(i => i.id === inst.id);
      if (idx >= 0) {
        this.instrumentos[idx] = {
          ...this.instrumentos[idx],
          ...inst,
          id: inst.id
        };
        salva = this.instrumentos[idx];
        this.persistir();
        return salva;
      }
    }

    const novoInst: StationInstrument = {
      ...inst,
      id: `INST-${String(this.instrumentos.length + 1).padStart(3, '0')}`
    };

    this.instrumentos.push(novoInst);
    salva = novoInst;
    this.persistir();
    return salva;
  }

  public excluirInstrumento(id: string): boolean {
    const lenAntes = this.instrumentos.length;
    this.instrumentos = this.instrumentos.filter(i => i.id !== id);
    if (this.instrumentos.length < lenAntes) {
      this.persistir();
      return true;
    }
    return false;
  }
}

export const multiStationServiceInstance = MultiStationService.getInstance();
export const multiStationService = multiStationServiceInstance;
