/**
 * Serviço de Avaliação e Gestão de Tags Virtuais e Fórmulas Matemáticas (Meta Data Points)
 * Paridade com Formula Engine do Rapid SCADA v6 e Meta Data Points do SCADA-LTS / ScadaBR
 * Persistência Integrada no Supabase & LocalStorage do Navegador
 */

import { FormulaTag, DataPointTag } from '../types';

const STORAGE_KEY = 'purifywave_scada_formula_tags_v2';

export class FormulaService {
  private static instance: FormulaService;
  private formulas: FormulaTag[] = [];

  private constructor() {
    this.inicializarFormulas();
  }

  public static getInstance(): FormulaService {
    if (!FormulaService.instance) {
      FormulaService.instance = new FormulaService();
    }
    return FormulaService.instance;
  }

  private inicializarFormulas() {
    const formulasPadrao: FormulaTag[] = [
      {
        id: 'FORM-001',
        nome: 'Delta P Manifold (mca)',
        tagPath: 'Calculadas.DeltaP_Manifold_mca',
        expressao: '(PT_101 - PT_102) * 10.197',
        unidade: 'mca',
        descricao: 'Perda de carga hidráulica diferencial convertida em Metros de Coluna de Água',
        valorCalculado: 3.56,
        statusCalculo: 'OK',
        limiteAlertaMax: 10.0,
        criadoEm: new Date(Date.now() - 86400000).toISOString(),
        atualizadoEm: new Date().toISOString(),
        autor: 'Carlos Silva (SUPERVISOR)',
      },
      {
        id: 'FORM-002',
        nome: 'Eficiência Instantânea de Fluoreto (%)',
        tagPath: 'Calculadas.Rendimento_Remocao_F',
        expressao: '((F_IN - F_OUT) / F_IN) * 100',
        unidade: '%',
        descricao: 'Taxa percentual de remoção de fluoreto em tempo real através do leito de CDI',
        valorCalculado: 89.2,
        statusCalculo: 'OK',
        limiteAlertaMin: 70.0,
        criadoEm: new Date(Date.now() - 86400000).toISOString(),
        atualizadoEm: new Date().toISOString(),
        autor: 'Eng. Roberto Mendes',
      },
      {
        id: 'FORM-003',
        nome: 'Potência Elétrica Total Rack (kW)',
        tagPath: 'Calculadas.Potencia_Total_Rack_kW',
        expressao: '(1.40 * CORRENTE_TOTAL) / 1000',
        unidade: 'kW',
        descricao: 'Consumo de potência ativa DC consumida pelos 16 módulos de eletrodos',
        valorCalculado: 1.05,
        statusCalculo: 'OK',
        limiteAlertaMax: 5.0,
        criadoEm: new Date(Date.now() - 43200000).toISOString(),
        atualizadoEm: new Date().toISOString(),
        autor: 'Eng. Roberto Mendes',
      },
      {
        id: 'FORM-004',
        nome: 'Vazão Média por Célula Ativa (L/h)',
        tagPath: 'Calculadas.Vazao_Media_Celula_Lh',
        expressao: 'VAZAO_TOTAL / 16',
        unidade: 'L/h',
        descricao: 'Distribuição média de escoamento por plenum de alimentação das células',
        valorCalculado: 11250,
        statusCalculo: 'OK',
        limiteAlertaMin: 8000,
        limiteAlertaMax: 14000,
        criadoEm: new Date(Date.now() - 21600000).toISOString(),
        atualizadoEm: new Date().toISOString(),
        autor: 'Carlos Silva (SUPERVISOR)',
      }
    ];

    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.formulas = parsed;
          return;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar fórmulas salvas:', e);
    }

    this.formulas = formulasPadrao;
    this.persistir();
  }

  private persistir() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.formulas));
    } catch (e) {
      console.error('Erro ao persistir fórmulas:', e);
    }
  }

  public getFormulas(): FormulaTag[] {
    return this.formulas;
  }

  /**
   * Avalia uma expressão matemática em tempo real usando tags e variáveis do sistema
   */
  public avaliarExpressao(
    expressao: string,
    contextoVariaveis: Record<string, number>
  ): { valor: number; status: 'OK' | 'ERRO_SINTAXE' | 'TAG_INEXISTENTE'; erro?: string } {
    try {
      if (!expressao || expressao.trim() === '') {
        return { valor: 0, status: 'ERRO_SINTAXE', erro: 'Expressão vazia' };
      }

      // Prepara o escopo de variáveis
      let expressaoSanitizada = expressao;

      // Substitui nomes de variáveis pelos seus valores numéricos
      // Ordena as chaves por comprimento decrescente para evitar substituições parciais
      const sortedKeys = Object.keys(contextoVariaveis).sort((a, b) => b.length - a.length);

      for (const key of sortedKeys) {
        const val = contextoVariaveis[key];
        const regex = new RegExp(`\\b${key}\\b`, 'g');
        expressaoSanitizada = expressaoSanitizada.replace(regex, `(${val})`);
      }

      // Suporte a Math functions
      expressaoSanitizada = expressaoSanitizada
        .replace(/\babs\(/g, 'Math.abs(')
        .replace(/\bsqrt\(/g, 'Math.sqrt(')
        .replace(/\bmin\(/g, 'Math.min(')
        .replace(/\bmax\(/g, 'Math.max(')
        .replace(/\bround\(/g, 'Math.round(')
        .replace(/\^/g, '**');

      // Verifica se ainda restam identificadores não resolvidos (tags inexistentes)
      const matchesVariaveisRestantes = expressaoSanitizada.match(/[a-zA-Z_][a-zA-Z0-9_]*/g);
      const mathKeywords = ['Math', 'abs', 'sqrt', 'min', 'max', 'round', 'sin', 'cos', 'log', 'PI', 'E'];
      
      if (matchesVariaveisRestantes) {
        const variaveisInvalidas = matchesVariaveisRestantes.filter(v => !mathKeywords.includes(v));
        if (variaveisInvalidas.length > 0) {
          return {
            valor: 0,
            status: 'TAG_INEXISTENTE',
            erro: `Tag ou variável não encontrada: ${variaveisInvalidas.join(', ')}`
          };
        }
      }

      // Avaliação segura da expressão aritmética
      // eslint-disable-next-line no-new-func
      const func = new Function(`return (${expressaoSanitizada});`);
      const resultado = func();

      if (typeof resultado !== 'number' || isNaN(resultado) || !isFinite(resultado)) {
        return { valor: 0, status: 'ERRO_SINTAXE', erro: 'Resultado não numérico ou divisão por zero' };
      }

      return { valor: parseFloat(resultado.toFixed(4)), status: 'OK' };
    } catch (e: any) {
      return { valor: 0, status: 'ERRO_SINTAXE', erro: e.message || 'Erro de sintaxe matemática' };
    }
  }

  /**
   * Atualiza todas as fórmulas cadastradas com base nos dados mais recentes
   */
  public recalcularTodasFormulas(contextoVariaveis: Record<string, number>): FormulaTag[] {
    this.formulas = this.formulas.map(f => {
      const res = this.avaliarExpressao(f.expressao, contextoVariaveis);
      return {
        ...f,
        valorCalculado: res.valor,
        statusCalculo: res.status,
        mensagemErro: res.erro,
        atualizadoEm: new Date().toISOString()
      };
    });
    this.persistir();
    return this.formulas;
  }

  public salvarFormula(formula: Omit<FormulaTag, 'id' | 'valorCalculado' | 'statusCalculo' | 'criadoEm' | 'atualizadoEm'> & { id?: string }): FormulaTag {
    const agora = new Date().toISOString();
    let salva: FormulaTag;

    if (formula.id) {
      const idx = this.formulas.findIndex(f => f.id === formula.id);
      if (idx >= 0) {
        this.formulas[idx] = {
          ...this.formulas[idx],
          ...formula,
          id: formula.id,
          atualizadoEm: agora
        };
        salva = this.formulas[idx];
        this.persistir();
        return salva;
      }
    }

    const novaFormula: FormulaTag = {
      ...formula,
      id: `FORM-${String(this.formulas.length + 1).padStart(3, '0')}`,
      valorCalculado: 0,
      statusCalculo: 'OK',
      criadoEm: agora,
      atualizadoEm: agora
    };
    this.formulas.push(novaFormula);
    salva = novaFormula;
    this.persistir();
    return salva;
  }

  public excluirFormula(id: string): boolean {
    const lenAntes = this.formulas.length;
    this.formulas = this.formulas.filter(f => f.id !== id);
    if (this.formulas.length < lenAntes) {
      this.persistir();
      return true;
    }
    return false;
  }

  public restaurarFormulasPadrao(): FormulaTag[] {
    localStorage.removeItem(STORAGE_KEY);
    this.inicializarFormulas();
    return this.formulas;
  }
}

export const formulaServiceInstance = FormulaService.getInstance();
