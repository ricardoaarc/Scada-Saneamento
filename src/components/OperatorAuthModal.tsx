/**
 * Modal de Autenticação de Operadores e Trilha de Auditoria (RBAC)
 * Padrão Industrial ISA-101 / CFR 21 Part 11
 */

import React, { useState } from 'react';
import { 
  UserCheck, 
  Shield, 
  Lock, 
  Key, 
  X, 
  CheckCircle2, 
  Clock, 
  FileCheck2,
  ChevronRight,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { OperatorProfile, OperatorRole, AuditActionLog } from '../types';
import { authService, OPERADORES_PREDEFINIDOS } from '../services/AuthService';

interface OperatorAuthModalProps {
  operadorAtual: OperatorProfile;
  historicoAuditoria: AuditActionLog[];
  onFechar: () => void;
  onOperadorAlterado: (novo: OperatorProfile) => void;
}

export const OperatorAuthModal: React.FC<OperatorAuthModalProps> = ({
  operadorAtual,
  historicoAuditoria,
  onFechar,
  onOperadorAlterado,
}) => {
  const [tabAtiva, setTabAtiva] = useState<'PERFIL' | 'AUDITORIA'>('PERFIL');
  const [feedbackSucesso, setFeedbackSucesso] = useState<string | null>(null);

  const handleTrocar = (id: string) => {
    const ok = authService.trocarOperador(id);
    if (ok) {
      const novo = authService.getOperadorAtual();
      onOperadorAlterado(novo);
      setFeedbackSucesso(`Operador ativo alterado para ${novo.nome} (${novo.role})`);
      setTimeout(() => setFeedbackSucesso(null), 3000);
    }
  };

  const getRoleBadge = (role: OperatorRole) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-950/80 text-purple-300 border-purple-700/60';
      case 'ENGENHEIRO':
        return 'bg-sky-950/80 text-sky-300 border-sky-700/60';
      default:
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#151b2b] border border-[#334155] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header do Modal */}
        <div className="p-4 bg-[#0a0e17] border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-700/50 text-sky-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Autenticação de Operador & Controle de Acesso (RBAC)
              </h3>
              <span className="text-[11px] text-[#94a3b8]">
                Gerenciamento de permissões industriais e registro de rastreabilidade
              </span>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="text-[#94a3b8] hover:text-white p-1 rounded hover:bg-[#1e293b]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-[#1e293b] bg-[#0f1422] px-4 pt-2">
          <button
            onClick={() => setTabAtiva('PERFIL')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition ${
              tabAtiva === 'PERFIL'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-[#94a3b8] hover:text-slate-200'
            }`}
          >
            Sessão Ativa & Perfis
          </button>
          <button
            onClick={() => setTabAtiva('AUDITORIA')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition flex items-center gap-1.5 ${
              tabAtiva === 'AUDITORIA'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-[#94a3b8] hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Trilha de Auditoria ({historicoAuditoria.length})
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {feedbackSucesso && (
            <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/50 rounded-lg text-xs text-emerald-200 flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{feedbackSucesso}</span>
            </div>
          )}

          {tabAtiva === 'PERFIL' ? (
            <>
              {/* Cartão do Operador Ativo */}
              <div className="p-4 rounded-xl bg-[#0a0e17] border border-sky-500/40 relative overflow-hidden">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center text-white font-bold text-lg shadow-md">
                      {operadorAtual.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-white">{operadorAtual.nome}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${getRoleBadge(operadorAtual.role)}`}>
                          {operadorAtual.role}
                        </span>
                      </div>
                      <p className="text-xs text-[#94a3b8]">{operadorAtual.cargo}</p>
                      <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-[#64748b]">
                        <span>Matrícula: <strong className="text-slate-300">{operadorAtual.matricula}</strong></span>
                        <span>E-mail: <strong className="text-slate-300">{operadorAtual.email}</strong></span>
                      </div>
                    </div>
                  </div>

                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Sessão Ativa
                  </span>
                </div>

                {/* Grade de Permissões */}
                <div className="mt-4 pt-3 border-t border-[#1e293b] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-[#0f1422] border border-[#1e293b]">
                    <span className="text-[#64748b] block text-[10px]">Operação Geral:</span>
                    <strong className="text-emerald-400">LIBERADA</strong>
                  </div>
                  <div className="p-2 rounded bg-[#0f1422] border border-[#1e293b]">
                    <span className="text-[#64748b] block text-[10px]">Sintonia PID:</span>
                    <strong className={operadorAtual.role !== 'OPERADOR' ? 'text-emerald-400' : 'text-amber-400'}>
                      {operadorAtual.role !== 'OPERADOR' ? 'AUTORIZADA' : 'RESTRITA'}
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-[#0f1422] border border-[#1e293b]">
                    <span className="text-[#64748b] block text-[10px]">Comutação CLP:</span>
                    <strong className={operadorAtual.role !== 'OPERADOR' ? 'text-emerald-400' : 'text-red-400'}>
                      {operadorAtual.role !== 'OPERADOR' ? 'AUTORIZADA' : 'BLOQUEADA'}
                    </strong>
                  </div>
                  <div className="p-2 rounded bg-[#0f1422] border border-[#1e293b]">
                    <span className="text-[#64748b] block text-[10px]">Reset Interlock:</span>
                    <strong className="text-emerald-400">COM AUDITORIA</strong>
                  </div>
                </div>
              </div>

              {/* Seletor Rápido de Operadores Homologados */}
              <div>
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Trocar de Usuário Homologado (Ambiente de Operação)
                </h4>
                <div className="space-y-2">
                  {OPERADORES_PREDEFINIDOS.map((op) => {
                    const isAtivo = op.id === operadorAtual.id;
                    return (
                      <div
                        key={op.id}
                        onClick={() => !isAtivo && handleTrocar(op.id)}
                        className={`p-3 rounded-lg border transition flex items-center justify-between cursor-pointer ${
                          isAtivo
                            ? 'bg-sky-950/20 border-sky-500/50 cursor-default'
                            : 'bg-[#0a0e17] border-[#1e293b] hover:border-[#334155] hover:bg-[#0f1422]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#1e293b] border border-[#334155] flex items-center justify-center font-bold text-xs text-slate-200">
                            {op.nome.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white">{op.nome}</span>
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase border ${getRoleBadge(op.role)}`}>
                                {op.role}
                              </span>
                            </div>
                            <span className="text-[11px] text-[#94a3b8]">{op.cargo} ({op.matricula})</span>
                          </div>
                        </div>

                        {isAtivo ? (
                          <span className="text-xs text-sky-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Atual
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="px-2.5 py-1 bg-[#1e293b] hover:bg-[#334155] text-slate-200 rounded text-xs font-semibold flex items-center gap-1 transition"
                          >
                            Assumir Posto
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* Trilha de Auditoria */
            <div className="space-y-2">
              <div className="p-2 bg-[#0a0e17] border border-[#1e293b] rounded text-xs text-[#94a3b8] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />
                <span>
                  Todos os eventos críticos (reset de interlock, sintonia PID e comutação de fonte) são assinados com matrícula e horário.
                </span>
              </div>

              {historicoAuditoria.length === 0 ? (
                <div className="text-center py-8 text-xs text-[#64748b]">
                  Nenhum registro de auditoria gerado até o momento.
                </div>
              ) : (
                historicoAuditoria.map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded bg-[#0a0e17] border border-[#1e293b] text-xs font-mono"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#64748b] mb-1">
                      <span className="text-slate-300 font-bold">
                        {log.operadorNome} ({log.operadorMatricula} - {log.role})
                      </span>
                      <span>{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                    </div>
                    <div className="text-slate-200 text-xs font-sans">
                      {log.acao}
                    </div>
                    {log.justificativa && (
                      <div className="text-[11px] text-[#94a3b8] mt-1 pl-2 border-l border-sky-600/40">
                        Justificativa: {log.justificativa}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 bg-[#0a0e17] border-t border-[#1e293b] flex items-center justify-between text-xs">
          <span className="text-[11px] text-[#64748b] font-mono">
            Sessão vinculada à IHM SCADA local
          </span>
          <button
            onClick={onFechar}
            className="px-4 py-1.5 bg-[#334155] hover:bg-[#475569] text-white rounded text-xs font-semibold"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
