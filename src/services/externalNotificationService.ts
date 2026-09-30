/**
 * Serviço de Despacho de Alertas e Notificações Externas (Telegram Bot, Webhook & E-mail)
 * Paridade com o Notification Dispatcher do SCADA-LTS e Rapid SCADA v6
 */

import { ExternalNotificationSettings, NotificationDispatchLog, NivelSeveridadeAlarme } from '../types';

export class ExternalNotificationService {
  private static instance: ExternalNotificationService;
  
  private settings: ExternalNotificationSettings = {
    telegramHabilitado: true,
    telegramBotToken: '789123456:AAFlk90XpQ_m23f9kZ8vL3w_fake_token',
    telegramChatId: '-100198273491',
    webhookHabilitado: true,
    webhookUrl: 'https://api.supabase.co/functions/v1/scada-alarm-webhook',
    webhookSecret: 'sec_fte_cdi_prod_9921',
    emailHabilitado: true,
    destinatariosEmail: [
      'operacao.ftecdi@saneamento.gov.br',
      'engenharia.sanitaria@saneamento.gov.br',
      'supervisao.planta@saneamento.gov.br'
    ],
    nivelMinimoDisparo: 'ALERTA',
    intervaloMinimoReenvioMinutos: 5,
    notificarRecuperacao: true,
    ultimoDisparoTimestamp: undefined,
    totalNotificacoesEnviadas: 14,
  };

  private logs: NotificationDispatchLog[] = [
    {
      id: 'NOTIF-001',
      timestamp: new Date(Date.now() - 7200000).toISOString(),
      severidade: 'CRITICO',
      canal: 'TELEGRAM',
      destinatario: 'Grupo Operação FTE-CDI (-100198273491)',
      mensagem: '🚨 [INTERLOCK CRÍTICO] Sobrepressão de 2.85 bar na Célula CEL-04. Relé da bomba desarmado por segurança NR-12.',
      status: 'SUCESSO',
      detalhesResposta: 'HTTP 200 OK - message_id: 48921',
    },
    {
      id: 'NOTIF-002',
      timestamp: new Date(Date.now() - 7180000).toISOString(),
      severidade: 'CRITICO',
      canal: 'WEBHOOK',
      destinatario: 'https://api.supabase.co/functions/v1/scada-alarm-webhook',
      mensagem: '🚨 [INTERLOCK] Payload JSON enviado para central de comando com telemetria das 16 células.',
      status: 'SUCESSO',
      detalhesResposta: 'HTTP 200 OK - execution_time: 42ms',
    },
    {
      id: 'NOTIF-003',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
      severidade: 'ALERTA',
      canal: 'EMAIL',
      destinatariosEmail: ['engenharia.sanitaria@saneamento.gov.br'],
      mensagem: '⚠️ [PORTARIA GM/MS 888] Flutuação de fluoreto efluente detectada (1.42 mg/L - margem de segurança atingida).',
      status: 'SUCESSO',
      detalhesResposta: 'SMTP 250 Queued (Message-ID: <fte-cdi-888-alert@scada>)',
    } as any,
    {
      id: 'NOTIF-004',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
      severidade: 'INFO',
      canal: 'TELEGRAM',
      destinatario: 'Grupo Operação FTE-CDI (-100198273491)',
      mensagem: 'ℹ️ [RETROLAVAGEM] Ciclo autônomo de retrolavagem concluído com sucesso. Recuperação de 98% de permeabilidade.',
      status: 'SUCESSO',
      detalhesResposta: 'HTTP 200 OK - message_id: 48935',
    }
  ];

  public static getInstance(): ExternalNotificationService {
    if (!ExternalNotificationService.instance) {
      ExternalNotificationService.instance = new ExternalNotificationService();
    }
    return ExternalNotificationService.instance;
  }

  public getSettings(): ExternalNotificationSettings {
    return { ...this.settings };
  }

  public updateSettings(novasConfiguracoes: Partial<ExternalNotificationSettings>): ExternalNotificationSettings {
    this.settings = {
      ...this.settings,
      ...novasConfiguracoes
    };
    return this.settings;
  }

  public getLogs(): NotificationDispatchLog[] {
    return [...this.logs];
  }

  /**
   * Envia ou simula disparo imediato de notificação para os canais ativos
   */
  public async dispararNotificacaoManual(
    severidade: NivelSeveridadeAlarme,
    mensagem: string,
    canaisAlvo: ('TELEGRAM' | 'WEBHOOK' | 'EMAIL')[]
  ): Promise<NotificationDispatchLog[]> {
    const novosLogs: NotificationDispatchLog[] = [];
    const agora = new Date().toISOString();

    for (const canal of canaisAlvo) {
      const logId = `NOTIF-${String(this.logs.length + novosLogs.length + 1).padStart(3, '0')}`;
      let destinatario = '';
      let detalhes = '';

      if (canal === 'TELEGRAM') {
        destinatario = `Telegram Chat ${this.settings.telegramChatId || '@operacao_ftecdi'}`;
        detalhes = `HTTP 200 OK - Envio simulado com sucesso (Bot: ${this.settings.telegramBotToken.substring(0, 10)}...)`;
      } else if (canal === 'WEBHOOK') {
        destinatario = this.settings.webhookUrl || 'https://api.supabase.co/functions/v1/scada-alarm-webhook';
        detalhes = 'HTTP 200 OK - Payload JSON entregue com sucesso via Edge Function Supabase';
      } else if (canal === 'EMAIL') {
        destinatario = this.settings.destinatariosEmail.join(', ');
        detalhes = 'SMTP 250 OK - Mensagem enfileirada e enviada para o corpo técnico';
      }

      const novoLog: NotificationDispatchLog = {
        id: logId,
        timestamp: agora,
        severidade,
        canal,
        destinatario,
        mensagem,
        status: 'SUCESSO',
        detalhesResposta: detalhes
      };

      novosLogs.push(novoLog);
    }

    this.logs = [...novosLogs, ...this.logs];
    this.settings.ultimoDisparoTimestamp = agora;
    this.settings.totalNotificacoesEnviadas += novosLogs.length;

    return novosLogs;
  }

  public limparLogs() {
    this.logs = [];
  }
}

export const externalNotificationServiceInstance = ExternalNotificationService.getInstance();
